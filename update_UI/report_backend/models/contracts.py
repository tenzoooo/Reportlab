from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class HeadingKind(str, Enum):
    doc_heading = "doc_heading"
    list_item = "list_item"
    table_figure_fragment = "table_figure_fragment"
    formula_fragment = "formula_fragment"
    unit_fragment = "unit_fragment"
    presentation_outline = "presentation_outline"
    discussion_heading = "discussion_heading"
    discussion_prompt = "discussion_prompt"
    appendix_like = "appendix_like"
    report_requirements = "report_requirements"
    noise = "noise"


class HeadingCleanItem(BaseModel):
    candidate_key: str = Field(..., description="Stable candidate identifier")
    raw_line: str = Field(..., description="Original candidate line")
    page: Optional[int] = Field(default=None, description="1-based page number if available")
    line_index: Optional[int] = Field(default=None, description="0-based line index within page if available")
    global_index: Optional[int] = Field(default=None, description="Global line index if available")
    context_lines: list[str] = Field(default_factory=list, description="Local context lines around the candidate")


class HeadingCleanRequest(BaseModel):
    items: list[HeadingCleanItem] = Field(default_factory=list)


class CleanHeading(BaseModel):
    candidate_key: str = Field(..., description="Stable candidate identifier")
    is_heading: bool = Field(..., description="Whether this candidate is a heading worth keeping")
    confidence: float = Field(..., ge=0.0, le=1.0)
    normalized_section: Optional[str] = Field(default=None, description="Normalized section number like '4.2.1'")
    normalized_title: Optional[str] = Field(default=None, description="Normalized title text")
    level: Optional[int] = Field(default=None, description="Heading level (1,2,3,...)")
    heading_kind: HeadingKind
    reason: str = Field(..., description="Short rationale for classification")


class HeadingCleanResponse(BaseModel):
    items: list[CleanHeading] = Field(default_factory=list)


class EvidenceRef(BaseModel):
    source_kind: str = Field(default="", description="manual_pdf|excel|image|past_report|llm|user|computed|binding")
    file_id: Optional[str] = Field(default=None, description="Optional file identifier")
    asset_id: str = Field(default="")
    page: Optional[int] = None
    sheet: Optional[str] = Field(default=None)
    cell_or_range: Optional[str] = Field(default=None)
    bbox: Optional[list[float]] = Field(default=None, description="Bounding box [x1,y1,x2,y2]")
    line_index: Optional[int] = None
    text: str = Field(default="")
    text_snippet: Optional[str] = Field(default=None)
    note: str = Field(default="")
    target: str = Field(default="")
    confidence: Optional[float] = Field(default=None)


class TextWithEvidence(BaseModel):
    text: str = Field(..., description="Required text")
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class MetricValue(BaseModel):
    value: float = Field(..., description="Numeric value")
    unit: str = Field(..., description="Unit string (\"1\" allowed)")


class QuantComment(BaseModel):
    theory_compare: bool = Field(..., description="Whether theory comparison is enabled")
    metrics: dict[str, MetricValue | dict] = Field(default_factory=dict)
    text: TextWithEvidence


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
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class TableAnalysis(BaseModel):
    caption: str = Field(..., description="Table caption (no strict length constraint by default)")
    quant_comment: str = Field(..., description="Quantitative-first comment")
    belongs_to: list[BelongsToCandidate] = Field(default_factory=list)
    result_summary: str = Field(..., description="Short result summary for description_brief")
    table_summary: str = Field(default="", description="Optional computed stats/summary for reranking/debug")
    assigned_exp_key: str = Field(default="", description="Best exp_key after reranking/HITL (optional)")
    assigned_score: float = Field(default=0.0, ge=0.0, le=1.0, description="Confidence for assigned_exp_key (optional)")
    assigned_rationale: str = Field(default="", description="Short rationale for assigned_exp_key (optional)")
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class ImageAsset(BaseModel):
    asset_id: str = ""
    image_id: str
    filename: str
    mime_type: str
    storage_key: str
    upload_index: int = Field(default=0, description="Global upload order for stable block ordering")
    rough_class: str = Field(default="", description="graph | photo | unknown")
    rough_class_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rough_class_method: str = Field(default="", description="heuristic | llm")
    rough_class_rationale: str = Field(default="")
    analysis: Optional[ImageAnalysis] = None
    assigned_to: Optional[str] = Field(default=None, description="exp_key when assigned")
    x_column_index: int = Field(default=0, description="1-based column index for x-axis")
    y_column_indices: list[int] = Field(default_factory=list, description="1-based column indices for y series")
    x_label: str = Field(default="", description="x-axis label")
    y_label: str = Field(default="", description="y-axis label")
    x_range: str = Field(default="", description="x-axis range like 'min~max'")
    y_range: str = Field(default="", description="y-axis range like 'min~max'")


