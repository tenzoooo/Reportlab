from __future__ import annotations

from pydantic import BaseModel, Field

from models.contracts import PastReportGraphHint, PastReportTableHint


class PastReportResultStructureItem(BaseModel):
    heading_line: str = Field(default="")
    title: str = Field(default="")
    summary: str = Field(default="")
    tables_count: int = Field(default=0, ge=0)
    graphs_count: int = Field(default=0, ge=0)
    tables: list[PastReportTableHint] = Field(default_factory=list)
    graphs: list[PastReportGraphHint] = Field(default_factory=list)


class PastReportResultStructureOutput(BaseModel):
    items: list[PastReportResultStructureItem] = Field(default_factory=list)
