from __future__ import annotations

from graph.state import AgentState, JobStatus, ValidationIssue, now_iso
from models.contracts import ExperimentResultGroup, ResultsPage, ResultsSection


_FAIL_RESULTS_PAGE_GROUPS_MISSING = "FAIL_RESULTS_PAGE_GROUPS_MISSING"


def _result_no_parent(result_no: str) -> str:
    parts = [p for p in (result_no or "").split(".") if p.strip()]
    if len(parts) <= 2:
        return result_no
    return ".".join(parts[:2])


def _result_no_key(result_no: str) -> tuple:
    parts = [p for p in (result_no or "").split(".") if p.strip()]
    key = []
    for part in parts:
        try:
            key.append(int(part))
        except Exception:
            key.append(9999)
    return tuple(key)


def _group_sort(groups: list[ExperimentResultGroup]) -> list[ExperimentResultGroup]:
    return sorted(groups, key=lambda g: _result_no_key(g.result_no))


def assemble_results_page(state: AgentState) -> AgentState:
    if state.text_generation_hitl.enabled or state.status == JobStatus.failed:
        return state
    if not state.result_groups:
        if state.experiments:
            state.validation_report.errors.append(
                ValidationIssue(code=_FAIL_RESULTS_PAGE_GROUPS_MISSING, message="Result groups are missing.")
            )
            state.status = JobStatus.failed
        return state

    groups_by_parent: dict[str, list[ExperimentResultGroup]] = {}
    for group in state.result_groups:
        parent_no = _result_no_parent(group.result_no)
        groups_by_parent.setdefault(parent_no, []).append(group)

    parents_with_children: set[str] = set()
    for exp in state.experiments:
        if not exp.subidx:
            continue
        exp_key = (exp.source_idx or exp.idx).strip()
        result_no = state.pdf.result_number_map.get(exp_key, "")
        if result_no:
            parents_with_children.add(_result_no_parent(result_no))

    sections: list[ResultsSection] = []
    for parent_no, groups in groups_by_parent.items():
        sections.append(
            ResultsSection(
                parent_result_no=parent_no,
                title=f"結果 {parent_no}",
                header_only=parent_no in parents_with_children,
                groups=_group_sort(groups),
                evidence_refs=[],
            )
        )

    sections_sorted = sorted(sections, key=lambda s: _result_no_key(s.parent_result_no))
    state.results_page = ResultsPage(sections=sections_sorted)
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["assemble_results_page"]