class TableAsset(BaseModel):
    asset_id: str = ""
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
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class TableContent(BaseModel):
    asset_upload_index: Optional[int] = None
    label: str
    caption: str
    rows: list[list[str]] = Field(default_factory=list)
    quant_comment: str = ""
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


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
    method_no: Optional[str] = Field(default=None, description="Method section number if available")

    method_summary: str = Field(default="", description="2-4 sentences method summary")
    result_brief: str = Field(default="", exclude=True, description="(internal) result summary, not part of output contract")
    description_brief: str = Field(default="", description="method_summary + '\\n' + result_brief")

    quant_comment: str = Field(default="", description="Optional experiment-level quantitative comment")
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)
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


class AssetRef(BaseModel):
    asset_id: str = Field(..., description="Asset identifier")
    asset_kind: Literal["table", "figure", "photo"]
    label: str = Field(..., description="Label with numbering")
    caption: TextWithEvidence


class ExperimentResultGroup(BaseModel):
    result_no: str = Field(..., description="Result number (e.g., '5.1.1')")
    method_no: Optional[str] = Field(default=None, description="Method number if available")
    experiment_name: str = Field(..., description="Experiment name/title")
    experiment_overview: TextWithEvidence
    result_description: TextWithEvidence
    tables: list[AssetRef] = Field(default_factory=list)
    figures: list[AssetRef] = Field(default_factory=list)
    photos: list[AssetRef] = Field(default_factory=list)
    quant_comment: QuantComment
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class ResultsSection(BaseModel):
    parent_result_no: str = Field(..., description="Parent result number (e.g., '5.1')")
    title: str = Field(..., description="Section title")
    header_only: bool = Field(..., description="Whether this section is only a header")
    groups: list[ExperimentResultGroup] = Field(default_factory=list)
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class ResultsPage(BaseModel):
    sections: list[ResultsSection] = Field(default_factory=list)
    chapter: Optional[str] = Field(default=None, description="Optional chapter label")
    title: Optional[str] = Field(default=None, description="Optional page title")
    generated_at: Optional[str] = Field(default=None, description="Optional ISO timestamp")
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class PastReportGraphHint(BaseModel):
    chart_type: str = Field(default="", description="Chart type (line/scatter/bar/other)")
    x_name: str = Field(default="", description="X variable name")
    x_unit: str = Field(default="", description="X variable unit")
    y_name: str = Field(default="", description="Y variable name")
    y_unit: str = Field(default="", description="Y variable unit")
    series_names: list[str] = Field(default_factory=list, description="Series names shown in legend or labels")
    condition_names: list[str] = Field(default_factory=list, description="Condition names (e.g., temperature, sample)")
    caption: str = Field(default="", description="Figure/graph caption")


class PastReportTableColumnHint(BaseModel):
    name: str = Field(default="", description="Column header name")
    unit: str = Field(default="", description="Column unit")


class PastReportTableHint(BaseModel):
    columns: list[PastReportTableColumnHint] = Field(default_factory=list)
    caption: str = Field(default="", description="Table caption")


class PastReportHeading(BaseModel):
    heading_line: str = Field(default="", description="Heading line extracted from past report")
    level: int = Field(default=1, ge=1, le=6)
    section_number: str = Field(default="", description="Section number if available")
    exp_key: str = Field(default="", description="Experiment number if available")
    title: str = Field(default="", description="Heading title")
    section_text: str = Field(default="", description="Text from this heading to the next heading")
    image_paths: list[str] = Field(default_factory=list)
    image_data_urls: list[str] = Field(default_factory=list)
    page_image_paths: list[str] = Field(default_factory=list)
    page_image_data_urls: list[str] = Field(default_factory=list)


