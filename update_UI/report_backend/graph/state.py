from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional
import uuid

from pydantic import BaseModel, Field

from models.contracts import (
    CleanHeading,
    Consideration,
    ConsiderationUnit,
    EvidenceRef,
    Experiment,
    ExperimentResultGroup,
    ImageAsset,
    PastReportExperimentHint,
    PastReportHeading,
    PastReportResultStructureHint,
    PastReportSummary,
    ReportResultHint,
    Reference,
    ResultsPage,
    TableAsset,
    TemplateContext,
    empty_past_report_summary,
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class InputAssetKind(str, Enum):
    pdf = "pdf"
    excel = "excel"
    image = "image"
    table = "table"
    past_report = "past_report"


class InputAssetRef(BaseModel):
    asset_id: str
    kind: InputAssetKind
    source_id: str
    filename: str = ""
    storage_key: str = ""
    upload_index: int = 0


class NormalizedAsset(BaseModel):
    asset_id: str
    kind: InputAssetKind
    source_id: str
    filename: str = ""
    storage_key: str = ""
    upload_index: int = 0
    size_bytes: int = 0
    sha256: str = ""
    mime_type: str = ""
    page_count: Optional[int] = None
    sheet_names: list[str] = Field(default_factory=list)
    role: Optional[str] = None


class JobStatus(str, Enum):
    created = "created"
    running = "running"
    waiting_hitl = "waiting_hitl"
    ready_to_resume = "ready_to_resume"
    partial = "partial"
    done = "done"
    failed = "failed"


class RetryBudgets(BaseModel):
    image_analyze: int = 2
    table_analyze: int = 1
    table_parse: int = 1
    discussion: int = 1
    render: int = 1


class JobMeta(BaseModel):
    job_id: str
    run_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    retry_budgets: RetryBudgets = Field(default_factory=RetryBudgets)
    next_upload_index: int = 1

    text_model: str = ""
    vision_model: str = ""
    template_path: str = ""
    run_mode: str = Field(default="update_mvp", description="Graph mode, e.g. 'full' | 'prepare' | 'update_mvp'")

    # UI progress (Why): 長いノード（例: D-I）中でも「どこまで進んでいるか」を
    # /jobs/{id}/intermediate で段階的に可視化するための、人間向けラベル。
    ui_phase: str = ""
    ui_detail: str = ""
    ui_current_experiment: str = ""


def default_job_meta() -> JobMeta:
    run_id = uuid.uuid4().hex
    return JobMeta(job_id=f"studio_{run_id}", run_id=run_id)


class ExcelData(BaseModel):
    asset_id: str = ""
    filename: str = ""
    storage_key: str = ""
    sheet_names: list[str] = Field(default_factory=list)


class ExcelFile(BaseModel):
    excel_id: str
    asset_id: str = ""
    filename: str = ""
    storage_key: str = ""
    upload_index: int = 0
    sheet_names: list[str] = Field(default_factory=list)


class MVPResultDebuginfo(BaseModel):
    excel_id: str = ""
    excel_filename: str = ""

    selection_type: str = ""
    chart_id: str = ""
    sheet: str = ""
    a1_range: str = ""
    rationale: str = ""

    table_markdown: str = ""
    table_rows: list[list[str]] = Field(default_factory=list)

    plot_kind: str = ""
    plot_x_label: str = ""
    plot_y_label: str = ""
    plot_title: str = ""

    # Structured facts for MVP quantitative comment generation (JSON-serializable).
    observations: dict[str, Any] = Field(default_factory=dict)

    image_id: str = ""
    image_source: str = ""
    needs_hitl: bool = False


class MVPDebuginfo(BaseModel):
    first_experiment_exp_key: str = ""
    first_experiment_rationale: str = ""

    excel_filename: str = ""
    excel_sheet: str = ""
    excel_range: str = ""
    excel_rationale: str = ""
    excel_candidates: list[dict[str, Any]] = Field(default_factory=list)
    excel_charts: list[dict[str, Any]] = Field(default_factory=list)
    excel_selection: dict[str, Any] = Field(default_factory=dict)

    table_markdown: str = ""
    table_rows: list[list[str]] = Field(default_factory=list)

    plot_kind: str = ""
    plot_x_label: str = ""
    plot_y_label: str = ""
    plot_title: str = ""

    # Structured facts for MVP quantitative comment generation (JSON-serializable).
    observations: dict[str, Any] = Field(default_factory=dict)

    results: list[MVPResultDebuginfo] = Field(default_factory=list)
    hitl_required: bool = False
    hitl_code: str = ""
    hitl_message: str = ""


class PdfTextBlock(BaseModel):
    page: int
    text: str


class PdfHeadingEvidence(BaseModel):
    section: str
    title: str
    level: int
    raw_line: str = ""
    page: Optional[int] = None
    line_index: Optional[int] = None
    global_index: Optional[int] = None
    range_start_global_index: Optional[int] = None
    range_end_global_index: Optional[int] = None
    heading_kind: str = Field(default="", description="doc_heading|presentation_outline|list_item|fragment|noise")
    clean_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    clean_reason: str = Field(default="")


class PdfStructuredSection(BaseModel):
    node_id: str = Field(default="")
    level: int = Field(default=1, ge=1)
    heading_line: str = Field(default="")
    title: str = Field(default="")
    section_number: str = Field(default="")
    start_index: int = Field(default=0, ge=0)
    end_index: int = Field(default=0, ge=0)
    text: str = Field(default="")
    children: list[PdfStructuredSection] = Field(default_factory=list)


class MethodNumberEvidence(BaseModel):
    method_id: str = Field(default="", description="Stable method identifier (e.g., 'method:4.2')")
    exp_key: str
    title: str
    method_text_prefix5: str = ""
    method_text_suffix5: str = ""
    heading_line: str = ""
    page: Optional[int] = None
    line_index: Optional[int] = None
    global_index: Optional[int] = None


class PdfMethodUnit(BaseModel):
    exp_key: str
    title: str
    level: int = Field(default=1, ge=1)
    text: str = Field(default="")
    parent_exp_key: str = Field(default="")
    child_exp_keys: list[str] = Field(default_factory=list)


class ExperimentUnitParent(BaseModel):
    exp_key: str
    title: str
    method_text: str = Field(default="")


class ExperimentUnit(BaseModel):
    exp_key: str
    title: str
    method_text: str = Field(default="")
    level: int = Field(default=0, ge=0)
    parent: ExperimentUnitParent | None = None


class ExperimentIndexEntry(BaseModel):
    exp_key: str
    method_id: str = ""
    method_title: str = ""
    parent_exp_key: str = ""
    child_exp_keys: list[str] = Field(default_factory=list)
    result_no: str = ""
    page: Optional[int] = None
    line_index: Optional[int] = None
    global_index: Optional[int] = None
    data_refs: list[str] = Field(default_factory=list)


class TheoryCandidate(BaseModel):
    candidate_id: str
    raw: str
    source_kind: str
    heading_section: str = ""
    heading_title: str = ""
    heading_line: str = ""
    page: Optional[int] = None
    line_index: Optional[int] = None
    context_before: str = ""
    context_after: str = ""


class TheoryFormula(BaseModel):
    candidate_id: str
    raw: str
    normalized: str
    omml: str
    source_kind: str
    selected: bool = False
    heading_section: str = ""
    heading_title: str = ""
    page: Optional[int] = None
    line_index: Optional[int] = None
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class LLMTheoryFormula(BaseModel):
    formula: str
    context: str
    experiments: list[str] = Field(default_factory=list)


class BLayerMethod(BaseModel):
    chapter: Optional[int] = None
    items: list[PdfMethodUnit] = Field(default_factory=list)
    experiment_units: list[ExperimentUnit] = Field(default_factory=list)


class BLayerDiscussion(BaseModel):
    chapter: Optional[int] = None
    section_number: str = ""
    title: str = ""
    heading_line: str = ""
    text: str = ""


class BLayerBundle(BaseModel):
    method: BLayerMethod = Field(default_factory=BLayerMethod)
    discussion: BLayerDiscussion = Field(default_factory=BLayerDiscussion)
    theory_formulas: list[LLMTheoryFormula] = Field(default_factory=list)


class DiscussionUnit(BaseModel):
    discussion_chapter: Optional[int] = None
    prompt_index: int
    prompt_text: str


class MethodTextReview(BaseModel):
    passed: bool
    issues: list[str] = Field(default_factory=list)
    bad_excerpt: Optional[str] = None


class PdfData(BaseModel):
    asset_id: str = ""
    filename: str = ""
    storage_key: str = ""
    pages: Optional[int] = None

    text: str = ""
    markdown_text: str = ""
    pdf_markdrown: str = ""
    page_texts: list[PdfTextBlock] = Field(default_factory=list)
    page_texts_key: str = ""
    heading_positions: list[PdfHeadingEvidence] = Field(default_factory=list)
    heading_positions_cleaned: list[PdfHeadingEvidence] = Field(default_factory=list)
    heading_positions_clean_report: list[CleanHeading] = Field(default_factory=list)
    structured_sections: list[PdfStructuredSection] = Field(default_factory=list)
    section_candidates: dict[str, list[PdfStructuredSection]] = Field(default_factory=dict)
    marker_reason: str = ""

    method_text: str = ""
    method_markdown_text: str = ""
    discussion_text: str = ""
    discussion_markdown_text: str = ""
    consideration_prompts: list[str] = Field(default_factory=list)

    method_chapter: Optional[int] = None
    discussion_chapter: Optional[int] = None

    method_numbers: list[MethodNumberEvidence] = Field(default_factory=list)
    method_units: list[PdfMethodUnit] = Field(default_factory=list)
    experiment_index: dict[str, ExperimentIndexEntry] = Field(default_factory=dict)
    result_number_map: dict[str, str] = Field(default_factory=dict)
    result_number_map_errors: list[str] = Field(default_factory=list)
    discussion_section: Optional[PdfStructuredSection] = None
    discussion_units: list[DiscussionUnit] = Field(default_factory=list)
    method_text_review: Optional[MethodTextReview] = None
    theory_candidates: list[TheoryCandidate] = Field(default_factory=list)
    theory_formulas: list[TheoryFormula] = Field(default_factory=list)
    theory_formulas_llm: list[LLMTheoryFormula] = Field(default_factory=list)

    needs_hitl_methods: bool = False
    needs_hitl_result_map: bool = False
    needs_hitl_discussion: bool = False
    needs_hitl_theory: bool = False


class PastReportData(BaseModel):
    report_id: str = ""
    asset_id: str = ""
    filename: str = ""
    storage_key: str = ""
    extracted_hint: str = ""
    headings: list[PastReportHeading] = Field(default_factory=list)
    result_section_headings: list[PastReportHeading] = Field(default_factory=list)
    hints: list[PastReportExperimentHint] = Field(default_factory=list)
    result_structure_hints: list[PastReportResultStructureHint] = Field(default_factory=list)
    result_structure_hints_ready: bool = False
    result_structure_hints_error: str = ""
    report_summary: PastReportSummary = Field(default_factory=empty_past_report_summary)
    hints_ready: bool = False
    hints_error: str = ""
    upload_index: int = 0


class ReportData(BaseModel):
    hints: list[ReportResultHint] = Field(default_factory=list)


class OutputExpectation(BaseModel):
    name: str = Field(default="")
    hint: str = Field(default="")
    x_axis_label: str = Field(default="")
    y_axis_label: str = Field(default="")


class RequiredOutputCandidate(BaseModel):
    tables_count: int = Field(default=0, ge=0)
    graphs_count: int = Field(default=0, ge=0)
    photos_count: int = Field(default=0, ge=0)
    table_expectations: list["OutputExpectation"] = Field(default_factory=list)
    graph_expectations: list["OutputExpectation"] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    evidence: list[str] = Field(default_factory=list)


class RequiredOutputEstimate(BaseModel):
    exp_key: str = Field(default="")
    title: str = Field(default="")
    method_summary: str = Field(default="")
    tables_count: int = Field(default=0, ge=0)
    graphs_count: int = Field(default=0, ge=0)
    photos_count: int = Field(default=0, ge=0)
    table_expectations: list["OutputExpectation"] = Field(default_factory=list)
    graph_expectations: list["OutputExpectation"] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    evidence: list[str] = Field(default_factory=list)
    candidates: list[RequiredOutputCandidate] = Field(default_factory=list)


class RequiredOutputsHitl(BaseModel):
    enabled: bool = False
    mode: str = Field(default="", description="confirm | required")
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class ExcelColumnProfile(BaseModel):
    column_index: int = Field(default=1, ge=1)
    header: str = Field(default="")
    sample_values: list[str] = Field(default_factory=list)
    numeric_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    text_ratio: float = Field(default=0.0, ge=0.0, le=1.0)


class ExcelSheetInventory(BaseModel):
    sheet_name: str = Field(default="")
    preview_rows: list[list[str]] = Field(default_factory=list)
    header_row_index: int = Field(default=0, ge=0)
    headers: list[str] = Field(default_factory=list)
    columns: list[ExcelColumnProfile] = Field(default_factory=list)
    numeric_density: float = Field(default=0.0, ge=0.0, le=1.0)


class ExcelInventory(BaseModel):
    excel_id: str = Field(default="")
    filename: str = Field(default="")
    sheet_names: list[str] = Field(default_factory=list)
    sheets: list[ExcelSheetInventory] = Field(default_factory=list)


class ExcelSheetSelectionCandidate(BaseModel):
    excel_id: str = Field(default="")
    sheet_name: str = Field(default="")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    evidence: list[str] = Field(default_factory=list)


class ExcelSheetSelection(BaseModel):
    exp_key: str = Field(default="")
    result_no: str = Field(default="")
    title: str = Field(default="")
    selected_excel_id: str = Field(default="")
    selected_sheet: str = Field(default="")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    evidence: list[str] = Field(default_factory=list)
    candidates: list[ExcelSheetSelectionCandidate] = Field(default_factory=list)
    used_llm: bool = False


class ColumnUnitBinding(BaseModel):
    column_index: int = Field(default=1, ge=1)
    header: str = Field(default="")
    name: str = Field(default="")
    unit: str = Field(default="")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    evidence: list[str] = Field(default_factory=list)


class TableColumnBinding(BaseModel):
    exp_key: str = Field(default="")
    result_no: str = Field(default="")
    excel_id: str = Field(default="")
    sheet_name: str = Field(default="")
    header_row_index: int = Field(default=0, ge=0)
    columns: list[ColumnUnitBinding] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    missing_units: list[str] = Field(default_factory=list)
    missing_mappings: list[str] = Field(default_factory=list)
    used_llm: bool = False


class TheoryParamValue(BaseModel):
    symbol: str = Field(default="")
    value: Optional[float] = None
    unit: str = Field(default="")
    source: str = Field(default="")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)


