from __future__ import annotations

import re
from core.storage import Storage
from graph.state import AgentState, TheoryCandidate, ValidationIssue, now_iso

# Regex to find lines that look like math formulas

# e.g. "V = IR", "y = ax + b"

# Must contain "=", have typical var chars, not be purely Japanese

_FORMULA_LIKE_RE = re.compile(r"(?:[a-zA-Zα-ωΑ-Ω].*[=≈].*[\w\)\s])")



# "Eq. (1)", "式(1)", "(1)" at end of line

_EQ_LABEL_RE = re.compile(r"[\(（](?:式|Eq\.?)?\s*(\d+)[\)）]\s*$")

def extract_theory_candidates(state: AgentState, *, storage: Storage | None = None) -> AgentState:
    """
    B6. ExtractTheoryCandidates
    Scans 'theory', 'principle', and 'method' sections for formula candidates.
    Populates state.pdf.theory_candidates.
    """
    target_sections = []
    # Order matters: Theory/Principle first, then Method
    for cat in ["theory", "principle", "method"]:
        target_sections.extend(state.pdf.section_candidates.get(cat, []))

    candidates: list[TheoryCandidate] = []
    candidate_count = 0

    if not target_sections:
        state.pdf.theory_candidates = []
        return state

    for section in target_sections:
        text = section.text or ""
        if not text:
            continue
        lines = [line.strip() for line in text.split("\n")]
        for line_idx, line in enumerate(lines):
            if not line:
                continue

            is_formula = False
            if _EQ_LABEL_RE.search(line):
                is_formula = True
            elif _FORMULA_LIKE_RE.search(line):
                if "図" in line or "表" in line:
                    pass
                elif len(line) < 3:
                    pass
                else:
                    is_formula = True

            if is_formula:
                candidate_count += 1
                prev_line = lines[line_idx - 1] if line_idx > 0 else ""
                next_line = lines[line_idx + 1] if line_idx + 1 < len(lines) else ""
                candidates.append(
                    TheoryCandidate(
                        candidate_id=f"theory_{candidate_count}",
                        raw=line,
                        source_kind="text",
                        heading_section=section.section_number,
                        heading_title=section.title,
                        heading_line=section.heading_line,
                        page=None,
                        line_index=None,
                        context_before=prev_line,
                        context_after=next_line,
                    )
                )

    state.pdf.theory_candidates = candidates
    
    if not candidates:
        # Warning only, not strictly fatal for MVP if no theory found (ComputeTheoryValue will skip)
        state.validation_report.warnings.append(
            ValidationIssue(code="warn_no_theory_candidates", message="No formula candidates extracted")
        )

    state.job_meta.updated_at = now_iso()
    return state
