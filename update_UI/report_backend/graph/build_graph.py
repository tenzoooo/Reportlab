from __future__ import annotations

from langgraph.graph import END, StateGraph

from core.storage import Storage
from graph.state import AgentState, JobStatus, now_iso
from graph.tracing import summarize_state_for_trace, traceable_if_enabled
from llm.client import LLMClient

from .nodes.ingest import ingest
from .nodes.pdf_parse import pdf_parse
from .nodes.pdf_sections import pdf_sections
from .nodes.discussion_extract import discussion_extract
from .nodes.method_extract import method_extract
from .nodes.unit_init import unit_init
from .nodes.image_analyze import image_analyze
from .nodes.image_rerank import image_rerank
from .nodes.image_assign import image_assign
from .nodes.table_parse import table_parse
from .nodes.table_rerank import table_rerank
from .nodes.table_assign import table_assign
from .nodes.discussion import discussion
from .nodes.summary import summary
from .nodes.references import references
from .nodes.validate import validate
from .nodes.retry_decide import retry_decide
from .nodes.render_docx import render_docx
from .nodes.snapshot import snapshot


def build_graph(*, storage: Storage, llm: LLMClient, template_path: str, mode: str = "full"):
    """
    Build and compile the LangGraph workflow.
    Nodes are closures capturing dependencies (storage, llm, template path).
    """

    resolved_mode = (mode or "full").strip().lower()
    if resolved_mode not in {"full", "prepare"}:
        raise ValueError(f"Invalid graph mode: {mode}")

    mode_tag = f"mode:{resolved_mode}"

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
        "ingest",
        _named_node(
            key="ingest",
            label="01 Ingest / 初期化",
            fn=lambda s: ingest(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_ingest", lambda s: snapshot(s, storage=storage, step="ingest"))

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
        "pdf_sections",
        _named_node(
            key="pdf_sections",
            label="03 章見出し検出（LLM）",
            fn=lambda s: pdf_sections(s, llm=llm),
        ),
    )
    graph.add_node("snapshot_pdf_sections", lambda s: snapshot(s, storage=storage, step="pdf_sections"))

    graph.add_node(
        "discussion_extract",
        _named_node(
            key="discussion_extract",
            label="04 考察プロンプト抽出（LLM）",
            fn=lambda s: discussion_extract(s, llm=llm),
        ),
    )
    graph.add_node("snapshot_discussion_extract", lambda s: snapshot(s, storage=storage, step="discussion_extract"))

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
        "unit_init",
        _named_node(
            key="unit_init",
            label="06 実験ユニット生成",
            fn=lambda s: unit_init(s),
        ),
    )
    graph.add_node("snapshot_unit_init", lambda s: snapshot(s, storage=storage, step="unit_init"))

    graph.add_node(
        "image_analyze",
        _named_node(
            key="image_analyze",
            label="07 画像解析（Vision LLM）",
            fn=lambda s: image_analyze(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_image_analyze", lambda s: snapshot(s, storage=storage, step="image_analyze"))
    graph.add_node(
        "image_rerank",
        _named_node(
            key="image_rerank",
            label="08 画像割当再ランキング（LLM）",
            fn=lambda s: image_rerank(s, llm=llm),
        ),
    )
    graph.add_node("snapshot_image_rerank", lambda s: snapshot(s, storage=storage, step="image_rerank"))
    graph.add_node(
        "image_assign",
        _named_node(
            key="image_assign",
            label="09 画像割当",
            fn=lambda s: image_assign(s),
        ),
    )
    graph.add_node("snapshot_image_assign", lambda s: snapshot(s, storage=storage, step="image_assign"))

    graph.add_node(
        "table_parse",
        _named_node(
            key="table_parse",
            label="10 表解析（LLM）",
            fn=lambda s: table_parse(s, llm=llm),
        ),
    )
    graph.add_node("snapshot_table_parse", lambda s: snapshot(s, storage=storage, step="table_parse"))
    graph.add_node(
        "table_rerank",
        _named_node(
            key="table_rerank",
            label="11 表割当再ランキング（LLM）",
            fn=lambda s: table_rerank(s, llm=llm),
        ),
    )
    graph.add_node("snapshot_table_rerank", lambda s: snapshot(s, storage=storage, step="table_rerank"))
    graph.add_node(
        "table_assign",
        _named_node(
            key="table_assign",
            label="12 表割当",
            fn=lambda s: table_assign(s),
        ),
    )
    graph.add_node("snapshot_table_assign", lambda s: snapshot(s, storage=storage, step="table_assign"))

    graph.add_node(
        "discussion",
        _named_node(
            key="discussion",
            label="11 考察生成（LLM）",
            fn=lambda s: discussion(s, llm=llm),
        ),
    )
    graph.add_node("snapshot_discussion", lambda s: snapshot(s, storage=storage, step="discussion"))

    graph.add_node(
        "summary_generate",
        _named_node(
            key="summary_generate",
            label="12 まとめ生成（LLM）",
            fn=lambda s: summary(s, llm=llm),
        ),
    )
    graph.add_node("snapshot_summary_generate", lambda s: snapshot(s, storage=storage, step="summary"))

    graph.add_node(
        "references",
        _named_node(
            key="references",
            label="13 参考文献",
            fn=lambda s: references(s),
        ),
    )
    graph.add_node("snapshot_references", lambda s: snapshot(s, storage=storage, step="references"))

    graph.add_node(
        "validate",
        _named_node(
            key="validate",
            label="14 検証 / テンプレ文脈生成",
            fn=lambda s: validate(s, storage=storage, llm=llm),
        ),
    )
    graph.add_node("snapshot_validate", lambda s: snapshot(s, storage=storage, step="validate"))

    graph.add_node(
        "retry_decide",
        _named_node(
            key="retry_decide",
            label="15 リトライ判断",
            fn=lambda s: retry_decide(s),
        ),
    )

    if resolved_mode == "full":
        graph.add_node(
            "render_docx",
            _named_node(
                key="render_docx",
                label="16 DOCX生成",
                fn=lambda s: render_docx(s, storage=storage, template_path=template_path),
            ),
        )
        graph.add_node("snapshot_render_docx", lambda s: snapshot(s, storage=storage, step="render_docx"))
    else:
        def _finish_prepare(state: AgentState) -> AgentState:
            state.status = JobStatus.done if not state.validation_report.errors else JobStatus.partial
            state.job_meta.updated_at = now_iso()
            return state

        graph.add_node(
            "finish_prepare",
            _named_node(
                key="finish_prepare",
                label="16 完了（prepare）",
                fn=_finish_prepare,
            ),
        )

    graph.set_entry_point("ingest")

    graph.add_edge("ingest", "snapshot_ingest")
    graph.add_edge("snapshot_ingest", "pdf_parse")
    graph.add_edge("pdf_parse", "snapshot_pdf_parse")
    graph.add_edge("snapshot_pdf_parse", "pdf_sections")
    graph.add_edge("pdf_sections", "snapshot_pdf_sections")
    graph.add_edge("snapshot_pdf_sections", "discussion_extract")
    graph.add_edge("discussion_extract", "snapshot_discussion_extract")
    graph.add_edge("snapshot_discussion_extract", "method_extract")
    graph.add_edge("method_extract", "snapshot_method_extract")
    graph.add_edge("snapshot_method_extract", "unit_init")
    graph.add_edge("unit_init", "snapshot_unit_init")

    # Assets are optional; nodes are no-ops when empty.
    graph.add_edge("snapshot_unit_init", "image_analyze")
    graph.add_edge("image_analyze", "snapshot_image_analyze")
    graph.add_edge("snapshot_image_analyze", "image_rerank")
    graph.add_edge("image_rerank", "snapshot_image_rerank")
    graph.add_edge("snapshot_image_rerank", "image_assign")
    graph.add_edge("image_assign", "snapshot_image_assign")

    graph.add_edge("snapshot_image_assign", "table_parse")
    graph.add_edge("table_parse", "snapshot_table_parse")
    graph.add_edge("snapshot_table_parse", "table_rerank")
    graph.add_edge("table_rerank", "snapshot_table_rerank")
    graph.add_edge("snapshot_table_rerank", "table_assign")
    graph.add_edge("table_assign", "snapshot_table_assign")

    graph.add_edge("snapshot_table_assign", "discussion")
    graph.add_edge("discussion", "snapshot_discussion")
    graph.add_edge("snapshot_discussion", "summary_generate")
    graph.add_edge("summary_generate", "snapshot_summary_generate")
    graph.add_edge("snapshot_summary_generate", "references")
    graph.add_edge("references", "snapshot_references")
    graph.add_edge("snapshot_references", "validate")
    graph.add_edge("validate", "snapshot_validate")
    graph.add_edge("snapshot_validate", "retry_decide")

    def _route_after_validate(state: AgentState) -> str:
        return state.next_action or "render_docx"

    graph.add_conditional_edges(
        "retry_decide",
        _route_after_validate,
        {
            "image_analyze": "image_analyze",
            "table_parse": "table_parse",
            "discussion": "discussion",
            "render_docx": "render_docx" if resolved_mode == "full" else "finish_prepare",
        },
    )

    if resolved_mode == "full":
        graph.add_edge("render_docx", "snapshot_render_docx")
        graph.add_edge("snapshot_render_docx", END)
    else:
        graph.add_edge("finish_prepare", END)

    return graph.compile()
