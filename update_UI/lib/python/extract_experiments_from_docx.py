import sys
import os
import json
import re
from typing import Dict, Any, List, Optional, Tuple, Union
from zipfile import ZipFile
from xml.etree import ElementTree as ET


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def _read_paragraphs_from_docx(docx_path: str) -> List[str]:
    """
    DOCX を直接 unzip して word/document.xml から段落テキストを抽出する。
    python-docx よりプレーンテキストの取得が高速で、スタイル差異にも左右されにくい。
    """
    with ZipFile(docx_path) as z:
        xml = z.read("word/document.xml")

    root = ET.fromstring(xml)
    paras: List[str] = []

    for p in root.findall(".//w:body/w:p", NS):
        texts = [t.text for t in p.findall(".//w:t", NS) if t.text]
        if not texts:
            continue
        para = "".join(texts)
        if para.strip():
            paras.append(para)
    return paras


def _detect_results_chapter(paras: List[str]) -> Optional[str]:
    """
    「◯.実験結果」の行から章番号を推定する。
    見つからない場合は None を返し、章番号によるフィルタは行わない。
    """
    chapter_pattern = re.compile(r"^(\d+)\.")
    for para in paras:
        m = chapter_pattern.match(para)
        if m and "実験結果" in para:
            return m.group(1)
    return None


def _parse_section_number(para: str) -> Optional[str]:
    """
    先頭の「1.1」「5.2」などの節番号を返す。
    """
    m = re.match(r"^(\d+\.\d+)", para)
    if m:
        return m.group(1)
    return None


def _parse_sub_number(para: str) -> Optional[str]:
    """
    先頭の「(1-1)」「（1-2）」などの小項目番号を返す。
    全角括弧も許容する。
    """
    m = re.match(r"^[\(\（](\d+-\d+)[\)\）]", para)
    if m:
        return m.group(1)
    return None


def _match_table(para: str) -> Optional[Tuple[str, str]]:
    """
    表のラベル・キャプションを抽出する。
    例: 「表1.1.1　反転増幅回路における…」
        「表 1.1.1 反転増幅回路における…」
    """
    m = re.match(r"^(表\s*\d+\.\d+(?:\.\d+)?)(.+)", para)
    if not m:
        return None
    label = m.group(1).replace(" ", "")
    caption = m.group(2).strip()
    return label, caption


def _match_figure(para: str) -> Optional[Tuple[str, str]]:
    """
    図のラベル・キャプションを抽出する。
    例: 「図1.1.1　〜」「図 1.6.3 〜」
    """
    m = re.match(r"^(図\s*\d+\.\d+(?:\.\d+)?)(.+)", para)
    if not m:
        return None
    label = m.group(1).replace(" ", "")
    caption = m.group(2).strip()
    return label, caption


def _sort_key_for_experiment(key: Union[str, Tuple[str, Optional[str]]]) -> Tuple[int, int, int, int]:
    """
    experiments dict のキー（節 or (節, 小項目)）を安定ソートするためのキー。
    """
    if isinstance(key, str):
        section = key
        sub = None
    else:
        section, sub = key

    sec_main, sec_sub = section.split(".")[:2]
    sec_main_i = int(sec_main)
    sec_sub_i = int(sec_sub)

    sub_main_i = 0
    sub_sub_i = 0
    if sub:
        parts = sub.split("-")
        if parts and parts[0].isdigit():
            sub_main_i = int(parts[0])
        if len(parts) > 1 and parts[1].isdigit():
            sub_sub_i = int(parts[1])

    # 節 → 小項目(大) → 小項目(小) の順
    return (sec_main_i, sec_sub_i, sub_main_i, sub_sub_i)