class PastReportExperimentHint(BaseModel):
    exp_key: str = Field(default="", description="Experiment number if available")
    name: str = Field(default="", description="Experiment name/title")
    graphs_count: int = Field(default=0, ge=0, description="Number of graphs for this experiment")
    tables_count: int = Field(default=0, ge=0, description="Number of tables for this experiment")
    graphs: list[PastReportGraphHint] = Field(default_factory=list)
    tables: list[PastReportTableHint] = Field(default_factory=list)


class PastReportResultStructureHint(BaseModel):
    heading_line: str = Field(default="", description="Heading line in result section")
    title: str = Field(default="", description="Section title")
    summary: str = Field(default="", description="Result summary for the section")
    tables_count: int = Field(default=0, ge=0, description="Number of tables needed for the section")
    graphs_count: int = Field(default=0, ge=0, description="Number of graphs needed for the section")
    tables: list[PastReportTableHint] = Field(default_factory=list, description="Table attribute hints")
    graphs: list[PastReportGraphHint] = Field(default_factory=list, description="Graph attribute hints")


class ReportResultHint(BaseModel):
    exp_key: str = Field(default="", description="Experiment number (e.g., 4.2.1)")
    title: str = Field(default="", description="Experiment title")
    result_hint: str = Field(default="", description="Result structure hint for this experiment")


class PastReportEnvironment(BaseModel):
    parameters: dict[str, str] = Field(..., description="Condition parameters, e.g., RL=3kΩ")
    hardware: list[str] = Field(..., description="Hardware/components mentioned")


class PastReportStructureSection(BaseModel):
    section_id: str = Field(..., description="Section/experiment id like '4.2.1'")
    title: str = Field(..., description="Section title")
    objective: str = Field(..., description="Purpose or goal for the section")
    environment: PastReportEnvironment = Field(...)


class PastReportErrorMetrics(BaseModel):
    relative_error: str = Field(..., description="Relative error (e.g., '0.35%')")
    offset: str = Field(..., description="Offset (e.g., '6mV')")


class PastReportDataPoint(BaseModel):
    target: str = Field(..., description="Metric name (e.g., gain, cutoff)")
    theory_value: float | None = Field(..., description="Theoretical value if specified")
    measured_value: float | None = Field(..., description="Measured value if specified")
    error_metrics: PastReportErrorMetrics = Field(...)
    raw_table_ref: str = Field(..., description="Table reference id (e.g., '表1')")


class PastReportVisualEvidence(BaseModel):
    figure_id: str = Field(..., description="Figure id (e.g., '図4')")
    type: str = Field(..., description="waveform | graph | photo")
    detected_features: list[str] = Field(..., description="Key visual features")
    anomaly_score: float = Field(..., ge=0.0, le=1.0, description="Visual anomaly score")


class PastReportLogicAudit(BaseModel):
    theoretical_consistency: bool | None = Field(..., description="Consistency with theory")
    causal_factors: list[str] = Field(..., description="Primary causes of error")
    blind_spots: list[str] = Field(..., description="Ignored/understated facts")
    opportunity_cost: str = Field(..., description="Next strategic step for accuracy")


class PastReportSummary(BaseModel):
    structure: list[PastReportStructureSection] = Field(...)
    data_points: list[PastReportDataPoint] = Field(...)
    visual_evidence: list[PastReportVisualEvidence] = Field(...)
    logic_audit: PastReportLogicAudit = Field(...)


def empty_past_report_logic_audit() -> PastReportLogicAudit:
    return PastReportLogicAudit(
        theoretical_consistency=None,
        causal_factors=[],
        blind_spots=[],
        opportunity_cost="",
    )


def empty_past_report_summary() -> PastReportSummary:
    return PastReportSummary(
        structure=[],
        data_points=[],
        visual_evidence=[],
        logic_audit=empty_past_report_logic_audit(),
    )
