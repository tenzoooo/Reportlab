from __future__ import annotations

from pydantic import BaseModel, Field


class ExcelParamBindingItem(BaseModel):
    symbol: str = Field(default="", description="parameter symbol")
    value: float | None = Field(default=None, description="numeric value")
    unit: str = Field(default="", description="unit for the parameter (use '1' if dimensionless)")
    source_hint: str = Field(default="", description="optional source hint like sheet/cell")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class ExcelParamBindingOutput(BaseModel):
    params: list[ExcelParamBindingItem] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
