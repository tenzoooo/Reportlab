from __future__ import annotations

from graph.nodes.build_bc_layer_state import build_bc_layer_state
from graph.nodes.build_discussion_summary_from_pdf_markdown import build_discussion_summary_from_pdf_markdown
from graph.nodes.compose_discussion_summary_references_markdown import compose_discussion_summary_references_markdown
from graph.update_mvp.B_reiya.map_result_numbers import map_result_numbers
from graph.update_mvp.B_reiya.normalize_ommlify_formula import normalize_and_ommlify_formula
from graph.update_mvp.D_reiya.run_d_to_i_per_experiment import run_d_to_i_per_experiment
from graph.update_mvp.O_reiya.create_hitl_request import create_hitl_request
from graph.update_mvp.O_reiya.wait_for_hitl_response import wait_for_hitl_response
from graph.update_mvp.P_reiya.emit_outputs import emit_outputs
from graph.update_mvp.P_reiya.render_docx import render_docx
from graph.update_mvp.classify_assets import classify_assets
from graph.update_mvp.ingest import ingest
from graph.update_mvp.normalize_inputs import normalize_inputs
from graph.update_mvp.session_start import session_start
from graph.update_mvp.L_reiya.compose_markdown_document import compose_markdown_document


NODE_SOURCE_MAP: dict[str, str] = {
    "session_start": "graph.update_mvp.session_start",
    "ingest": "graph.update_mvp.ingest",
    "normalize_inputs": "graph.update_mvp.normalize_inputs",
    "classify_assets": "graph.update_mvp.classify_assets",
    "bc_layer_parallel": "graph.nodes.build_bc_layer_state",
    "map_result_numbers": "graph.update_mvp.B_reiya.map_result_numbers",
    "normalize_ommlify_formula": "graph.update_mvp.B_reiya.normalize_ommlify_formula",
    "run_d_to_i_per_experiment": "graph.update_mvp.D_reiya.run_d_to_i_per_experiment",
    "n_build_discussion_summary": "graph.nodes.build_discussion_summary_from_pdf_markdown",
    "m_compose_footer": "graph.nodes.compose_discussion_summary_references_markdown",
    "j_merge_payload": "graph.update_mvp_flow.build_graph_update_mvp_flow:_merge_j_layer_payload",
    "k_compose_markdown": "graph.update_mvp.L_reiya.compose_markdown_document",
    "l_render_docx": "graph.update_mvp.P_reiya.render_docx",
    "l_emit_outputs": "graph.update_mvp.P_reiya.emit_outputs",
    "create_hitl_request": "graph.update_mvp.O_reiya.create_hitl_request",
    "wait_for_hitl_response": "graph.update_mvp.O_reiya.wait_for_hitl_response",
}

