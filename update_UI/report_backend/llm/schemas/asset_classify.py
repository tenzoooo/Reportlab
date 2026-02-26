from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class AssetClassifyOutput(BaseModel):
    kind: Literal["graph", "photo", "unknown"] = Field(..., description="Coarse asset type")
    confidence: float = Field(..., ge=0.0, le=1.0)
    rationale: str = Field(default="", description="Short rationale")
