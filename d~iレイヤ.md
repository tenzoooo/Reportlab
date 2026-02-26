# 実験パス（ExpPath）

## 目的
- Bレイヤの実験リストから `exp_key` を受け取り、D〜Iレイヤを順に実行して **個々の実験結果JSON** を生成する。

## 入力
- `exp_key`（Bレイヤの `method.items` の順）
- `tmp_state_outputs/b_layer_after_all_steps.json`（基底state）
- `tmp_state_outputs/c_layer_run.json`（過去レポートの見出しヒント）

## 出力（exp_keyごと）
1. `tmp_state_outputs/d_layer_input_<exp_key>.json`
2. `tmp_state_outputs/d_layer_output_<exp_key>.json`
3. `tmp_state_outputs/e_layer_output_<exp_key>.json`
4. `tmp_state_outputs/f_layer_output_<exp_key>.json`
5. `tmp_state_outputs/g_layer_captions_<exp_key>.json`
6. `tmp_state_outputs/g_layer_quant_<exp_key>.json`
7. `tmp_state_outputs/h_layer_output_<exp_key>.json`
8. `tmp_state_outputs/i_layer_output_<exp_key>.json`

## レイヤごとの役割（要約）
- **Dレイヤ**: 実験方法と過去レポートのヒントから、結果に必要な表/図の期待を整理（required_outputs）。
- **Eレイヤ**: Excelシート選定・表範囲決定・列/単位のバインド。
- **Fレイヤ**: 表抽出・グラフ生成・挿入資産の割当。
- **Gレイヤ**: キャプション生成、定量コメント生成（理論式×表）。
- **Hレイヤ**: `method_summary` / `result_description` の生成、表/図ラベル・キャプション整形。
- **Iレイヤ**: Hレイヤ出力を実験ページ用JSONへ整形（`result_page_<exp_key>` 生成）。

## ロジック（実行順）
1. Dレイヤ入力生成（B/C成果物から `exp_key` 1件を抽出）
2. D → E → F → G → H → I を順に実行

## 実装ツール
- `update_UI/report_backend/tools/run_d_to_h_from_b.py`
  - Bレイヤ `method.items` の順に `exp_key` を抽出し、D〜Iを順に実行する。
- 単体ツール
  - `build_d_layer_input.py`
  - `run_d_layer_for_exp.py`
  - `run_e_layer_for_exp.py`
  - `run_f_layer_for_exp.py`
  - `run_g_layer_captions_for_exp.py`
  - `run_g_layer_quant_for_exp.py`
  - `run_h_layer_for_exp.py`
  - `run_i_layer_for_exp.py`
