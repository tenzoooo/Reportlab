from __future__ import annotations

from langgraph.graph import END, StateGraph

from core.storage import Storage
from graph.state import AgentState, JobStatus, now_iso
from llm.client import LLMClient

from .nodes.ingest import ingest
from .nodes.pdf_parse import pdf_parse
from .nodes.pdf_sections import pdf_sections
from .nodes.discussion_extract import discussion_extract
from .nodes.method_extract import method_extract
from .nodes.unit_init import unit_init
from .nodes.image_analyze import image_analyze
from .nodes.image_assign import image_assign
from .nodes.table_parse import table_parse
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

    graph = StateGraph(AgentState)

    graph.add_node("ingest", lambda s: ingest(s, storage=storage, llm=llm))
    graph.add_node("snapshot_ingest", lambda s: snapshot(s, storage=storage, step="ingest"))

    graph.add_node("pdf_parse", lambda s: pdf_parse(s, storage=storage, llm=llm))
    graph.add_node("snapshot_pdf_parse", lambda s: snapshot(s, storage=storage, step="pdf_parse"))

    graph.add_node("pdf_sections", lambda s: pdf_sections(s, llm=llm))
    graph.add_node("snapshot_pdf_sections", lambda s: snapshot(s, storage=storage, step="pdf_sections"))

    graph.add_node("discussion_extract", lambda s: discussion_extract(s, llm=llm))
    graph.add_node("snapshot_discussion_extract", lambda s: snapshot(s, storage=storage, step="discussion_extract"))

    graph.add_node("method_extract", lambda s: method_extract(s, llm=llm))
    graph.add_node("snapshot_method_extract", lambda s: snapshot(s, storage=storage, step="method_extract"))

    graph.add_node("unit_init", lambda s: unit_init(s))
    graph.add_node("snapshot_unit_init", lambda s: snapshot(s, storage=storage, step="unit_init"))

    graph.add_node("image_analyze", lambda s: image_analyze(s, storage=storage, llm=llm))
    graph.add_node("snapshot_image_analyze", lambda s: snapshot(s, storage=storage, step="image_analyze"))
    graph.add_node("image_assign", lambda s: image_assign(s))
    graph.add_node("snapshot_image_assign", lambda s: snapshot(s, storage=storage, step="image_assign"))

    graph.add_node("table_parse", lambda s: table_parse(s, llm=llm))
    graph.add_node("snapshot_table_parse", lambda s: snapshot(s, storage=storage, step="table_parse"))
    graph.add_node("table_assign", lambda s: table_assign(s))
    graph.add_node("snapshot_table_assign", lambda s: snapshot(s, storage=storage, step="table_assign"))

    graph.add_node("discussion", lambda s: discussion(s, llm=llm))
    graph.add_node("snapshot_discussion", lambda s: snapshot(s, storage=storage, step="discussion"))

    graph.add_node("summary_generate", lambda s: summary(s, llm=llm))
    graph.add_node("snapshot_summary_generate", lambda s: snapshot(s, storage=storage, step="summary"))

    graph.add_node("references", lambda s: references(s))
    graph.add_node("snapshot_references", lambda s: snapshot(s, storage=storage, step="references"))

    graph.add_node("validate", lambda s: validate(s, storage=storage, llm=llm))
    graph.add_node("snapshot_validate", lambda s: snapshot(s, storage=storage, step="validate"))

    graph.add_node("retry_decide", lambda s: retry_decide(s))

    if resolved_mode == "full":
        graph.add_node("render_docx", lambda s: render_docx(s, storage=storage, template_path=template_path))
        graph.add_node("snapshot_render_docx", lambda s: snapshot(s, storage=storage, step="render_docx"))
    else:
        def _finish_prepare(state: AgentState) -> AgentState:
            state.status = JobStatus.done if not state.validation_report.errors else JobStatus.partial
            state.job_meta.updated_at = now_iso()
            return state

        graph.add_node("finish_prepare", _finish_prepare)

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
    graph.add_edge("snapshot_image_analyze", "image_assign")
    graph.add_edge("image_assign", "snapshot_image_assign")

    graph.add_edge("snapshot_image_assign", "table_parse")
    graph.add_edge("table_parse", "snapshot_table_parse")
    graph.add_edge("snapshot_table_parse", "table_assign")
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
