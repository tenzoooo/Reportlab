from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional, TypeVar

from openai import OpenAI
from pydantic import BaseModel, ValidationError as PydanticValidationError

from core.config import Settings
from core.errors import LLMError
from core.retry import retry
from core.text import caption_len
from llm.schemas.discussion import DiscussionOutput
from llm.schemas.discussion_extract import DiscussionExtractOutput
from llm.schemas.equation_line_ocr import EquationLineOCROutput
from llm.schemas.assign_rerank import AssignmentRerankOutput
from llm.schemas.method_extract import MethodExtractResult
from llm.schemas.mvp_first_experiment import MVPFirstExperimentOutput
from llm.schemas.mvp_quant_comment import MVPQuantCommentOutput
from llm.schemas.pdf_sections import PdfSectionsOutput
from llm.schemas.references import ReferencesOutput
from llm.schemas.summary import SummaryOutput
from llm.schemas.excel_select import ExcelSelectionOutput
from models.contracts import ImageAnalysis, TableAnalysis


logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _compact_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _env_temperature(name: str, *, default: float | None = None) -> float | None:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        t = float(raw)
    except Exception:
        return default
    if t < 0:
        t = 0.0
    if t > 1.5:
        t = 1.5
    return t


def _sanitize_mvp_quant_comment_paragraph(paragraph: str) -> str:
    """
    Make MVP quant-comment text robust against occasional "JSON echo" inside the paragraph.
    We keep this conservative: remove characters we explicitly ban in validators.
    """
    s = str(paragraph or "")
    if not s:
        return s

    # Remove common JSON-like wrappers accidentally echoed into the paragraph.
    s = re.sub(r"(?i)\"?paragraph\"?\s*:\s*", "", s)

    # Remove explicitly forbidden characters (keep the paragraph readable).
    for ch in ["{", "}", "[", "]", "`"]:
        s = s.replace(ch, "")
    if "_" in s:
        s = s.replace("_", " ")

    # Remove label words if the model echoed the instruction.
    s = s.replace("定量コメント", "").replace("定量的考察", "")
    return _compact_spaces(s)


def _mvp_missing_points(payload: dict[str, Any]) -> int:
    raw = payload.get("欠測点数")
    if raw is not None:
        try:
            return max(0, int(raw))
        except Exception:
            pass
    missing = payload.get("missing_data")
    if isinstance(missing, dict):
        raw2 = missing.get("total_missing_points")
        if raw2 is not None:
            try:
                return max(0, int(raw2))
            except Exception:
                pass
    series = payload.get("series")
    if isinstance(series, list):
        total = 0
        for item in series:
            if not isinstance(item, dict):
                continue
            raw3 = item.get("missing_count")
            if raw3 is None:
                continue
            try:
                total += int(raw3)
            except Exception:
                continue
        return max(0, total)
    return 0


def _mvp_first_numeric_token(payload: dict[str, Any]) -> str | None:
    try:
        probe = payload.get("probe")
        if isinstance(probe, dict):
            x = probe.get("x")
            if isinstance(x, (int, float)) and (x == x):  # NaN-safe
                # Keep as a compact token.
                return str(int(x)) if abs(x - int(x)) < 1e-9 else str(x)
    except Exception:
        pass
    try:
        s = json.dumps(payload, ensure_ascii=False)
        m = re.search(r"\d+(?:\.\d+)?", s)
        return m.group(0) if m else None
    except Exception:
        return None


def _ensure_mvp_quant_comment_has_digits(paragraph: str, *, validation_payload: dict[str, Any]) -> str:
    if not paragraph or re.search(r"\d", paragraph):
        return paragraph
    missing_n = _mvp_missing_points(validation_payload)
    if missing_n > 0:
        return _compact_spaces(paragraph + f"（欠測{missing_n}点）")
    token = _mvp_first_numeric_token(validation_payload)
    if token:
        return _compact_spaces(paragraph + f"（{token}）")
    return paragraph


def _series_name_map_from_payload(payload: dict[str, Any]) -> dict[str, str]:
    """
    Build mapping like {"系列1": "IB=0 μA", "系列2": "IB=20 μA"} when driver info exists.
    """
    mapping: dict[str, str] = {}
    try:
        vars_ = payload.get("variables") or {}
        driver = vars_.get("driver") if isinstance(vars_, dict) else {}
        if not isinstance(driver, dict):
            return mapping
        name = str(driver.get("name") or "").strip()
        unit = str(driver.get("unit") or "").strip()
        values = driver.get("values")
        if not name or not isinstance(values, list):
            return mapping
        for idx, v in enumerate(values, start=1):
            try:
                val = float(v)
            except Exception:
                continue
            mapping[f"系列{idx}"] = f"{name}={_format_sig(val)}{unit}"
    except Exception:
        return mapping
    return mapping


