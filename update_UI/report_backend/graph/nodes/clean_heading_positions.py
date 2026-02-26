from __future__ import annotations

import json
import os
import re
import unicodedata
from bisect import bisect_left
from typing import Iterable, Optional

from pydantic import BaseModel, Field, ValidationError

from core.storage import Storage
from graph.state import AgentState, DiscussionUnit, MethodNumberEvidence, MethodTextReview, PdfHeadingEvidence, PdfStructuredSection, PdfTextBlock, QualityIssue, ValidationIssue, now_iso
from llm.client import LLMClient

_MARKER_LEN = 20

_METHOD_KEYWORDS = ("実験", "実験方法", "方法", "実験手順", "手順", "Method", "Methods")
_DISCUSSION_KEYWORDS = ("考察", "考察事項", "検討事項", "報告事項", "報告及び検討事項", "Discussion")
_METHOD_EXCLUDE_PREFIXES = ("手順書", "実験書", "指導書")

_HEADING_NUMBER_RE = re.compile(r"^\s*(?P<section>\d+(?:[.．]\d+)*)(?:[.．])?\s*(?P<title>.+)$")
_METHOD_ITEM_RE = re.compile(r"^\s*(?P<section>\d+(?:[.．]\d+)*)(?:[.．])?\s+(?P<title>.+)$")
_B_LAYER_LLM_FAIL_FAST_ENV = "REPORT_AGENT_B_LAYER_LLM_FAIL_FAST"


class _LLMSectionMarkerEntry(BaseModel):
    found: bool
    heading: Optional[str] = None
    start_excerpt_20: Optional[str] = None
    end_excerpt_20: Optional[str] = None
    notes: str


class _LLMSectionMarkersResponse(BaseModel):
    methods: _LLMSectionMarkerEntry
    discussion: _LLMSectionMarkerEntry


class _LLMMethodOutline(BaseModel):
    method_number: str = Field(description="実験方法の番号。例: 4.1")
    method_name: str = Field(description="実験名")
    method_text_prefix5: str = Field(description="実験方法本文の先頭5文字")
    method_text_suffix5: str = Field(description="実験方法本文の末尾5文字")


class _LLMMethodOutlineResponse(BaseModel):
    items: list[_LLMMethodOutline] = Field(default_factory=list)


class _LLMDiscussionUnit(BaseModel):
    discussion_chapter: Optional[int] = None
    prompt_index: int
    prompt_text: str


class _LLMDiscussionUnitsResponse(BaseModel):
    items: list[_LLMDiscussionUnit] = Field(default_factory=list)


class _LLMMethodTextReview(BaseModel):
    passed: bool
    issues: list[str] = Field(default_factory=list)
    bad_excerpt: Optional[str] = None


class _LLMHeadingItem(BaseModel):
    heading_line: str = Field(description="PDF本文からの見出し行（必ず原文の部分文字列）")
    level: Optional[int] = Field(default=None, ge=1, le=6)
    notes: Optional[str] = None


class _LLMHeadingResponse(BaseModel):
    items: list[_LLMHeadingItem] = Field(default_factory=list)


class _LLMHeadingPickResponse(BaseModel):
    method_heading_line: Optional[str] = None
    discussion_heading_line: Optional[str] = None


class _LLMHeadingRangeResponse(BaseModel):
    method_start_heading_line: Optional[str] = None
    discussion_start_heading_line: Optional[str] = None


class _HeadingReviewIssue(BaseModel):
    at: str
    reason: str


class _HeadingReviewResult(BaseModel):
    issues: list[_HeadingReviewIssue] = Field(default_factory=list)
    retry: bool = False


def _normalize_for_match(text: str) -> str:
    normalized: list[str] = []
    for ch in text or "":
        cat = unicodedata.category(ch)
        if cat.startswith("Z") or cat.startswith("P") or cat.startswith("S"):
            continue
        if ch.isspace():
            continue
        normalized.append(ch)
    return "".join(normalized)


def _normalize_section(section: str) -> str:
    s = (section or "").strip().replace("．", ".")
    s = s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    return s.rstrip(".")


def _normalize_heading_for_keyword(text: str) -> str:
    s = unicodedata.normalize("NFKC", text or "")
    s = re.sub(r"\s+", "", s)
    return s


def _extract_section_number_from_heading(text: str) -> str:
    s = (text or "").strip().replace("．", ".")
    s = s.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    m = _HEADING_NUMBER_RE.match(s)
    if m:
        return _normalize_section(m.group("section"))
    return ""


def _split_section_numbers(section: str) -> list[int] | None:
    if not section:
        return None
    raw = _normalize_section(section)
    if not raw:
        return None
    parts = re.split(r"[.\-‐‑–—−ー]+", raw)
    nums: list[int] = []
    for part in parts:
        if not part or not part.isdigit():
            return None
        nums.append(int(part))
    return nums or None


def _review_heading_sequence(items: list[_LLMHeadingItem]) -> _HeadingReviewResult:
    if not items:
        return _HeadingReviewResult()
    last_by_parent: dict[tuple[int, ...], int] = {}
    issues: list[_HeadingReviewIssue] = []
    for item in items:
        heading_line = (item.heading_line or "").strip()
        if not heading_line:
            continue
        section_number = _extract_section_number_from_heading(heading_line)
        path = _split_section_numbers(section_number)
        if not path:
            continue
        issue_reason = ""
        for depth in range(1, len(path) + 1):
            parent = tuple(path[: depth - 1])
            current = path[depth - 1]
            last = last_by_parent.get(parent)
            if last is None:
                last_by_parent[parent] = current
                continue
            if current == last + 1:
                last_by_parent[parent] = current
                continue
            if current <= last:
                issue_reason = (
                    f"連番の逆順または重複: parent={'.'.join(map(str, parent)) or 'root'} "
                    f"last={last} current={current} section_number={section_number}"
                )
            else:
                issue_reason = (
                    f"欠番: parent={'.'.join(map(str, parent)) or 'root'} "
                    f"expected={last + 1} current={current} section_number={section_number}"
                )
            last_by_parent[parent] = current
            break
        if issue_reason:
            issues.append(_HeadingReviewIssue(at=heading_line, reason=issue_reason))
    return _HeadingReviewResult(issues=issues, retry=bool(issues))


def _normalized_with_map(text: str) -> tuple[str, list[int]]:
    normalized: list[str] = []
    index_map: list[int] = []
    for idx, ch in enumerate(text or ""):
        cat = unicodedata.category(ch)
        if cat.startswith("Z") or cat.startswith("P") or cat.startswith("S"):
            continue
        if ch.isspace():
            continue
        normalized.append(ch)
        index_map.append(idx)
    return "".join(normalized), index_map


