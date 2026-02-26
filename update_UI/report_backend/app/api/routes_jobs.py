from __future__ import annotations

import json
import os
import sys
import time
import uuid
from typing import Optional

import anyio
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from core.excel import validate_a1_range
from core.jobs import load_state, save_state
from core.storage import Storage
from core.text import extract_docx_text, extract_report_hint_from_text
from graph.build_graph import build_graph
from graph.state import (
    AgentState,
    ExcelFile,
    ExcelSheetSelection,
    ExcelSheetSelectionCandidate,
    GraphAxisInfo,
    JobMeta,
    JobStatus,
    PastReportData,
    ValidationIssue,
    now_iso,
)
from llm.client import LLMClient
from models.contracts import ImageAsset, TableAsset
from templating.renderer import render_docx_bytes


class CreateJobResponse(BaseModel):
    job_id: str


class AddImageResponse(BaseModel):
    image_id: str


class AddTableRequest(BaseModel):
    raw_csv: str = Field(..., description="CSV string (one table)")
    filename: Optional[str] = None


class AddTableResponse(BaseModel):
    table_id: str


class AddExcelResponse(BaseModel):
    excel_id: str
    filename: str


class AddPastReportResponse(BaseModel):
    report_id: str
    filename: str
    hint_len: int
    upload_index: int


class RunJobResponse(BaseModel):
    job_id: str
    status: JobStatus
    artifact_docx_key: Optional[str] = None
    artifact_markdown_key: Optional[str] = None
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)


class SelectSheetExcelFile(BaseModel):
    excel_id: str
    filename: str
    sheet_names: list[str] = Field(default_factory=list)


class SelectSheetRequest(BaseModel):
    job_id: str
    exp_key: str
    title: str
    hints: str
    excel_files: list[SelectSheetExcelFile] = Field(default_factory=list)


class SelectSheetResponse(BaseModel):
    excel_id: str
    sheet_name: str
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    evidence: list[str] = Field(default_factory=list)


class SelectRangeRequest(BaseModel):
    job_id: str
    exp_key: str
    title: str
    hints: str
    excel_id: str
    sheet_name: str
    preview_rows: list[list[str]] = Field(default_factory=list)


class SelectRangeResponse(BaseModel):
    a1_range: str
    rationale: str = Field(default="")
    has_graph: bool = False
    graph_axes: GraphAxisInfo = Field(default_factory=GraphAxisInfo)


