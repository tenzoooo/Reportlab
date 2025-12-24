from __future__ import annotations


def safe_upload_index(value) -> int:
    if isinstance(value, int) and value > 0:
        return value
    return 10**18


def block_upload_index(block) -> int:
    try:
        if block.type == "figure":
            return safe_upload_index(block.figure.asset_upload_index)
        if block.type == "table":
            return safe_upload_index(block.table.asset_upload_index)
    except Exception:
        return 10**18
    return 10**18


def insert_block_in_upload_order(blocks, new_block) -> None:
    new_idx = block_upload_index(new_block)
    for i, existing in enumerate(blocks):
        if block_upload_index(existing) > new_idx:
            blocks.insert(i, new_block)
            return
    blocks.append(new_block)

