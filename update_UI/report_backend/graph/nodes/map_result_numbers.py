from __future__ import annotations

from graph.state import AgentState, ExperimentIndexEntry, ValidationIssue, now_iso

def map_result_numbers(state: AgentState) -> AgentState:
    """
    B4. MapResultNumbers
    Maps method numbers (e.g., 4.1) to result numbers (e.g., 5.1).
    Populates state.pdf.result_number_map.
    """
    
    if not state.pdf.method_numbers:
        # B3 failed or found nothing. B4 cannot proceed.
        return state

    mapping = {}
    errors = []

    # Detect the "chapter" of methods. Usually the first part of "4.1" -> 4.
    # We want to map Chapter M -> Chapter M+1 (e.g. 4 -> 5).
    
    for method in state.pdf.method_numbers:
        parts = method.exp_key.split('.')
        if not parts:
            continue
            
        try:
            method_chapter = int(parts[0])
            result_chapter = method_chapter + 1
            
            # Reconstruct result number: 5.1...
            result_parts = [str(result_chapter)] + parts[1:]
            result_no = ".".join(result_parts)
            
            mapping[method.exp_key] = result_no
            
        except ValueError:
            errors.append(f"Invalid method number format: {method.exp_key}")
            continue

    state.pdf.result_number_map = mapping
    if errors:
        state.pdf.result_number_map_errors = errors
        state.validation_report.warnings.append(
            ValidationIssue(code="result_map_partial_error", message=f"Failed to map some method numbers: {', '.join(errors)}")
        )
        
    if not mapping:
         state.validation_report.errors.append(
            ValidationIssue(code="hitl_method_to_result_mapping", message="Could not map any method numbers to result numbers")
        )

    experiment_index: dict[str, ExperimentIndexEntry] = {}
    exp_keys = [m.exp_key for m in state.pdf.method_numbers]
    children_map: dict[str, list[str]] = {key: [] for key in exp_keys}
    parent_map: dict[str, str] = {key: "" for key in exp_keys}
    exp_set = set(exp_keys)
    for key in exp_keys:
        parts = key.split(".")
        if len(parts) <= 1:
            continue
        parent = ".".join(parts[:-1])
        if parent in exp_set:
            parent_map[key] = parent
            children_map[parent].append(key)

    for method in state.pdf.method_numbers:
        result_no = mapping.get(method.exp_key, "")
        experiment_index[method.exp_key] = ExperimentIndexEntry(
            exp_key=method.exp_key,
            method_id=method.method_id,
            method_title=method.title,
            parent_exp_key=parent_map.get(method.exp_key, ""),
            child_exp_keys=children_map.get(method.exp_key, []),
            result_no=result_no,
            page=method.page,
            line_index=method.line_index,
            global_index=method.global_index,
            data_refs=[],
        )
    state.pdf.experiment_index = experiment_index

    state.job_meta.updated_at = now_iso()
    return state
