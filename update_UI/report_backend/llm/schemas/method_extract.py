from __future__ import annotations

from pydantic import BaseModel, Field


class MethodExperiment(BaseModel):
    exp_key: str = Field(..., description="PDF section number for the experiment, e.g. '4.2.1'")
    title: str = Field(..., description="Experiment title (section title)")
    method_summary: str = Field(..., description="2-4 sentences summary of the method (だ・である調)")


class MethodExtractResult(BaseModel):
    experiments: list[MethodExperiment] = Field(default_factory=list)

