from __future__ import annotations

from pydantic import BaseModel, Field

from models.contracts import PastReportExperimentHint, PastReportSummary


class PastReportHintsOutput(BaseModel):
    experiments: list[PastReportExperimentHint] = Field(...)
    report_summary: PastReportSummary = Field(...)
