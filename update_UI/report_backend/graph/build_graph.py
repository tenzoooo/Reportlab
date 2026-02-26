from __future__ import annotations

from langgraph.graph import END, StateGraph

from core.storage import Storage
from graph.state import AgentState, JobStatus, now_iso
from graph.tracing import summarize_state_for_trace, traceable_if_enabled
from llm.client import LLMClient

from .update_mvp.a_reiya.ingest import ingest
from .update_mvp.a_reiya.session_start import session_start
from .update_mvp_flow.build_graph_update_mvp_flow import build_graph_update_mvp
from .nodes.pdf_parse import pdf_parse
from .nodes.clean_heading_positions import clean_heading_positions
from .nodes.parse_manual_structure import parse_manual_structure
from .nodes.extract_method_numbers import extract_method_numbers
from .nodes.map_result_numbers import map_result_numbers
from .nodes.extract_theory_candidates import extract_theory_candidates
from .nodes.normalize_ommlify_formula import normalize_and_ommlify_formula
from .nodes.past_report_hints import past_report_hints
from .nodes_legacy.method_extract import method_extract
from .nodes.infer_required_outputs import infer_required_outputs
from .nodes.required_outputs_ambiguity_gate import required_outputs_ambiguity_gate
from .nodes.inspect_excel import inspect_excel
from .nodes.select_excel_ranges import select_excel_ranges
from .nodes.select_excel_sheet_per_experiment import (
    select_excel_sheet_per_experiment,
    select_excel_sheet_per_required_outputs,
)
from .nodes.sheet_selection_ambiguity_gate import sheet_selection_ambiguity_gate
from .nodes.bind_table_columns_and_units import bind_table_columns_and_units
from .nodes.column_unit_ambiguity_gate import column_unit_ambiguity_gate
from .nodes.bind_theory_substitution_params import bind_theory_substitution_params
from .nodes.param_binding_gate import param_binding_gate
from .nodes.bind_insert_assets import bind_insert_assets
from .nodes.generate_graphs import generate_graphs
from .nodes.resolve_axes_and_units import resolve_axes_and_units
from .nodes.decide_theory_compare_hitl import decide_theory_compare_hitl
from .nodes.compute_theory_value import compute_theory_value
from .nodes.compute_delta_and_abs_error import compute_delta_and_abs_error
from .nodes.compute_slope_and_extreme import compute_slope_and_extreme
from .nodes.summarize_method_to_overview import summarize_method_to_overview
from .nodes_legacy.generate_result_description import generate_result_description
from .nodes_legacy.generate_captions import generate_captions
from .nodes_legacy.generate_quant_comment_text import generate_quant_comment_text
from .nodes.assemble_experiment_result_group import assemble_experiment_result_group
from .nodes.assemble_results_page import assemble_results_page
from .nodes_legacy.build_discussion_page import build_discussion_page
from .nodes_legacy.build_summary_page import build_summary_page
from .nodes.build_references_page import build_references_page
from .nodes.unit_init import unit_init
from .update_mvp.a_reiya.normalize_inputs import normalize_inputs
from .update_mvp.a_reiya.classify_assets import classify_assets
from .nodes_legacy.validate import validate
from .nodes.render_docx_markdown import render_docx_markdown
from .nodes_legacy.render_markdown import render_markdown
from .nodes_legacy.review_markdown import review_markdown_node
from .nodes.snapshot import snapshot
from .nodes.excel_mvp import excel_mvp
from .nodes_legacy.quant_comment_mvp import quant_comment_mvp