class TheoryParamBinding(BaseModel):
    exp_key: str = Field(default="")
    result_no: str = Field(default="")
    required_params: list[str] = Field(default_factory=list)
    params: list[TheoryParamValue] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    missing_params: list[str] = Field(default_factory=list)
    used_llm: bool = False


class ExcelSheetSelectionHitl(BaseModel):
    enabled: bool = False
    code: str = Field(default="")
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class ColumnUnitHitl(BaseModel):
    enabled: bool = False
    codes: list[str] = Field(default_factory=list)
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class TheoryParamHitl(BaseModel):
    enabled: bool = False
    code: str = Field(default="")
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class InsertAssetBinding(BaseModel):
    exp_key: str = Field(default="")
    result_no: str = Field(default="")
    tables_asset_ids: list[str] = Field(default_factory=list)
    graphs_asset_ids: list[str] = Field(default_factory=list)
    photos_asset_ids: list[str] = Field(default_factory=list)
    required_tables: int = Field(default=0, ge=0)
    required_graphs: int = Field(default=0, ge=0)
    required_photos: int = Field(default=0, ge=0)
    missing_tables: int = Field(default=0, ge=0)
    missing_graphs: int = Field(default=0, ge=0)
    missing_photos: int = Field(default=0, ge=0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    evidence: list[str] = Field(default_factory=list)
    ambiguous: bool = False
    type_unknown: bool = False


class QuantCommentTarget(BaseModel):
    exp_key: str = Field(default="")
    table_ids: list[str] = Field(default_factory=list)
    graph_ids: list[str] = Field(default_factory=list)
    photo_ids: list[str] = Field(default_factory=list)


class QuantCommentResult(BaseModel):
    exp_key: str = Field(default="")
    asset_id: str = Field(default="")
    kind: str = Field(default="")
    caption: str = Field(default="")
    quant_comment: str = Field(default="")
    error: str = Field(default="")


class InsertAssetHitl(BaseModel):
    enabled: bool = False
    codes: list[str] = Field(default_factory=list)
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class GraphAxisBinding(BaseModel):
    graph_id: str = Field(default="")
    exp_key: str = Field(default="")
    result_no: str = Field(default="")
    x_column: int = Field(default=0, ge=0)
    y_columns: list[int] = Field(default_factory=list)
    x_label: str = Field(default="")
    y_label: str = Field(default="")
    x_unit: str = Field(default="")
    y_unit: str = Field(default="")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    rationale: str = Field(default="")
    used_llm: bool = False


class AxisHitl(BaseModel):
    enabled: bool = False
    code: str = Field(default="")
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class TheoryCompareHitl(BaseModel):
    enabled: bool = False
    code: str = Field(default="")
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class TheoryValueResult(BaseModel):
    exp_key: str = Field(default="")
    result_no: str = Field(default="")
    formula: str = Field(default="")
    target_symbol: str = Field(default="")
    value: Optional[float] = None
    unit: str = Field(default="")
    params_used: dict[str, float] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class DeltaErrorResult(BaseModel):
    exp_key: str = Field(default="")
    result_no: str = Field(default="")
    target_symbol: str = Field(default="")
    theory_value: Optional[float] = None
    theory_unit: str = Field(default="")
    measured_value: Optional[float] = None
    measured_unit: str = Field(default="")
    measured_source: str = Field(default="")
    delta: Optional[float] = None
    abs_error: Optional[float] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class SlopeExtremeResult(BaseModel):
    graph_id: str = Field(default="")
    exp_key: str = Field(default="")
    result_no: str = Field(default="")
    x_unit: str = Field(default="")
    y_unit: str = Field(default="")
    slope: Optional[float] = None
    max_value: Optional[float] = None
    min_value: Optional[float] = None
    points_count: int = Field(default=0, ge=0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)


class ComputationHitl(BaseModel):
    enabled: bool = False
    codes: list[str] = Field(default_factory=list)
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)


