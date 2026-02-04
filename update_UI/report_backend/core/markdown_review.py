from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal


BlockType = Literal["heading", "text", "table", "image", "caption"]


@dataclass(frozen=True)
class Block:
    type: BlockType
    text: str = ""
    lines: list[str] | None = None
    meta: dict[str, Any] | None = None


_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_IMG_RE = re.compile(r"^!\[(?P<alt>.*)\]\((?P<src>[^)]+)\)\s*$")
_TABLE_LINE_RE = re.compile(r"^\s*\|.*\|\s*$")
_CAPTION_RE = re.compile(r"^(?P<kind>表|図)\s+(?P<label>[0-9]+(?:\.[0-9]+){0,4})\s*[:：]\s*(?P<body>.+)$")
_ASCII_RE = re.compile(r"[A-Za-z]")


def parse_markdown_blocks(markdown: str) -> list[Block]:
    """
    Minimal Markdown block parser for review/logging (no rewriting).
    """
    lines = (markdown or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[Block] = []

    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue

        m = _HEADING_RE.match(line)
        if m:
            blocks.append(Block(type="heading", text=m.group(2).strip(), meta={"level": len(m.group(1))}))
            i += 1
            continue

        cm = _CAPTION_RE.match(line.strip())
        if cm:
            blocks.append(
                Block(
                    type="caption",
                    text=line.strip(),
                    meta={"kind": cm.group("kind"), "label": cm.group("label"), "body": cm.group("body")},
                )
            )
            i += 1
            continue

        im = _IMG_RE.match(line.strip())
        if im:
            blocks.append(Block(type="image", text=line.strip(), meta={"src": im.group("src").strip(), "alt": im.group("alt")}))
            i += 1
            continue

        if _TABLE_LINE_RE.match(line):
            buf: list[str] = []
            j = i
            while j < len(lines) and _TABLE_LINE_RE.match(lines[j]):
                buf.append(lines[j].rstrip())
                j += 1
            blocks.append(Block(type="table", lines=buf))
            i = j
            continue

        # Paragraph
        buf2: list[str] = [line.strip()]
        j = i + 1
        while j < len(lines):
            nxt = lines[j]
            if not nxt.strip():
                break
            if _HEADING_RE.match(nxt) or _CAPTION_RE.match(nxt.strip()) or _IMG_RE.match(nxt.strip()) or _TABLE_LINE_RE.match(nxt):
                break
            buf2.append(nxt.strip())
            j += 1
        blocks.append(Block(type="text", text=" ".join(buf2).strip()))
        i = j + 1 if j < len(lines) and not lines[j].strip() else j

    return blocks


def review_markdown(markdown: str) -> tuple[str, dict[str, Any]]:
    """
    Check-only reviewer:
    - MUST NOT rewrite wording, relocate paragraphs, or apply regex-based "fixes".
    - Emits a review log for debugging / quality gates.
    """
    log: dict[str, Any] = {"violations": [], "warnings": [], "fatal_errors": [], "auto_fixed": []}
    blocks = parse_markdown_blocks(markdown)
    log["parse"] = {"blocks": len(blocks)}

    # 1) English caption guard (log-only).
    for i, b in enumerate(blocks):
        if b.type != "caption":
            continue
        if _ASCII_RE.search(b.text or ""):
            log["violations"].append({"type": "english_caption", "location": i, "text": (b.text or "")[:160]})

    # 2) Hard ban: no heading/word "定量コメント" anywhere in the final markdown.
    if "定量コメント" in (markdown or ""):
        log["violations"].append({"type": "forbidden_word_found", "word": "定量コメント"})

    # 3) Quantitative comment placement check (best-effort, log-only):
    # Expect the *last* text block after the last evidence (table/image).
    last_evidence = max((i for i, b in enumerate(blocks) if b.type in {"table", "image"}), default=None)
    if last_evidence is not None:
        last_text = next((b for b in blocks[last_evidence + 1 :] if b.type == "text"), None)
        if last_text is None or not (last_text.text or "").strip():
            log["warnings"].append({"type": "missing_post_evidence_text"})
        else:
            # Avoid figure/table references inside that paragraph.
            if re.search(r"(?:表|図)\s*\d", last_text.text or ""):
                log["violations"].append({"type": "post_evidence_text_references_figure_table"})

    return (markdown or "").replace("\r\n", "\n").replace("\r", "\n"), log
