from __future__ import annotations

from pydantic import BaseModel, Field


class MVPQuantCommentOutput(BaseModel):
    paragraph: str = Field(..., description="Exactly one Japanese paragraph (no newlines).")

