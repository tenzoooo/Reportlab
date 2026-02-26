from __future__ import annotations

from graph.state import AgentState, TheoryFormula, ValidationIssue, now_iso

def normalize_ommlify_formula(state: AgentState) -> AgentState:

    """

    B7. NormalizeAndOMMLifyFormula

    Converts extracted theory candidates into OMML (Office MathML) format.

    Populates state.pdf.theory_formulas.

    """

    

    formulas: list[TheoryFormula] = []

    

    for cand in state.pdf.theory_candidates:

        # Mock conversion logic

        # 1. Normalize: "V=IR" -> "V = I R"

        normalized = cand.raw.replace(" ", "")

        

        # 2. OMMLify: Call external converter or use template

        # For now, just store as plain text or simple placeholder

        omml = f"<m:oMath><m:r><m:t>{normalized}</m:t></m:r></m:oMath>"

        

        formulas.append(TheoryFormula(

            candidate_id=cand.candidate_id,

            raw=cand.raw,

            normalized=normalized,

            omml=omml,

            source_kind=cand.source_kind,

            heading_section=cand.heading_section,

            heading_title=cand.heading_title,

            page=cand.page,

            line_index=cand.line_index

        ))

        

    state.pdf.theory_formulas = formulas

    

    if not formulas and state.pdf.theory_candidates:

        # Candidates exist but conversion failed?

        state.validation_report.errors.append(

            ValidationIssue(code="hitl_omml_conversion_failed", message="Failed to convert theory formulas to OMML")

        )

        state.pdf.needs_hitl_theory = True



    state.job_meta.updated_at = now_iso()

    return state



# Alias for compatibility with build_graph_update_mvp

normalize_and_ommlify_formula = normalize_ommlify_formula
