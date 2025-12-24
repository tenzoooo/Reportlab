from __future__ import annotations

from pydantic import BaseModel, Field


class EquationLineOCROutput(BaseModel):
    text: str = Field(
        default="",
        description="OCR transcription of the single target line (plain Unicode, no explanations).",
    )

