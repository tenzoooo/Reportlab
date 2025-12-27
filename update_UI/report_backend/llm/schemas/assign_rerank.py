from __future__ import annotations

from pydantic import BaseModel, Field


class AssignmentRerankOutput(BaseModel):
    exp_key: str = Field(
        default="",
        description="Chosen experiment exp_key; empty string if cannot decide",
    )
    score: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence score (0..1)")
    rationale: str = Field(default="", description="Short rationale for the choice")