def _find_span_by_markers(text: str, *, start_marker: str, end_marker: str) -> tuple[int, int] | None:
    if not text:
        return None
    if not start_marker or not end_marker:
        return None
    normalized_text, index_map = _normalized_with_map(text)
    norm_start = _normalize_for_match(start_marker)
    norm_end = _normalize_for_match(end_marker)
    if not norm_start or not norm_end:
        return None
    start_pos = normalized_text.find(norm_start)
    if start_pos < 0:
        return None
    end_pos = normalized_text.find(norm_end, start_pos + len(norm_start))
    if end_pos < 0:
        return None
    start_idx = index_map[start_pos]
    end_idx = index_map[end_pos + len(norm_end) - 1] + 1
    if end_idx <= start_idx:
        return None
    return start_idx, end_idx


def _slice_by_markers(text: str, *, start_marker: str, end_marker: str) -> str:
    span = _find_span_by_markers(text, start_marker=start_marker, end_marker=end_marker)
    if not span:
        return ""
    return text[span[0] : span[1]].strip()


def _find_start_index(text: str, marker: str) -> int | None:
    if not text or not marker:
        return None
    normalized_text, index_map = _normalized_with_map(text)
    norm_marker = _normalize_for_match(marker)
    if not norm_marker:
        return None
    start_pos = normalized_text.find(norm_marker)
    if start_pos < 0:
        return None
    return index_map[start_pos]


def _find_next_chapter_start(text: str, current_chapter: int) -> int | None:
    if not text or current_chapter <= 0:
        return None
    pattern = re.compile(rf"(?m)^\s*{current_chapter + 1}[.．]\s*(?!\d)")
    match = pattern.search(text)
    if not match:
        return None
    return match.start()


def _find_method_heading_start(text: str) -> int | None:
    if not text:
        return None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if any(line.startswith(prefix) for prefix in _METHOD_EXCLUDE_PREFIXES):
            continue
        if not any(kw in line for kw in _METHOD_KEYWORDS):
            continue
        if _HEADING_NUMBER_RE.match(line):
            return text.find(raw_line)
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if any(line.startswith(prefix) for prefix in _METHOD_EXCLUDE_PREFIXES):
            continue
        if any(kw in line for kw in _METHOD_KEYWORDS):
            return text.find(raw_line)
    return None


def _ensure_page_texts(state: AgentState, *, storage: Optional[Storage]) -> bool:
    if state.pdf.page_texts:
        return False
    if not storage:
        return False
    if not state.pdf.page_texts_key:
        return False
    raw = storage.get_json(state.pdf.page_texts_key)
    state.pdf.page_texts = [PdfTextBlock.model_validate(item) for item in raw or []]
    return True


def _build_line_index(page_texts: list[PdfTextBlock]) -> list[tuple[int, int, int, str]]:
    indexed: list[tuple[int, int, int, str]] = []
    global_index = 0
    for block in page_texts:
        lines = block.text.splitlines()
        for idx, raw in enumerate(lines):
            line = " ".join((raw or "").strip().split())
            indexed.append((block.page, idx, global_index, line))
            global_index += 1
    return indexed


def _locate_heading_line(indexed: list[tuple[int, int, int, str]], heading_line: str) -> tuple[int | None, int | None, int | None, str]:
    if not heading_line:
        return None, None, None, ""
    needle = " ".join((heading_line or "").strip().split())
    if not needle:
        return None, None, None, ""
    for page, line_index, global_index, line in indexed:
        if not line:
            continue
        if needle in line or line in needle:
            return page, line_index, global_index, line
    return None, None, None, ""


def _pick_heading_line(section_text: str, keywords: Iterable[str]) -> tuple[str, str, str]:
    for raw_line in section_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if not any(kw in line for kw in keywords):
            continue
        match = _HEADING_NUMBER_RE.match(line)
        if match:
            section = match.group("section")
            title = match.group("title").strip()
            return section, title, line
        return "", line, line
    return "", "", ""


def _extract_method_candidates(method_text: str) -> list[tuple[str, str, str, int]]:
    candidates: list[tuple[str, str, str, int]] = []
    seen: set[tuple[str, str]] = set()
    for idx, raw_line in enumerate(method_text.splitlines()):
        line = raw_line.strip()
        if not line:
            continue
        if any(kw in line for kw in _DISCUSSION_KEYWORDS):
            continue
        match = _METHOD_ITEM_RE.match(line)
        if not match:
            continue
        section = _normalize_section(match.group("section"))
        title = match.group("title").strip()
        if not section or not title:
            continue
        if "." not in section:
            continue
        first_seg = section.split(".", 1)[0]
        try:
            if int(first_seg) <= 0:
                continue
        except Exception:
            continue
        key = (section, title)
        if key in seen:
            continue
        seen.add(key)
        candidates.append((section, title, line, idx))
    return candidates


def _build_method_segments(method_text: str, candidates: list[tuple[str, str, str, int]]) -> dict[str, str]:
    if not method_text or not candidates:
        return {}
    lines = method_text.splitlines()
    segments: dict[str, str] = {}
    sorted_candidates = sorted(candidates, key=lambda v: v[3])
    for i, (section, _title, _line, start_idx) in enumerate(sorted_candidates):
        end_idx = len(lines)
        if i + 1 < len(sorted_candidates):
            end_idx = sorted_candidates[i + 1][3]
        segment_text = "\n".join(lines[start_idx:end_idx]).strip()
        if segment_text:
            segments[section] = segment_text
    return segments


def _build_parent_child_map(exp_keys: list[str]) -> tuple[dict[str, list[str]], dict[str, str]]:
    children_map: dict[str, list[str]] = {key: [] for key in exp_keys}
    parent_map: dict[str, str] = {key: "" for key in exp_keys}
    key_set = set(exp_keys)
    for key in exp_keys:
        parts = key.split(".")
        if len(parts) <= 1:
            continue
        parent = ".".join(parts[:-1])
        if parent in key_set:
            parent_map[key] = parent
            children_map[parent].append(key)
    return children_map, parent_map