class TextGenerationHitl(BaseModel):
    enabled: bool = False
    codes: list[str] = Field(default_factory=list)
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)
    rewind_target: str = Field(default="")


class ValidationIssue(BaseModel):
    code: str
    message: str
    target: Optional[str] = None


class ValidationReport(BaseModel):
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)
    retry_targets: list[ValidationIssue] = Field(default_factory=list)


class FieldOption(BaseModel):
    value: str
    label: str


class FieldSpec(BaseModel):
    field_id: str
    name: str
    label: str
    type: Literal["single_select", "multi_select", "text", "number", "unit_select", "textarea"]
    required: bool
    options: Optional[list[FieldOption]] = None
    default: Optional[Any] = None
    help: Optional[str] = None
    validation: Optional[dict[str, Any]] = None


class HITLRequest(BaseModel):
    request_id: str
    issue_code: str
    severity: Literal["HITL"] = "HITL"
    title: str
    description: str
    rewind_target: str
    context: dict[str, Any] = Field(default_factory=dict)
    fields: list[FieldSpec] = Field(default_factory=list)
    submit_label: str = Field(default="決定")


class HITLResponse(BaseModel):
    request_id: str
    answers: dict[str, Any] = Field(default_factory=dict)
    submitted_at: Optional[str] = None
    user_note: str = Field(default="")