def build_graph(*, storage: Storage, llm: LLMClient, template_path: str, mode: str = "update_mvp"):
    """
    Build and compile the LangGraph workflow.
    """

    resolved_mode = (mode or "update_mvp").strip().lower()
    if resolved_mode in {"mvp", "update_mvp"}:
        # update_mvp workflow (A-N) for docx output.
        return build_graph_update_mvp(storage=storage, llm=llm)

    mode_tag = f"mode:{resolved_mode or 'legacy'}"

    def _state_inputs(inputs: dict) -> dict:
        return {"state": summarize_state_for_trace(inputs.get("state"))}

    def _state_outputs(state: AgentState) -> dict:
        return summarize_state_for_trace(state)

    def _named_node(*, key: str, label: str, fn):
        tags = ["workflow:report_agent", mode_tag, f"node:{key}"]

        @traceable_if_enabled(
            name=label,
            run_type="chain",
            tags=tags,
            process_inputs=_state_inputs,
            process_outputs=_state_outputs,
        )
        def _run(state: AgentState) -> AgentState:
            return fn(state)

        return _run

    graph = StateGraph(AgentState)

    graph.add_node(
        "session_start",
        _named_node(
            key="session_start",
            label="A0 START / セッション開始",
            fn=lambda s: session_start(s),
        ),
    )
    graph.add_node("snapshot_session_start", lambda s: snapshot(s, storage=storage, step="session_start"))

    graph.add_node(
        "ingest",
        _named_node(
            key="ingest",
            label="A1 Ingest / ファイル受領",
            fn=lambda s: ingest(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_ingest", lambda s: snapshot(s, storage=storage, step="ingest"))

    graph.add_node(
        "normalize_inputs",
        _named_node(
            key="normalize_inputs",
            label="A2 入力正規化",
            fn=lambda s: normalize_inputs(s, storage=storage),
        ),
    )
    graph.add_node("snapshot_normalize_inputs", lambda s: snapshot(s, storage=storage, step="normalize_inputs"))

    graph.add_node(
        "classify_assets",
        _named_node(
            key="classify_assets",
            label="A3 画像粗分類",
            fn=lambda s: classify_assets(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_classify_assets", lambda s: snapshot(s, storage=storage, step="classify_assets"))

    graph.add_node(
        "pdf_parse",
        _named_node(
            key="pdf_parse",
            label="02 PDF解析 / テキスト抽出",
            fn=lambda s: pdf_parse(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_pdf_parse", lambda s: snapshot(s, storage=storage, step="pdf_parse"))

    graph.add_node(
        "clean_heading_positions",
        _named_node(
            key="clean_heading_positions",
            label="B5.5 見出し浄化",
            fn=lambda s: clean_heading_positions(s, llm=llm, storage=storage),
        ),
    )
    graph.add_node(
        "snapshot_clean_heading_positions",
        lambda s: snapshot(s, storage=storage, step="clean_heading_positions"),
    )

    graph.add_node(
        "parse_manual_structure",
        _named_node(
            key="parse_manual_structure",
            label="B6 章構造解析",
            fn=lambda s: parse_manual_structure(s),
        ),
    )
    graph.add_node(
        "snapshot_parse_manual_structure",
        lambda s: snapshot(s, storage=storage, step="parse_manual_structure"),
    )
    graph.add_node(
        "extract_method_numbers",
        _named_node(
            key="extract_method_numbers",
            label="B7 実験番号抽出",
            fn=lambda s: extract_method_numbers(s),
        ),
    )
    graph.add_node(
        "snapshot_extract_method_numbers",
        lambda s: snapshot(s, storage=storage, step="extract_method_numbers"),
    )
    graph.add_node(
        "map_result_numbers",
        _named_node(
            key="map_result_numbers",
            label="B8 結果番号写像",
            fn=lambda s: map_result_numbers(s),
        ),
    )
    graph.add_node(
        "snapshot_map_result_numbers",
        lambda s: snapshot(s, storage=storage, step="map_result_numbers"),
    )
    graph.add_node(
        "extract_theory_candidates",
        _named_node(
            key="extract_theory_candidates",
            label="B10 理論式候補抽出",
            fn=lambda s: extract_theory_candidates(s, storage=storage),
        ),
    )
    graph.add_node(
        "snapshot_extract_theory_candidates",
        lambda s: snapshot(s, storage=storage, step="extract_theory_candidates"),
    )
    graph.add_node(
        "normalize_ommlify_formula",
        _named_node(
            key="normalize_ommlify_formula",
            label="B11 理論式整形/OMML化",
            fn=lambda s: normalize_and_ommlify_formula(s),
        ),
    )
    graph.add_node(
        "snapshot_normalize_ommlify_formula",
        lambda s: snapshot(s, storage=storage, step="normalize_ommlify_formula"),
    )

    graph.add_node(
        "past_report_hints",
        _named_node(
            key="past_report_hints",
            label="C12 過去レポート構造ヒント抽出",
            fn=lambda s: past_report_hints(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_past_report_hints", lambda s: snapshot(s, storage=storage, step="past_report_hints"))

    graph.add_node(
        "method_extract",
        _named_node(
            key="method_extract",
            label="05 実験ユニット抽出（LLM）",
            fn=lambda s: method_extract(s, llm=llm),
        ),
    )
    graph.add_node("snapshot_method_extract", lambda s: snapshot(s, storage=storage, step="method_extract"))

    graph.add_node(
        "infer_required_outputs",
        _named_node(
            key="infer_required_outputs",
            label="D13 Required Outputs推定",
            fn=lambda s: infer_required_outputs(s, llm=llm),
        ),
    )
    graph.add_node(
        "snapshot_infer_required_outputs",
        lambda s: snapshot(s, storage=storage, step="infer_required_outputs"),
    )
    graph.add_node(
        "required_outputs_gate",
        _named_node(
            key="required_outputs_gate",
            label="D14 Required Outputs曖昧性ゲート",
            fn=lambda s: required_outputs_ambiguity_gate(s),
        ),
    )
    graph.add_node(
        "snapshot_required_outputs_gate",
        lambda s: snapshot(s, storage=storage, step="required_outputs_gate"),
    )

    graph.add_node(
        "inspect_excel",
        _named_node(
            key="inspect_excel",
            label="E15 Excel探索",
            fn=lambda s: inspect_excel(s, storage=storage),
        ),
    )
    graph.add_node(
        "select_excel_ranges",
        _named_node(
            key="select_excel_ranges",
            label="E15.5 Excel範囲選択",
            fn=lambda s: select_excel_ranges(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_select_excel_ranges", lambda s: snapshot(s, storage=storage, step="select_excel_ranges"))
    graph.add_node("snapshot_inspect_excel", lambda s: snapshot(s, storage=storage, step="inspect_excel"))
    graph.add_node(
        "select_excel_sheet",
        _named_node(
            key="select_excel_sheet",
            label="E16 実験ごとのシート選択",
            fn=lambda s: select_excel_sheet_per_required_outputs(s, llm=llm),
        ),
    )
    graph.add_node(
        "snapshot_select_excel_sheet",
        lambda s: snapshot(s, storage=storage, step="select_excel_sheet"),
    )
    graph.add_node(
        "sheet_selection_gate",
        _named_node(
            key="sheet_selection_gate",
            label="E17 シート選択ゲート",
            fn=lambda s: sheet_selection_ambiguity_gate(s),
        ),
    )
    graph.add_node(
        "snapshot_sheet_selection_gate",
        lambda s: snapshot(s, storage=storage, step="sheet_selection_gate"),
    )
    graph.add_node(
        "bind_table_columns",
        _named_node(
            key="bind_table_columns",
            label="E18 表列/単位バインド",
            fn=lambda s: bind_table_columns_and_units(s, llm=llm),
        ),
    )
    graph.add_node(
        "snapshot_bind_table_columns",
        lambda s: snapshot(s, storage=storage, step="bind_table_columns"),
    )
    graph.add_node(
        "column_unit_gate",
        _named_node(
            key="column_unit_gate",
            label="E19 列/単位ゲート",
            fn=lambda s: column_unit_ambiguity_gate(s),
        ),
    )
    graph.add_node(
        "snapshot_column_unit_gate",
        lambda s: snapshot(s, storage=storage, step="column_unit_gate"),
    )
    graph.add_node(
        "bind_theory_params",
        _named_node(
            key="bind_theory_params",
            label="E20 理論パラメータ抽出",
            fn=lambda s: bind_theory_substitution_params(s, llm=llm),
        ),
    )
    graph.add_node(
        "snapshot_bind_theory_params",
        lambda s: snapshot(s, storage=storage, step="bind_theory_params"),
    )
    graph.add_node(
        "param_binding_gate",
        _named_node(
            key="param_binding_gate",
            label="E21 理論パラメータゲート",
            fn=lambda s: param_binding_gate(s),
        ),
    )
    graph.add_node(
        "snapshot_param_binding_gate",
        lambda s: snapshot(s, storage=storage, step="param_binding_gate"),
    )
    graph.add_node(
        "bind_insert_assets",
        _named_node(
            key="bind_insert_assets",
            label="F19 挿入対象紐付け",
            fn=lambda s: bind_insert_assets(s, storage=storage),
        ),
    )
    graph.add_node(
        "snapshot_bind_insert_assets",
        lambda s: snapshot(s, storage=storage, step="bind_insert_assets"),
    )
    graph.add_node(
        "generate_graphs",
        _named_node(
            key="generate_graphs",
            label="F20 グラフ生成",
            fn=lambda s: generate_graphs(s, storage=storage),
        ),
    )
    graph.add_node(
        "snapshot_generate_graphs",
        lambda s: snapshot(s, storage=storage, step="generate_graphs"),
    )
    graph.add_node(
        "resolve_axes",
        _named_node(
            key="resolve_axes",
            label="F21 軸ラベル/単位確定",
            fn=lambda s: resolve_axes_and_units(s, llm=llm),
        ),
    )
    graph.add_node(
        "snapshot_resolve_axes",
        lambda s: snapshot(s, storage=storage, step="resolve_axes"),
    )

    graph.add_node(
        "decide_theory_compare_hitl",
        _named_node(
            key="decide_theory_compare_hitl",
            label="G22 理論比較(実験別)決定",
            fn=lambda s: decide_theory_compare_hitl(s),
        ),
    )
    graph.add_node(
        "snapshot_decide_theory_compare_hitl",
        lambda s: snapshot(s, storage=storage, step="decide_theory_compare_hitl"),
    )

    graph.add_node(
        "compute_theory_value",
        _named_node(
            key="compute_theory_value",
            label="H23 理論値算出",
            fn=lambda s: compute_theory_value(s),
        ),
    )
    graph.add_node(
        "snapshot_compute_theory_value",
        lambda s: snapshot(s, storage=storage, step="compute_theory_value"),
    )
    graph.add_node(
        "compute_delta_and_abs_error",
        _named_node(
            key="compute_delta_and_abs_error",
            label="H24 Δ/絶対誤差算出",
            fn=lambda s: compute_delta_and_abs_error(s),
        ),
    )
    graph.add_node(
        "snapshot_compute_delta_and_abs_error",
        lambda s: snapshot(s, storage=storage, step="compute_delta_and_abs_error"),
    )
    graph.add_node(
        "compute_slope_and_extreme",
        _named_node(
            key="compute_slope_and_extreme",
            label="H25 傾き/最大最小算出",
            fn=lambda s: compute_slope_and_extreme(s),
        ),
    )
    graph.add_node(
        "snapshot_compute_slope_and_extreme",
        lambda s: snapshot(s, storage=storage, step="compute_slope_and_extreme"),
    )

    graph.add_node(
        "summarize_method_to_overview_1",
        _named_node(
            key="summarize_method_to_overview_1",
            label="I26 方法要約（1st）",
            fn=lambda s: summarize_method_to_overview(s),
        ),
    )
    graph.add_node(
        "generate_result_description_1",
        _named_node(
            key="generate_result_description_1",
            label="I27 結果説明（1st）",
            fn=lambda s: generate_result_description(s),
        ),
    )
    graph.add_node(
        "generate_captions_1",
        _named_node(
            key="generate_captions_1",
            label="I28 キャプション（1st）",
            fn=lambda s: generate_captions(s),
        ),
    )
    graph.add_node(
        "generate_quant_comment_text_1",
        _named_node(
            key="generate_quant_comment_text_1",
            label="I29 定量コメント（1st）",
            fn=lambda s: generate_quant_comment_text(s),
        ),
    )

    graph.add_node(
        "summarize_method_to_overview_2",
        _named_node(
            key="summarize_method_to_overview_2",
            label="I26 方法要約（2nd）",
            fn=lambda s: summarize_method_to_overview(s),
        ),
    )
    graph.add_node(
        "generate_result_description_2",
        _named_node(
            key="generate_result_description_2",
            label="I27 結果説明（2nd）",
            fn=lambda s: generate_result_description(s),
        ),
    )
    graph.add_node(
        "generate_captions_2",
        _named_node(
            key="generate_captions_2",
            label="I28 キャプション（2nd）",
            fn=lambda s: generate_captions(s),
        ),
    )
    graph.add_node(
        "generate_quant_comment_text_2",
        _named_node(
            key="generate_quant_comment_text_2",
            label="I29 定量コメント（2nd）",
            fn=lambda s: generate_quant_comment_text(s),
        ),
    )
    graph.add_node(
        "assemble_experiment_result_group",
        _named_node(
            key="assemble_experiment_result_group",
            label="J30 実験結果グループ組立",
            fn=lambda s: assemble_experiment_result_group(s),
        ),
    )
    graph.add_node(
        "snapshot_assemble_experiment_result_group",
        lambda s: snapshot(s, storage=storage, step="assemble_experiment_result_group"),
    )
    graph.add_node(
        "assemble_results_page",
        _named_node(
            key="assemble_results_page",
            label="J31 実験結果ページ組立",
            fn=lambda s: assemble_results_page(s),
        ),
    )
    graph.add_node(
        "snapshot_assemble_results_page",
        lambda s: snapshot(s, storage=storage, step="assemble_results_page"),
    )
    graph.add_node(
        "build_discussion_page",
        _named_node(
            key="build_discussion_page",
            label="K32 考察ページ作成",
            fn=lambda s: build_discussion_page(s, llm=llm),
        ),
    )
    graph.add_node(
        "snapshot_build_discussion_page",
        lambda s: snapshot(s, storage=storage, step="build_discussion_page"),
    )
    graph.add_node(
        "build_summary_page",
        _named_node(
            key="build_summary_page",
            label="K33 まとめページ作成",
            fn=lambda s: build_summary_page(s, llm=llm),
        ),
    )
    graph.add_node(
        "snapshot_build_summary_page",
        lambda s: snapshot(s, storage=storage, step="build_summary_page"),
    )
    graph.add_node(
        "build_references_page",
        _named_node(
            key="build_references_page",
            label="K34 参考文献ページ作成",
            fn=lambda s: build_references_page(s),
        ),
    )
    graph.add_node(
        "snapshot_build_references_page",
        lambda s: snapshot(s, storage=storage, step="build_references_page"),
    )

    graph.add_node(
        "unit_init",
        _named_node(
            key="unit_init",
            label="06 実験ユニット生成",
            fn=lambda s: unit_init(s),
        ),
    )
    graph.add_node("snapshot_unit_init", lambda s: snapshot(s, storage=storage, step="unit_init"))

    graph.add_node(
        "excel_mvp",
        _named_node(
            key="excel_mvp",
            label="07 Excel→表抽出→グラフ生成（MVP）",
            fn=lambda s: excel_mvp(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_excel_mvp", lambda s: snapshot(s, storage=storage, step="excel_mvp"))

    graph.add_node(
        "validate",
        _named_node(
            key="validate",
            label="14 検証 / テンプレ文脈生成",
            fn=lambda s: validate(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_validate", lambda s: snapshot(s, storage=storage, step="validate"))

    def _halt_mvp(state: AgentState) -> AgentState:
        state.status = JobStatus.partial
        state.job_meta.updated_at = now_iso()
        return state

    graph.add_node(
        "halt_mvp",
        _named_node(
            key="halt_mvp",
            label="15 HITL待ち（MVP）",
            fn=_halt_mvp,
        ),
    )

    graph.add_node(
        "quant_comment_mvp",
        _named_node(
            key="quant_comment_mvp",
            label="16.5 定量コメント生成（MVP）",
            fn=lambda s: quant_comment_mvp(s, llm=llm, storage=storage),
        ),
    )
    graph.add_node(
        "snapshot_quant_comment_mvp", lambda s: snapshot(s, storage=storage, step="quant_comment_mvp")
    )
    graph.add_node(
        "render_markdown",
        _named_node(
            key="render_markdown",
            label="16 Markdown生成（MVP）",
            fn=lambda s: render_markdown(s, storage=storage),
        ),
    )
    graph.add_node("snapshot_render_markdown", lambda s: snapshot(s, storage=storage, step="render_markdown"))
    graph.add_node(
        "review_markdown",
        _named_node(
            key="review_markdown",
            label="17 レビュー/修正（Markdown）",
            fn=lambda s: review_markdown_node(s, storage=storage),
        ),
    )
    graph.add_node("snapshot_review_markdown", lambda s: snapshot(s, storage=storage, step="review_markdown"))
    graph.add_node(
        "render_docx_markdown",
        _named_node(
            key="render_docx_markdown",
            label="18 DOCX生成（Markdown）",
            fn=lambda s: render_docx_markdown(s, storage=storage),
        ),
    )
    graph.add_node("snapshot_render_docx", lambda s: snapshot(s, storage=storage, step="render_docx"))

    graph.set_entry_point("session_start")

    graph.add_edge("session_start", "snapshot_session_start")
    graph.add_edge("snapshot_session_start", "ingest")
    graph.add_edge("ingest", "snapshot_ingest")
    graph.add_edge("snapshot_ingest", "normalize_inputs")
    graph.add_edge("normalize_inputs", "snapshot_normalize_inputs")
    graph.add_edge("snapshot_normalize_inputs", "classify_assets")
    graph.add_edge("classify_assets", "snapshot_classify_assets")
    graph.add_edge("snapshot_classify_assets", "pdf_parse")
    graph.add_edge("pdf_parse", "snapshot_pdf_parse")
    graph.add_edge("snapshot_pdf_parse", "clean_heading_positions")
    graph.add_edge("clean_heading_positions", "snapshot_clean_heading_positions")
    graph.add_edge("snapshot_clean_heading_positions", "parse_manual_structure")
    graph.add_edge("parse_manual_structure", "snapshot_parse_manual_structure")
    graph.add_edge("snapshot_parse_manual_structure", "extract_method_numbers")
    graph.add_edge("extract_method_numbers", "snapshot_extract_method_numbers")
    graph.add_edge("snapshot_extract_method_numbers", "map_result_numbers")
    graph.add_edge("map_result_numbers", "snapshot_map_result_numbers")
    graph.add_edge("snapshot_map_result_numbers", "extract_theory_candidates")
    graph.add_edge("extract_theory_candidates", "snapshot_extract_theory_candidates")
    graph.add_edge("snapshot_extract_theory_candidates", "normalize_ommlify_formula")
    graph.add_edge("normalize_ommlify_formula", "snapshot_normalize_ommlify_formula")
    graph.add_edge("snapshot_normalize_ommlify_formula", "past_report_hints")
    graph.add_edge("past_report_hints", "snapshot_past_report_hints")
    graph.add_edge("snapshot_past_report_hints", "method_extract")
    graph.add_edge("method_extract", "snapshot_method_extract")
    graph.add_edge("snapshot_method_extract", "infer_required_outputs")
    graph.add_edge("infer_required_outputs", "snapshot_infer_required_outputs")
    graph.add_edge("snapshot_infer_required_outputs", "required_outputs_gate")
    graph.add_edge("required_outputs_gate", "snapshot_required_outputs_gate")

    def _route_after_required_outputs(state: AgentState) -> str:
        if state.required_outputs_hitl.enabled:
            return "halt_mvp"
        return "inspect_excel"

    graph.add_conditional_edges(
        "snapshot_required_outputs_gate",
        _route_after_required_outputs,
        {"halt_mvp": "halt_mvp", "inspect_excel": "inspect_excel"},
    )
    graph.add_edge("inspect_excel", "snapshot_inspect_excel")
    graph.add_edge("snapshot_inspect_excel", "select_excel_sheet")
    graph.add_edge("select_excel_sheet", "snapshot_select_excel_sheet")
    graph.add_edge("snapshot_select_excel_sheet", "sheet_selection_gate")
    graph.add_edge("sheet_selection_gate", "snapshot_sheet_selection_gate")

    def _route_after_sheet_gate(state: AgentState) -> str:
        if state.excel_sheet_hitl.enabled:
            return "halt_mvp"
        return "select_excel_ranges"

    graph.add_conditional_edges(
        "snapshot_sheet_selection_gate",
        _route_after_sheet_gate,
        {"halt_mvp": "halt_mvp", "select_excel_ranges": "select_excel_ranges"},
    )
    graph.add_edge("select_excel_ranges", "snapshot_select_excel_ranges")
    graph.add_edge("snapshot_select_excel_ranges", "bind_table_columns")
    graph.add_edge("bind_table_columns", "snapshot_bind_table_columns")
    graph.add_edge("snapshot_bind_table_columns", "column_unit_gate")
    graph.add_edge("column_unit_gate", "snapshot_column_unit_gate")

    def _route_after_column_gate(state: AgentState) -> str:
        if state.column_unit_hitl.enabled:
            return "halt_mvp"
        return "bind_theory_params"

    graph.add_conditional_edges(
        "snapshot_column_unit_gate",
        _route_after_column_gate,
        {"halt_mvp": "halt_mvp", "bind_theory_params": "bind_theory_params"},
    )
    graph.add_edge("bind_theory_params", "snapshot_bind_theory_params")
    graph.add_edge("snapshot_bind_theory_params", "param_binding_gate")
    graph.add_edge("param_binding_gate", "snapshot_param_binding_gate")

    def _route_after_param_gate(state: AgentState) -> str:
        if state.theory_param_hitl.enabled:
            return "halt_mvp"
        return "bind_insert_assets"

    graph.add_conditional_edges(
        "snapshot_param_binding_gate",
        _route_after_param_gate,
        {"halt_mvp": "halt_mvp", "bind_insert_assets": "bind_insert_assets"},
    )
    graph.add_edge("bind_insert_assets", "snapshot_bind_insert_assets")
    graph.add_edge("snapshot_bind_insert_assets", "generate_graphs")
    graph.add_edge("generate_graphs", "snapshot_generate_graphs")
    graph.add_edge("snapshot_generate_graphs", "resolve_axes")
    graph.add_edge("resolve_axes", "snapshot_resolve_axes")

    def _route_after_resolve_axes(state: AgentState) -> str:
        if state.insert_asset_hitl.enabled or state.axis_hitl.enabled:
            return "halt_mvp"
        return "decide_theory_compare_hitl"

    graph.add_conditional_edges(
        "snapshot_resolve_axes",
        _route_after_resolve_axes,
        {"halt_mvp": "halt_mvp", "decide_theory_compare_hitl": "decide_theory_compare_hitl"},
    )

    graph.add_edge("decide_theory_compare_hitl", "snapshot_decide_theory_compare_hitl")

    def _route_after_theory_compare_hitl(state: AgentState) -> str:
        if state.theory_compare_hitl.enabled:
            return "halt_mvp"
        return "compute_theory_value"

    graph.add_conditional_edges(
        "snapshot_decide_theory_compare_hitl",
        _route_after_theory_compare_hitl,
        {
            "halt_mvp": "halt_mvp",
            "compute_theory_value": "compute_theory_value",
        },
    )

    graph.add_edge("compute_theory_value", "snapshot_compute_theory_value")
    graph.add_edge("snapshot_compute_theory_value", "compute_delta_and_abs_error")
    graph.add_edge("compute_delta_and_abs_error", "snapshot_compute_delta_and_abs_error")

    def _route_after_delta(state: AgentState) -> str:
        if state.computation_hitl.enabled:
            return "halt_mvp"
        return "compute_slope_and_extreme"

    graph.add_conditional_edges(
        "snapshot_compute_delta_and_abs_error",
        _route_after_delta,
        {"halt_mvp": "halt_mvp", "compute_slope_and_extreme": "compute_slope_and_extreme"},
    )

    graph.add_edge("compute_slope_and_extreme", "snapshot_compute_slope_and_extreme")

    def _route_after_slope(state: AgentState) -> str:
        if state.computation_hitl.enabled:
            return "halt_mvp"
        return "unit_init"

    graph.add_conditional_edges(
        "snapshot_compute_slope_and_extreme",
        _route_after_slope,
        {"halt_mvp": "halt_mvp", "unit_init": "unit_init"},
    )

    graph.add_edge("unit_init", "snapshot_unit_init")
    graph.add_edge("snapshot_unit_init", "summarize_method_to_overview_1")
    graph.add_edge("summarize_method_to_overview_1", "generate_result_description_1")
    graph.add_edge("generate_result_description_1", "generate_captions_1")
    graph.add_edge("generate_captions_1", "generate_quant_comment_text_1")

    def _route_after_i_layer_first(state: AgentState) -> str:
        if state.text_generation_hitl.enabled:
            return "halt_mvp"
        if state.status == JobStatus.failed:
            return "end"
        return "excel_mvp"

    graph.add_conditional_edges(
        "generate_quant_comment_text_1",
        _route_after_i_layer_first,
        {"halt_mvp": "halt_mvp", "excel_mvp": "excel_mvp", "end": END},
    )
    graph.add_edge("excel_mvp", "snapshot_excel_mvp")
    graph.add_edge("snapshot_excel_mvp", "summarize_method_to_overview_2")
    graph.add_edge("summarize_method_to_overview_2", "generate_result_description_2")
    graph.add_edge("generate_result_description_2", "generate_captions_2")
    graph.add_edge("generate_captions_2", "generate_quant_comment_text_2")

    def _route_after_i_layer_second(state: AgentState) -> str:
        if state.text_generation_hitl.enabled:
            return "halt_mvp"
        if state.status == JobStatus.failed:
            return "end"
        return "assemble_experiment_result_group"

    graph.add_conditional_edges(
        "generate_quant_comment_text_2",
        _route_after_i_layer_second,
        {
            "halt_mvp": "halt_mvp",
            "assemble_experiment_result_group": "assemble_experiment_result_group",
            "end": END,
        },
    )
    graph.add_edge("assemble_experiment_result_group", "snapshot_assemble_experiment_result_group")

    def _route_after_assemble_group(state: AgentState) -> str:
        if state.text_generation_hitl.enabled:
            return "halt_mvp"
        if state.status == JobStatus.failed:
            return "end"
        return "assemble_results_page"

    graph.add_conditional_edges(
        "snapshot_assemble_experiment_result_group",
        _route_after_assemble_group,
        {"halt_mvp": "halt_mvp", "assemble_results_page": "assemble_results_page", "end": END},
    )
    graph.add_edge("assemble_results_page", "snapshot_assemble_results_page")

    def _route_after_assemble_page(state: AgentState) -> str:
        if state.status == JobStatus.failed:
            return "end"
        return "build_discussion_page"

    graph.add_conditional_edges(
        "snapshot_assemble_results_page",
        _route_after_assemble_page,
        {"build_discussion_page": "build_discussion_page", "end": END},
    )
    graph.add_edge("build_discussion_page", "snapshot_build_discussion_page")

    def _route_after_discussion(state: AgentState) -> str:
        if state.text_generation_hitl.enabled:
            return "halt_mvp"
        if state.status == JobStatus.failed:
            return "end"
        return "build_summary_page"

    graph.add_conditional_edges(
        "snapshot_build_discussion_page",
        _route_after_discussion,
        {"halt_mvp": "halt_mvp", "build_summary_page": "build_summary_page", "end": END},
    )
    graph.add_edge("build_summary_page", "snapshot_build_summary_page")

    def _route_after_summary(state: AgentState) -> str:
        if state.status == JobStatus.failed:
            return "end"
        return "build_references_page"

    graph.add_conditional_edges(
        "snapshot_build_summary_page",
        _route_after_summary,
        {"build_references_page": "build_references_page", "end": END},
    )
    graph.add_edge("build_references_page", "snapshot_build_references_page")

    def _route_after_references(state: AgentState) -> str:
        if state.status == JobStatus.failed:
            return "end"
        return "validate"

    graph.add_conditional_edges(
        "snapshot_build_references_page",
        _route_after_references,
        {"validate": "validate", "end": END},
    )
    graph.add_edge("validate", "snapshot_validate")

    def _route_after_validate_mvp(state: AgentState) -> str:
        if any(str(err.code or "").startswith("hitl_") for err in state.validation_report.errors):
            return "halt_mvp"
        return "quant_comment_mvp"

    graph.add_conditional_edges(
        "snapshot_validate",
        _route_after_validate_mvp,
        {"halt_mvp": "halt_mvp", "quant_comment_mvp": "quant_comment_mvp"},
    )
    graph.add_edge("quant_comment_mvp", "snapshot_quant_comment_mvp")
    graph.add_edge("snapshot_quant_comment_mvp", "render_markdown")
    graph.add_edge("render_markdown", "snapshot_render_markdown")
    graph.add_edge("snapshot_render_markdown", "review_markdown")
    graph.add_edge("review_markdown", "snapshot_review_markdown")
    graph.add_edge("snapshot_review_markdown", "render_docx_markdown")
    graph.add_edge("render_docx_markdown", "snapshot_render_docx")
    graph.add_edge("snapshot_render_docx", END)
    graph.add_edge("halt_mvp", END)

    return graph.compile()