def _build_marker_messages(full_text: str) -> list[dict]:
    system = (
        "あなたは「長いPDFテキスト」から特定の章を切り出す抽出器です。\n"
        "以下のルールに厳密に従い、JSONのみを出力してください（説明文は禁止）。\n\n"
        "# 入力\n"
        "- pdf_text: PDFから抽出した全文テキスト（改行・ページ番号・図表番号・空白の乱れを含む）\n\n"
        "# 目的\n"
        "- 「実験方法（methods/procedure）」章\n"
        "- 「考察（discussion）」章\n"
        "について、それぞれ\n"
        "1) 章本文の先頭20文字\n"
        "2) 章本文の末尾20文字\n"
        "を抽出する。\n\n"
        "# 章の見つけ方（重要）\n"
        "1. 見出し候補（大文字小文字・全角半角・空白・句読点ゆれを許容）\n"
        "- methods系: \"実験方法\", \"実験手順\", \"方法\", \"手順\", \"実験\", \"Procedure\", \"Methods\", \"Method\"\n"
        "- discussion系: \"考察\", \"Discussion\", \"考察問題\"（※「考察問題」「担当考察」などは考察に含めてよい）\n"
        "- 除外: 見出し行が「手順書」「実験書」「指導書」から始まる場合は実験方法として扱わない\n"
        "2. 見出しは必ず行頭が「[数字].」で始まる（例: \"4.\"）。\n"
        "高確率で実験方法は「{数字}.methods系」で始まる。\n"
        "実験方法はあなたが抽出する考察の直前までです。\n\n"
        "## 例\n"
        "入力例）\n"
        "電気電子実験 手順書\n"
        "RCフィルタ\n"
        "\n"
        "1. 目的\n"
        "RC低域フィルタの周波数特性を測定し，遮断周波数と位相遅れを確認する。\n"
        "\n"
        "2. 理論\n"
        "伝達関数H(jω)=1/(1+jωRC)より，利得|H|と位相φ=-tan^-1(ωRC)が得られる。\n"
        "\n"
        "3. 使用器具\n"
        "抵抗(1 kΩ)，コンデンサ(0.1 μF)，関数発生器，オシロスコープ，ブレッドボード。\n"
        "\n"
        "4. 実験方法\n"
        "4.1. 回路構成\n"
        "4.1.1. 部品定数\n"
        "R=1.0 kΩ，C=0.10 μFとする。配線は最短にし，GNDは一点に集める。\n"
        "4.1.2. 配線手順\n"
        "ブレッドボードにRとCを直列に接続し，入力VinをR側に印加する。出力VoutはCの両端から取り出す。\n"
        "\n"
        "4.2. 測定手順\n"
        "4.2.1. 入力条件\n"
        "関数発生器の出力を正弦波1.0 Vpp，オフセット0 Vに設定する。\n"
        "4.2.2. 周波数掃引\n"
        "周波数を10 Hzから100 kHzまで掃引し，各点でVout_ppと位相差Δtを測定する。\n"
        "4.2.3. 計算方法\n"
        "利得[dB]=20log10(Vout_pp/Vin_pp)，位相[deg]=-360·f·Δtとして計算する。\n"
        "\n"
        "5. 考察\n"
        "5.1. 遮断周波数の差異\n"
        "実測fcと理論値fc=1/(2πRC)の差の要因を，部品誤差と測定誤差に分けて述べよ。\n"
        "5.2. 位相遅れの振る舞い\n"
        "周波数が高いほど位相が-90°に近づく理由を，インピーダンスの観点から説明せよ。\n"
        "5.3. 測定系の影響\n"
        "プローブ容量や信号源内部抵抗がfc推定に与える影響を考察せよ。\n"
        "\n"
        "6. まとめ\n"
        "振幅特性と位相特性を測定し，理論式との整合を確認した。\n"
        "\n"
        "出力例）\n"
        "{\n"
        "  \"methods\": {\n"
        "    \"found\": true,\n"
        "    \"heading\": \"4. 実験方法\",\n"
        "    \"start_excerpt_20\": \"4.1. 回路構成\\n4.1\",\n"
        "    \"end_excerpt_20\": \"位相[deg]=-360·f·Δtとして計算する。\",\n"
        "    \"notes\": \"found_by_numbered_heading\"\n"
        "  },\n"
        "  \"discussion\": {\n"
        "    \"found\": true,\n"
        "    \"heading\": \"5. 考察\",\n"
        "    \"start_excerpt_20\": \"5.1. 遮断周波数の差異\\n実\",\n"
        "    \"end_excerpt_20\": \"信号源内部抵抗がfc推定に与える影響を考察せよ。\",\n"
        "    \"notes\": \"found_by_numbered_heading\"\n"
        "  }\n"
        "}\n\n"
        "# 出力\n"
        "以下のJSONフォーマットに従って出力する。\n"
        "{\n"
        "  \"methods\": {\n"
        "    \"found\": boolean,\n"
        "    \"heading\": string|null,\n"
        "    \"start_excerpt_20\": string|null,\n"
        "    \"end_excerpt_20\": string|null,\n"
        "    \"notes\": string\n"
        "  },\n"
        "  \"discussion\": {\n"
        "    \"found\": boolean,\n"
        "    \"heading\": string|null,\n"
        "    \"start_excerpt_20\": string|null,\n"
        "    \"end_excerpt_20\": string|null,\n"
        "    \"notes\": string\n"
        "  }\n"
        "}\n\n"
        "# notes には以下のどれかを短く入れる\n"
        "- \"ok\"\n"
        "- \"not_found\"\n"
        "- \"ambiguous_chose_first\"\n"
        "- \"found_by_heading_keyword_only\"\n"
        "- \"found_by_numbered_heading\"\n\n"
        "# 実行\n"
        "次の pdf_text を処理せよ。\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": f"[pdf_text]\n<<<\n{full_text}\n>>>"},
    ]


def _build_method_messages(
    method_text: str,
    discussion_text: str,
    *,
    candidates: list[tuple[str, str, bool]],
) -> list[dict]:
    system = (
        "実験方法/考察の章のテキストから、各実験方法の見出し番号と実験名を抽出する。"
        "出力はJSONのみで items=[{method_number, method_name, method_text_prefix5, method_text_suffix5}]。"
        f"method_text_prefix5/ suffix5 は該当実験方法本文の先頭/末尾{_MARKER_LEN}文字（原文そのまま）。"
        f"{_MARKER_LEN}文字未満ならそのまま返す。"
        "見出し番号は '1.' のような番号形式を優先する。"
        "親実験（例: 4.1 に 4.1.1 がある場合の 4.1）は出力しない。"
    )
    payload = {
        "method_text": method_text,
        "discussion_text": discussion_text,
        "method_candidates": [
            {"method_number": section, "method_name": title, "is_parent": is_parent}
            for section, title, is_parent in candidates
        ],
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _build_discussion_messages(discussion_text: str) -> list[dict]:
    system = (
        "考察の章テキストから考察文を抽出し、命令形を能動態に変換する。\n"
        "出力はJSONのみ。items=[{discussion_chapter, prompt_index, prompt_text}]。\n"
        "discussion_chapter は章番号（例: 5）、prompt_index は上から1始まり、prompt_text は能動態の文章。\n"
        "命令形の例: 〜せよ/〜しなさい/〜述べよ/〜示せ/〜表せ。\n"
        "能動態の例: 〜する/〜述べる/〜示す/〜表す。\n"
        "本文に含まれる考察指示だけを対象とし、不要な本文は含めない。\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": discussion_text},
    ]