def _replace_series_with_driver(paragraph: str, *, validation_payload: dict[str, Any]) -> str:
    if not paragraph:
        return paragraph
    mapping = _series_name_map_from_payload(validation_payload)
    out = paragraph
    for key, val in mapping.items():
        out = out.replace(key, val)
    # Remove any remaining generic "系列N" tokens.
    out = re.sub(r"系列\s*\d+\s*=?\s*", "", out)
    out = out.replace("系列", "")
    return out


def _simplify_jargon(paragraph: str) -> str:
    """
    Prefer plain words (e.g., replace '乖離' with 'ずれ').
    """
    if not paragraph:
        return paragraph
    out = paragraph.replace("乖離", "ずれ")
    return _compact_spaces(out)


def _repair_mvp_quant_comment_digits_each_sentence(paragraph: str) -> str:
    """
    Best-effort repair for the strict MVP quant-comment contract:
    if the model outputs 3 sentences but misses digits in one of them,
    patch minimally by reusing the first numeric token already present.
    """
    if not paragraph or "\n" in paragraph:
        return paragraph
    if paragraph.count("。") != 3:
        return paragraph

    sents = [s.strip() for s in paragraph.split("。") if s.strip()]
    if len(sents) != 3:
        return paragraph
    if all(re.search(r"\d", s) for s in sents):
        return paragraph

    m = re.search(r"\d+(?:\.\d+)?", paragraph)
    token = m.group(0) if m else "0"
    fixed_sents: list[str] = []
    for s in sents:
        if re.search(r"\d", s):
            fixed_sents.append(s)
        else:
            fixed_sents.append(f"{s}（{token}）")
    return "。".join(fixed_sents) + "。"


