from __future__ import annotations

import io
import zipfile
from pathlib import Path

from PIL import Image

from core.storage import LocalStorage
from models.contracts import ImageAsset
from templating.markdown_docx import render_docx_from_markdown


def _docx_xml(docx_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
        return z.read("word/document.xml").decode("utf-8", "ignore")


def test_render_docx_from_markdown_with_table_and_image(tmp_path: Path):
    storage = LocalStorage(root=tmp_path)

    # Store a tiny PNG to be referenced by image:<id>
    img = Image.new("RGB", (40, 30), "white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    raw = buf.getvalue()
    storage.put_bytes("imgs/a.png", raw)

    images = {
        "img1": ImageAsset(
            image_id="img1",
            filename="a.png",
            mime_type="image/png",
            storage_key="imgs/a.png",
            upload_index=1,
        )
    }

    md = "\n".join(
        [
            "# Title",
            "",
            "para line 1",
            "para line 2",
            "",
            "表 1：table caption",
            "",
            "| a | b |",
            "|---|---|",
            "| 1 | 2 |",
            "",
            "![](image:img1)",
            "図 1：cap",
            "",
        ]
    )

    docx = render_docx_from_markdown(markdown=md, storage=storage, images_by_id=images)
    xml = _docx_xml(docx)
    assert "Title" in xml
    assert "para line 1 para line 2" in xml
    assert "a" in xml and "b" in xml
    assert "1" in xml and "2" in xml
    assert "cap" in xml


def test_render_docx_from_markdown_draws_diagonal_for_empty_header_cell(tmp_path: Path):
    storage = LocalStorage(root=tmp_path)

    md = "\n".join(
        [
            "|  | b |",
            "|---|---|",
            "| 1 | 2 |",
        ]
    )

    docx = render_docx_from_markdown(markdown=md, storage=storage, images_by_id={})
    xml = _docx_xml(docx)
    assert "w:tr2bl" in xml
