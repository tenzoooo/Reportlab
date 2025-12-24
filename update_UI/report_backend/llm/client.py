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
from llm.schemas.method_extract import MethodExtractResult
from llm.schemas.pdf_sections import PdfSectionsOutput
from llm.schemas.references import ReferencesOutput
from llm.schemas.summary import SummaryOutput
from models.contracts import ImageAnalysis, TableAnalysis


logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def _compact_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _is_truthy(value: str | None) -> bool:
    if not value:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _langsmith_enabled() -> bool:
    return _is_truthy(os.environ.get("LANGSMITH_TRACING")) or _is_truthy(os.environ.get("LANGCHAIN_TRACING_V2"))


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
        attempts: int = 3,
    ) -> T:
        if self.mock:
            return self._mock_response(response_model, messages)

        model_name = model or self.text_model

        def _call() -> T:
            try:
                completion = self._client.beta.chat.completions.parse(
                    model=model_name,
                    messages=messages,
                    response_format=response_model,
                )
                parsed = completion.choices[0].message.parsed
                if parsed is None:
                    raise LLMError("LLM returned empty parsed response")
                return parsed
            except PydanticValidationError as exc:
                raise LLMError(f"LLM output validation failed: {exc}") from exc
            except Exception as exc:
                raise LLMError(str(exc)) from exc

        return retry(_call, attempts=attempts, retry_on=(LLMError,))

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

    def analyze_image(
        self,
        *,
        image_b64_url: str,
        experiments: list[dict[str, str]],
        method_context: str,
        attempts: int = 3,
    ) -> ImageAnalysis:
        from llm.prompts.image_analyze import IMAGE_ANALYZE_SYSTEM, build_image_analyze_user

        messages = [
            {"role": "system", "content": IMAGE_ANALYZE_SYSTEM},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": build_image_analyze_user(experiments, method_context)},
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
            if len(analysis.belongs_to) > 3:
                analysis = analysis.model_copy(update={"belongs_to": analysis.belongs_to[:3]})
            return analysis

        return retry(_call, attempts=attempts, retry_on=(LLMError,))

    def analyze_table(self, raw_csv: str, *, experiments: list[dict[str, str]]) -> TableAnalysis:
        from llm.prompts.table_analyze import TABLE_ANALYZE_SYSTEM, build_table_analyze_user

        return self.parse(
            TableAnalysis,
            model=self.text_model,
            messages=[
                {"role": "system", "content": TABLE_ANALYZE_SYSTEM},
                {"role": "user", "content": build_table_analyze_user(raw_csv, experiments)},
            ],
            attempts=2,
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

        # Fallback: attempt to parse JSON from assistant content when available
        for m in reversed(messages):
            if isinstance(m.get("content"), str):
                try:
                    return response_model.model_validate(json.loads(m["content"]))
                except Exception:
                    continue

        raise LLMError(f"Mock LLM has no handler for {response_model.__name__}")
