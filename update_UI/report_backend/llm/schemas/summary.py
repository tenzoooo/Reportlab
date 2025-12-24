from __future__ import annotations

from pydantic import BaseModel, Field


class SummaryOutput(BaseModel):
    summary: str = Field(..., description="2-5 paragraphs in だ・である調 (use newlines between paragraphs)")

