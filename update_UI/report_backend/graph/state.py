from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from models.contracts import Consideration, Experiment, ImageAsset, TableAsset, TemplateContext


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStatus(str, Enum):
    created = "created"
    running = "running"
    partial = "partial"
    done = "done"
    failed = "failed"


class RetryBudgets(BaseModel):
    image_analyze: int = 2
    table_analyze: int = 1
    discussion: int = 1
    render: int = 1


class JobMeta(BaseModel):
    job_id: str
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    retry_budgets: RetryBudgets = Field(default_factory=RetryBudgets)
    next_upload_index: int = 1

    text_model: str = ""
    vision_model: str = ""


class PdfData(BaseModel):
    filename: str = ""
    storage_key: str = ""
    pages: Optional[int] = None

    text: str = ""
    headings: list[dict[str, Any]] = Field(default_factory=list)

    method_text: str = ""
    discussion_text: str = ""
    consideration_prompts: list[str] = Field(default_factory=list)

    method_chapter: Optional[int] = None
    discussion_chapter: Optional[int] = None


class ValidationIssue(BaseModel):
    code: str
    message: str
    target: Optional[str] = None


class ValidationReport(BaseModel):
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)
    retry_targets: list[ValidationIssue] = Field(default_factory=list)


class SnapshotMeta(BaseModel):
    step: str
    storage_key: str
    created_at: str = Field(default_factory=now_iso)


class AgentState(BaseModel):
    status: JobStatus = JobStatus.created
    job_meta: JobMeta

    pdf: PdfData = Field(default_factory=PdfData)
    method_tree: list[dict[str, Any]] = Field(default_factory=list)

    experiments: list[Experiment] = Field(default_factory=list)
    assets_images: list[ImageAsset] = Field(default_factory=list)
    assets_tables: list[TableAsset] = Field(default_factory=list)

    consideration: Consideration = Field(default_factory=Consideration)
    summary: str = ""

    template_context: Optional[TemplateContext] = None
    artifact_docx_key: Optional[str] = None

    validation_report: ValidationReport = Field(default_factory=ValidationReport)
    next_action: str = Field(default="", description="Internal: next retry step (set by retry_decide)")
    snapshots: list[SnapshotMeta] = Field(default_factory=list)