def _is_truthy(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _langsmith_enabled() -> bool:
    return (
        _is_truthy(os.environ.get("LANGSMITH_TRACING"))
        or _is_truthy(os.environ.get("LANGSMITH_TRACING_V2"))
        or _is_truthy(os.environ.get("LANGCHAIN_TRACING_V2"))
    )


def _traceable_if_enabled(
    *,
    name: str,
    run_type: str,
    tags: list[str] | None = None,
    process_inputs: Any | None = None,
    process_outputs: Any | None = None,
):
    def decorator(fn):
        if not _langsmith_enabled():
            return fn
        try:
            from langsmith import traceable
        except Exception:
            return fn
        return traceable(
            name=name,
            run_type=run_type,
            tags=tags,
            process_inputs=process_inputs,
            process_outputs=process_outputs,
        )(fn)

    return decorator


def _preview_text(value: str, *, max_len: int = 600) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    if len(s) <= max_len:
        return s
    return s[:max_len] + "…"


def _process_text_fields(fields: list[str]):
    def _processor(inputs: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for field in fields:
            raw = inputs.get(field) or ""
            out[field] = {"len": len(str(raw)), "preview": _preview_text(str(raw))}
        return out

    return _processor


def _process_image_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    img_url = str(inputs.get("image_b64_url") or "")
    method_context = str(inputs.get("method_context") or "")
    extracted_hint = str(inputs.get("extracted_hint") or "")
    experiments = inputs.get("experiments") or []

    mime = ""
    if img_url.startswith("data:") and ";base64," in img_url:
        mime = img_url[5 : img_url.find(";base64,")]

    return {
        "image": {"mime": mime, "data_url_len": len(img_url)},
        "experiments_count": len(experiments) if isinstance(experiments, list) else 0,
        "method_context": {"len": len(method_context), "preview": _preview_text(method_context, max_len=300)},
        "extracted_hint": {"len": len(extracted_hint), "preview": _preview_text(extracted_hint, max_len=200)},
        "attempts": inputs.get("attempts"),
    }


def _process_equation_ocr_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    img_url = str(inputs.get("image_b64_url") or "")
    hint = str(inputs.get("extracted_hint") or "")
    mime = ""
    if img_url.startswith("data:") and ";base64," in img_url:
        mime = img_url[5 : img_url.find(";base64,")]
    return {
        "image": {"mime": mime, "data_url_len": len(img_url)},
        "extracted_hint": {"len": len(hint), "preview": _preview_text(hint, max_len=200)},
        "attempts": inputs.get("attempts"),
    }


class LLMClient:
    def __init__(self, settings: Settings):
        self._settings = settings
        self.text_model = settings.openai_model
        self.vision_model = settings.openai_vision_model
        client = OpenAI(api_key=settings.openai_api_key)
        if _langsmith_enabled():
            try:
                from langsmith.wrappers import wrap_openai

                client = wrap_openai(client)
            except Exception as exc:
                logger.warning("LangSmith tracing is enabled but OpenAI wrapping failed: %s", exc)

        self._client = client

    @property
    def mock(self) -> bool:
        return self._settings.mock_llm

    def parse(
        self,
        response_model: type[T],
        *,
        model: Optional[str] = None,
        messages: list[dict[str, Any]],
        temperature: float | None = None,
        attempts: int = 3,
    ) -> T:
        if self.mock:
            return self._mock_response(response_model, messages)

        model_name = model or self.text_model

        def _call() -> T:
            try:
                kwargs: dict[str, Any] = {
                    "model": model_name,
                    "messages": messages,
                    "response_format": response_model,
                }
                if temperature is not None:
                    kwargs["temperature"] = temperature
                completion = self._client.beta.chat.completions.parse(**kwargs)
                parsed = completion.choices[0].message.parsed
                if parsed is None:
                    raise LLMError("LLM returned empty parsed response")
                return parsed
            except PydanticValidationError as exc:
                raise LLMError(f"LLM output validation failed: {exc}") from exc
            except Exception as exc:
                raise LLMError(str(exc)) from exc

        return retry(_call, attempts=attempts, retry_on=(LLMError,))

    @_traceable_if_enabled(
        name="LLM: 実験ユニット抽出（method_extract）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:method_extract"],
        process_inputs=_process_text_fields(["method_text"]),
    )
    def method_extract(self, method_text: str) -> MethodExtractResult:
        from llm.prompts.method_extract import METHOD_EXTRACT_SYSTEM, build_method_extract_user

        return self.parse(
            MethodExtractResult,
            model=self.text_model,
            messages=[
                {"role": "system", "content": METHOD_EXTRACT_SYSTEM},
                {"role": "user", "content": build_method_extract_user(method_text)},
            ],
            attempts=3,
        )

    @_traceable_if_enabled(
        name="Vision LLM: 画像解析（image_analyze）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:vision_llm", "task:image_analyze"],
        process_inputs=_process_image_inputs,
    )
    def analyze_image(
        self,
        *,
        image_b64_url: str,
        experiments: list[dict[str, str]],
        method_context: str,
        extracted_hint: str = "",
        attempts: int = 3,
    ) -> ImageAnalysis:
        from llm.prompts.image_analyze import IMAGE_ANALYZE_SYSTEM, build_image_analyze_user

        messages = [
            {"role": "system", "content": IMAGE_ANALYZE_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": build_image_analyze_user(experiments, method_context, extracted_hint=extracted_hint)},
                    {"type": "image_url", "image_url": {"url": image_b64_url}},
                ],
            },
        ]

        def _call() -> ImageAnalysis:
            analysis = self.parse(ImageAnalysis, model=self.vision_model, messages=messages, attempts=1)
            if not analysis.belongs_to:
                raise LLMError("Image analysis belongs_to is empty")
            if caption_len(analysis.caption) > 15:
                raise LLMError("Image analysis caption exceeds 15 characters")
            if len(analysis.belongs_to) > 8:
                analysis = analysis.model_copy(update={"belongs_to": analysis.belongs_to[:8]})
            return analysis

        return retry(_call, attempts=attempts, retry_on=(LLMError,))

    @_traceable_if_enabled(
        name="LLM: 表解析（table_analyze）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:table_analyze"],
        process_inputs=_process_text_fields(["raw_csv"]),
    )
    def analyze_table(self, raw_csv: str, *, experiments: list[dict[str, str]], table_summary: str = "") -> TableAnalysis:
        from llm.prompts.table_analyze import TABLE_ANALYZE_SYSTEM, build_table_analyze_user

        return self.parse(
            TableAnalysis,
            model=self.text_model,
            messages=[
                {"role": "system", "content": TABLE_ANALYZE_SYSTEM},
                {"role": "user", "content": build_table_analyze_user(raw_csv, experiments, table_summary=table_summary)},
            ],
            attempts=2,
        )

    @_traceable_if_enabled(
        name="LLM: MVP 最初の実験選定（mvp_first_experiment）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:mvp_first_experiment"],
    )
    def mvp_first_experiment(self, *, payload: dict[str, Any]) -> MVPFirstExperimentOutput:
        from llm.prompts.mvp_first_experiment import MVP_FIRST_EXPERIMENT_SYSTEM, build_mvp_first_experiment_user

        return self.parse(
            MVPFirstExperimentOutput,
            model=self.text_model,
            messages=[
                {"role": "system", "content": MVP_FIRST_EXPERIMENT_SYSTEM},
                {"role": "user", "content": build_mvp_first_experiment_user(payload)},
            ],
            attempts=2,
        )

    @_traceable_if_enabled(
        name="LLM: Excel 結果表選択（excel_select）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:excel_select"],
    )
    def excel_select(self, *, payload: dict[str, Any]) -> ExcelSelectionOutput:
        from llm.prompts.excel_select import EXCEL_SELECT_SYSTEM, build_excel_select_user

        return self.parse(
            ExcelSelectionOutput,
            model=self.text_model,
            messages=[
                {"role": "system", "content": EXCEL_SELECT_SYSTEM},
                {"role": "user", "content": build_excel_select_user(payload)},
            ],
            attempts=2,
        )

    @_traceable_if_enabled(
        name="LLM: MVP 定量コメント生成（mvp_quant_comment）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:mvp_quant_comment"],
    )
    def mvp_quant_comment(self, *, payload: dict[str, Any]) -> MVPQuantCommentOutput:
        """
        Generate exactly one quantitative comment paragraph from structured JSON only.
        """
        from llm.prompts.mvp_quant_comment import MVP_QUANT_COMMENT_SYSTEM, build_mvp_quant_comment_user

        def _validate(paragraph: str, *, validation_payload: dict[str, Any]) -> None:
            if not paragraph:
                raise LLMError("mvp_quant_comment returned empty paragraph")
            if "\n" in paragraph:
                raise LLMError("mvp_quant_comment paragraph must not contain newlines")
            if "定量コメント" in paragraph or "定量的考察" in paragraph:
                raise LLMError("mvp_quant_comment must not include label words like '定量コメント/定量的考察'")
            # Hard formatting bans (prevent log/JSON dumping).
            if any(ch in paragraph for ch in ["{", "}", "[", "]", "`"]):
                raise LLMError("mvp_quant_comment must not include code/JSON-like characters")
            if "_" in paragraph:
                raise LLMError("mvp_quant_comment must not include snake_case/underscores")
            if re.search(r"(?:表|図)\s*\d", paragraph):
                raise LLMError("mvp_quant_comment must not reference tables/figures")
            if "以下に示す" in paragraph:
                raise LLMError("mvp_quant_comment must not include forward references")

            # Keep quant-comment validation permissive: allow creative length/phrasing,
            # while requiring at least some numeric grounding.
            if not re.search(r"\d", paragraph):
                raise LLMError("mvp_quant_comment must include at least one digit")

            # Missing data mention is optional; some users prefer focusing on theory/target consistency instead.

            forbidden = (
                validation_payload.get("禁止語")
                or validation_payload.get("forbidden_terms")
                or validation_payload.get("forbidden")
                or []
            )
            if isinstance(forbidden, list):
                for t in forbidden:
                    term = str(t or "")
                    if term and term in paragraph:
                        raise LLMError(f"mvp_quant_comment used forbidden term: {term}")

        def _call() -> MVPQuantCommentOutput:
            temperature = _env_temperature("REPORT_AGENT_QUANT_COMMENT_TEMPERATURE", default=0.7)
            try:
                out = self.parse(
                    MVPQuantCommentOutput,
                    model=self.text_model,
                    messages=[
                        {"role": "system", "content": MVP_QUANT_COMMENT_SYSTEM},
                        {"role": "user", "content": build_mvp_quant_comment_user(payload)},
                    ],
                    temperature=temperature,
                    attempts=1,
                )
            except LLMError as exc:
                if temperature is not None and "Unsupported value: 'temperature'" in str(exc):
                    out = self.parse(
                        MVPQuantCommentOutput,
                        model=self.text_model,
                        messages=[
                            {"role": "system", "content": MVP_QUANT_COMMENT_SYSTEM},
                            {"role": "user", "content": build_mvp_quant_comment_user(payload)},
                        ],
                        attempts=1,
                    )
                else:
                    raise
            paragraph = _compact_spaces(str(out.paragraph or ""))
            paragraph = _sanitize_mvp_quant_comment_paragraph(paragraph)
            paragraph = _ensure_mvp_quant_comment_has_digits(paragraph, validation_payload=payload)
            paragraph = _replace_series_with_driver(paragraph, validation_payload=payload)
            paragraph = _simplify_jargon(paragraph)
            _validate(paragraph, validation_payload=payload)
            return out.model_copy(update={"paragraph": paragraph})

        return retry(_call, attempts=2, retry_on=(LLMError,))

    def mvp_quant_comment_vision(
        self,
        *,
        system_prompt: str,
        user_text: str,
        image_b64_url: str,
        validation_payload: dict[str, Any],
        attempts: int = 2,
    ) -> MVPQuantCommentOutput:
        """
        Vision-based variant: user provides the prompt. We still enforce the same output contract/validations.
        """

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [{"type": "text", "text": user_text}, {"type": "image_url", "image_url": {"url": image_b64_url}}]},
        ]

        def _call() -> MVPQuantCommentOutput:
            temperature = _env_temperature("REPORT_AGENT_QUANT_COMMENT_TEMPERATURE", default=0.7)
            try:
                out = self.parse(
                    MVPQuantCommentOutput, model=self.vision_model, messages=messages, temperature=temperature, attempts=1
                )
            except LLMError as exc:
                # Some models only support default sampling params (e.g., temperature fixed at 1).
                if temperature is not None and "Unsupported value: 'temperature'" in str(exc):
                    out = self.parse(MVPQuantCommentOutput, model=self.vision_model, messages=messages, attempts=1)
                else:
                    raise
            paragraph = _compact_spaces(str(out.paragraph or ""))
            paragraph = _sanitize_mvp_quant_comment_paragraph(paragraph)
            paragraph = _ensure_mvp_quant_comment_has_digits(paragraph, validation_payload=validation_payload)
            paragraph = _replace_series_with_driver(paragraph, validation_payload=validation_payload)
            paragraph = _simplify_jargon(paragraph)
            if paragraph and not re.search(r"\d", paragraph):
                # Ground a minimal numeric token from the provided user_text (table/method context),
                # so the job doesn't fail just because the model omitted digits.
                m = re.search(r"\d+(?:\.\d+)?", user_text or "")
                if m:
                    paragraph = _compact_spaces(paragraph + f"（{m.group(0)}）")
            # Reuse the same validations by calling the text-mode validator through mvp_quant_comment().
            # (We call the inner validation by re-running minimal checks here.)
            # NOTE: keep in sync with mvp_quant_comment() validations.
            if not paragraph:
                raise LLMError("mvp_quant_comment_vision returned empty paragraph")
            if "\n" in paragraph:
                raise LLMError("mvp_quant_comment_vision paragraph must not contain newlines")
            if "定量コメント" in paragraph or "定量的考察" in paragraph:
                raise LLMError("mvp_quant_comment_vision must not include label words")
            if any(ch in paragraph for ch in ["{", "}", "[", "]", "`"]):
                raise LLMError("mvp_quant_comment_vision must not include code/JSON-like characters")
            if "_" in paragraph:
                raise LLMError("mvp_quant_comment_vision must not include snake_case/underscores")
            if re.search(r"(?:表|図)\s*\d", paragraph):
                raise LLMError("mvp_quant_comment_vision must not reference tables/figures")
            if "以下に示す" in paragraph:
                raise LLMError("mvp_quant_comment_vision must not include forward references")
            if not re.search(r"\d", paragraph):
                raise LLMError("mvp_quant_comment_vision must include at least one digit")

            # Missing data mention is optional; some users prefer focusing on theory/target consistency instead.

            forbidden = (
                validation_payload.get("禁止語")
                or validation_payload.get("forbidden_terms")
                or validation_payload.get("forbidden")
                or []
            )
            if isinstance(forbidden, list):
                for t in forbidden:
                    term = str(t or "")
                    if term and term in paragraph:
                        raise LLMError(f"mvp_quant_comment_vision used forbidden term: {term}")

            return out.model_copy(update={"paragraph": paragraph})

        return retry(_call, attempts=attempts, retry_on=(LLMError,))

    @_traceable_if_enabled(
        name="LLM: 画像割当再ランキング（image_rerank）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:image_rerank"],
    )
    def rerank_image_assignment(self, *, payload: dict, attempts: int = 2) -> AssignmentRerankOutput:
        from llm.prompts.assign_rerank_image import ASSIGN_RERANK_IMAGE_SYSTEM, build_assign_rerank_image_user

        sample_n_env = os.environ.get("REPORT_AGENT_ASSIGN_SAMPLE_N") or ""
        sample_n = int(sample_n_env) if sample_n_env.strip().isdigit() else 1
        sample_n = max(1, min(sample_n, 7))
        temp_env = os.environ.get("REPORT_AGENT_ASSIGN_SAMPLE_TEMPERATURE") or ""
        temperature = float(temp_env) if temp_env.strip() else 1.0
        if temperature < 0:
            temperature = 0.0
        if temperature > 1.5:
            temperature = 1.5
        temperature_arg: float | None = None if abs(temperature - 1.0) < 1e-9 else temperature

        messages = [
            {"role": "system", "content": ASSIGN_RERANK_IMAGE_SYSTEM},
            {"role": "user", "content": build_assign_rerank_image_user(payload)},
        ]

        if sample_n == 1:
            try:
                return self.parse(
                    AssignmentRerankOutput,
                    model=self.text_model,
                    messages=messages,
                    temperature=temperature_arg,
                    attempts=attempts,
                )
            except LLMError as exc:
                # Some models only support default sampling params (e.g., temperature fixed at 1).
                if temperature_arg is not None and "Unsupported value: 'temperature'" in str(exc):
                    logger.warning("Rerank image: temperature override unsupported for model=%s; retrying without it", self.text_model)
                    return self.parse(
                        AssignmentRerankOutput,
                        model=self.text_model,
                        messages=messages,
                        temperature=None,
                        attempts=attempts,
                    )
                raise

        results: list[AssignmentRerankOutput] = []
        for _ in range(sample_n):
            try:
                results.append(
                    self.parse(
                        AssignmentRerankOutput,
                        model=self.text_model,
                        messages=messages,
                        temperature=temperature_arg,
                        attempts=1,
                    )
                )
            except LLMError as exc:
                if temperature_arg is not None and "Unsupported value: 'temperature'" in str(exc):
                    logger.warning("Rerank image: temperature override unsupported for model=%s; continuing without it", self.text_model)
                    temperature_arg = None
                    results.append(
                        self.parse(
                            AssignmentRerankOutput,
                            model=self.text_model,
                            messages=messages,
                            temperature=None,
                            attempts=1,
                        )
                    )
                else:
                    raise

        scores: dict[str, float] = {}
        best_rationale: dict[str, str] = {}
        for r in results:
            key = (r.exp_key or "").strip()
            if not key:
                continue
            scores[key] = scores.get(key, 0.0) + float(r.score or 0.0)
            if key not in best_rationale and (r.rationale or "").strip():
                best_rationale[key] = r.rationale

        if not scores:
            return AssignmentRerankOutput(exp_key="", score=0.0, rationale="")

        best_key = max(scores.keys(), key=lambda k: scores[k])
        avg_score = min(1.0, max(0.0, scores[best_key] / sample_n))
        return AssignmentRerankOutput(exp_key=best_key, score=avg_score, rationale=best_rationale.get(best_key, ""))

    @_traceable_if_enabled(
        name="LLM: 表割当再ランキング（table_rerank）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:table_rerank"],
    )
    def rerank_table_assignment(self, *, payload: dict, attempts: int = 2) -> AssignmentRerankOutput:
        from llm.prompts.assign_rerank_table import ASSIGN_RERANK_TABLE_SYSTEM, build_assign_rerank_table_user

        sample_n_env = os.environ.get("REPORT_AGENT_ASSIGN_SAMPLE_N") or ""
        sample_n = int(sample_n_env) if sample_n_env.strip().isdigit() else 1
        sample_n = max(1, min(sample_n, 7))
        temp_env = os.environ.get("REPORT_AGENT_ASSIGN_SAMPLE_TEMPERATURE") or ""
        temperature = float(temp_env) if temp_env.strip() else 1.0
        if temperature < 0:
            temperature = 0.0
        if temperature > 1.5:
            temperature = 1.5
        temperature_arg: float | None = None if abs(temperature - 1.0) < 1e-9 else temperature

        messages = [
            {"role": "system", "content": ASSIGN_RERANK_TABLE_SYSTEM},
            {"role": "user", "content": build_assign_rerank_table_user(payload)},
        ]

        if sample_n == 1:
            try:
                return self.parse(
                    AssignmentRerankOutput,
                    model=self.text_model,
                    messages=messages,
                    temperature=temperature_arg,
                    attempts=attempts,
                )
            except LLMError as exc:
                if temperature_arg is not None and "Unsupported value: 'temperature'" in str(exc):
                    logger.warning("Rerank table: temperature override unsupported for model=%s; retrying without it", self.text_model)
                    return self.parse(
                        AssignmentRerankOutput,
                        model=self.text_model,
                        messages=messages,
                        temperature=None,
                        attempts=attempts,
                    )
                raise

        results: list[AssignmentRerankOutput] = []
        for _ in range(sample_n):
            try:
                results.append(
                    self.parse(
                        AssignmentRerankOutput,
                        model=self.text_model,
                        messages=messages,
                        temperature=temperature_arg,
                        attempts=1,
                    )
                )
            except LLMError as exc:
                if temperature_arg is not None and "Unsupported value: 'temperature'" in str(exc):
                    logger.warning("Rerank table: temperature override unsupported for model=%s; continuing without it", self.text_model)
                    temperature_arg = None
                    results.append(
                        self.parse(
                            AssignmentRerankOutput,
                            model=self.text_model,
                            messages=messages,
                            temperature=None,
                            attempts=1,
                        )
                    )
                else:
                    raise

        scores: dict[str, float] = {}
        best_rationale: dict[str, str] = {}
        for r in results:
            key = (r.exp_key or "").strip()
            if not key:
                continue
            scores[key] = scores.get(key, 0.0) + float(r.score or 0.0)
            if key not in best_rationale and (r.rationale or "").strip():
                best_rationale[key] = r.rationale

        if not scores:
            return AssignmentRerankOutput(exp_key="", score=0.0, rationale="")

        best_key = max(scores.keys(), key=lambda k: scores[k])
        avg_score = min(1.0, max(0.0, scores[best_key] / sample_n))
        return AssignmentRerankOutput(exp_key=best_key, score=avg_score, rationale=best_rationale.get(best_key, ""))

    @_traceable_if_enabled(
        name="LLM: 考察生成（discussion）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:discussion"],
    )
    def generate_discussion(self, prompts: list[str], *, experiments: list[dict[str, str]] | None = None) -> DiscussionOutput:
        from llm.prompts.discussion import DISCUSSION_SYSTEM, build_discussion_user

        return self.parse(
            DiscussionOutput,
            model=self.text_model,
            messages=[
                {"role": "system", "content": DISCUSSION_SYSTEM},
                {"role": "user", "content": build_discussion_user(prompts)},
            ],
            attempts=2,
        )

    @_traceable_if_enabled(
        name="LLM: 考察プロンプト抽出（discussion_extract）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:discussion_extract"],
        process_inputs=_process_text_fields(["text"]),
    )
    def extract_discussion_prompts(self, text: str) -> DiscussionExtractOutput:
        from llm.prompts.discussion_extract import DISCUSSION_EXTRACT_SYSTEM, build_discussion_extract_user

        def _call() -> DiscussionExtractOutput:
            out = self.parse(
                DiscussionExtractOutput,
                model=self.text_model,
                messages=[
                    {"role": "system", "content": DISCUSSION_EXTRACT_SYSTEM},
                    {"role": "user", "content": build_discussion_extract_user(text)},
                ],
                attempts=1,
            )
            # LLM-first: allow minimal repairs for noisy PDF text. Just normalize empties.
            cleaned: list[str] = []
            for p in out.prompts or []:
                s = (p or "").strip()
                if not s:
                    continue
                cleaned.append(s)
            return out.model_copy(update={"prompts": cleaned})

        return retry(_call, attempts=2, retry_on=(LLMError,))

    @_traceable_if_enabled(
        name="LLM: 章見出し検出（pdf_sections）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:pdf_sections"],
        process_inputs=_process_text_fields(["text"]),
    )
    def detect_pdf_sections(self, text: str) -> PdfSectionsOutput:
        from llm.prompts.pdf_sections import PDF_SECTIONS_SYSTEM, build_pdf_sections_user

        return self.parse(
            PdfSectionsOutput,
            model=self.text_model,
            messages=[
                {"role": "system", "content": PDF_SECTIONS_SYSTEM},
                {"role": "user", "content": build_pdf_sections_user(text)},
            ],
            attempts=2,
        )

    @_traceable_if_enabled(
        name="LLM: まとめ生成（summary）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:summary"],
        process_inputs=_process_text_fields(["pdf_text", "consideration_text"]),
    )
    def generate_summary(self, *, pdf_text: str, experiments: list[dict[str, str]], consideration_text: str) -> SummaryOutput:
        from llm.prompts.summary import SUMMARY_SYSTEM, build_summary_user

        return self.parse(
            SummaryOutput,
            model=self.text_model,
            messages=[
                {"role": "system", "content": SUMMARY_SYSTEM},
                {"role": "user", "content": build_summary_user(pdf_text, experiments, consideration_text)},
            ],
            attempts=2,
        )

    @_traceable_if_enabled(
        name="LLM: 参考文献生成（references）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:llm", "task:references"],
    )
    def generate_references(self, *, pdf_filename: str) -> ReferencesOutput:
        from llm.prompts.references import REFERENCES_SYSTEM, build_references_user

        return self.parse(
            ReferencesOutput,
            model=self.text_model,
            messages=[
                {"role": "system", "content": REFERENCES_SYSTEM},
                {"role": "user", "content": build_references_user(pdf_filename)},
            ],
            attempts=1,
        )

    @_traceable_if_enabled(
        name="Vision LLM: 数式行OCR（equation_line_ocr）",
        run_type="llm",
        tags=["workflow:report_agent", "agent:vision_llm", "task:equation_line_ocr"],
        process_inputs=_process_equation_ocr_inputs,
    )
    def ocr_equation_line(self, *, image_b64_url: str, extracted_hint: str, attempts: int = 2) -> EquationLineOCROutput:
        from llm.prompts.equation_line_ocr import EQUATION_LINE_OCR_SYSTEM, build_equation_line_ocr_user

        return self.parse(
            EquationLineOCROutput,
            model=self.vision_model,
            messages=[
                {"role": "system", "content": EQUATION_LINE_OCR_SYSTEM},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": build_equation_line_ocr_user(extracted_hint)},
                        {"type": "image_url", "image_url": {"url": image_b64_url}},
                    ],
                },
            ],
            attempts=attempts,
        )

    def stream_experimental_results_markdown(self, payload: dict[str, Any], *, model: Optional[str] = None):
        """
        Stream a Markdown "experimental results" section.

        Yields: text chunks (not JSON) for low-latency UI rendering.
        """

        from llm.prompts.experimental_results import EXPERIMENTAL_RESULTS_SYSTEM, build_experimental_results_user

        if self.mock:
            yield "# 実験結果\n\n## 1 実験\n入力が不足しているため一般論として述べる。"
            return

        model_name = model or self.text_model
        messages = [
            {"role": "system", "content": EXPERIMENTAL_RESULTS_SYSTEM},
            {"role": "user", "content": build_experimental_results_user(payload)},
        ]

        try:
            stream = self._client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True,
            )
            for event in stream:
                choice = event.choices[0] if event.choices else None
                delta = getattr(choice, "delta", None) if choice else None
                text = getattr(delta, "content", None) if delta else None
                if text:
                    yield text
        except Exception as exc:
            raise LLMError(str(exc)) from exc

    def _mock_response(self, response_model: type[T], messages: list[dict[str, Any]]) -> T:
        # Keep mock logic simple and deterministic for tests.
        if response_model is MethodExtractResult:
            # Extract headings like "3.1 タイトル" from the user text
            user_text = ""
            for m in messages:
                if m.get("role") == "user" and isinstance(m.get("content"), str):
                    user_text = m["content"]
                    break
            # method_text is embedded after a marker in our prompt builder
            lines = user_text.splitlines()
            parsed: list[dict[str, str]] = []
            for line in lines:
                line = line.strip()
                match = re.match(r"^([0-9]+(?:\.[0-9]+){1,3})\s+(.+)$", line)
                if not match:
                    continue
                parsed.append(
                    {
                        "exp_key": match.group(1),
                        "title": match.group(2).strip(),
                        "method_summary": "手順の要点を確認し、実験を行った。",
                    }
                )
            if not parsed:
                parsed = [
                    {"exp_key": "3.1", "title": "テスト実験", "method_summary": "手順の要点を確認し、実験を行った。"}
                ]
            return response_model.model_validate({"experiments": parsed})

        if response_model is ImageAnalysis:
            return response_model.model_validate(
                {
                    "caption": "テスト画像",
                    "quant_comment": "定量情報が読み取れなかったため、ここでは定性的に述べる。",
                    "belongs_to": [{"exp_key": "3.1", "score": 0.9, "rationale": "実験名と一致するため。"}],
                    "result_summary": "傾向が確認できた。",
                }
            )

        if response_model is TableAnalysis:
            return response_model.model_validate(
                {
                    "caption": "測定結果",
                    "quant_comment": "数値の変化から傾向を確認した。",
                    "belongs_to": [{"exp_key": "3.1", "score": 0.8, "rationale": "測定項目に対応するため。"}],
                    "result_summary": "表から傾向が分かった。",
                }
            )

        if response_model is DiscussionOutput:
            return response_model.model_validate(
                {
                    "units": [
                        {
                            "index": "1",
                            "discussion_active": "結果を比較し、考察する。",
                            "answer": None,
                        }
                    ]
                }
            )

        if response_model is DiscussionExtractOutput:
            # Extract imperative-looking lines from the provided user text (verbatim).
            user_text = ""
            for m in messages:
                if m.get("role") == "user" and isinstance(m.get("content"), str):
                    user_text = m["content"]
                    break
            # the content includes 'text:<<< ... >>>'
            marker_start = user_text.find("<<<")
            marker_end = user_text.rfind(">>>")
            raw = user_text[marker_start + 3 : marker_end] if marker_start != -1 and marker_end != -1 else user_text
            lines = []
            for line in raw.splitlines():
                l = line.strip()
                if not l:
                    continue
                if any(s in l for s in ["せよ", "しなさい", "求めよ", "示せ", "述べよ", "表しなさい", "表わしなさい"]):
                    lines.append(line)  # keep verbatim (including spaces)
            return response_model.model_validate({"prompts": lines[:20]})

        if response_model is SummaryOutput:
            return response_model.model_validate(
                {"summary": "目的と手順を確認し実験を行った。\n結果の傾向を整理し考察した。\n全体として理解が深まった。"}
            )

        if response_model is ReferencesOutput:
            return response_model.model_validate(
                {
                    "references": [
                        {
                            "id": "1",
                            "title": f"実験書PDF（配布資料）: {messages[-1].get('content','')}",
                            "year": "",
                            "authors": "",
                        }
                    ]
                }
            )

        if response_model is MVPFirstExperimentOutput:
            # Pick the first experiment in the provided payload.
            return response_model.model_validate({"exp_key": "3.1", "rationale": "番号が最小で先頭にあるため。"})

        if response_model is MVPQuantCommentOutput:
            return response_model.model_validate(
                {
                    "paragraph": "IBを0 μAから60 μAまで増加させると、VCE≈1 V付近におけるICは約0.008〜5.5 mAの範囲で増加する関係が確認された。特に、VCE≳1 Vの領域ではIB=60 μAの条件においてICは約5.5〜6.8 mAに分布し、平均は約6.2 mAであった。測定値には最大で約±29%のばらつきと欠測6点があるが、本結果からは当該条件下でICがIBによって制御される傾向が定量的に確認できた。"
                }
            )

        if response_model is ExcelSelectionOutput:
            return response_model.model_validate(
                {
                    "selection_type": "range",
                    "sheet": "Sheet1",
                    "a1_range": "A1:B3",
                    "chart_id": None,
                    "rationale": "最も単純な数値表を選択した。",
                }
            )

        # Fallback: attempt to parse JSON from assistant content when available
        for m in reversed(messages):
            if isinstance(m.get("content"), str):
                try:
                    return response_model.model_validate(json.loads(m["content"]))
                except Exception:
                    continue

        raise LLMError(f"Mock LLM has no handler for {response_model.__name__}")
