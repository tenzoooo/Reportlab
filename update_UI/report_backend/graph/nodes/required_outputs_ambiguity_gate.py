from __future__ import annotations

from graph.state import AgentState, RequiredOutputCandidate, RequiredOutputEstimate, RequiredOutputsHitl, now_iso
from graph.hitl import hitl_disabled


_AUTO_CONFIDENCE = 0.75
_HITL_REQUIRED_CONFIDENCE = 0.50


def _build_candidate_rows(candidates: list[RequiredOutputCandidate], *, exp_idx: int) -> str:
    rows = []
    for idx, cand in enumerate(candidates):
        evidence = ", ".join([e for e in cand.evidence if e])
        rationale = cand.rationale or ""
        label = (
            f"tables={cand.tables_count} graphs={cand.graphs_count} photos={cand.photos_count} "
            f"(conf={cand.confidence:.2f}) {rationale}"
        ).strip()
        if evidence:
            label += f" [evidence: {evidence}]"
        rows.append(
            "<label>"
            f"<input type=\"radio\" name=\"candidate_{exp_idx}\" value=\"{idx}\" {'checked' if idx == 0 else ''}> "
            f"{label}"
            "</label>"
        )
    return "<br>".join(rows)


def _build_html_payload(targets: list[RequiredOutputEstimate]) -> tuple[str, dict[str, object]]:
    blocks = []
    payload_experiments = []
    for exp_idx, exp in enumerate(targets):
        candidates = exp.candidates or [
            RequiredOutputCandidate(
                tables_count=exp.tables_count,
                graphs_count=exp.graphs_count,
                photos_count=exp.photos_count,
                confidence=exp.confidence,
                rationale=exp.rationale,
                evidence=exp.evidence,
            )
        ]
        candidate_rows = _build_candidate_rows(candidates, exp_idx=exp_idx)
        blocks.append(
            "<section>"
            f"<h3>Experiment {exp.exp_key} {exp.title}</h3>"
            f"<p>{exp.method_summary}</p>"
            "<div>"
            f"{candidate_rows}"
            "</div>"
            "<div>"
            f"<label>Tables <input type=\"number\" name=\"tables_{exp_idx}\" value=\"{exp.tables_count}\" min=\"0\"></label> "
            f"<label>Graphs <input type=\"number\" name=\"graphs_{exp_idx}\" value=\"{exp.graphs_count}\" min=\"0\"></label> "
            f"<label>Photos <input type=\"number\" name=\"photos_{exp_idx}\" value=\"{exp.photos_count}\" min=\"0\"></label>"
            "</div>"
            "</section>"
        )
        payload_experiments.append(
            {
                "exp_key": exp.exp_key,
                "title": exp.title,
                "method_summary": exp.method_summary,
                "default": {
                    "tables_count": exp.tables_count,
                    "graphs_count": exp.graphs_count,
                    "photos_count": exp.photos_count,
                },
                "candidates": [c.model_dump() for c in candidates],
            }
        )

    html = "<form data-hitl=\"required_outputs\">" + "\n".join(blocks) + "</form>"
    payload = {"experiments": payload_experiments}
    return html, payload


def required_outputs_ambiguity_gate(state: AgentState) -> AgentState:
    state.required_outputs_hitl = RequiredOutputsHitl()

    if not state.required_outputs:
        # In HITL-disabled mode, do not block the pipeline here.
        if hitl_disabled():
            state.job_meta.updated_at = now_iso()
            return state
        html, payload = _build_html_payload([])
        state.required_outputs_hitl = RequiredOutputsHitl(
            enabled=True,
            mode="required",
            message="必要な出力（表/グラフ/写真）を推定できる実験情報がありません。",
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()
        return state

    targets: list[RequiredOutputEstimate] = []
    required_mode = False
    for estimate in state.required_outputs:
        has_candidates = bool(estimate.candidates)
        needs_hitl = has_candidates or estimate.confidence < _AUTO_CONFIDENCE
        if needs_hitl:
            targets.append(estimate)
        if estimate.confidence < _HITL_REQUIRED_CONFIDENCE:
            required_mode = True

    if targets:
        if hitl_disabled():
            # Do not block; proceed with the best-effort estimates already present in state.required_outputs.
            state.job_meta.updated_at = now_iso()
            return state
        html, payload = _build_html_payload(targets)
        mode = "required" if required_mode else "confirm"
        message = "各実験で必要な出力（表/グラフ/写真）を確認してください。"
        if mode == "required":
            message = "必要な出力（表/グラフ/写真）の確認が完了するまで処理を継続できません。"
        state.required_outputs_hitl = RequiredOutputsHitl(
            enabled=True,
            mode=mode,
            message=message,
            html=html,
            payload=payload,
        )
        state.job_meta.updated_at = now_iso()

    return state
