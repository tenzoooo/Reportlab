from __future__ import annotations

from graph.nodes.theory_compare_utils import any_theory_compare_enabled, is_theory_compare_enabled_for_exp
from graph.state import AgentState, TheoryParamBinding, TheoryParamHitl, now_iso


_UNIT_OPTIONS = ["1", "V", "mV", "A", "mA", "ohm", "s", "ms", "Hz", "kHz", "C", "K", "%"]


def _build_html_payload(bindings: list[TheoryParamBinding]) -> tuple[str, dict[str, object]]:
    blocks = []
    payload_targets = []
    for exp_idx, binding in enumerate(bindings):
        rows = []
        params = binding.missing_params or []
        for param_idx, symbol in enumerate(params):
            unit_opts = []
            for unit in _UNIT_OPTIONS:
                unit_opts.append(f"<option value=\"{unit}\">{unit}</option>")
            rows.append(
                "<div>"
                f"<label>{symbol} value <input type=\"number\" name=\"param_value_{exp_idx}_{param_idx}\" /></label> "
                f"<select name=\"param_unit_{exp_idx}_{param_idx}\">{''.join(unit_opts)}</select> "
                f"<input type=\"text\" name=\"source_hint_{exp_idx}_{param_idx}\" placeholder=\"source hint (optional)\" />"
                "</div>"
            )
        blocks.append(
            "<section>"
            f"<h3>Experiment {binding.result_no or binding.exp_key}</h3>"
            f"{''.join(rows)}"
            "</section>"
        )
        payload_targets.append(
            {
                "exp_key": binding.exp_key,
                "result_no": binding.result_no,
                "missing_params": params,
            }
        )

    html = "<form data-hitl=\"theory_param_binding\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": payload_targets, "unit_options": _UNIT_OPTIONS}
    return html, payload


def param_binding_gate(state: AgentState) -> AgentState:
    state.theory_param_hitl = TheoryParamHitl()
    if not any_theory_compare_enabled(state):
        state.job_meta.updated_at = now_iso()
        return state
    bindings = list(state.theory_param_bindings)
    if not bindings:
        html, payload = _build_html_payload([])
        state.theory_param_hitl = TheoryParamHitl(
            enabled=True,
            code="HITL_THEORY_SUBSTITUTION_MISSING",
            message="Theory parameter bindings are missing.",
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()
        return state

    targets = [b for b in bindings if b.missing_params and is_theory_compare_enabled_for_exp(state, b.exp_key)]
    if targets:
        html, payload = _build_html_payload(targets)
        state.theory_param_hitl = TheoryParamHitl(
            enabled=True,
            code="HITL_THEORY_SUBSTITUTION_MISSING",
            message="Provide missing theory substitution parameters.",
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()
    return state
