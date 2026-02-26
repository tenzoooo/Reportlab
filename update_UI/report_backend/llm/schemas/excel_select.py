from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ExcelSelectionOutput(BaseModel):
    excel_id: str = Field(default="", description="excel_id of the selected workbook from payload")
    stop: bool = Field(default=False, description="Set true when no further results should be selected")
    selection_type: Literal["chart", "range"] = Field(..., description="'chart' when using an existing chart, else 'range'")
    chart_id: Optional[str] = Field(default=None, description="When selection_type='chart': chart_id like 'Sheet1#0'")
    sheet: str = Field(default="", description="When selection_type='range': target sheet name")
    a1_range: str = Field(default="", description="When selection_type='range': A1 range like 'A12:D34'")
    rationale: str = Field(default="", description="Why this selection matches the experiment results")
