from __future__ import annotations

from graph.state import AgentState, JobStatus, now_iso
from core.storage import Storage
from llm.client import LLMClient


def ingest(state: AgentState, *, storage: Storage, llm: LLMClient) -> AgentState:
    # No-op for now: job creation happens in the API layer.
    state.status = JobStatus.running
    state.job_meta.text_model = llm.text_model
    state.job_meta.vision_model = llm.vision_model
    state.job_meta.updated_at = now_iso()
    return state