def _ext_from_filename(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    ext = filename.rsplit(".", 1)[-1].strip().lower()
    if not ext:
        return ""
    return "." + ext


def _langsmith_enabled() -> bool:
    override = (os.environ.get("REPORT_AGENT_ENABLE_LANGSMITH") or "").strip().lower()
    if override in {"1", "true", "yes", "y", "on"}:
        return True
    if override in {"0", "false", "no", "n", "off"}:
        return False

    trace_flags = [
        os.environ.get("LANGSMITH_TRACING"),
        os.environ.get("LANGSMITH_TRACING_V2"),
        os.environ.get("LANGCHAIN_TRACING_V2"),
    ]
    explicit = [v.strip().lower() for v in trace_flags if isinstance(v, str) and v.strip()]
    if explicit:
        return any(v in {"1", "true", "yes", "y", "on"} for v in explicit)
    return bool(os.environ.get("LANGSMITH_API_KEY") or os.environ.get("LANGCHAIN_API_KEY"))


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    import fitz  # PyMuPDF
    from core.text import clean_pdf_text_for_llm, is_bad_pdf_page_text, normalize_pdf_text

    # Optional full OCR mode (useful for scanned PDFs).
    if (os.environ.get("REPORT_AGENT_PDF_OCR") or "").strip().lower() in {"1", "true", "yes", "y", "on"}:
        try:
            from core.pdf_ocr import ocr_pdf_bytes

            lang = (os.environ.get("REPORT_AGENT_PDF_OCR_LANG") or "jpn+eng").strip() or "jpn+eng"
            zoom = float(os.environ.get("REPORT_AGENT_PDF_OCR_ZOOM") or "2.5")
            max_pages_env = (os.environ.get("REPORT_AGENT_PDF_OCR_MAX_PAGES") or "").strip()
            max_pages = int(max_pages_env) if max_pages_env.isdigit() else None
            result = ocr_pdf_bytes(pdf_bytes, lang=lang, zoom=zoom, max_pages=max_pages)
            return clean_pdf_text_for_llm(normalize_pdf_text(result.text))
        except Exception:
            # Fall back to text extraction.
            pass

    use_hybrid_ocr = (os.environ.get("REPORT_AGENT_PDF_OCR_HYBRID") or "").strip().lower() in {"1", "true", "yes", "y", "on"}
    hybrid_ocr_budget_env = (os.environ.get("REPORT_AGENT_PDF_OCR_HYBRID_MAX_PAGES") or "").strip()
    hybrid_ocr_budget = int(hybrid_ocr_budget_env) if hybrid_ocr_budget_env.isdigit() else 6

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    flags = 0
    flags |= getattr(fitz, "TEXT_DEHYPHENATE", 0)
    flags |= getattr(fitz, "TEXT_PRESERVE_WHITESPACE", 0)

    lang = (os.environ.get("REPORT_AGENT_PDF_OCR_LANG") or "jpn+eng").strip() or "jpn+eng"
    zoom = float(os.environ.get("REPORT_AGENT_PDF_OCR_ZOOM") or "2.5")
    psm_env = (os.environ.get("REPORT_AGENT_PDF_OCR_PSM") or "").strip()
    psm = int(psm_env) if psm_env.isdigit() else 6
    matrix = fitz.Matrix(zoom, zoom)
    ocr_used = 0

    chunks: list[str] = []
    for page in doc:
        try:
            page_text = page.get_text("text", flags=flags, sort=True)
        except TypeError:
            page_text = page.get_text()

        page_text = normalize_pdf_text(page_text or "")
        if use_hybrid_ocr and ocr_used < hybrid_ocr_budget and is_bad_pdf_page_text(page_text):
            try:
                from core.pdf_ocr import is_tesseract_available, ocr_png_bytes

                if is_tesseract_available():
                    pix = page.get_pixmap(matrix=matrix, alpha=False)
                    ocr_text = ocr_png_bytes(pix.tobytes("png"), lang=lang, psm=psm)
                    if ocr_text and ocr_text.strip():
                        page_text = ocr_text
                        ocr_used += 1
            except Exception:
                pass

        chunks.append(page_text)

    return clean_pdf_text_for_llm(normalize_pdf_text("\n".join([c for c in chunks if c])))


def _extract_past_report_hint(report_bytes: bytes, *, ext: str) -> str:
    if not report_bytes:
        return ""
    if ext == ".pdf":
        text = _extract_pdf_text(report_bytes)
    elif ext == ".docx":
        text = extract_docx_text(report_bytes)
    else:
        return ""
    return extract_report_hint_from_text(text)


def _shrink_text(text: str, *, max_chars: int = 120_000) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    if len(t) <= max_chars:
        return t

    keywords = ["実験方法", "実験手順", "方法", "Procedure", "考察", "検討事項", "報告事項", "Discussion"]
    positions: list[int] = []
    for kw in keywords:
        p = t.find(kw)
        if p != -1:
            positions.append(p)
    positions.sort()
    if positions:
        start = max(0, positions[0] - 10_000)
        end = min(len(t), start + max_chars)
        return t[start:end]
    return t[:max_chars]


def _slice_from_heading(full_text: str, heading_line: str) -> str | None:
    import re

    t = (full_text or "").strip()
    h = (heading_line or "").strip("\n")
    if not t or not h:
        return None
    start = t.find(h)
    if start == -1:
        return None
    after = start + len(h)
    end_match = re.search(r"(?m)^\s*(\d+)[.．]\s+\S", t[after:])
    end = after + end_match.start() if end_match else len(t)
    return t[start:end].strip()


def build_router(*, storage: Storage, llm: LLMClient, template_path: str) -> APIRouter:
    r = APIRouter()

    class ExperimentalResultsStreamRequest(BaseModel):
        chapter: Optional[int] = None
        experiments: list[dict] = Field(default_factory=list)

    def _sse(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    def _split_markdown_sections(md: str) -> list[dict]:
        sections: list[dict] = []
        current = {"title": "", "markdown": ""}
        for line in (md or "").splitlines():
            if line.startswith("## "):
                if current["markdown"].strip():
                    sections.append(current)
                current = {"title": line[3:].strip(), "markdown": line + "\n"}
            else:
                current["markdown"] += line + "\n"
        if current["markdown"].strip():
            sections.append(current)
        return sections

    @r.post("/experimental-results/stream")
    async def _experimental_results_stream(req: ExperimentalResultsStreamRequest):
        """
        Stream a Markdown "experimental results" section via SSE.

        Strategy:
        - Stream plain text chunks (`delta`) for a safe, non-broken UI during generation.
        - Emit a final structured payload (`final`) once complete.
        """

        payload = {
            "chapter": req.chapter,
            "experiments": req.experiments or [],
        }

        started_at = time.time()

        def gen():
            yield _sse("meta", {"started_at": started_at, "model": llm.text_model})
            out = ""
            try:
                for chunk in llm.stream_experimental_results_markdown(payload):
                    out += chunk
                    yield _sse("delta", {"text": chunk})
                final = {
                    "markdown": out.strip(),
                    "sections": _split_markdown_sections(out),
                    "finished_at": time.time(),
                    "elapsed_ms": int((time.time() - started_at) * 1000),
                }
                yield _sse("final", final)
                yield _sse("done", {})
            except Exception as exc:
                yield _sse("error", {"message": str(exc)})
                yield _sse("done", {})

        headers = {
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
        return StreamingResponse(gen(), media_type="text/event-stream; charset=utf-8", headers=headers)

    class _SheetSelectLLMOutput(BaseModel):
        excel_id: str = Field(default="")
        sheet_name: str = Field(default="")
        confidence: float = Field(default=0.0, ge=0.0, le=1.0)
        rationale: str = Field(default="")
        evidence: list[str] = Field(default_factory=list)

    @r.post("/excel/select-sheet", response_model=SelectSheetResponse)
    async def _select_excel_sheet(req: SelectSheetRequest) -> SelectSheetResponse:
        state = load_state(storage, job_id=req.job_id)
        payload = {
            "experiment": {"exp_key": req.exp_key, "title": req.title, "hints": req.hints},
            "excel_files": [f.model_dump() for f in req.excel_files],
        }
        system = (
            "あなたは実験結果に対応するExcelシートを選ぶ抽出器です。\n"
            "出力はJSONのみ（説明文は禁止）。\n"
            "# 入力\n"
            "- experiment: {exp_key, title, hints}\n"
            "- excel_files: [{excel_id, filename, sheet_names}]\n"
            "# ルール\n"
            "- excel_id と sheet_name は入力の候補から選ぶ。\n"
            "- rationale は短く理由を書く。\n"
            "- confidence は 0〜1。\n"
            "- evidence は根拠語句。\n"
        )
        output = llm.parse(
            _SheetSelectLLMOutput,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            attempts=2,
        )
        selection = ExcelSheetSelection(
            exp_key=req.exp_key,
            title=req.title,
            selected_excel_id=output.excel_id,
            selected_sheet=output.sheet_name,
            confidence=output.confidence,
            rationale=output.rationale or "",
            evidence=list(output.evidence or []),
            candidates=[
                ExcelSheetSelectionCandidate(
                    excel_id=output.excel_id,
                    sheet_name=output.sheet_name,
                    confidence=output.confidence,
                    rationale=output.rationale or "",
                    evidence=list(output.evidence or []),
                )
            ],
            used_llm=True,
        )
        updated: list[ExcelSheetSelection] = []
        replaced = False
        for existing in state.excel_sheet_selections:
            if existing.exp_key == req.exp_key:
                updated.append(selection)
                replaced = True
            else:
                updated.append(existing)
        if not replaced:
            updated.append(selection)
        state.excel_sheet_selections = updated
        state.job_meta.updated_at = now_iso()
        save_state(storage, state)
        return SelectSheetResponse(
            excel_id=output.excel_id,
            sheet_name=output.sheet_name,
            confidence=output.confidence,
            rationale=output.rationale or "",
            evidence=list(output.evidence or []),
        )

    class _RangeSelectLLMOutput(BaseModel):
        a1_range: str = Field(default="")
        rationale: str = Field(default="")
        has_graph: bool = False
        graph_axes: GraphAxisInfo = Field(default_factory=GraphAxisInfo)

    @r.post("/excel/select-range", response_model=SelectRangeResponse)
    async def _select_excel_range(req: SelectRangeRequest) -> SelectRangeResponse:
        state = load_state(storage, job_id=req.job_id)
        payload = {
            "experiment": {
                "exp_key": req.exp_key,
                "title": req.title,
                "hints": req.hints,
                "excel_id": req.excel_id,
                "sheet_name": req.sheet_name,
            },
            "preview_rows": req.preview_rows,
        }
        system = (
            "あなたはExcelのプレビューから表範囲とグラフ情報を選ぶ抽出器です。\n"
            "出力はJSONのみ（説明文は禁止）。\n"
            "# 入力\n"
            "- experiment: {exp_key, title, hints, excel_id, sheet_name}\n"
            "- preview_rows: 先頭プレビュー\n"
            "# ルール\n"
            "- a1_range は表範囲（A1:D20 など）。\n"
            "- has_graph が true の場合は graph_axes を埋める。\n"
            "- graph_axes には x/y 名称・単位・系列名・条件名を入れる。\n"
        )
        output = llm.parse(
            _RangeSelectLLMOutput,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            attempts=2,
        )
        a1 = (output.a1_range or "").strip().upper().replace(" ", "")
        if a1 and not validate_a1_range(a1):
            a1 = ""

        from graph.state import EExcelRangeSelection

        result = {
            "exp_key": req.exp_key,
            "title": req.title,
            "table_range": {"excel_id": req.excel_id, "sheet": req.sheet_name, "a1_range": a1},
            "has_graph": bool(output.has_graph),
            "graph_axes": output.graph_axes.model_dump(),
        }
        selection = EExcelRangeSelection(
            exp_key=req.exp_key,
            title=req.title,
            excel_id=req.excel_id,
            excel_filename="",
            sheet=req.sheet_name,
            a1_range=a1,
            has_graph=bool(output.has_graph),
            graph_axes=output.graph_axes,
            result=result,
        )
        updated: list[EExcelRangeSelection] = []
        replaced = False
        for existing in state.e_excel.range_selections:
            if existing.exp_key == req.exp_key:
                updated.append(selection)
                replaced = True
            else:
                updated.append(existing)
        if not replaced:
            updated.append(selection)
        state.e_excel.range_selections = updated
        state.job_meta.updated_at = now_iso()
        save_state(storage, state)
        return SelectRangeResponse(
            a1_range=a1,
            rationale=output.rationale or "",
            has_graph=bool(output.has_graph),
            graph_axes=output.graph_axes,
        )

    @r.get("/debug/tracing")
    async def _debug_tracing():
        """
        Debug endpoint to verify whether LangSmith tracing should be active.
        Does not expose API keys.
        """

        langsmith_importable = True
        try:
            import langsmith  # noqa: F401
        except Exception:
            langsmith_importable = False

        enabled = _langsmith_enabled()
        project = os.environ.get("LANGSMITH_PROJECT") or os.environ.get("LANGCHAIN_PROJECT") or ""
        endpoint = os.environ.get("LANGSMITH_ENDPOINT") or os.environ.get("LANGCHAIN_ENDPOINT") or ""
        api_key_set = bool(os.environ.get("LANGSMITH_API_KEY") or os.environ.get("LANGCHAIN_API_KEY"))

        return {
            "langsmith_importable": langsmith_importable,
            "langsmith_enabled": enabled,
            "langsmith_project": project,
            "langsmith_endpoint": endpoint,
            "langsmith_api_key_set": api_key_set,
            "python_executable": sys.executable,
        }

    @r.post("/debug/tracing/test")
    async def _debug_tracing_test():
        """
        Emits a minimal trace to LangSmith to validate connectivity.
        """

        if not _langsmith_enabled():
            raise HTTPException(status_code=400, detail="LangSmith tracing is not enabled (set LANGSMITH_TRACING=true)")
        if not (os.environ.get("LANGSMITH_API_KEY") or os.environ.get("LANGCHAIN_API_KEY")):
            raise HTTPException(status_code=400, detail="LangSmith API key is missing (set LANGSMITH_API_KEY)")

        try:
            from langsmith import traceable
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"langsmith import failed: {exc}")

        @traceable(name="report_agent_trace_test", run_type="chain", tags=["report-agent", "debug"])
        def _run():
            return {"ok": True}

        return _run()

    @r.post("/debug/extract")
    async def _debug_extract(pdf: UploadFile = File(...)):
        """
        Debug endpoint to validate the extraction pipeline only (no job state, no docx render).

        Returns:
        - raw extracted text preview/len
        - LLM-detected section heading lines
        - method/discussion section previews
        - extracted discussion instruction prompts
        """

        pdf_bytes = await pdf.read()
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Empty PDF upload")

        text = _extract_pdf_text(pdf_bytes)
        probe = _shrink_text(text)

        detected = {"method_heading_line": None, "discussion_heading_line": None}
        method_text = ""
        discussion_text = ""
        prompts: list[str] = []

        try:
            out = llm.detect_pdf_sections(probe or text)
            method_line = (out.method_heading_line or "").strip("\n")
            discussion_line = (out.discussion_heading_line or "").strip("\n")
            if method_line and method_line in text:
                detected["method_heading_line"] = method_line
                method_text = _slice_from_heading(text, method_line) or ""
            if discussion_line and discussion_line in text:
                detected["discussion_heading_line"] = discussion_line
                discussion_text = _slice_from_heading(text, discussion_line) or ""
        except Exception:
            pass

        try:
            out2 = llm.extract_discussion_prompts(probe or text)
            prompts = [p for p in out2.prompts if p and str(p).strip()]
        except Exception:
            prompts = []

        return {
            "filename": pdf.filename or "",
            "text_len": len(text),
            "text_preview": (text[:3000] + "…") if len(text) > 3000 else text,
            "probe_len": len(probe),
            "detected": detected,
            "method_text_len": len(method_text),
            "method_text_preview": (method_text[:2000] + "…") if len(method_text) > 2000 else method_text,
            "discussion_text_len": len(discussion_text),
            "discussion_text_preview": (discussion_text[:2000] + "…") if len(discussion_text) > 2000 else discussion_text,
            "prompts_count": len(prompts),
            "prompts": prompts,
        }

    @r.post("/debug/ocr")
    async def _debug_ocr(
        pdf: UploadFile = File(...),
        lang: str = "jpn+eng",
        zoom: float = 2.5,
        max_pages: int | None = None,
    ):
        """
        Debug endpoint: OCR-based PDF extraction via tesseract (render pages -> OCR).
        """
        pdf_bytes = await pdf.read()
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Empty PDF upload")
        try:
            from core.pdf_ocr import ocr_pdf_bytes
            from core.text import clean_pdf_text_for_llm, normalize_pdf_text

            result = ocr_pdf_bytes(pdf_bytes, lang=lang, zoom=zoom, max_pages=max_pages)
            text = clean_pdf_text_for_llm(normalize_pdf_text(result.text))
            return {
                "filename": pdf.filename or "",
                "pages": result.pages,
                "text_len": len(text),
                "text_preview": (text[:3000] + "…") if len(text) > 3000 else text,
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"OCR failed: {exc}")

    @r.post("/render")
    async def _render_from_context(
        context_json: str = Form(...),
        images: list[UploadFile] = File(default=[]),
    ):
        """
        Render a docx directly from a provided TemplateContext-like JSON.

        - `context_json`: The full docxtpl context (TemplateContext + optional extra keys).
        - `images`: Optional. Upload images where the *filename is the image_id* referenced by `figure.figure_image_id`.
        """

        try:
            import json

            context = json.loads(context_json)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid context_json (must be JSON)")

        image_bytes_by_id: dict[str, bytes] = {}
        for img in images:
            raw = await img.read()
            if not raw:
                continue
            image_id = (img.filename or "").strip()
            if not image_id:
                continue
            image_bytes_by_id[image_id] = raw

        try:
            docx = render_docx_bytes(
                template_path=template_path,
                context=context if isinstance(context, dict) else {},
                storage=storage,
                job_id="render",
                image_bytes_by_id=image_bytes_by_id or None,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=500, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"render failed: {exc}")

        return Response(
            content=docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": 'attachment; filename="report_rendered.docx"'},
        )

    @r.post("/jobs", response_model=CreateJobResponse)
    async def _create_job(pdf: UploadFile = File(...)) -> CreateJobResponse:
        job_id = uuid.uuid4().hex
        pdf_bytes = await pdf.read()
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail="Empty PDF upload")

        pdf_key = f"jobs/{job_id}/source/manual.pdf"
        storage.put_bytes(pdf_key, pdf_bytes)

        state = AgentState(job_meta=JobMeta(job_id=job_id))
        state.status = JobStatus.created
        state.pdf.filename = pdf.filename or "manual.pdf"
        state.pdf.storage_key = pdf_key
        state.job_meta.updated_at = now_iso()

        save_state(storage, state)
        return CreateJobResponse(job_id=job_id)

    @r.post("/jobs/{job_id}/images", response_model=AddImageResponse)
    async def _add_image(job_id: str, image: UploadFile = File(...)) -> AddImageResponse:
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty image upload")

        image_id = uuid.uuid4().hex
        ext = _ext_from_filename(image.filename or "")
        img_key = f"jobs/{job_id}/source/images/{image_id}{ext or '.bin'}"
        storage.put_bytes(img_key, image_bytes)

        mime = image.content_type or "application/octet-stream"
        upload_index = state.job_meta.next_upload_index
        state.job_meta.next_upload_index += 1

        state.assets_images.append(
            ImageAsset(
                image_id=image_id,
                filename=image.filename or f"{image_id}{ext}",
                mime_type=mime,
                storage_key=img_key,
                upload_index=upload_index,
            )
        )
        state.job_meta.updated_at = now_iso()
        save_state(storage, state)
        return AddImageResponse(image_id=image_id)

    @r.post("/jobs/{job_id}/tables", response_model=AddTableResponse)
    async def _add_table(job_id: str, req: AddTableRequest) -> AddTableResponse:
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        raw = (req.raw_csv or "").strip("\n")
        if not raw.strip():
            raise HTTPException(status_code=400, detail="raw_csv is empty")

        table_id = uuid.uuid4().hex
        tbl_key = f"jobs/{job_id}/source/tables/{table_id}.csv"
        storage.put_bytes(tbl_key, raw.encode("utf-8"))

        upload_index = state.job_meta.next_upload_index
        state.job_meta.next_upload_index += 1

        state.assets_tables.append(
            TableAsset(
                table_id=table_id,
                storage_key=tbl_key,
                raw_csv=raw,
                upload_index=upload_index,
            )
        )
        state.job_meta.updated_at = now_iso()
        save_state(storage, state)
        return AddTableResponse(table_id=table_id)

    @r.post("/jobs/{job_id}/excel", response_model=AddExcelResponse)
    async def _add_excel(job_id: str, excel: UploadFile = File(...)) -> AddExcelResponse:
        """
        Upload an Excel file (.xlsx) to be used by MVP mode.
        """
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        raw = await excel.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty excel upload")

        ext = _ext_from_filename(excel.filename or "")
        if ext not in {".xlsx", ".xlsm"}:
            raise HTTPException(status_code=400, detail="Unsupported excel type (expected .xlsx or .xlsm)")

        excel_id = uuid.uuid4().hex
        key = f"jobs/{job_id}/source/excels/{excel_id}{ext or '.bin'}"
        storage.put_bytes(key, raw)
        filename = excel.filename or f"excel{ext}"
        state.excel.filename = filename
        state.excel.storage_key = key
        upload_index = state.job_meta.next_upload_index
        state.job_meta.next_upload_index += 1
        state.excel_files.append(
            ExcelFile(
                excel_id=excel_id,
                filename=filename,
                storage_key=key,
                upload_index=upload_index,
            )
        )
        state.job_meta.updated_at = now_iso()
        save_state(storage, state)
        return AddExcelResponse(excel_id=excel_id, filename=filename)

    @r.post("/jobs/{job_id}/past-report", response_model=AddPastReportResponse)
    async def _add_past_report(job_id: str, report: UploadFile = File(...)) -> AddPastReportResponse:
        """
        Upload a past report (PDF/DOCX). Store a compact preview hint.
        Structured hints are extracted during MVP run.
        """
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        raw = await report.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty past report upload")

        ext = _ext_from_filename(report.filename or "")
        if ext not in {".pdf", ".docx"}:
            raise HTTPException(status_code=400, detail="Unsupported past report type (expected .pdf or .docx)")

        report_id = uuid.uuid4().hex
        key = f"jobs/{job_id}/source/past_reports/{report_id}{ext or '.bin'}"
        storage.put_bytes(key, raw)

        hint = _extract_past_report_hint(raw, ext=ext)
        upload_index = state.job_meta.next_upload_index
        state.job_meta.next_upload_index += 1
        report_entry = PastReportData(
            report_id=report_id,
            filename=report.filename or f"past_report{ext}",
            storage_key=key,
            extracted_hint=hint,
            upload_index=upload_index,
        )
        state.past_reports.append(report_entry)
        state.past_report = report_entry
        state.job_meta.updated_at = now_iso()
        save_state(storage, state)
        return AddPastReportResponse(
            report_id=report_id,
            filename=report_entry.filename,
            hint_len=len(hint),
            upload_index=upload_index,
        )

    @r.post("/jobs/{job_id}/run", response_model=RunJobResponse)
    async def _run_job(job_id: str, mode: str = "update_mvp") -> RunJobResponse:
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        raw_mode = (mode or "update_mvp").strip().lower()
        resolved_mode = "update_mvp" if raw_mode == "mvp" else raw_mode
        if resolved_mode not in {"full", "prepare", "update_mvp"}:
            raise HTTPException(status_code=400, detail="Invalid mode (expected 'full' | 'prepare' | 'update_mvp')")

        graph = build_graph(storage=storage, llm=llm, template_path=template_path, mode=resolved_mode)
        state.status = JobStatus.running
        state.job_meta.text_model = llm.text_model
        state.job_meta.vision_model = llm.vision_model
        state.job_meta.template_path = template_path
        state.job_meta.run_mode = resolved_mode
        state.job_meta.updated_at = now_iso()
        save_state(storage, state)

        try:
            config = {
                "recursion_limit": 100,
                "tags": ["report-agent"],
                "metadata": {
                    "job_id": job_id,
                    "pdf_filename": state.pdf.filename,
                    "images": len(state.assets_images),
                    "tables": len(state.assets_tables),
                    "mode": resolved_mode,
                },
            }

            def _invoke_sync():
                if _langsmith_enabled():
                    try:
                        from langsmith import traceable

                        @traceable(
                            name=f"Report Agent Workflow ({resolved_mode})",
                            run_type="chain",
                            metadata={"job_id": job_id, "mode": resolved_mode, "pdf_filename": state.pdf.filename},
                            tags=["workflow:report_agent", "report-agent", f"mode:{resolved_mode}"],
                        )
                        def _invoke():
                            return graph.invoke(state, config=config)

                        return _invoke()
                    except Exception:
                        return graph.invoke(state, config=config)
                return graph.invoke(state, config=config)

            # graph.invoke() is CPU/IO-heavy and sync. Offload it so the event-loop can still
            # serve /intermediate polling and other requests while the job runs.
            result = await anyio.to_thread.run_sync(_invoke_sync)
            result_state = AgentState.model_validate(result)
        except Exception as exc:
            state.status = JobStatus.partial
            state.validation_report.errors.append(ValidationIssue(code="run_failed", message=str(exc)))
            state.job_meta.updated_at = now_iso()
            save_state(storage, state)
            return RunJobResponse(
                job_id=job_id,
                status=state.status,
                artifact_docx_key=state.artifact_docx_key,
                artifact_markdown_key=state.artifact_markdown_key,
                errors=state.validation_report.errors,
                warnings=state.validation_report.warnings,
            )

        save_state(storage, result_state)
        return RunJobResponse(
            job_id=job_id,
            status=result_state.status,
            artifact_docx_key=result_state.artifact_docx_key,
            artifact_markdown_key=result_state.artifact_markdown_key,
            errors=result_state.validation_report.errors,
            warnings=result_state.validation_report.warnings,
        )

    @r.get("/jobs/{job_id}", response_model=AgentState)
    async def _get_job(job_id: str) -> AgentState:
        try:
            return load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

    @r.get("/jobs/{job_id}/intermediate")
    async def _get_intermediate(job_id: str):
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")
        return state.model_dump()

    @r.get("/jobs/{job_id}/artifact")
    async def _get_artifact(job_id: str):
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        if not state.artifact_docx_key:
            raise HTTPException(status_code=404, detail="Artifact not available yet")

        raw = storage.get_bytes(state.artifact_docx_key)
        return Response(
            content=raw,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="report_{job_id}.docx"'},
        )

    @r.get("/jobs/{job_id}/artifact/markdown")
    async def _get_artifact_markdown(job_id: str):
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        if not state.artifact_markdown_key:
            raise HTTPException(status_code=404, detail="Markdown artifact not available yet")

        raw = storage.get_bytes(state.artifact_markdown_key)
        return Response(
            content=raw,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="report_{job_id}.md"'},
        )

    @r.get("/jobs/{job_id}/artifact/markdown/raw")
    async def _get_artifact_markdown_raw(job_id: str):
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        if not state.artifact_markdown_raw_key:
            raise HTTPException(status_code=404, detail="Raw markdown artifact not available yet")

        raw = storage.get_bytes(state.artifact_markdown_raw_key)
        return Response(
            content=raw,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="report_{job_id}_raw.md"'},
        )

    @r.get("/jobs/{job_id}/artifact/review_log")
    async def _get_review_log(job_id: str):
        try:
            state = load_state(storage, job_id=job_id)
        except Exception:
            raise HTTPException(status_code=404, detail="Job not found")

        if not state.artifact_review_log_key:
            raise HTTPException(status_code=404, detail="Review log not available yet")

        raw = storage.get_bytes(state.artifact_review_log_key)
        return Response(
            content=raw,
            media_type="application/json; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="review_log_{job_id}.json"'},
        )

    return r
