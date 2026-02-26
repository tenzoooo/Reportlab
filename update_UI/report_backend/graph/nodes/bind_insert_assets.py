from __future__ import annotations

import re
from collections import defaultdict
from typing import Iterable

from core.excel import load_workbook_bytes, table_to_csv
from core.storage import Storage
from graph.state import (
    AgentState,
    InsertAssetBinding,
    InsertAssetHitl,
    TableColumnBinding,
    now_iso,
)
from models.contracts import ImageAsset, TableAsset


_EMPTY_ROW_LIMIT = 2
_MAX_TABLE_ROWS = 220

_HITL_INSERT_UNKNOWN = "HITL_INSERT_ASSET_UNKNOWN"
_HITL_INSERT_MISSING = "HITL_INSERT_ASSET_MISSING"
_HITL_TYPE_UNKNOWN = "HITL_ASSET_TYPE_UNKNOWN"

_ROUGH_GRAPH = "graph"
_ROUGH_PHOTO = "photo"
_ROUGH_UNKNOWN = "unknown"


def _to_str(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if abs(value) >= 1e12 or (abs(value) > 0 and abs(value) < 1e-6):
            return f"{value:.6g}"
        s = f"{value:.10f}".rstrip("0").rstrip(".")
        return s if s else "0"
    return str(value)


def _normalize_token(value: str) -> str:
    return (value or "").replace("．", ".").replace("。", ".").strip()


def _asset_label(asset: ImageAsset | TableAsset) -> str:
    if isinstance(asset, ImageAsset):
        return asset.filename or asset.image_id
    return asset.table_id


def _asset_id_from_result(result_no: str, idx: int) -> str:
    return f"tbl_{result_no}_{idx}"


def _storage_key_for_table(run_id: str, result_no: str, table_id: str) -> str:
    return f"tables/{run_id}/{result_no}/{table_id}.json"


def _column_label(name: str, unit: str) -> str:
    n = (name or "").strip()
    u = (unit or "").strip()
    if not n:
        n = "column"
    if not u or u == "1":
        return n
    return f"{n} ({u})"


def _extract_table_rows(ws, binding: TableColumnBinding) -> list[list[str]]:
    col_indices = sorted({c.column_index for c in binding.columns if c.column_index > 0})
    if not col_indices:
        return []
    header = []
    for col in sorted(binding.columns, key=lambda c: c.column_index):
        header.append(_column_label(col.name or col.header, col.unit))
    rows = [header]
    header_row = binding.header_row_index or 1
    empty_streak = 0
    start_row = max(1, header_row + 1)
    for r in range(start_row, start_row + _MAX_TABLE_ROWS):
        row_vals = [_to_str(ws.cell(row=r, column=c).value) for c in col_indices]
        if all(not v.strip() for v in row_vals):
            empty_streak += 1
            if empty_streak >= _EMPTY_ROW_LIMIT:
                break
            continue
        empty_streak = 0
        rows.append(row_vals)
    if len(rows) <= 1:
        return []
    return rows


def _excel_sources(state: AgentState) -> dict[str, dict[str, str]]:
    sources: dict[str, dict[str, str]] = {}
    for excel in state.excel_files:
        if excel.excel_id and excel.storage_key:
            sources[excel.excel_id] = {"storage_key": excel.storage_key, "filename": excel.filename}
    if state.excel.storage_key:
        sources.setdefault(
            "primary",
            {"storage_key": state.excel.storage_key, "filename": state.excel.filename},
        )
    return sources


def _generate_table_assets(
    state: AgentState,
    *,
    storage: Storage,
) -> list[TableAsset]:
    existing_ids = {tbl.table_id for tbl in state.assets_tables}
    created: list[TableAsset] = []
    sources = _excel_sources(state)
    by_exp: dict[str, list[TableColumnBinding]] = defaultdict(list)
    for binding in state.table_column_bindings:
        if binding.exp_key:
            by_exp[binding.exp_key].append(binding)

    for exp_key, bindings in by_exp.items():
        result_no = ""
        for b in bindings:
            if b.result_no:
                result_no = b.result_no
                break
        if not result_no:
            result_no = exp_key
        for idx, binding in enumerate(bindings, start=1):
            table_id = _asset_id_from_result(result_no, idx)
            if table_id in existing_ids:
                continue
            excel_meta = sources.get(binding.excel_id, {})
            storage_key = excel_meta.get("storage_key", "")
            if not storage_key or not binding.sheet_name:
                continue
            try:
                wb = load_workbook_bytes(storage.get_bytes(storage_key))
                ws = wb[binding.sheet_name]
            except Exception:
                continue
            rows = _extract_table_rows(ws, binding)
            if not rows:
                continue
            raw_csv = table_to_csv(rows)
            table_json_key = _storage_key_for_table(state.job_meta.run_id or state.job_meta.job_id, result_no, table_id)
            storage.put_json(table_json_key, {"rows": rows, "exp_key": exp_key, "result_no": result_no})
            created.append(
                TableAsset(
                    asset_id=table_id,
                    table_id=table_id,
                    storage_key=table_json_key,
                    raw_csv=raw_csv,
                    upload_index=idx,
                    rows=rows,
                    assigned_to=exp_key,
                )
            )
            existing_ids.add(table_id)
    return created


def _match_filename(filename: str, tokens: Iterable[str]) -> bool:
    name = (filename or "").lower()
    for token in tokens:
        if token and token.lower() in name:
            return True
    return False


def _explicit_image_assignment(img: ImageAsset) -> str:
    assigned = (img.assigned_to or "").strip()
    if assigned:
        return assigned
    assigned = str(getattr(img.analysis, "assigned_exp_key", "") or "").strip()
    if assigned:
        return assigned
    return ""


def _choose_assets(
    *,
    exp_key: str,
    result_no: str,
    required_tables: int,
    required_graphs: int,
    required_photos: int,
    tables: list[TableAsset],
    images: list[ImageAsset],
) -> InsertAssetBinding:
    evidence: list[str] = []
    confidence_parts: list[float] = []
    tables_selected: list[str] = []
    graphs_selected: list[str] = []
    photos_selected: list[str] = []
    ambiguous = False
    type_unknown = False

    explicit_tables = [t for t in tables if t.assigned_to == exp_key]
    if explicit_tables:
        explicit_tables.sort(key=lambda t: t.upload_index)
        tables_selected = [t.table_id for t in explicit_tables[:required_tables]]
        confidence_parts.append(0.95)
        evidence.append("explicit_table")

    if len(tables_selected) < required_tables:
        remaining = [t for t in tables if t.table_id not in tables_selected]
        remaining.sort(key=lambda t: t.upload_index)
        tables_selected.extend([t.table_id for t in remaining[: required_tables - len(tables_selected)]])
        if remaining:
            confidence_parts.append(0.6)
            evidence.append("table_fallback")
            if len(remaining) > required_tables:
                ambiguous = True

    exp_tokens = [exp_key, result_no]
    explicit_images: dict[str, list[ImageAsset]] = {"graph": [], "photo": []}
    filename_matches: dict[str, list[ImageAsset]] = {"graph": [], "photo": [], "unknown": []}
    unknown_images: list[ImageAsset] = []

    for img in images:
        exp_assigned = _explicit_image_assignment(img)
        if exp_assigned and exp_assigned != exp_key:
            continue
        rough = (img.rough_class or "").strip().lower() or _ROUGH_UNKNOWN
        if exp_assigned:
            if rough == _ROUGH_GRAPH:
                explicit_images["graph"].append(img)
            elif rough == _ROUGH_PHOTO:
                explicit_images["photo"].append(img)
            else:
                unknown_images.append(img)
            continue
        if _match_filename(img.filename, exp_tokens):
            filename_matches[rough].append(img)
        elif rough == _ROUGH_UNKNOWN:
            unknown_images.append(img)

    for kind, required, selected in [
        ("graph", required_graphs, graphs_selected),
        ("photo", required_photos, photos_selected),
    ]:
        pool = explicit_images[kind]
        pool.sort(key=lambda i: i.upload_index)
        selected.extend([img.image_id for img in pool[:required]])
        if pool:
            confidence_parts.append(0.9)
            evidence.append(f"explicit_{kind}")

        if len(selected) < required:
            remaining = [img for img in filename_matches.get(kind, []) if img.image_id not in selected]
            remaining.sort(key=lambda i: i.upload_index)
            selected.extend([img.image_id for img in remaining[: required - len(selected)]])
            if remaining:
                confidence_parts.append(0.75)
                evidence.append(f"filename_{kind}")
                if len(remaining) > required:
                    ambiguous = True

        if len(selected) < required:
            candidates = [img for img in images if img.rough_class == kind and img.image_id not in selected]
            candidates.sort(key=lambda i: i.upload_index)
            selected.extend([img.image_id for img in candidates[: required - len(selected)]])
            if candidates:
                confidence_parts.append(0.6)
                evidence.append(f"class_{kind}")
                if len(candidates) > required:
                    ambiguous = True

    missing_graphs = max(0, required_graphs - len(graphs_selected))
    missing_photos = max(0, required_photos - len(photos_selected))

    unknown_images.sort(key=lambda i: i.upload_index)
    for img in list(unknown_images):
        if missing_graphs <= 0 and missing_photos <= 0:
            break
        if img.rough_class_confidence < 0.5:
            type_unknown = True
            continue
        if missing_graphs > 0:
            graphs_selected.append(img.image_id)
            missing_graphs -= 1
            confidence_parts.append(max(0.5, img.rough_class_confidence))
            evidence.append("unknown_as_graph")
            continue
        if missing_photos > 0:
            photos_selected.append(img.image_id)
            missing_photos -= 1
            confidence_parts.append(max(0.5, img.rough_class_confidence))
            evidence.append("unknown_as_photo")

    missing_tables = max(0, required_tables - len(tables_selected))
    missing_graphs = max(0, required_graphs - len(graphs_selected))
    missing_photos = max(0, required_photos - len(photos_selected))

    confidence = min(confidence_parts) if confidence_parts else 0.4
    rationale = "selected assets based on explicit assignment and filename heuristics"

    if missing_graphs > 0 or missing_photos > 0:
        type_unknown = type_unknown or bool(unknown_images)

    return InsertAssetBinding(
        exp_key=exp_key,
        result_no=result_no,
        tables_asset_ids=tables_selected,
        graphs_asset_ids=graphs_selected,
        photos_asset_ids=photos_selected,
        required_tables=required_tables,
        required_graphs=required_graphs,
        required_photos=required_photos,
        missing_tables=missing_tables,
        missing_graphs=missing_graphs,
        missing_photos=missing_photos,
        confidence=confidence,
        rationale=rationale,
        evidence=evidence,
        ambiguous=ambiguous,
        type_unknown=type_unknown,
    )


def _build_insert_asset_hitl(
    bindings: list[InsertAssetBinding],
    *,
    tables: list[TableAsset],
    images: list[ImageAsset],
) -> InsertAssetHitl:
    codes: set[str] = set()
    targets: list[InsertAssetBinding] = []

    for binding in bindings:
        if binding.missing_tables or binding.missing_graphs or binding.missing_photos:
            codes.add(_HITL_INSERT_MISSING)
            targets.append(binding)
        if binding.ambiguous:
            codes.add(_HITL_INSERT_UNKNOWN)
            targets.append(binding)
        if binding.type_unknown:
            codes.add(_HITL_TYPE_UNKNOWN)
            targets.append(binding)

    if not codes:
        return InsertAssetHitl()

    html, payload = _build_insert_asset_hitl_payload(targets, tables=tables, images=images)
    return InsertAssetHitl(
        enabled=True,
        codes=sorted(codes),
        message="Confirm assets to insert for each experiment.",
        html=html,
        payload=payload,
    )


def _build_insert_asset_hitl_payload(
    targets: list[InsertAssetBinding],
    *,
    tables: list[TableAsset],
    images: list[ImageAsset],
) -> tuple[str, dict[str, object]]:
    table_options = [{"id": t.table_id, "label": _asset_label(t)} for t in tables]
    image_options = [{"id": i.image_id, "label": _asset_label(i), "rough_class": i.rough_class} for i in images]

    blocks = []
    payload_targets = []
    for idx, binding in enumerate(targets):
        t_opts = "\n".join([f"<option value=\"{o['id']}\">{o['label']}</option>" for o in table_options])
        g_opts = "\n".join([f"<option value=\"{o['id']}\">{o['label']}</option>" for o in image_options])
        p_opts = g_opts
        blocks.append(
            "<section>"
            f"<h3>Experiment {binding.result_no or binding.exp_key}</h3>"
            f"<label>Tables <select multiple name=\"tables_asset_ids_{idx}\">{t_opts}</select></label>"
            f"<label>Graphs <select multiple name=\"graphs_asset_ids_{idx}\">{g_opts}</select></label>"
            f"<label>Photos <select multiple name=\"photos_asset_ids_{idx}\">{p_opts}</select></label>"
            "</section>"
        )
        payload_targets.append(
            {
                "exp_key": binding.exp_key,
                "result_no": binding.result_no,
                "selected": {
                    "tables_asset_ids": binding.tables_asset_ids,
                    "graphs_asset_ids": binding.graphs_asset_ids,
                    "photos_asset_ids": binding.photos_asset_ids,
                },
            }
        )

    html = "<form data-hitl=\"insert_assets\">" + "\n".join(blocks) + "</form>"
    payload = {"targets": payload_targets, "tables": table_options, "images": image_options}
    return html, payload


def bind_insert_assets(state: AgentState, *, storage: Storage) -> AgentState:
    created_tables = _generate_table_assets(state, storage=storage)
    if created_tables:
        state.assets_tables = list(state.assets_tables) + created_tables

    tables = list(state.assets_tables)
    images = list(state.assets_images)
    required_by_exp: dict[str, tuple[int, int, int]] = {}
    for estimate in state.required_outputs:
        required_by_exp[str(estimate.exp_key or "").strip()] = (
            int(estimate.tables_count or 0),
            int(estimate.graphs_count or 0),
            int(estimate.photos_count or 0),
        )

    bindings: list[InsertAssetBinding] = []
    for exp_key, counts in required_by_exp.items():
        result_no = str(state.pdf.result_number_map.get(exp_key, "") or "")
        req_tables, req_graphs, req_photos = counts
        binding = _choose_assets(
            exp_key=exp_key,
            result_no=result_no,
            required_tables=req_tables,
            required_graphs=req_graphs,
            required_photos=req_photos,
            tables=tables,
            images=images,
        )
        bindings.append(binding)

    state.insert_asset_bindings = bindings
    state.insert_asset_hitl = _build_insert_asset_hitl(bindings, tables=tables, images=images)
    state.job_meta.updated_at = now_iso()
    return state


__all__ = ["bind_insert_assets", "_build_insert_asset_hitl"]
