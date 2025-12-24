from __future__ import annotations

from pydantic import BaseModel, Field


class ReferenceItem(BaseModel):
    id: str
    title: str
    year: str = ""
    authors: str = ""


class ReferencesOutput(BaseModel):
    references: list[ReferenceItem] = Field(default_factory=list)

