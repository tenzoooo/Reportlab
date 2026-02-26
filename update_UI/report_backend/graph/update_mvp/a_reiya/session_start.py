from __future__ import annotations

import uuid

from graph.state import AgentState, JobStatus, now_iso


def session_start(state: AgentState) -> AgentState:
    state.status = JobStatus.running
    # Keep job_id stable for web runs; only update run_id per execution.
    state.job_meta.run_id = uuid.uuid4().hex
    state.job_meta.updated_at = now_iso()
    return state
