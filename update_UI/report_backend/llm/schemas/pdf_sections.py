from __future__ import annotations

from pydantic import BaseModel, Field


class PdfSectionsOutput(BaseModel):
    method_heading_line: str | None = Field(
        default=None,
        description="Verbatim heading line that starts the method/procedure section (must be substring of input).",
    )
    discussion_heading_line: str | None = Field(
        default=None,
        description="Verbatim heading line that starts the discussion/consideration section (must be substring of input).",
    )

