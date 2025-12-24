from __future__ import annotations

from pydantic import BaseModel, Field


class DiscussionExtractOutput(BaseModel):
    prompts: list[str] = Field(
        default_factory=list,
        description="Extracted instruction lines (may be minimally repaired from noisy PDF text).",
    )
