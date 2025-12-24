from __future__ import annotations

import re

from pydantic import BaseModel, Field
from pydantic import field_validator


class DiscussionUnit(BaseModel):
    index: str = Field(..., description="Number string without parentheses, e.g. '1', '2', '6.1'")
    discussion_active: str = Field(..., description="Imperative -> active, だ・である調")
    answer: str | None = Field(default=None, description="(optional) Discussion body in だ・である調")

    @field_validator("discussion_active")
    @classmethod
    def _strip_json_artifacts(cls, value: str) -> str:
        """
        Some models occasionally leak JSON delimiters into string fields (e.g. '...。},{').
        Since discussion_active is intended to be plain text, strip anything after such delimiters.
        """

        text = (value or "").strip()
        if not text:
            return ""

        # Cut at common list/object delimiters if they appear inside the field.
        # Keep only the first segment, preserving the original instruction text.
        candidates = [
            text.find("},{"),
            text.find("}, {"),
            text.find("}\n,{"),
            text.find("}\r\n,{"),
        ]
        cut_positions = [p for p in candidates if p != -1]
        if cut_positions:
            text = text[: min(cut_positions)].rstrip()

        # Also cut on a generic object delimiter pattern.
        m = re.search(r"\}\s*,\s*\{", text)
        if m:
            text = text[: m.start()].rstrip()

        # Avoid a trailing unmatched quote if it slipped in.
        text = text.rstrip("\"'`").rstrip()
        return text


class DiscussionOutput(BaseModel):
    units: list[DiscussionUnit] = Field(default_factory=list)