def _build_method_text_review_messages(method_text: str) -> list[dict]:
    system = (
        "method_text が実験方法章として適切かレビューする。"
        "出力はJSONのみで {passed:boolean, issues:[string], bad_excerpt:string|null}。"
        "不適切な場合は bad_excerpt に問題箇所の短い抜粋を入れる。"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": method_text},
    ]


def _build_heading_messages(full_text: str, *, review_issues: list[_HeadingReviewIssue]) -> list[dict]:
    system = (
        "あなたはPDF全文テキストから「見出し行」を抽出する抽出器です。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# ルール\n"
        "- heading_line は必ず入力テキストの部分文字列（完全一致）にする。\n"
        "- 見出しは本文構造の骨格になる行のみ。図表番号やページ番号、ヘッダ/フッタは除外。\n"
        "- 番号付き見出しは必ず抽出する（例: 4. 実験 / 4.2.1. 反転増幅回路 / 5. 考察）。\n"
        "- 小見出し（4.2.1, 4.2.2 など）も漏れなく抽出する。\n"
        "- 「使用方法」「機器の使用方法」など機器操作の節は見出しでも除外。\n"
        "- 優先抽出語（見出しに含まれる場合は優先的に抽出）:\n"
        "  - method: 実験 / 実験方法 / 実験手順 / 方法 / 手順\n"
        "  - discussion: 考察 / 検討事項 / 報告事項\n"
        "  - theory: 理論 / 原理\n"
        "- 除外語（見出しに含まれる場合は除外）: 使用方法 / 機器の使用方法 / 手順書 / 指導書 / 目的\n"
        "- 可能な限り順序は本文出現順にする。\n"
        "- level は 1-6 の整数。番号付き見出しは階層に対応させる（例: 1 -> level1, 1.1 -> level2）。\n"
        "- 番号なしの見出しは文脈で妥当な階層を推定し、過度に細かくしない。\n\n"
        "# 出力\n"
        "{\n"
        "  \"items\": [\n"
        "    {\"heading_line\": \"...\", \"level\": 1, \"notes\": \"...\"}\n"
        "  ]\n"
        "}\n"
    )
    payload = {
        "pdf_text": full_text,
        "reviewer_issues": [issue.model_dump() for issue in review_issues],
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def _build_heading_pick_messages(heading_items: list[dict[str, str | int]]) -> list[dict]:
    system = (
        "あなたは見出し行の一覧から「実験方法」と「考察」に該当する見出し行を選ぶ分類器です。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# ルール\n"
        "- method_heading_line と discussion_heading_line は必ず入力リスト内の heading_line をそのまま返す。\n"
        "- 見出しが存在しない場合は null を返す。\n"
        "- methods系: 実験方法/実験手順/方法/手順/Method/Methods など\n"
        "- discussion系: 考察/検討事項/Discussion など\n\n"
        "# 出力\n"
        "{\n"
        "  \"method_heading_line\": string|null,\n"
        "  \"discussion_heading_line\": string|null\n"
        "}\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"headings": heading_items}, ensure_ascii=False)},
    ]


def _build_heading_range_messages(heading_items: list[dict[str, str | int]]) -> list[dict]:
    system = (
        "あなたは見出し行の一覧から「実験方法」と「考察」の章開始見出しを特定する分類器です。\n"
        "出力はJSONのみ（説明文は禁止）。\n\n"
        "# ルール\n"
        "- method_start_heading_line / discussion_start_heading_line は必ず入力リスト内の heading_line をそのまま返す。\n"
        "- 章開始は「その章のサブツリー全体（配下の小見出し含む）を包含する最上位の開始見出し」を選ぶ。\n"
        "- 章の開始は原則として番号付き見出し（例: 4. 実験 / 5. 考察）を優先する。\n"
        "- method の start は「実験」章（例: 4. 実験/4. 実験方法/4. 実験手順）の開始見出し。\n"
        "- discussion の start は「考察」章（例: 5. 考察/検討事項）の開始見出し。\n"
        "- 「使用方法」「機器の使用方法」など機器操作の章は method ではない。\n"
        "- 小見出し（4.2.1 など）は start ではなく、その章の範囲内として扱う。\n"
        "- 見出しが存在しない場合は null を返す。\n"
        "- methods系: 実験方法/実験手順/方法/手順/Method/Methods など\n"
        "- discussion系: 考察/検討事項/Discussion など\n\n"
        "# スコアリング（同点なら上に出現する見出しを優先）\n"
        "- +30: 見出しに「実験」「実験方法」「実験手順」\n"
        "- +30: 見出しに「考察」「検討事項」「報告事項」\n"
        "- -10: 「目的」「結果」「説明せよ」「(b)」など指示文\n"
        "- +5: section_number が単独章（例: 4 / 5）\n"
        "- -10: section_number が空\n"
        "- +5: level=1\n"
        "- -30: 見出しに「書」「目的」「使用方法」「機器の使用方法」\n\n"
        "# 出力\n"
        "{\n"
        "  \"method_start_heading_line\": string|null,\n"
        "  \"discussion_start_heading_line\": string|null\n"
        "}\n"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps({"headings": heading_items}, ensure_ascii=False)},
    ]


def _find_start_index_after(text: str, marker: str, *, start_pos: int) -> int | None:
    if not text or not marker:
        return None
    normalized_text, index_map = _normalized_with_map(text)
    norm_marker = _normalize_for_match(marker)
    if not norm_marker:
        return None
    if start_pos <= 0:
        start_norm = 0
    else:
        start_norm = bisect_left(index_map, start_pos)
        if start_norm >= len(index_map):
            return None
    start_pos_norm = normalized_text.find(norm_marker, start_norm)
    if start_pos_norm < 0:
        return None
    return index_map[start_pos_norm]


def _extract_section_number_and_title(heading_line: str) -> tuple[str, str]:
    line = (heading_line or "").strip()
    if not line:
        return "", ""
    match = _HEADING_NUMBER_RE.match(line)
    if match:
        section = _normalize_section(match.group("section"))
        title = match.group("title").strip()
        return section, title
    return "", line


def _coerce_heading_level(section_number: str, level: Optional[int]) -> int:
    if level is not None and 1 <= level <= 6:
        return level
    if section_number:
        return max(1, min(6, section_number.count(".") + 1))
    return 1


