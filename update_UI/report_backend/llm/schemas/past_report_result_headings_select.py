from __future__ import annotations

from pydantic import BaseModel, Field


class PastReportResultHeadingsSelectOutput(BaseModel):
    heading_lines: list[str] = Field(default_factory=list)
