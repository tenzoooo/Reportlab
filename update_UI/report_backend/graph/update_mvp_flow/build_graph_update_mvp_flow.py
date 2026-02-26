from __future__ import annotations

from langgraph.graph import END, StateGraph

from core.storage import Storage
from graph.state import AgentState, ArtifactsBundle, JobStatus, now_iso
from graph.nodes.snapshot import snapshot
from graph.hitl import hitl_disabled
from graph.tracing import summarize_state_for_trace, traceable_if_enabled
from llm.client import LLMClient

from .nodes import (
    build_bc_layer_state,
    build_discussion_summary_from_pdf_markdown,
    classify_assets,
    compose_discussion_summary_references_markdown,
    compose_markdown_document,
    create_hitl_request,
    emit_outputs,
    ingest,
    map_result_numbers,
    normalize_and_ommlify_formula,
    normalize_inputs,
    render_docx,
    run_d_to_i_per_experiment,
    session_start,
    wait_for_hitl_response,
)
from graph.nodes.ui_progress import set_ui_progress


def _merge_j_layer_payload(state: AgentState) -> AgentState:
    if state.artifacts.json_bundle is None:
        state.artifacts.json_bundle = ArtifactsBundle(payload={}, generated_at=now_iso())

    references: list[str] = []
    if state.references_page and state.references_page.formatted_lines:
        references = [str(line or "").strip() for line in state.references_page.formatted_lines if str(line or "").strip()]

    pre_j_markdown = ""
    if state.markdown.document:
        pre_j_markdown = state.markdown.document.text or ""

    state.artifacts.json_bundle.payload["results_page_footer"] = {
        "discussion": state.discussion_page.text if state.discussion_page else "",
        "summary": state.summary_page.text if state.summary_page else "",
        "references": references,
        "markdown": pre_j_markdown,
    }
    state.job_meta.updated_at = now_iso()
    return state