class HITLFormSpec(BaseModel):
    title: str
    description: str
    fields: list[FieldSpec] = Field(default_factory=list)
    submit_label: str = Field(default="決定")
    rewind_target: str = Field(default="")


class ExperimentHitlEntry(BaseModel):
    exp_key: str
    kind: str
    code: str = Field(default="")
    message: str = Field(default="")
    html: str = Field(default="")
    payload: dict[str, Any] = Field(default_factory=dict)
    rewind_target: str = Field(default="")
    created_at: str = Field(default_factory=now_iso)


class MarkdownDocument(BaseModel):
    text: str = Field(default="")
    generated_at: Optional[str] = None
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)
    assets_manifest: list[str] = Field(default_factory=list)


class MarkdownState(BaseModel):
    document: Optional[MarkdownDocument] = None
    document_styled: Optional[MarkdownDocument] = None


class ArtifactsBundle(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)
    generated_at: Optional[str] = None


class ArtifactsState(BaseModel):
    json_bundle: Optional[ArtifactsBundle] = None


class RenderedDocxState(BaseModel):
    path: str = Field(default="")
    local_path: str = Field(default="")
    omml_inserted: bool = False
    retry_count: int = Field(default=0, ge=0)
    generated_at: Optional[str] = None


class RequiredOutputCounts(BaseModel):
    tables_count: int = Field(default=0, ge=0)
    graphs_count: int = Field(default=0, ge=0)
    photos_count: int = Field(default=0, ge=0)


