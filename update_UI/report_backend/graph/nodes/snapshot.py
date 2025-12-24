from __future__ import annotations

from graph.state import AgentState, SnapshotMeta, now_iso
from core.storage import Storage
from core.jobs import job_state_key


def snapshot(state: AgentState, *, storage: Storage, step: str) -> AgentState:
    job_id = state.job_meta.job_id
    ts = now_iso().replace(":", "").replace("-", "")
    key = f"jobs/{job_id}/snapshots/{ts}_{step}.json"
    storage.put_json(key, state.model_dump())
    storage.put_json(job_state_key(job_id), state.model_dump())
    state.snapshots.append(SnapshotMeta(step=step, storage_key=key))
    state.job_meta.updated_at = now_iso()
    return state
