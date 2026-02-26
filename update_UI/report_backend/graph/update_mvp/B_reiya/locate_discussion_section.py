from __future__ import annotations

from graph.nodes.locate_discussion_section import locate_discussion_section as _locate_discussion_section
from graph.state import AgentState


def locate_discussion_section(state: AgentState) -> AgentState:
    return _locate_discussion_section(state)