class CRequiredOutputsState(BaseModel):
    by_result_no: dict[str, RequiredOutputCounts] = Field(default_factory=dict)


class ExcelSheetSelectionEntry(BaseModel):
    excel_file_id: str = Field(default="")
    sheet_name: str = Field(default="")


class ColumnBindingEntry(BaseModel):
    name: str = Field(default="")
    col_ref: str = Field(default="")
    unit: str = Field(default="")


class TableBindingEntry(BaseModel):
    table_id: str = Field(default="")
    columns: list[ColumnBindingEntry] = Field(default_factory=list)


class AxisBindingEntry(BaseModel):
    x_column: int = Field(default=0, ge=0)
    y_columns: list[int] = Field(default_factory=list)
    x_label: str = Field(default="")
    y_label: str = Field(default="")
    x_unit: str = Field(default="")
    y_unit: str = Field(default="")


class ParamValueEntry(BaseModel):
    value: Optional[Any] = None
    unit: str = Field(default="")
    sheet_name: Optional[str] = None
    cell_or_range: Optional[str] = None


class GraphAxisInfo(BaseModel):
    x_name: str = Field(default="")
    x_unit: str = Field(default="")
    y_name: str = Field(default="")
    y_unit: str = Field(default="")
    series_names: list[str] = Field(default_factory=list)
    condition_names: list[str] = Field(default_factory=list)