def _build_structured_sections(
    full_text: str, items: list[_LLMHeadingItem]
) -> tuple[list[PdfStructuredSection], list[str]]:
    if not full_text or not items:
        return [], []

    entries: list[tuple[_LLMHeadingItem, int, int, int, str, str]] = []
    missing: list[str] = []
    cursor = 0
    for item in items:
        heading_line = item.heading_line or ""
        if not heading_line.strip():
            continue
        start_idx = _find_start_index_after(full_text, heading_line, start_pos=cursor)
        if start_idx is None:
            missing.append(heading_line.strip())
            continue
        line_end = full_text.find("\n", start_idx)
        if line_end < 0:
            line_end = start_idx + len(heading_line)
        section_number, title = _extract_section_number_and_title(item.heading_line)
        if not section_number:
            section_number = _extract_section_number_from_heading(item.heading_line)
        level = _coerce_heading_level(section_number, item.level)
        entries.append((item, start_idx, line_end, level, section_number, title))
        cursor = line_end

    if not entries:
        return [], missing

    sections_flat: list[PdfStructuredSection] = []
    for idx, (item, start_idx, line_end, level, section_number, title) in enumerate(entries):
        next_start = len(full_text)
        for j in range(idx + 1, len(entries)):
            if entries[j][3] == level:
                next_start = entries[j][1]
                break
        if next_start < line_end:
            next_start = line_end
        text = full_text[line_end:next_start].strip()
        sections_flat.append(
            PdfStructuredSection(
                node_id=f"pdf_section_{idx + 1}",
                level=level,
                heading_line=item.heading_line,
                title=title,
                section_number=section_number,
                start_index=line_end,
                end_index=next_start,
                text=text,
                children=[],
            )
        )

    roots: list[PdfStructuredSection] = []
    stack: list[PdfStructuredSection] = []
    for node in sections_flat:
        while stack and stack[-1].level >= node.level:
            stack.pop()
        if stack:
            stack[-1].children.append(node)
        else:
            roots.append(node)
        stack.append(node)

    return roots, missing


def _flatten_structured_sections(sections: list[PdfStructuredSection]) -> list[PdfStructuredSection]:
    flat: list[PdfStructuredSection] = []

    def _walk(nodes: list[PdfStructuredSection]) -> None:
        for node in nodes:
            flat.append(node)
            if node.children:
                _walk(node.children)

    _walk(sections)
    return flat


def _find_root_by_keywords(
    sections: list[PdfStructuredSection], keywords: Iterable[str]
) -> Optional[PdfStructuredSection]:
    flat = _flatten_structured_sections(sections)
    for sec in flat:
        if sec.level != 1:
            continue
        heading = _normalize_heading_for_keyword(sec.heading_line or sec.title)
        if not heading:
            continue
        if any(kw in heading for kw in keywords):
            return sec
    return None


def _pick_consecutive_method_discussion_roots(
    sections: list[PdfStructuredSection],
) -> tuple[Optional[PdfStructuredSection], Optional[PdfStructuredSection]]:
    flat = _flatten_structured_sections(sections)
    level1 = [s for s in flat if s.level == 1]
    if not level1:
        return None, None

    numbered: list[tuple[int, PdfStructuredSection]] = []
    for s in level1:
        num = s.section_number or _extract_section_number_from_heading(s.heading_line or s.title)
        if not num:
            continue
        try:
            chapter = int(num.split(".")[0])
        except Exception:
            continue
        numbered.append((chapter, s))

    if not numbered:
        return None, None

    method_candidates = []
    discussion_candidates = []
    for chapter, sec in numbered:
        heading = _normalize_heading_for_keyword(sec.heading_line or sec.title)
        if any(kw in heading for kw in _METHOD_KEYWORDS):
            method_candidates.append((chapter, sec))
        if any(kw in heading for kw in _DISCUSSION_KEYWORDS):
            discussion_candidates.append((chapter, sec))

    if not method_candidates or not discussion_candidates:
        return None, None

    method_candidates.sort(key=lambda v: v[0])
    discussion_candidates.sort(key=lambda v: v[0])

    for m_ch, m_sec in method_candidates:
        for d_ch, d_sec in discussion_candidates:
            if d_ch == m_ch + 1:
                return m_sec, d_sec

    return None, None


def _extract_discussion_units_deterministic(text: str, chapter: Optional[int]) -> list[DiscussionUnit]:
    if not text:
        return []
    sentences = []
    buf = ""
    for ch in text:
        buf += ch
        if ch in "。．!?！？":
            sentences.append(buf.strip())
            buf = ""
    if buf.strip():
        sentences.append(buf.strip())

    endings = ("せよ", "しなさい", "述べよ", "示せ", "求めよ", "表せ", "表しなさい", "表わしなさい")
    units: list[DiscussionUnit] = []
    idx = 1
    for s in sentences:
        stripped = s.strip()
        if not stripped:
            continue
        if any(stripped.endswith(e) for e in endings):
            units.append(DiscussionUnit(discussion_chapter=chapter, prompt_index=idx, prompt_text=stripped))
            idx += 1
    return units

def _mock_markers_from_text(method_text: str, discussion_text: str, full_text: str) -> _LLMSectionMarkersResponse:
    method_src = method_text or full_text
    discussion_src = discussion_text or ""
    return _LLMSectionMarkersResponse(
        methods=_LLMSectionMarkerEntry(
            found=bool(method_src),
            heading=None,
            start_excerpt_20=(method_src[:_MARKER_LEN] if method_src else None),
            end_excerpt_20=(method_src[-_MARKER_LEN:] if method_src else None),
            notes="ok" if method_src else "not_found",
        ),
        discussion=_LLMSectionMarkerEntry(
            found=bool(discussion_src),
            heading=None,
            start_excerpt_20=(discussion_src[:_MARKER_LEN] if discussion_src else None),
            end_excerpt_20=(discussion_src[-_MARKER_LEN:] if discussion_src else None),
            notes="ok" if discussion_src else "not_found",
        ),
    )


def _mock_method_outlines(method_text: str) -> list[_LLMMethodOutline]:
    items: list[_LLMMethodOutline] = []
    for raw_line in method_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = re.match(r"^(\d+(?:\.\d+)*)\s+(.+)$", line)
        if not match:
            continue
        items.append(
            _LLMMethodOutline(
                method_number=match.group(1),
                method_name=match.group(2).strip(),
                method_text_prefix5=line[:_MARKER_LEN],
                method_text_suffix5=line[-_MARKER_LEN:],
            )
        )
    return items


def _mock_headings_from_text(full_text: str) -> list[_LLMHeadingItem]:
    items: list[_LLMHeadingItem] = []
    seen: set[str] = set()
    for raw_line in full_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = _HEADING_NUMBER_RE.match(line)
        if not match:
            continue
        section = _normalize_section(match.group("section"))
        level = section.count(".") + 1 if section else 1
        if line in seen:
            continue
        seen.add(line)
        items.append(_LLMHeadingItem(heading_line=line, level=level, notes="mock_numbered_heading"))

    # Inline numbered headings (e.g., "4.2.1. 反転増幅回路") that are not line-started.
    inline_re = re.compile(r"(\\d+(?:[.．]\\d+)+)\\s*[.．]\\s*([^\\s\\n]{1,40})")
    for match in inline_re.finditer(full_text):
        heading_line = match.group(0).strip()
        if not heading_line or heading_line in seen:
            continue
        seen.add(heading_line)
        section = _normalize_section(match.group(1))
        level = section.count(".") + 1 if section else 1
        items.append(_LLMHeadingItem(heading_line=heading_line, level=level, notes="mock_inline_numbered_heading"))
    return items


