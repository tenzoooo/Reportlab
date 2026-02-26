from __future__ import annotations

from pydantic import BaseModel, Field


class TheoryFormulaItem(BaseModel):
    formula: str = Field(..., description="LaTeXで表現された理論式（$は不要）")
    context: str = Field(..., description="式の周辺文脈（短文）")
    experiments: list[str] = Field(default_factory=list, description="適用実験（例: '4.2.1 反転増幅回路'）")


class TheoryFormulaExtractOutput(BaseModel):
    items: list[TheoryFormulaItem] = Field(default_factory=list)
