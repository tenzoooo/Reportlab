from __future__ import annotations

from graph.state import AgentState, ValidationIssue


def _find_retry_target(state: AgentState, code: str) -> ValidationIssue | None:
    for issue in state.validation_report.retry_targets:
        if issue.code == code:
            return issue
    return None


def retry_decide(state: AgentState) -> AgentState:
    """
    Decide whether to retry a specific subtask and mutate state for a diff retry.

    Sets:
      - state.next_action: one of "image_analyze" | "table_parse" | "discussion" | ""

    Notes:
      - This is intentionally single-step: one retry target per loop, then the graph flows back to validate.
      - Budgets are enforced via state.job_meta.retry_budgets.
    """

    state.next_action = ""

    budgets = state.job_meta.retry_budgets

    # Priority: image -> table -> discussion
    image_issue = _find_retry_target(state, "retry_image_analyze")
    if image_issue and budgets.image_analyze > 0 and image_issue.target:
        budgets.image_analyze -= 1
        for img in state.assets_images:
            if img.image_id == image_issue.target:
                img.analysis = None
                img.assigned_to = None
                break
        state.next_action = "image_analyze"
        return state

    table_issue = _find_retry_target(state, "retry_table_analyze")
    if table_issue and budgets.table_analyze > 0 and table_issue.target:
        budgets.table_analyze -= 1
        for tbl in state.assets_tables:
            if tbl.table_id == table_issue.target:
                tbl.analysis = None
                tbl.assigned_to = None
                break
        state.next_action = "table_parse"
        return state

    discussion_issue = _find_retry_target(state, "retry_discussion")
    if discussion_issue and budgets.discussion > 0:
        budgets.discussion -= 1
        state.consideration.units = []
        state.next_action = "discussion"
        return state

    return state

