from __future__ import annotations

from graph.state import AgentState, JobStatus, now_iso


def resume_from_rewind_target(state: AgentState) -> AgentState:
    if not (state.next_rewind_target or "").strip():
        return state
    state.status = JobStatus.running
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["resume_from_rewind_target"]
