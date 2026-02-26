from __future__ import annotations

import time

from graph.nodes import run_d_to_i_per_experiment as di
from graph.state import AgentState, BLayerBundle, BLayerMethod, ExperimentUnit, JobMeta


def _build_state(exp_keys: list[str]) -> AgentState:
    state = AgentState(job_meta=JobMeta(job_id="job"))
    state.b_layer_bundle = BLayerBundle(
        method=BLayerMethod(
            experiment_units=[
                ExperimentUnit(exp_key=key, title=f"実験{key}", method_text="手順", level=1) for key in exp_keys
            ]
        )
    )
    state.method_tree = [{"exp_key": key, "title": f"実験{key}", "method_summary": "要約"} for key in exp_keys]
    state.pdf.result_number_map = {key: f"5.{idx + 1}" for idx, key in enumerate(exp_keys)}
    return state


def _patch_pipeline_noops(monkeypatch, *, sleep_by_exp_key: dict[str, float]) -> None:
    noop_names = [
        "build_result_hints_from_method",
        "infer_required_outputs",
        "required_outputs_ambiguity_gate",
        "inspect_excel",
        "select_excel_sheet_per_required_outputs",
        "sheet_selection_ambiguity_gate",
        "select_excel_ranges",
        "bind_table_columns_and_units",
        "column_unit_ambiguity_gate",
        "bind_insert_assets",
        "generate_graphs",
        "generate_quant_comments_from_assets",
    ]
    for name in noop_names:
        monkeypatch.setattr(di, name, lambda state, **_: state)

    def _fake_build_experiment_page(state):
        exp_key = str(state.experiments[0].source_idx or "")
        time.sleep(float(sleep_by_exp_key.get(exp_key, 0.0)))
        state.experiments[0].name = f"done:{exp_key}"
        return state

    monkeypatch.setattr(di, "_build_experiment_page_node", _fake_build_experiment_page)
    monkeypatch.setattr(di, "assemble_results_page", lambda state: state)
    monkeypatch.setattr(di, "_write_experiment_payload", lambda **_: None)


def test_run_d_to_i_parallel_is_faster_than_serial(monkeypatch):
    exp_keys = ["4.1", "4.2", "4.3"]
    _patch_pipeline_noops(monkeypatch, sleep_by_exp_key={key: 0.12 for key in exp_keys})

    serial_state = _build_state(exp_keys)
    monkeypatch.setenv("REPORT_AGENT_EXPERIMENT_PARALLELISM", "1")
    t0 = time.perf_counter()
    serial_result = di.run_d_to_i_per_experiment(serial_state, storage=object(), llm=object())
    serial_elapsed = time.perf_counter() - t0

    parallel_state = _build_state(exp_keys)
    monkeypatch.setenv("REPORT_AGENT_EXPERIMENT_PARALLELISM", "3")
    t1 = time.perf_counter()
    parallel_result = di.run_d_to_i_per_experiment(parallel_state, storage=object(), llm=object())
    parallel_elapsed = time.perf_counter() - t1

    assert parallel_elapsed < serial_elapsed * 0.75
    assert [exp.source_idx for exp in parallel_result.experiments] == exp_keys
    assert [exp.name for exp in parallel_result.experiments] == [f"done:{key}" for key in exp_keys]


def test_run_d_to_i_parallel_keeps_input_order(monkeypatch):
    exp_keys = ["4.1", "4.2", "4.3"]
    _patch_pipeline_noops(
        monkeypatch,
        sleep_by_exp_key={
            "4.1": 0.20,
            "4.2": 0.01,
            "4.3": 0.10,
        },
    )
    monkeypatch.setenv("REPORT_AGENT_EXPERIMENT_PARALLELISM", "3")

    result = di.run_d_to_i_per_experiment(_build_state(exp_keys), storage=object(), llm=object())

    assert [exp.source_idx for exp in result.experiments] == exp_keys
    assert [exp.name for exp in result.experiments] == [f"done:{key}" for key in exp_keys]
