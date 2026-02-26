from __future__ import annotations

from pydantic import BaseModel, Field


class ExcelSheetSelectionOutput(BaseModel):
    excel_id: str = Field(default="", description="excel_id of the selected workbook")
    sheet_name: str = Field(default="", description="selected sheet name")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="", description="why this sheet matches the experiment")
