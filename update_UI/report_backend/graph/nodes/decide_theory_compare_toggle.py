from __future__ import annotations

from graph.state import AgentState, TheoryCompareHitl, now_iso


_HITL_CODE = "HITL_THEORY_COMPARE_TOGGLE"


def _build_hitl_payload(enabled: bool) -> tuple[str, dict[str, object]]:
    checked_on = " checked" if enabled else ""
    checked_off = "" if enabled else " checked"
    html = (
        "<form data-hitl=\"theory_compare_toggle\">"
        "<section>"
        "<h3>Theory Compare</h3>"
        "<label><input type=\"radio\" name=\"theory_compare_enabled\" value=\"true\""
        f"{checked_on} />ON</label>"
        "<label><input type=\"radio\" name=\"theory_compare_enabled\" value=\"false\""
        f"{checked_off} />OFF</label>"
        "</section>"
        "</form>"
    )
    payload = {"selected": {"theory_compare_enabled": bool(enabled)}}
    return html, payload


def decide_theory_compare_toggle(state: AgentState) -> AgentState:
    if state.theory_compare_decided:
        state.theory_compare_hitl = TheoryCompareHitl()
        state.job_meta.updated_at = now_iso()
        return state

    if state.theory_compare_enabled is False:
        state.theory_compare_decided = True
        state.theory_compare_hitl = TheoryCompareHitl()
        state.job_meta.updated_at = now_iso()
        return state

    state.theory_compare_enabled = True
    html, payload = _build_hitl_payload(state.theory_compare_enabled)
    state.theory_compare_hitl = TheoryCompareHitl(
        enabled=True,
        code=_HITL_CODE,
        message="Select whether to enable theory comparison.",
        html=html,
        payload=payload,
    )
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["decide_theory_compare_toggle"]
