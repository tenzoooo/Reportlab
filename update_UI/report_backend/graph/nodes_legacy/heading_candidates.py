from __future__ import annotations

import re
from typing import Iterable

from graph.state import PdfHeadingEvidence, PdfTextBlock

_HEADING_PATTERN = re.compile(
    r"^(?P<number>[0-9０-９]+(?:[.\uFF0E．][0-9０-９]+){0,3})[.\uFF0E．]?\s*(?P<title>.+)$"
    r"|"
    r"^(?P<colon_number>[0-9０-９]+)\s*[:：]\s*(?P<colon_title>.+)$"
    r"|"
    r"^【(?P<bracket_title>[^】]+)】\s*$"
)


def extract_heading_candidates(page_texts: Iterable[PdfTextBlock]) -> list[PdfHeadingEvidence]:
    headings: list[PdfHeadingEvidence] = []
    current_global_index = 0

    for page_block in page_texts:
        page_num = page_block.page
        lines = page_block.text.split("\n")

        for line_idx, line in enumerate(lines):
            raw_line = line.strip()
            if not raw_line:
                current_global_index += 1
                continue

            match = _HEADING_PATTERN.match(raw_line)
            if match:
                number = match.group("number") or match.group("colon_number")
                title = match.group("title") or match.group("colon_title") or match.group("bracket_title") or ""

                level = 1
                if number:
                    level = number.count(".") + number.count("．") + number.count("｡") + 1

                section_str = number if number else title

                headings.append(
                    PdfHeadingEvidence(
                        section=section_str,
                        title=title.strip(),
                        level=level,
                        raw_line=raw_line,
                        page=page_num,
                        line_index=line_idx,
                        global_index=current_global_index,
                    )
                )

            current_global_index += 1

    return headings
