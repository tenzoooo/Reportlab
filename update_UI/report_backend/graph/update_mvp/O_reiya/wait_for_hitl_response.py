from __future__ import annotations

from graph.state import AgentState, JobStatus, now_iso


def wait_for_hitl_response(state: AgentState) -> AgentState:
    if state.hitl_active is None:
        return state
    state.status = JobStatus.waiting_hitl
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["wait_for_hitl_response"]