class EExcelRangeSelection(BaseModel):
    exp_key: str = Field(default="")
    title: str = Field(default="")
    excel_id: str = Field(default="")
    excel_filename: str = Field(default="")
    sheet: str = Field(default="")
    a1_range: str = Field(default="")
    has_graph: bool = Field(default=False)
    graph_axes: GraphAxisInfo = Field(default_factory=GraphAxisInfo)
    result: dict[str, Any] = Field(default_factory=dict)


class EExcelState(BaseModel):
    sheet_selection_by_result_no: dict[str, ExcelSheetSelectionEntry] = Field(default_factory=dict)
    table_bindings_by_result_no: dict[str, list[TableBindingEntry]] = Field(default_factory=dict)
    axis_bindings_by_result_no: dict[str, AxisBindingEntry] = Field(default_factory=dict)
    param_bindings_by_result_no: dict[str, dict[str, ParamValueEntry]] = Field(default_factory=dict)
    range_selections: list[EExcelRangeSelection] = Field(default_factory=list)


class AssetAssignment(BaseModel):
    tables: list[str] = Field(default_factory=list)
    graphs: list[str] = Field(default_factory=list)
    photos: list[str] = Field(default_factory=list)


class AssetIndexEntry(BaseModel):
    kind: str = Field(default="")
    storage_key: str = Field(default="")
    label: str = Field(default="")
    caption: str = Field(default="")


