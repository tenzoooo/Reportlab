from __future__ import annotations

from pydantic import BaseModel, Field


class MVPFirstExperimentOutput(BaseModel):
    exp_key: str = Field(..., description="Chosen first experiment key, e.g. '4.1.1' (prefer source_idx from PDF)")
    rationale: str = Field(default="", description="Why this is the first experiment")

