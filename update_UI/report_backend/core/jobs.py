from __future__ import annotations

from graph.state import AgentState
from core.storage import Storage


def job_state_key(job_id: str) -> str:
    return f"jobs/{job_id}/state.json"


def load_state(storage: Storage, *, job_id: str) -> AgentState:
    data = storage.get_json(job_state_key(job_id))
    return AgentState.model_validate(data)


def save_state(storage: Storage, state: AgentState) -> None:
    storage.put_json(job_state_key(state.job_meta.job_id), state.model_dump())