class FAssetsState(BaseModel):
    assignments_by_result_no: dict[str, AssetAssignment] = Field(default_factory=dict)
    assets_index: dict[str, AssetIndexEntry] = Field(default_factory=dict)


class DiscussionPage(BaseModel):
    text: str = Field(default="")
    prompts: list[str] = Field(default_factory=list)
    units: list[ConsiderationUnit] = Field(default_factory=list)
    generated_at: Optional[str] = None


class SummaryPage(BaseModel):
    text: str = Field(default="")
    generated_at: Optional[str] = None


class ReferencesPage(BaseModel):
    references: list[Reference] = Field(default_factory=list)
    formatted_lines: list[str] = Field(default_factory=list)
    generated_at: Optional[str] = None


class QualityIssue(BaseModel):
    code: str
    stage: str
    severity: Literal["HITL", "FAIL", "WARN", "INFO"]
    message: str
    evidence_refs: list[EvidenceRef] = Field(default_factory=list)
    suggested_action: Literal["ask_user", "autofix", "stop", "retry"]
    rewind_target: Optional[str] = None


class QualityReport(BaseModel):
    pass_gate: bool = False
    issues: list[QualityIssue] = Field(default_factory=list)


class HitlHistoryEntry(BaseModel):
    request: dict[str, Any] = Field(default_factory=dict)
    response: dict[str, Any] = Field(default_factory=dict)
    rewind_target: Optional[str] = None
    timestamp: str = Field(default_factory=now_iso)


class OmmlInsertion(BaseModel):
    result_no: str
    target_text: str
    omml: str


class SnapshotMeta(BaseModel):
    step: str
    storage_key: str
    created_at: str = Field(default_factory=now_iso)