def build_graph_update_mvp(*, storage: Storage, llm: LLMClient):
    mode_tag = "mode:update_mvp"

    def _state_inputs(inputs: dict) -> dict:
        return {"state": summarize_state_for_trace(inputs.get("state"))}

    def _state_outputs(state: AgentState) -> dict:
        return summarize_state_for_trace(state)

    def _named_node(*, key: str, label: str, fn):
        tags = ["workflow:report_agent_update_mvp", mode_tag, f"node:{key}"]
        ui_labels: dict[str, tuple[str, str]] = {
            "session_start": ("Aレイヤー", "セッション開始"),
            "ingest": ("Aレイヤー", "準備"),
            "normalize_inputs": ("Aレイヤー", "入力正規化"),
            "classify_assets": ("Aレイヤー", "入力分類"),
            "bc_layer_parallel": ("B/Cレイヤー", "構造ヒント抽出"),
            "map_result_numbers": ("Bレイヤー", "結果番号対応付け"),
            "normalize_ommlify_formula": ("Bレイヤー", "理論式正規化"),
            "run_d_to_i_per_experiment": ("D-Iレイヤー", "実験単位処理"),
            "n_build_discussion_summary": ("Nレイヤー", "考察/まとめ生成"),
            "m_compose_footer": ("Mレイヤー", "参考文献/末尾統合"),
            "j_merge_payload": ("Jレイヤー", "統合"),
            "k_compose_markdown": ("Kレイヤー", "Markdown化"),
            "l_render_docx": ("Lレイヤー", "DOCX出力"),
            "l_emit_outputs": ("Lレイヤー", "成果物保存"),
            "create_hitl_request": ("HITL", "確認待ち"),
            "wait_for_hitl_response": ("HITL", "回答待ち"),
        }

        @traceable_if_enabled(
            name=label,
            run_type="chain",
            tags=tags,
            process_inputs=_state_inputs,
            process_outputs=_state_outputs,
        )
        def _run(state: AgentState) -> AgentState:
            # Best-effort: ノード開始時点でUI用進捗を更新（長いノードでも段階表示できる）
            try:
                phase, detail = ui_labels.get(key, ("", ""))
                if phase or detail:
                    set_ui_progress(state, storage=storage, phase=phase, detail=detail)
            except Exception:
                pass
            next_state = fn(state)
            # Persist per-node snapshot so /jobs/{id}/intermediate can reflect progress in real time.
            return snapshot(next_state, storage=storage, step=key)

        return _run

    graph = StateGraph(AgentState)

    graph.add_node("session_start", _named_node(key="session_start", label="A0 Session Start", fn=lambda s: session_start(s)))
    graph.add_node("ingest", _named_node(key="ingest", label="A1 Ingest", fn=lambda s: ingest(s, storage=storage, llm=llm)))
    graph.add_node(
        "normalize_inputs",
        _named_node(key="normalize_inputs", label="A2 Normalize Inputs", fn=lambda s: normalize_inputs(s, storage=storage)),
    )
    graph.add_node(
        "classify_assets",
        _named_node(key="classify_assets", label="A3 Classify Assets", fn=lambda s: classify_assets(s, storage=storage, llm=llm)),
    )
    graph.add_node(
        "bc_layer_parallel",
        _named_node(key="bc_layer_parallel", label="B+C Parallel (B + C)", fn=lambda s: build_bc_layer_state(s, storage=storage, llm=llm)),
    )
    graph.add_node(
        "map_result_numbers",
        _named_node(key="map_result_numbers", label="B8 Map Result Numbers", fn=lambda s: map_result_numbers(s)),
    )
    graph.add_node(
        "normalize_ommlify_formula",
        _named_node(
            key="normalize_ommlify_formula",
            label="B11 Normalize + OMMLify Formula",
            fn=lambda s: normalize_and_ommlify_formula(s),
        ),
    )

    graph.add_node(
        "run_d_to_i_per_experiment",
        _named_node(
            key="run_d_to_i_per_experiment",
            label="D-I Per Experiment",
            fn=lambda s: run_d_to_i_per_experiment(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node(
        "n_build_discussion_summary",
        _named_node(
            key="n_build_discussion_summary",
            label="N Build Discussion/Summary",
            fn=lambda s: build_discussion_summary_from_pdf_markdown(s, llm=llm),
        ),
    )
    graph.add_node(
        "m_compose_footer",
        _named_node(
            key="m_compose_footer",
            label="M Compose Discussion/Summary/References",
            fn=lambda s: compose_discussion_summary_references_markdown(s),
        ),
    )
    graph.add_node(
        "j_merge_payload",
        _named_node(
            key="j_merge_payload",
            label="J Merge I Outputs + M Footer",
            fn=lambda s: _merge_j_layer_payload(s),
        ),
    )
    graph.add_node(
        "k_compose_markdown",
        _named_node(key="k_compose_markdown", label="K Compose Markdown", fn=lambda s: compose_markdown_document(s)),
    )
    graph.add_node(
        "l_render_docx",
        _named_node(key="l_render_docx", label="L Render DOCX", fn=lambda s: render_docx(s, storage=storage)),
    )
    graph.add_node(
        "l_emit_outputs",
        _named_node(key="l_emit_outputs", label="L Emit Outputs", fn=lambda s: emit_outputs(s, storage=storage)),
    )
    graph.add_node(
        "create_hitl_request",
        _named_node(key="create_hitl_request", label="O43 Create HITL Request", fn=lambda s: create_hitl_request(s)),
    )
    graph.add_node(
        "wait_for_hitl_response",
        _named_node(key="wait_for_hitl_response", label="O44 Wait For HITL Response", fn=lambda s: wait_for_hitl_response(s)),
    )

    graph.set_entry_point("session_start")
    graph.add_edge("session_start", "ingest")
    graph.add_edge("ingest", "normalize_inputs")
    graph.add_edge("normalize_inputs", "classify_assets")
    graph.add_edge("classify_assets", "bc_layer_parallel")
    graph.add_edge("bc_layer_parallel", "map_result_numbers")
    graph.add_edge("map_result_numbers", "normalize_ommlify_formula")

    def _route_after_ommlify(state: AgentState) -> str:
        if hitl_disabled():
            return "run_d_to_i_per_experiment"
        if state.pdf.needs_hitl_theory:
            return "create_hitl_request"
        return "run_d_to_i_per_experiment"

    graph.add_conditional_edges(
        "normalize_ommlify_formula",
        _route_after_ommlify,
        {"create_hitl_request": "create_hitl_request", "run_d_to_i_per_experiment": "run_d_to_i_per_experiment"},
    )

    def _route_after_d_to_i(state: AgentState) -> str:
        if state.status == JobStatus.failed:
            return "end"
        if hitl_disabled():
            return "n_build_discussion_summary"
        if state.text_generation_hitl.enabled:
            return "create_hitl_request"
        return "n_build_discussion_summary"

    graph.add_conditional_edges(
        "run_d_to_i_per_experiment",
        _route_after_d_to_i,
        {"create_hitl_request": "create_hitl_request", "n_build_discussion_summary": "n_build_discussion_summary", "end": END},
    )

    def _route_after_n_layer(state: AgentState) -> str:
        if state.status == JobStatus.failed:
            return "end"
        if hitl_disabled():
            return "m_compose_footer"
        if state.text_generation_hitl.enabled:
            return "create_hitl_request"
        return "m_compose_footer"

    graph.add_conditional_edges(
        "n_build_discussion_summary",
        _route_after_n_layer,
        {"create_hitl_request": "create_hitl_request", "m_compose_footer": "m_compose_footer", "end": END},
    )

    graph.add_edge("m_compose_footer", "j_merge_payload")
    graph.add_edge("j_merge_payload", "k_compose_markdown")
    graph.add_edge("k_compose_markdown", "l_render_docx")
    graph.add_edge("l_render_docx", "l_emit_outputs")
    graph.add_edge("l_emit_outputs", END)

    graph.add_edge("create_hitl_request", "wait_for_hitl_response")
    graph.add_edge("wait_for_hitl_response", END)

    return graph.compile()
