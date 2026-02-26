from __future__ import annotations

from collections import defaultdict

from graph.nodes.theory_compare_utils import any_theory_compare_enabled
from graph.state import AgentState, TheoryCompareHitl, now_iso


_HITL_CODE = "HITL_THEORY_COMPARE_PER_EXPERIMENT"


def _has_children(state: AgentState, *, idx: str) -> bool:
    return any(exp.idx == idx and exp.subidx for exp in state.experiments)


def _exp_key(exp) -> str:
    return (exp.source_idx or exp.idx or "").strip()


def _collect_formula_map(state: AgentState) -> dict[str, list[str]]:
    formulas_by_exp: dict[str, list[str]] = defaultdict(list)
    for item in state.pdf.theory_formulas_llm:
        formula = str(getattr(item, "formula", "") or "").strip()
        if not formula:
            continue
        for exp_key in getattr(item, "experiments", []) or []:
            key = str(exp_key or "").strip()
            if not key:
                continue
            formulas_by_exp[key].append(formula)
    return dict(formulas_by_exp)


def _build_hitl_payload(rows: list[dict[str, object]]) -> tuple[str, dict[str, object]]:
    blocks = []
    for idx, row in enumerate(rows):
        exp_key = row["exp_key"]
        title = row["title"]
        tables = row["tables"]
        graphs = row["graphs"]
        formulas = row["formulas"]
        default = row["default_compare"]
        checked_true = " checked" if default else ""
        checked_false = "" if default else " checked"
        formula_text = "; ".join([f for f in formulas if f])
        summary = f"tables={tables} graphs={graphs}"
        if formula_text:
            summary = f"{summary} / theory: {formula_text}"
        blocks.append(
            "<section>"
            f"<h3>Experiment {exp_key} {title}</h3>"
            f"<p>{summary}</p>"
            f"<label><input type=\"radio\" name=\"compare_{idx}\" value=\"true\"{checked_true} />比較する</label>"
            f"<label><input type=\"radio\" name=\"compare_{idx}\" value=\"false\"{checked_false} />比較しない</label>"
            "</section>"
        )
    html = "<form data-hitl=\"theory_compare_hitl\">" + "\n".join(blocks) + "</form>"
    payload = {"experiments": rows}
    return html, payload


def decide_theory_compare_hitl(state: AgentState) -> AgentState:
    formulas_by_exp = _collect_formula_map(state)
    rows: list[dict[str, object]] = []
    decisions = dict(state.theory_compare_by_experiment or {})
    for exp in state.experiments:
        if not exp.subidx and _has_children(state, idx=exp.idx):
            continue
        exp_key = _exp_key(exp)
        if not exp_key:
            continue
        binding = next((b for b in state.insert_asset_bindings if b.exp_key == exp_key), None)
        tables = len(binding.tables_asset_ids) if binding else 0
        graphs = len(binding.graphs_asset_ids) if binding else 0
        formulas = list(formulas_by_exp.get(exp_key, []))
        if exp_key in decisions:
            default_compare = bool(decisions[exp_key])
        else:
            default_compare = bool(formulas)
            decisions[exp_key] = default_compare
        rows.append(
            {
                "exp_key": exp_key,
                "title": exp.name,
                "result_no": str(state.pdf.result_number_map.get(exp_key, "") or ""),
                "tables": tables,
                "graphs": graphs,
                "formulas": formulas,
                "default_compare": default_compare,
            }
        )

    if not rows:
        state.theory_compare_by_experiment = {}
        state.theory_compare_enabled = False
        state.theory_compare_hitl = TheoryCompareHitl()
        state.job_meta.updated_at = now_iso()
        return state

    state.theory_compare_by_experiment = decisions
    state.theory_compare_enabled = any_theory_compare_enabled(state)

    if state.theory_compare_decided:
        state.theory_compare_hitl = TheoryCompareHitl()
        state.job_meta.updated_at = now_iso()
        return state

    html, payload = _build_hitl_payload(rows)
    state.theory_compare_hitl = TheoryCompareHitl(
        enabled=True,
        code=_HITL_CODE,
        message="実験ごとに理論比較を行うか選択してください。",
        html=html,
        payload=payload,
    )
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["decide_theory_compare_hitl"]