class AgentState(BaseModel):
    status: JobStatus = JobStatus.created
    job_meta: JobMeta = Field(default_factory=default_job_meta)

    pdf: PdfData = Field(default_factory=PdfData)
    report: ReportData = Field(default_factory=ReportData)
    past_report: PastReportData = Field(default_factory=PastReportData)
    past_reports: list[PastReportData] = Field(default_factory=list)
    excel: ExcelData = Field(default_factory=ExcelData)
    excel_files: list[ExcelFile] = Field(default_factory=list)
    input_assets: list[InputAssetRef] = Field(default_factory=list)
    normalized_inputs: list[NormalizedAsset] = Field(default_factory=list)
    mvp: MVPDebuginfo = Field(default_factory=MVPDebuginfo)
    method_tree: list[dict[str, Any]] = Field(default_factory=list)

    experiments: list[Experiment] = Field(default_factory=list)
    assets_images: list[ImageAsset] = Field(default_factory=list)
    assets_tables: list[TableAsset] = Field(default_factory=list)
    result_groups: list[ExperimentResultGroup] = Field(default_factory=list)
    results_page: Optional[ResultsPage] = None
    discussion_page: Optional[DiscussionPage] = None
    summary_page: Optional[SummaryPage] = None
    references_page: Optional[ReferencesPage] = None

    required_outputs: list[RequiredOutputEstimate] = Field(default_factory=list)
    required_outputs_hitl: RequiredOutputsHitl = Field(default_factory=RequiredOutputsHitl)
    excel_inventory: list[ExcelInventory] = Field(default_factory=list)
    excel_sheet_selections: list[ExcelSheetSelection] = Field(default_factory=list)
    table_column_bindings: list[TableColumnBinding] = Field(default_factory=list)
    theory_param_bindings: list[TheoryParamBinding] = Field(default_factory=list)

    excel_sheet_hitl: ExcelSheetSelectionHitl = Field(default_factory=ExcelSheetSelectionHitl)
    column_unit_hitl: ColumnUnitHitl = Field(default_factory=ColumnUnitHitl)
    theory_param_hitl: TheoryParamHitl = Field(default_factory=TheoryParamHitl)
    insert_asset_bindings: list[InsertAssetBinding] = Field(default_factory=list)
    insert_asset_hitl: InsertAssetHitl = Field(default_factory=InsertAssetHitl)
    graph_axis_bindings: list[GraphAxisBinding] = Field(default_factory=list)
    axis_hitl: AxisHitl = Field(default_factory=AxisHitl)
    g_quant_comment_inputs: list[QuantCommentTarget] = Field(default_factory=list)
    g_quant_comment_results: list[QuantCommentResult] = Field(default_factory=list)
    theory_compare_enabled: bool = Field(default=True)
    theory_compare_by_experiment: dict[str, bool] = Field(default_factory=dict)
    theory_compare_decided: bool = Field(default=False)
    theory_compare_hitl: TheoryCompareHitl = Field(default_factory=TheoryCompareHitl)
    theory_value_results: list[TheoryValueResult] = Field(default_factory=list)
    delta_error_results: list[DeltaErrorResult] = Field(default_factory=list)
    slope_extreme_results: list[SlopeExtremeResult] = Field(default_factory=list)
    computation_hitl: ComputationHitl = Field(default_factory=ComputationHitl)
    text_generation_hitl: TextGenerationHitl = Field(default_factory=TextGenerationHitl)

    consideration: Consideration = Field(default_factory=Consideration)
    summary: str = ""
    style_rules: dict[str, Any] = Field(default_factory=dict)
    compute_log: Optional[dict[str, Any]] = None

    template_context: Optional[TemplateContext] = None
    artifact_docx_key: Optional[str] = None
    artifact_markdown_key: Optional[str] = None
    artifact_markdown_raw_key: Optional[str] = None
    artifact_review_log_key: Optional[str] = None
    artifact_json_key: Optional[str] = None
    artifact_quality_report_key: Optional[str] = None

    review_log: dict[str, Any] = Field(default_factory=dict)

    validation_report: ValidationReport = Field(default_factory=ValidationReport)
    markdown: MarkdownState = Field(default_factory=MarkdownState)
    artifacts: ArtifactsState = Field(default_factory=ArtifactsState)
    rendered_docx: RenderedDocxState = Field(default_factory=RenderedDocxState)
    c_required_outputs: CRequiredOutputsState = Field(default_factory=CRequiredOutputsState)
    e_excel: EExcelState = Field(default_factory=EExcelState)
    f_assets: FAssetsState = Field(default_factory=FAssetsState)
    hitl_active: Optional[HITLRequest] = None
    hitl_response: Optional[HITLResponse] = None
    hitl_form_registry: dict[str, HITLFormSpec] = Field(default_factory=dict)
    hitl_queue: list[HITLRequest] = Field(default_factory=list)
    experiment_hitl_queue: list[ExperimentHitlEntry] = Field(default_factory=list)
    next_rewind_target: str = Field(default="")
    hitl_history: list[HitlHistoryEntry] = Field(default_factory=list)
    quality_report: QualityReport = Field(default_factory=QualityReport)
    omml_insertion_plan: list[OmmlInsertion] = Field(default_factory=list)
    preformat_autofix_attempts: int = Field(default=0, ge=0)
    next_action: str = Field(default="", description="Internal: next retry step (set by retry_decide)")
    snapshots: list[SnapshotMeta] = Field(default_factory=list)
    b_layer_bundle: Optional[BLayerBundle] = None