def _mock_pick_headings_from_sections(sections: list[PdfStructuredSection]) -> _LLMHeadingPickResponse:
    method_line = None
    discussion_line = None
    for sec in sections:
        if method_line is None and any(kw in (sec.title or "") for kw in _METHOD_KEYWORDS):
            method_line = sec.heading_line
        if discussion_line is None and any(kw in (sec.title or "") for kw in _DISCUSSION_KEYWORDS):
            discussion_line = sec.heading_line
        if method_line and discussion_line:
            break
    return _LLMHeadingPickResponse(method_heading_line=method_line, discussion_heading_line=discussion_line)


def _mock_pick_heading_ranges_from_sections(sections: list[PdfStructuredSection]) -> _LLMHeadingRangeResponse:
    method_indices = [i for i, s in enumerate(sections) if any(kw in (s.title or "") for kw in _METHOD_KEYWORDS)]
    discussion_indices = [i for i, s in enumerate(sections) if any(kw in (s.title or "") for kw in _DISCUSSION_KEYWORDS)]
    method_start = sections[method_indices[0]].heading_line if method_indices else None
    discussion_start = sections[discussion_indices[0]].heading_line if discussion_indices else None
    return _LLMHeadingRangeResponse(
        method_start_heading_line=method_start,
        discussion_start_heading_line=discussion_start,
    )


def _score_heading_candidate(
    *,
    heading_line: str,
    title: str,
    section_number: str,
    level: int,
    kind: str,
) -> int:
    text = f"{heading_line} {title}"
    score = 0

    method_keywords = ("実験", "実験方法", "実験手順")
    discussion_keywords = ("考察", "検討事項", "報告事項")

    if kind == "method" and any(kw in text for kw in method_keywords):
        score += 30
    if kind == "discussion" and any(kw in text for kw in discussion_keywords):
        score += 30

    if any(kw in text for kw in ("目的", "結果", "説明せよ")):
        score -= 10
    if re.search(r"[（(][a-zA-Z][)）]", text):
        score -= 10

    if section_number and section_number.isdigit():
        score += 5
    if not section_number:
        score -= 10

    if level == 1:
        score += 5

    if any(kw in text for kw in ("書", "目的", "使用方法", "機器の使用方法")):
        score -= 30

    return score


def _select_best_heading_line(sections: list[PdfStructuredSection], *, kind: str) -> str:
    best_line = ""
    best_score: int | None = None
    for sec in sections:
        heading_line = sec.heading_line or ""
        if not heading_line:
            continue
        score = _score_heading_candidate(
            heading_line=heading_line,
            title=sec.title or "",
            section_number=sec.section_number or "",
            level=sec.level,
            kind=kind,
        )
        if best_score is None or score > best_score:
            best_score = score
            best_line = heading_line
    return best_line


