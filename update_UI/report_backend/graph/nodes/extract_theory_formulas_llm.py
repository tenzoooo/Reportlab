from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Iterable

from core.storage import Storage
from graph.state import AgentState, LLMTheoryFormula, PdfTextBlock, ValidationIssue, now_iso
from llm.client import LLMClient
from llm.schemas.theory_formula_extract import TheoryFormulaItem

_DEFAULT_OUTPUT_PATH = Path("/tmp/method_only.json")
_MAX_CHUNK_CHARS = 12000
_CONTEXT_BEFORE_CHARS = 100
_DEBUG_ENV_FLAG = "ENABLE_AI_DEBUG_LOG"

logger = logging.getLogger(__name__)


def _debug_enabled() -> bool:
    # Reuse the existing global debug flag to avoid adding new config surface.
    return (os.environ.get(_DEBUG_ENV_FLAG) or "").lower() in {"1", "true", "yes", "on"}


def _load_page_texts(state: AgentState, *, storage: Storage | None) -> list[PdfTextBlock]:
    if state.pdf.page_texts:
        return state.pdf.page_texts
    if not storage or not state.pdf.page_texts_key:
        return []
    raw = storage.get_json(state.pdf.page_texts_key)
    return [PdfTextBlock.model_validate(item) for item in raw or []]


def _full_pdf_text(state: AgentState, *, storage: Storage | None) -> str:
    if state.pdf.markdown_text:
        return state.pdf.markdown_text
    if state.pdf.text:
        return state.pdf.text
    page_texts = _load_page_texts(state, storage=storage)
    if not page_texts:
        return ""
    return "\n".join(block.text for block in page_texts if block.text)


def _experiment_catalog(state: AgentState) -> list[str]:
    items: list[str] = []
    if state.pdf.method_units:
        for unit in state.pdf.method_units:
            title = (unit.title or "").strip()
            exp_key = (unit.exp_key or "").strip()
            if exp_key and title:
                items.append(f"{exp_key} {title}")
            elif exp_key:
                items.append(exp_key)
    elif state.pdf.method_numbers:
        for method in state.pdf.method_numbers:
            title = (method.title or "").strip()
            exp_key = (method.exp_key or "").strip()
            if exp_key and title:
                items.append(f"{exp_key} {title}")
            elif exp_key:
                items.append(exp_key)
    # Preserve order, remove duplicates
    seen: set[str] = set()
    deduped: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        deduped.append(item)
    return deduped


def _split_text(text: str, *, max_chars: int) -> list[str]:
    paragraphs = [p for p in (text or "").split("\n\n") if p.strip()]
    chunks: list[str] = []
    buf: list[str] = []
    buf_len = 0
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if buf_len + len(para) + 2 > max_chars and buf:
            chunks.append("\n\n".join(buf))
            buf = []
            buf_len = 0
        buf.append(para)
        buf_len += len(para) + 2
    if buf:
        chunks.append("\n\n".join(buf))
    if not chunks and text:
        chunks = [text]
    return chunks


def _merge_items(items: Iterable[TheoryFormulaItem]) -> list[LLMTheoryFormula]:
    merged: list[LLMTheoryFormula] = []
    index_by_key: dict[str, int] = {}

    def _key(formula: str) -> str:
        return "".join((formula or "").split())

    for item in items:
        key = _key(item.formula)
        if not key:
            continue
        if key not in index_by_key:
            merged.append(
                LLMTheoryFormula(
                    formula=item.formula,
                    context=item.context,
                    experiments=list(dict.fromkeys(item.experiments)),
                )
            )
            index_by_key[key] = len(merged) - 1
            continue
        idx = index_by_key[key]
        current = merged[idx]
        if (not current.context) and item.context:
            current.context = item.context
        elif item.context and len(item.context) > len(current.context):
            current.context = item.context
        if item.experiments:
            current.experiments = list(dict.fromkeys([*current.experiments, *item.experiments]))
    return merged


def _all_occurrences(text: str, needle: str) -> list[int]:
    if not text or not needle:
        return []
    positions: list[int] = []
    start = 0
    while True:
        idx = text.find(needle, start)
        if idx == -1:
            break
        positions.append(idx)
        start = idx + max(1, len(needle))
    return positions


def _context_before(text: str, *, start_idx: int, limit: int) -> str:
    if not text:
        return ""
    begin = max(0, start_idx - limit)
    return text[begin:start_idx]


def _write_output(path: Path, *, formulas: list[LLMTheoryFormula]) -> None:
    payload: dict[str, object] = {}
    if path.exists():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            payload = {}
    payload["theory_formulas"] = [item.model_dump() for item in formulas]
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def extract_theory_formulas_llm(
    state: AgentState,
    *,
    llm: LLMClient | None,
    storage: Storage | None = None,
    output_path: Path | None = None,
) -> AgentState:
    """
    Bレイヤ: LLMでPDF全文から理論式を抽出し、/tmp/method_only.jsonに結合する。
    """
    if llm is None or not callable(getattr(llm, "extract_theory_formulas", None)):
        state.validation_report.warnings.append(
            ValidationIssue(code="warn_llm_missing", message="LLM未設定のため理論式抽出をスキップ")
        )
        return state

    pdf_text = _full_pdf_text(state, storage=storage).strip()
    if not pdf_text:
        state.validation_report.warnings.append(
            ValidationIssue(code="warn_pdf_text_missing", message="PDF全文テキストが無いため理論式抽出をスキップ")
        )
        return state

    experiments = _experiment_catalog(state)
    chunks = _split_text(pdf_text, max_chars=_MAX_CHUNK_CHARS)
    if not chunks:
        return state

    collected: list[TheoryFormulaItem] = []
    for idx, chunk in enumerate(chunks, start=1):
        if _debug_enabled():
            logger.info(
                "theory_formula_extract: chunk %s/%s (len=%s)",
                idx,
                len(chunks),
                len(chunk),
            )
        result = llm.extract_theory_formulas(
            pdf_text=chunk,
            experiments=experiments,
            chunk_index=idx,
            chunk_count=len(chunks),
        )
        if _debug_enabled():
            logger.info(
                "theory_formula_extract: chunk %s/%s returned %s items",
                idx,
                len(chunks),
                len(result.items or []),
            )
        collected.extend(result.items or [])

    merged = _merge_items(collected)
    if _debug_enabled():
        logger.info("theory_formula_extract: merged items=%s", len(merged))

    expanded: list[LLMTheoryFormula] = []
    for item in merged:
        positions = _all_occurrences(pdf_text, item.formula or "")
        if not positions:
            expanded.append(item)
            continue
        for idx in positions:
            expanded.append(
                LLMTheoryFormula(
                    formula=item.formula,
                    context=_context_before(pdf_text, start_idx=idx, limit=_CONTEXT_BEFORE_CHARS),
                    experiments=item.experiments,
                )
            )

    if _debug_enabled():
        logger.info("theory_formula_extract: expanded items=%s", len(expanded))

    state.pdf.theory_formulas_llm = expanded

    target_path = output_path or _DEFAULT_OUTPUT_PATH
    _write_output(target_path, formulas=expanded)

    state.job_meta.updated_at = now_iso()
    return state
