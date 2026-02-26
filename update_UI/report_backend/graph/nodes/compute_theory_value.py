from __future__ import annotations

import ast
import math
import re

from graph.nodes.theory_compare_utils import any_theory_compare_enabled, is_theory_compare_enabled_for_exp
from graph.state import AgentState, ComputationHitl, TheoryValueResult, now_iso


_HITL_CODE = "HITL_THEORY_VALUE_MISSING"

_PARAM_RE = re.compile(r"\b[A-Za-z][A-Za-z0-9_]*\b")

_SYMBOL_SYNONYMS = {
    "R": ["抵抗", "resistance", "ohm"],
    "V": ["電圧", "voltage"],
    "I": ["電流", "current"],
    "C": ["容量", "capacitance"],
    "L": ["インダクタンス", "inductance"],
    "T": ["温度", "temperature"],
    "f": ["周波数", "frequency"],
}

_ALLOWED_FUNCS = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "ln": math.log,
    "exp": math.exp,
    "sqrt": math.sqrt,
}
_ALLOWED_CONSTS = {"pi": math.pi, "e": math.e}

_ALLOWED_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.Constant,
    ast.Name,
    ast.Load,
    ast.Call,
    ast.Pow,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Mod,
)


def _sanitize_expression(expr: str) -> str:
    s = str(expr or "")
    s = s.replace("＝", "=").replace("×", "*").replace("＊", "*").replace("∙", "*").replace("·", "*")
    s = s.replace("−", "-").replace("–", "-").replace("—", "-").replace("÷", "/")
    s = s.replace("^", "**")
    return s.strip()


def _rhs_expression(expr: str) -> str:
    if "=" in expr:
        return expr.split("=", 1)[1].strip()
    return expr.strip()


def _lhs_symbol(expr: str) -> str:
    if "=" not in expr:
        return ""
    lhs = expr.split("=", 1)[0]
    tokens = _PARAM_RE.findall(lhs)
    return tokens[0] if tokens else ""


def _safe_eval(expr: str, values: dict[str, float]) -> float | None:
    try:
        tree = ast.parse(expr, mode="eval")
    except Exception:
        return None
    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            return None
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                return None
            if node.func.id not in _ALLOWED_FUNCS:
                return None
    env = {"__builtins__": {}}
    env.update(_ALLOWED_FUNCS)
    env.update(_ALLOWED_CONSTS)
    env.update(values)
    try:
        out = eval(compile(tree, "<theory_expr>", "eval"), env)
    except Exception:
        return None
    try:
        return float(out)
    except Exception:
        return None


def _unit_from_columns(state: AgentState, *, exp_key: str, symbol: str) -> str:
    if not symbol:
        return ""
    target = symbol.lower()
    synonyms = [s.lower() for s in _SYMBOL_SYNONYMS.get(symbol, [])]
    for binding in state.table_column_bindings:
        if binding.exp_key != exp_key:
            continue
        for col in binding.columns:
            name = (col.name or col.header or "").lower()
            if target and target in name:
                return col.unit or ""
            if any(syn in name for syn in synonyms):
                return col.unit or ""
    return ""


def _build_hitl_payload(targets: list[TheoryValueResult]) -> tuple[str, dict[str, object]]:
    blocks = []
    payload_targets = []
    for idx, item in enumerate(targets):
        blocks.append(
            "<section>"
            f"<h3>Experiment {item.exp_key}</h3>"
            f"<label>Theory value <input type=\"number\" name=\"theory_value_{idx}\" /></label>"
            f"<label>Unit <input type=\"text\" name=\"theory_unit_{idx}\" /></label>"
            "</section>"
        )
        payload_targets.append({"exp_key": item.exp_key, "result_no": item.result_no})
    html = "<form data-hitl=\"theory_value\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": payload_targets}
    return html, payload


def compute_theory_value(state: AgentState) -> AgentState:
    if not any_theory_compare_enabled(state):
        state.theory_value_results = []
        state.computation_hitl = ComputationHitl()
        state.job_meta.updated_at = now_iso()
        return state

    formula = state.pdf.theory_formulas[0] if state.pdf.theory_formulas else None
    if formula is None:
        state.theory_value_results = []
        targets = [
            TheoryValueResult(exp_key=b.exp_key, result_no=b.result_no)
            for b in state.theory_param_bindings
            if is_theory_compare_enabled_for_exp(state, b.exp_key)
        ]
        html, payload = _build_hitl_payload(targets)
        state.computation_hitl = ComputationHitl(
            enabled=True,
            codes=[_HITL_CODE],
            message="Theory formula is missing.",
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()
        return state

    expr_raw = _sanitize_expression(formula.normalized or formula.raw or "")
    rhs = _rhs_expression(expr_raw)
    target_symbol = _lhs_symbol(expr_raw)

    results: list[TheoryValueResult] = []
    missing: list[TheoryValueResult] = []

    for binding in state.theory_param_bindings:
        if not is_theory_compare_enabled_for_exp(state, binding.exp_key):
            continue
        params: dict[str, float] = {}
        missing_params = []
        for symbol in binding.required_params:
            param = next((p for p in binding.params if p.symbol == symbol and p.value is not None), None)
            if param is None:
                missing_params.append(symbol)
                continue
            params[symbol] = float(param.value)
        if missing_params:
            missing.append(
                TheoryValueResult(
                    exp_key=binding.exp_key,
                    result_no=binding.result_no,
                    formula=expr_raw,
                    target_symbol=target_symbol,
                    value=None,
                    unit="",
                    params_used=params,
                    confidence=0.0,
                )
            )
            continue

        value = _safe_eval(rhs, params)
        unit = _unit_from_columns(state, exp_key=binding.exp_key, symbol=target_symbol)
        if value is None:
            missing.append(
                TheoryValueResult(
                    exp_key=binding.exp_key,
                    result_no=binding.result_no,
                    formula=expr_raw,
                    target_symbol=target_symbol,
                    value=None,
                    unit=unit,
                    params_used=params,
                    confidence=0.0,
                )
            )
            continue
        results.append(
            TheoryValueResult(
                exp_key=binding.exp_key,
                result_no=binding.result_no,
                formula=expr_raw,
                target_symbol=target_symbol,
                value=value,
                unit=unit,
                params_used=params,
                confidence=0.8,
            )
        )

    state.theory_value_results = results
    if missing:
        html, payload = _build_hitl_payload(missing)
        state.computation_hitl = ComputationHitl(
            enabled=True,
            codes=[_HITL_CODE],
            message="Theory values could not be computed.",
            html=html,
            payload=payload,
        )
    else:
        state.computation_hitl = ComputationHitl()

    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["compute_theory_value"]