def clean_heading_positions(state: AgentState, *, llm: LLMClient, storage: Storage | None = None) -> AgentState:
    llm_fail_fast = str(os.environ.get(_B_LAYER_LLM_FAIL_FAST_ENV) or "").strip().lower() in {"1", "true", "yes", "y", "on"}

    def _handle_llm_error(*, code: str, message: str) -> None:
        state.pdf.marker_reason = (state.pdf.marker_reason + ";" + message) if state.pdf.marker_reason else message
        state.quality_report.issues.append(
            QualityIssue(
                code=code,
                stage="B",
                severity="WARN",
                message=message,
                suggested_action="ask_user",
            )
        )
        if llm_fail_fast:
            raise RuntimeError(message)

    loaded_from_storage = _ensure_page_texts(state, storage=storage)
    full_text = state.pdf.markdown_text or state.pdf.text or ""
    if not full_text and state.pdf.page_texts:
        full_text = "\n".join(block.text for block in state.pdf.page_texts if block.text)
    if not full_text:
        state.validation_report.errors.append(
            ValidationIssue(code="missing_pdf_text", message="No PDF text available for B-layer marker extraction")
        )
        if loaded_from_storage:
            state.pdf.page_texts = []
        return state

    extracted_markers: _LLMSectionMarkersResponse | None = None
    if getattr(llm, "mock", False) and hasattr(llm, "_client"):
        extracted_markers = _mock_markers_from_text(state.pdf.method_text, state.pdf.discussion_text, full_text)
    else:
        try:
            marker_resp = llm.parse(
                _LLMSectionMarkersResponse,
                messages=_build_marker_messages(full_text),
                attempts=2,
            )
            extracted_markers = marker_resp
        except Exception as exc:
            _handle_llm_error(
                code="WARN_SECTION_MARKER_LLM_FAILED",
                message=f"LLM failed to extract section markers: {type(exc).__name__}: {exc}",
            )

    method_text = ""
    discussion_text = ""
    method_span: tuple[int, int] | None = None
    if extracted_markers:
        methods = extracted_markers.methods
        discussion = extracted_markers.discussion
        method_text = _slice_by_markers(
            full_text,
            start_marker=methods.start_excerpt_20 or "",
            end_marker=methods.end_excerpt_20 or "",
        )
        discussion_text = _slice_by_markers(
            full_text,
            start_marker=discussion.start_excerpt_20 or "",
            end_marker=discussion.end_excerpt_20 or "",
        )
        method_span = _find_span_by_markers(
            full_text,
            start_marker=methods.start_excerpt_20 or "",
            end_marker=methods.end_excerpt_20 or "",
        )
        state.pdf.marker_reason = "methods:" + (methods.notes or "") + ";discussion:" + (discussion.notes or "")

    if method_text and discussion_text and extracted_markers:
        discussion_start_idx = _find_start_index(full_text, extracted_markers.discussion.start_excerpt_20 or "")
        if method_span and discussion_start_idx is not None:
            if discussion_start_idx < method_span[1]:
                method_text = full_text[method_span[0] : discussion_start_idx].strip()

    if method_span and state.pdf.method_chapter:
        next_chapter_idx = _find_next_chapter_start(full_text, state.pdf.method_chapter)
        if next_chapter_idx is not None and next_chapter_idx > method_span[0]:
            method_text = full_text[method_span[0] : next_chapter_idx].strip()

    if method_text:
        for prefix in _METHOD_EXCLUDE_PREFIXES:
            if method_text.startswith(prefix):
                start_idx = _find_method_heading_start(full_text)
                if start_idx is not None:
                    method_text = full_text[start_idx : (method_span[1] if method_span else None)].strip()
                break

    if not method_text:
        state.validation_report.warnings.append(
            ValidationIssue(code="method_section_marker_unmatched", message="Failed to match method section markers; fallback to existing method_text")
        )
        state.pdf.needs_hitl_methods = True
        method_text = state.pdf.method_text or full_text

    if not discussion_text:
        state.validation_report.warnings.append(
            ValidationIssue(code="discussion_section_marker_unmatched", message="Failed to match discussion section markers; fallback to existing discussion_text")
        )
        state.pdf.needs_hitl_discussion = True
        discussion_text = state.pdf.discussion_text or ""

    from core.text import pdf_text_to_markdown

    state.pdf.method_text = method_text
    state.pdf.discussion_text = discussion_text
    state.pdf.method_markdown_text = pdf_text_to_markdown(method_text)
    state.pdf.discussion_markdown_text = pdf_text_to_markdown(discussion_text)

    structured_items: list[_LLMHeadingItem] = []
    llm_failed = False
    review_issues: list[_HeadingReviewIssue] = []
    max_retries = 2
    attempt = 0
    while True:
        attempt += 1
        try:
            if getattr(llm, "mock", False) and hasattr(llm, "_client"):
                structured_items = _mock_headings_from_text(full_text)
            else:
                heading_resp = llm.parse(
                    _LLMHeadingResponse,
                    model="gpt-5-mini",
                    messages=_build_heading_messages(full_text, review_issues=review_issues),
                    attempts=2,
                )
                structured_items = list(heading_resp.items or [])
        except Exception as exc:
            llm_failed = True
            _handle_llm_error(
                code="WARN_PDF_HEADING_LLM_FAILED",
                message=f"LLM failed to extract headings: {type(exc).__name__}: {exc}",
            )
            break

        if structured_items:
            has_dotted = any(
                "." in (_extract_section_number_from_heading(item.heading_line) or "")
                for item in structured_items
            )
            if not has_dotted:
                merged: dict[str, _LLMHeadingItem] = {item.heading_line: item for item in structured_items}
                for item in _mock_headings_from_text(full_text):
                    if item.heading_line not in merged:
                        merged[item.heading_line] = item
                structured_items = list(merged.values())

        review = _review_heading_sequence(structured_items)
        review_issues = list(review.issues or [])
        if not review.retry:
            break
        if attempt > max_retries:
            state.quality_report.issues.append(
                QualityIssue(
                    code="WARN_PDF_HEADING_SEQUENCE_GAP",
                    stage="B",
                    severity="WARN",
                    message=f"Heading sequence issues remained after retries: {len(review_issues)}",
                    suggested_action="ask_user",
                )
            )
            break
        if getattr(llm, "mock", False):
            break

    if structured_items:
        has_dotted = any(
            "." in (_extract_section_number_from_heading(item.heading_line) or "")
            for item in structured_items
        )
        if not has_dotted:
            merged: dict[str, _LLMHeadingItem] = {item.heading_line: item for item in structured_items}
            for item in _mock_headings_from_text(full_text):
                if item.heading_line not in merged:
                    merged[item.heading_line] = item
            structured_items = list(merged.values())

    structured_sections: list[PdfStructuredSection] = []
    if structured_items:
        structured_sections, missing = _build_structured_sections(full_text, structured_items)
        if not structured_sections:
            state.quality_report.issues.append(
                QualityIssue(
                    code="WARN_PDF_HEADING_STRUCT_EMPTY",
                    stage="B",
                    severity="WARN",
                    message="Heading extraction succeeded but no structured sections were built",
                    suggested_action="ask_user",
                )
            )
        elif missing:
            state.quality_report.issues.append(
                QualityIssue(
                    code="WARN_PDF_HEADING_UNMATCHED",
                    stage="B",
                    severity="WARN",
                    message=f"Some headings could not be matched to text: {len(missing)}",
                    suggested_action="ask_user",
                )
            )
    elif not llm_failed:
        state.quality_report.issues.append(
            QualityIssue(
                code="WARN_PDF_HEADING_NOT_FOUND",
                stage="B",
                severity="WARN",
                message="No headings extracted from PDF text",
                suggested_action="ask_user",
            )
        )

    state.pdf.structured_sections = structured_sections

    deterministic_applied = False
    if structured_sections:
        method_root, discussion_root = _pick_consecutive_method_discussion_roots(structured_sections)
        if not method_root:
            method_root = _find_root_by_keywords(structured_sections, _METHOD_KEYWORDS)
        if not discussion_root:
            discussion_root = _find_root_by_keywords(structured_sections, _DISCUSSION_KEYWORDS)
        if method_root:
            method_nodes = _flatten_structured_sections([method_root])
            method_text = "\n".join([n.text for n in method_nodes if n.text]).strip()
            state.pdf.method_text = method_text
            if method_root.section_number and method_root.section_number.split(".")[0].isdigit():
                state.pdf.method_chapter = int(method_root.section_number.split(".")[0])
            state.pdf.needs_hitl_methods = False
            deterministic_applied = True
        if discussion_root:
            discussion_nodes = _flatten_structured_sections([discussion_root])
            discussion_text = "\n".join([n.text for n in discussion_nodes if n.text]).strip()
            state.pdf.discussion_text = discussion_text
            if discussion_root.section_number and discussion_root.section_number.split(".")[0].isdigit():
                state.pdf.discussion_chapter = int(discussion_root.section_number.split(".")[0])
            state.pdf.needs_hitl_discussion = False
            deterministic_applied = True
        if deterministic_applied:
            suffix = "deterministic_heading_root"
            state.pdf.marker_reason = (state.pdf.marker_reason + ";" + suffix) if state.pdf.marker_reason else suffix

    if structured_sections and not deterministic_applied:
        flat_sections = _flatten_structured_sections(structured_sections)
        heading_items = [
            {
                "heading_line": s.heading_line,
                "level": s.level,
                "section_number": s.section_number,
                "title": s.title,
            }
            for s in flat_sections
            if s.heading_line
        ]
        try:
            if getattr(llm, "mock", False) and hasattr(llm, "_client"):
                range_resp = _mock_pick_heading_ranges_from_sections(flat_sections)
            else:
                range_resp = llm.parse(
                    _LLMHeadingRangeResponse,
                    messages=_build_heading_range_messages(heading_items),
                    attempts=2,
                )
            method_start = (range_resp.method_start_heading_line or "").strip()
            discussion_start = (range_resp.discussion_start_heading_line or "").strip()
            if not method_start:
                method_start = _select_best_heading_line(flat_sections, kind="method")
            if not discussion_start:
                discussion_start = _select_best_heading_line(flat_sections, kind="discussion")
            if not any([method_start, discussion_start]):
                state.quality_report.issues.append(
                    QualityIssue(
                        code="WARN_METHOD_DISCUSSION_RANGE_PICK_EMPTY",
                        stage="B",
                        severity="WARN",
                        message="LLM returned no method/discussion heading ranges from heading list",
                        suggested_action="ask_user",
                    )
                )
            section_map = {s.heading_line: s for s in flat_sections}
            index_map = {s.heading_line: idx for idx, s in enumerate(flat_sections)}
            updated = False

            def _apply_start(start_line: str, *, kind: str) -> None:
                nonlocal updated, method_text, discussion_text
                if not start_line:
                    return
                if start_line not in index_map:
                    state.quality_report.issues.append(
                        QualityIssue(
                            code=f"WARN_{kind.upper()}_HEADING_START_UNMATCHED",
                            stage="B",
                            severity="WARN",
                            message=f"LLM-selected {kind} heading start not found in structured sections",
                            suggested_action="ask_user",
                        )
                    )
                    return
                start_sec = section_map.get(start_line)
                if not start_sec:
                    return
                subtree = _flatten_structured_sections([start_sec])
                combined_text = "\n".join([s.text for s in subtree if s.text]).strip()
                if kind == "method":
                    method_text = combined_text
                    state.pdf.method_text = method_text
                    if start_sec and start_sec.section_number and start_sec.section_number.split(".")[0].isdigit():
                        state.pdf.method_chapter = int(start_sec.section_number.split(".")[0])
                    state.pdf.needs_hitl_methods = False
                else:
                    discussion_text = combined_text
                    state.pdf.discussion_text = discussion_text
                    if start_sec and start_sec.section_number and start_sec.section_number.split(".")[0].isdigit():
                        state.pdf.discussion_chapter = int(start_sec.section_number.split(".")[0])
                    state.pdf.needs_hitl_discussion = False
                updated = True

            _apply_start(method_start, kind="method")
            _apply_start(discussion_start, kind="discussion")

            if updated:
                suffix = "heading_range_pick"
                state.pdf.marker_reason = (state.pdf.marker_reason + ";" + suffix) if state.pdf.marker_reason else suffix
        except Exception as exc:
            _handle_llm_error(
                code="WARN_METHOD_DISCUSSION_RANGE_PICK_FAILED",
                message=f"LLM failed to pick method/discussion heading ranges: {type(exc).__name__}: {exc}",
            )

    state.pdf.discussion_units = []
    # Method text review is intentionally disabled for now.
    state.pdf.method_text_review = None

    if discussion_text:
        if deterministic_applied:
            state.pdf.discussion_units = _extract_discussion_units_deterministic(discussion_text, state.pdf.discussion_chapter)
        else:
            try:
                discussion_resp = llm.parse(_LLMDiscussionUnitsResponse, messages=_build_discussion_messages(discussion_text), attempts=2)
                units: list[DiscussionUnit] = []
                for item in discussion_resp.items:
                    chapter = item.discussion_chapter
                    if chapter is None:
                        chapter = state.pdf.discussion_chapter
                    units.append(
                        DiscussionUnit(
                            discussion_chapter=chapter,
                            prompt_index=item.prompt_index,
                            prompt_text=item.prompt_text,
                        )
                    )
                state.pdf.discussion_units = units
            except Exception as exc:
                _handle_llm_error(
                    code="WARN_DISCUSSION_STRUCT_LLM_FAILED",
                    message=f"LLM failed to structure discussion prompts: {type(exc).__name__}: {exc}",
                )

    method_items: list[_LLMMethodOutline] = []
    method_candidates = _extract_method_candidates(method_text)
    exp_keys = [section for section, _, _, _ in method_candidates]
    segment_map = _build_method_segments(method_text, method_candidates)
    children_map, parent_map = _build_parent_child_map(exp_keys)
    # Deterministic extraction only: do not rely on LLM for method outlines.

    indexed_lines = _build_line_index(state.pdf.page_texts) if state.pdf.page_texts else []

    method_section, method_title, method_heading_line = _pick_heading_line(method_text, _METHOD_KEYWORDS)
    discussion_section, discussion_title, discussion_heading_line = _pick_heading_line(discussion_text, _DISCUSSION_KEYWORDS)

    if method_section.isdigit():
        state.pdf.method_chapter = int(method_section)
    if discussion_section.isdigit():
        state.pdf.discussion_chapter = int(discussion_section)

    heading_positions: list[PdfHeadingEvidence] = []
    for section, title, raw_line in [
        (method_section, method_title, method_heading_line),
        (discussion_section, discussion_title, discussion_heading_line),
    ]:
        if not title:
            continue
        page, line_index, global_index, normalized_line = _locate_heading_line(indexed_lines, raw_line)
        level = 1
        if section:
            level = section.count(".") + 1
        heading_positions.append(
            PdfHeadingEvidence(
                section=section or "",
                title=title,
                level=level,
                raw_line=normalized_line or raw_line,
                page=page,
                line_index=line_index,
                global_index=global_index,
                heading_kind="doc_heading",
                clean_confidence=1.0,
                clean_reason="marker_deterministic",
            )
        )

    state.pdf.heading_positions_cleaned = heading_positions

    llm_map: dict[str, _LLMMethodOutline] = {}
    method_numbers: list[MethodNumberEvidence] = []
    missing_leaf = False
    for section, title, raw_line, _line_idx in method_candidates:
        method_id = f"method:{section}"
        is_parent = bool(children_map.get(section))
        prefix = ""
        suffix = ""
        llm_item = llm_map.get(section)
        if not is_parent and llm_item:
            prefix = (llm_item.method_text_prefix5 or "").strip()
            suffix = (llm_item.method_text_suffix5 or "").strip()
            if llm_item.method_name:
                title = llm_item.method_name.strip() or title
        if not is_parent and (not prefix or not suffix):
            seg = segment_map.get(section, "")
            if seg:
                if not prefix:
                    prefix = seg[:_MARKER_LEN]
                if not suffix:
                    suffix = seg[-_MARKER_LEN:]
        evidence = MethodNumberEvidence(
            method_id=method_id,
            exp_key=section,
            title=title,
            method_text_prefix5=prefix,
            method_text_suffix5=suffix,
            heading_line=raw_line,
        )
        method_numbers.append(evidence)

    if method_numbers:
        state.pdf.method_numbers = method_numbers
        state.pdf.needs_hitl_methods = missing_leaf
    else:
        state.validation_report.errors.append(
            ValidationIssue(code="hitl_method_number_unknown", message="Could not extract method numbers from method/discussion text")
        )
        state.pdf.needs_hitl_methods = True

    state.job_meta.updated_at = now_iso()
    if loaded_from_storage:
        state.pdf.page_texts = []
    return state