def extract_experiments_from_docx(docx_path: str) -> Dict[str, Any]:
    """
    1本の過去レポート DOCX から、実験結果章の「experiments 配列」を抽出する。

    出力形式（例）:
    {
      "chapter": 1,
      "experiments": [
        {
          "section": "1.1",
          "idx": 1,
          "subidx": 1,
          "name": "(1-1)　入力電圧と出力電圧の関係",
          "tables": [{ "label": "表1.1.1", "caption": "…" }],
          "figures": [{ "label": "図1.1.1", "caption": "…" }]
        },
        ...
      ]
    }
    """
    paras = _read_paragraphs_from_docx(docx_path)
    chapter_str = _detect_results_chapter(paras)

    experiments: Dict[Union[str, Tuple[str, Optional[str]]], Dict[str, Any]] = {}
    current_section: Optional[str] = None
    current_sub: Optional[str] = None

    def ensure_experiment(
        key: Union[str, Tuple[str, Optional[str]]],
        section: str,
        sub: Optional[str],
        title: Optional[str] = None,
    ) -> Dict[str, Any]:
        ex = experiments.get(key)
        if not ex:
            ex = {
                "section": section,
                "sub": sub,
                "name": title or "",
                "tables": [],
                "figures": [],
            }
            experiments[key] = ex
        else:
            if title and not ex.get("name"):
                ex["name"] = title
        return ex

    for para in paras:
        # 節番号 1.1, 1.2 ... を検出
        section = _parse_section_number(para)
        if section:
            # 「◯.実験結果」が検出できていれば、その章以外の節はスキップ
            if chapter_str is not None and section.split(".")[0] != chapter_str:
                # 実験結果章を抜けたとみなしてループ終了
                current_section = None
                current_sub = None
                break
            current_section = section
            current_sub = None
            ensure_experiment(section, section, None, para)
            continue

        # 小項目 (1-1), (2-1) ... を検出
        sub = _parse_sub_number(para)
        if sub and current_section:
            current_sub = sub
            key = (current_section, current_sub)
            ensure_experiment(key, current_section, current_sub, para)
            continue

        if not current_section:
            # 実験節の外は無視
            continue

        # 表
        t = _match_table(para)
        if t:
            label, caption = t
            key = (current_section, current_sub) if current_sub else current_section
            ex = ensure_experiment(key, current_section, current_sub)
            ex["tables"].append({"label": label, "caption": caption})
            continue

        # 図
        f = _match_figure(para)
        if f:
            label, caption = f
            key = (current_section, current_sub) if current_sub else current_section
            ex = ensure_experiment(key, current_section, current_sub)
            ex["figures"].append({"label": label, "caption": caption})
            continue

    # experiments dict → ソートされた配列に変換しつつ idx / subidx を付与
    experiments_list: List[Dict[str, Any]] = []
    if not experiments:
        return {"chapter": int(chapter_str) if chapter_str else None, "experiments": experiments_list}

    sorted_keys = sorted(experiments.keys(), key=_sort_key_for_experiment)

    # 節ごとに idx を採番 (1, 2, 3, ...)
    section_to_idx: Dict[str, int] = {}
    next_idx = 1
    for key in sorted_keys:
        if isinstance(key, str):
            section = key
        else:
            section = key[0]
        if section not in section_to_idx:
            section_to_idx[section] = next_idx
            next_idx += 1

    for key in sorted_keys:
        ex = experiments[key]
        section = ex["section"]
        sub = ex.get("sub")

        idx = section_to_idx.get(section, 0)
        subidx: Optional[int] = None
        if sub:
            main = sub.split("-")[0]
            if main.isdigit():
                subidx = int(main)

        experiments_list.append(
            {
                "section": section,
                "idx": idx,
                "subidx": subidx,
                "name": ex.get("name", ""),
                "tables": ex.get("tables", []),
                "figures": ex.get("figures", []),
            }
        )

    return {"chapter": int(chapter_str) if chapter_str else None, "experiments": experiments_list}


def _process_path(path: str) -> Dict[str, Any]:
    """
    ファイル or ディレクトリを受け取り、結果 JSON を返す。
    - DOCX ファイル 1本 → そのまま extract_experiments_from_docx の結果
    - ディレクトリ       → 直下の *.docx をすべて処理した {filename: result} マップ
    """
    if os.path.isdir(path):
        results: Dict[str, Any] = {}
        for name in sorted(os.listdir(path)):
            if not name.lower().endswith(".docx"):
                continue
            full = os.path.join(path, name)
            results[name] = extract_experiments_from_docx(full)
        return results
    else:
        return extract_experiments_from_docx(path)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 extract_experiments_from_docx.py <docx_path or directory>", file=sys.stderr)
        sys.exit(1)

    target = sys.argv[1]
    result = _process_path(target)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
