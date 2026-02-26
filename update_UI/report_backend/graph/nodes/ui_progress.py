from __future__ import annotations

from core.jobs import job_state_key
from core.storage import Storage
from graph.state import AgentState, now_iso


def set_ui_progress(
    state: AgentState,
    *,
    storage: Storage,
    phase: str,
    detail: str = "",
    current_experiment: str = "",
) -> AgentState:
    """
    Why:
      - LangGraphの1ノードが長い場合でも、/jobs/{id}/intermediate のポーリングで
        ユーザーに「いま何をしているか」を段階的に見せたい。
      - snapshot(step=...) は基本的にノード完了時にしか増えないため、
        UI用に "現在の処理" を state に明示して都度永続化する。
    """

    state.job_meta.ui_phase = str(phase or "")
    state.job_meta.ui_detail = str(detail or "")
    state.job_meta.ui_current_experiment = str(current_experiment or "")
    state.job_meta.updated_at = now_iso()

    # Best-effort: 進捗表示のための永続化失敗でジョブ本体を落とさない。
    try:
        storage.put_json(job_state_key(state.job_meta.job_id), state.model_dump())
    except Exception:
        pass
    return state


__all__ = ["set_ui_progress"]

