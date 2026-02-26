from __future__ import annotations

import json
from pathlib import Path

from graph.nodes.extract_theory_formulas_llm import extract_theory_formulas_llm
from graph.state import AgentState, PdfMethodUnit
from llm.schemas.theory_formula_extract import TheoryFormulaExtractOutput, TheoryFormulaItem


class _MockLLM:
    def extract_theory_formulas(self, *, pdf_text: str, experiments: list[str], chunk_index: int, chunk_count: int):
        return TheoryFormulaExtractOutput(
            items=[
                TheoryFormulaItem(
                    formula="V = IR",
                    context="電圧と電流の関係を示す。",
                    experiments=["4.2.1 反転増幅回路"],
                )
            ]
        )


def _find_repo_root(start: Path) -> Path:
    candidates = [start, *start.parents]
    for base in candidates:
        if (base / "tmp_state_outputs" / "a_layer_after_all_steps.json").exists():
            return base
    raise FileNotFoundError("repo root with tmp_state_outputs/a_layer_after_all_steps.json not found")


def _load_state_from_json() -> AgentState:
    repo_root = _find_repo_root(Path(__file__).resolve())
    json_path = repo_root / "tmp_state_outputs" / "a_layer_after_all_steps.json"
    data = json.loads(json_path.read_text(encoding="utf-8"))
    return AgentState.model_validate(data)


def test_b_layer_extract_theory_formulas_llm_writes_json(tmp_path) -> None:
    state = _load_state_from_json()
    state.pdf.text = "オームの法則: V = IR を用いる。"
    state.pdf.method_units = [
        PdfMethodUnit(exp_key="4.2.1", title="反転増幅回路", level=2, text=""),
    ]

    output_path = tmp_path / "method_only.json"
    state = extract_theory_formulas_llm(state, llm=_MockLLM(), storage=None, output_path=output_path)

    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert "theory_formulas" in payload
    assert payload["theory_formulas"][0]["formula"] == "V = IR"
    assert state.pdf.theory_formulas_llm
