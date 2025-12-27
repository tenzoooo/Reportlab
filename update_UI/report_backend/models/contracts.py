from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class BelongsToCandidate(BaseModel):
    exp_key: str = Field(..., description="Experiment key (e.g., '4.2.1')")
    score: float = Field(..., ge=0.0, le=1.0)
    rationale: str = Field(..., description="Why it belongs to the experiment")


class ImageAnalysis(BaseModel):
    caption: str = Field(..., description="<=15 chars (unicode code points) excluding spaces")
    quant_comment: str = Field(..., description="Quantitative-first comment; if impossible, say so and be qualitative")
    belongs_to: list[BelongsToCandidate] = Field(default_factory=list, description="Top 3 candidates")
    result_summary: str = Field(..., description="Short result summary for description_brief")
    ocr_text: str = Field(default="", description="Optional OCR text extracted from the image")
    assigned_exp_key: str = Field(default="", description="Best exp_key after reranking/HITL (optional)")
    assigned_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence for assigned_exp_key (optional)")
    assigned_rationale: str = Field(default="", description="Short rationale for assigned_exp_key (optional)")


class TableAnalysis(BaseModel):
    caption: str = Field(..., description="Table caption (no strict length constraint by default)")
    quant_comment: str = Field(..., description="Quantitative-first comment")
    belongs_to: list[BelongsToCandidate] = Field(default_factory=list)
    result_summary: str = Field(..., description="Short result summary for description_brief")
    table_summary: str = Field(default="", description="Optional computed stats/summary for reranking/debug")
    assigned_exp_key: str = Field(default="", description="Best exp_key after reranking/HITL (optional)")
    assigned_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence for assigned_exp_key (optional)")
    assigned_rationale: str = Field(default="", description="Short rationale for assigned_exp_key (optional)")


class ImageAsset(BaseModel):
    image_id: str
    filename: str
    mime_type: str
    storage_key: str
    upload_index: int = Field(default=0, description="Global upload order for stable block ordering")
    analysis: Optional[ImageAnalysis] = None
    assigned_to: Optional[str] = Field(default=None, description="exp_key when assigned")


class TableAsset(BaseModel):
    table_id: str
    storage_key: str
    raw_csv: str
    upload_index: int = Field(default=0, description="Global upload order for stable block ordering")
    rows: list[list[str]] = Field(default_factory=list)
    analysis: Optional[TableAnalysis] = None
    assigned_to: Optional[str] = None


class FigureContent(BaseModel):
    figure_image_id: Optional[str] = None
    asset_upload_index: Optional[int] = None
    label: str
    caption: str
    quant_comment: str = ""


class TableContent(BaseModel):
    asset_upload_index: Optional[int] = None
    label: str
    caption: str
    rows: list[list[str]] = Field(default_factory=list)
    quant_comment: str = ""


class FigureBlock(BaseModel):
    type: Literal["figure"] = "figure"
    figure: FigureContent


class TableBlock(BaseModel):
    type: Literal["table"] = "table"
    table: TableContent


Block = FigureBlock | TableBlock


class Experiment(BaseModel):
    idx: str = Field(..., description="PDF-derived key (e.g., '4.2.1')")
    subidx: str = Field(default="", description="Optional sub-index, unused in v1")
    name: str

    source_idx: str = Field(default="", description="Original PDF section number (e.g., '4.2.1') for traceability")

    method_summary: str = Field(default="", description="2-4 sentences method summary")
    result_brief: str = Field(default="", exclude=True, description="(internal) result summary, not part of output contract")
    description_brief: str = Field(default="", description="method_summary + '\\n' + result_brief")

    quant_comment: str = Field(default="", description="Optional experiment-level quantitative comment")
    blocks: list[Block] = Field(default_factory=list)

    # Convenience lists (optional, depending on template)
    tables: list[TableContent] = Field(default_factory=list)
    figures: list[FigureContent] = Field(default_factory=list)


class ConsiderationUnit(BaseModel):
    index: str
    discussion_active: str
    answer: Optional[str] = Field(default=None, exclude=True)


class Reference(BaseModel):
    id: str
    title: str
    year: Optional[str] = None
    authors: Optional[str] = None
    notes: Optional[str] = None


class Consideration(BaseModel):
    units: list[ConsiderationUnit] = Field(default_factory=list)
    references: list[Reference] = Field(default_factory=list)
    reference_list_formatted: list[str] = Field(default_factory=list)


class TemplateContext(BaseModel):
    chapter: int
    chapter_plus_1: int
    chapter_plus_2: int
    experiments: list[Experiment]
    consideration: Consideration
    summary: str
