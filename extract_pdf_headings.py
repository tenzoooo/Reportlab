from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF
from openai import OpenAI
from pydantic import BaseModel, Field


ROOT_DIR = Path(__file__).resolve().parent
REPORT_BACKEND_DIR = ROOT_DIR / "update_UI" / "report_backend"
if str(REPORT_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(REPORT_BACKEND_DIR))

try:
    from core.text import normalize_pdf_text
except Exception:  # Fallback: keep raw text if core is unavailable.
    def normalize_pdf_text(text: str) -> str:
        return text or ""


ENV_OPENAI_API_KEY = "OPENAI_API_KEY"
ENV_OPENAI_MODEL = "OPENAI_MODEL"
ENV_LOCAL_PATH = ROOT_DIR / "update_UI" / ".env.local"

HEADING_KINDS = (
    "doc_heading",
    "discussion_heading",
    "discussion_prompt",
    "appendix_like",
    "report_requirements",
    "other",
)

SYSTEM_PROMPT = f"""
あなたはPDFのテキスト抽出結果から「見出し行」だけを抽出する。

必須:
- 出力はJSONのみ（スキーマに厳密準拠）
- title は対象行のテキストをそのまま使う（要約・改変しない）
- page は1始まり
- line_index は「各ページの非空行」配列の0始まり
- section は見出し行に明示された番号を文字列で入れる（無い場合は空文字）
- level は章/節/小節の階層（例: "2"=1, "2.3"=2, "2.3.1"=3）
- heading_kind は {HEADING_KINDS} のいずれか
- clean_confidence は0〜1の実数
- clean_reason は "numbered_heading" / "keyword_heading" / "format_heading" / "other"

判断基準の例:
- "考察"や"Discussion"が章見出し: discussion_heading
- "問"や"〜せよ"の設問見出し: discussion_prompt
- 付録/提出/注意など: appendix_like
- "レポートについて"など要件系: report_requirements
- それ以外の通常章: doc_heading
"""


@dataclass(frozen=True)
class PageLines:
    page: int
    lines: list[str]


class HeadingItem(BaseModel):
    section: str = Field(description="見出し番号。無い場合は空文字")
    title: str = Field(description="見出し行の原文テキスト")
    level: int = Field(description="1=章,2=節,3=小節")
    page: int = Field(description="1始まりのページ番号")
    line_index: int = Field(description="ページ内の非空行インデックス（0始まり）")
    heading_kind: str = Field(description="見出しの分類")
    clean_confidence: float = Field(description="0〜1の信頼度")
    clean_reason: str = Field(description="採用理由の簡潔なラベル")


class HeadingExtractionOutput(BaseModel):
    items: list[HeadingItem]


def _read_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"{name} is required in environment")
    return value


def _load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        if key not in os.environ:
            os.environ[key] = value


def _iter_page_lines(pdf_path: Path) -> Iterable[PageLines]:
    doc = fitz.open(pdf_path)
    flags = 0
    flags |= getattr(fitz, "TEXT_DEHYPHENATE", 0)
    flags |= getattr(fitz, "TEXT_PRESERVE_WHITESPACE", 0)

    for idx, page in enumerate(doc, start=1):
        try:
            raw = page.get_text("text", flags=flags, sort=True)
        except TypeError:
            raw = page.get_text()
        text = normalize_pdf_text(raw or "")
        raw_lines = text.splitlines()
        lines = [line.strip() for line in raw_lines if line.strip()]
        yield PageLines(page=idx, lines=lines)


def _build_user_prompt(pages: list[PageLines]) -> str:
    parts: list[str] = []
    parts.append("各ページの非空行を番号付きで示す。line_indexは各ページの非空行リストの0始まり。")
    for page in pages:
        parts.append(f"\n=== Page {page.page} ===")
        for i, line in enumerate(page.lines):
            parts.append(f"L{i}: {line}")
    return "\n".join(parts)


def _call_openai(*, model: str, api_key: str, user_prompt: str) -> HeadingExtractionOutput:
    client = OpenAI(api_key=api_key)
    completion = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format=HeadingExtractionOutput,
    )
    message = completion.choices[0].message
    if getattr(message, "refusal", None):
        raise RuntimeError(f"LLM refusal: {message.refusal}")
    parsed = message.parsed
    if parsed is None:
        raise RuntimeError("LLM returned empty parsed response")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description="PDF全文を抽出し、LLMで見出しをJSON抽出する")
    parser.add_argument("pdf", type=Path, help="入力PDFファイル")
    parser.add_argument("--out", type=Path, default=None, help="出力JSONの保存先（省略時はstdout）")
    args = parser.parse_args()

    if not args.pdf.exists():
        raise FileNotFoundError(f"PDF not found: {args.pdf}")

    _load_env_file(ENV_LOCAL_PATH)
    api_key = _read_env(ENV_OPENAI_API_KEY)
    model = _read_env(ENV_OPENAI_MODEL)

    pages = list(_iter_page_lines(args.pdf))
    user_prompt = _build_user_prompt(pages)
    output = _call_openai(model=model, api_key=api_key, user_prompt=user_prompt)

    payload = output.model_dump()
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)

    if args.out:
        args.out.write_text(rendered, encoding="utf-8")
    else:
        print(rendered)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
