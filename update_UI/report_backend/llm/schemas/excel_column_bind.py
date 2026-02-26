from __future__ import annotations

from pydantic import BaseModel, Field


class ExcelColumnBindingItem(BaseModel):
    column_index: int = Field(..., description="1-based column index")
    header: str = Field(default="", description="original header string")
    name: str = Field(default="", description="normalized column name")
    unit: str = Field(default="", description="unit for the column (use '1' if dimensionless)")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")


class ExcelColumnBindingOutput(BaseModel):
    columns: list[ExcelColumnBindingItem] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
