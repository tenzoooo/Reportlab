from __future__ import annotations

from graph.state import AgentState, ValidationIssue, now_iso

def locate_discussion_section(state: AgentState) -> AgentState:
    """
    B5. LocateDiscussionSection
    Identifies the specific section for 'Discussion' (考察).
    Populates state.pdf.discussion_section.
    """
    
    candidates = state.pdf.section_candidates.get("discussion", [])
    
    if not candidates:
        state.validation_report.errors.append(
            ValidationIssue(code="hitl_discussion_section_unknown", message="No discussion section found in manual")
        )
        state.pdf.needs_hitl_discussion = True
        return state

    # If multiple candidates, try to pick the best one.
    # Usually '考察' (Discussion) is a top-level chapter or high-level section.
    # We prefer exact match for "考察" or "検討事項".
    
    best_candidate = None
    
    # Priority 1: Exact "考察" title
    for c in candidates:
        if c.title == "考察":
            best_candidate = c
            break
            
    # Priority 2: "検討事項" or similar
    if not best_candidate:
        for c in candidates:
            if "検討" in c.title or "課題" in c.title:
                best_candidate = c
                break
                
    # Fallback: Just take the first one found by ParseManualStructure
    if not best_candidate:
        best_candidate = candidates[0]
        
    state.pdf.discussion_section = best_candidate
    state.job_meta.updated_at = now_iso()
    
    return state