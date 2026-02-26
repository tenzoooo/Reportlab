from __future__ import annotations

from pydantic import BaseModel, Field


class ExcelAxisResolveOutput(BaseModel):
    x_column: int = Field(..., description="1-based column index for x-axis")
    y_columns: list[int] = Field(default_factory=list, description="1-based column indices for y series")
    x_label: str = Field(default="")
    y_label: str = Field(default="")
    x_unit: str = Field(default="")
    y_unit: str = Field(default="")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
