# update_mvp_flow

このフォルダは、再定義した本線フロー（A -> B/C -> D-I -> N -> M -> J -> K -> L）の
「使うノード定義」と「グラフ定義」を集約するための専用パッケージ。

## files

- `build_graph_update_mvp_flow.py`
  - 本線のグラフ構築（`build_graph_update_mvp`）
- `nodes.py`
  - 本線で使うノード関数の import 集約
  - `NODE_SOURCE_MAP` でノード名と実装元の対応表を管理

## node order

1. `session_start`
2. `ingest`
3. `normalize_inputs`
4. `classify_assets`
5. `bc_layer_parallel`
6. `map_result_numbers`
7. `normalize_ommlify_formula`
8. `run_d_to_i_per_experiment`
9. `n_build_discussion_summary`
10. `m_compose_footer`
11. `j_merge_payload`
12. `k_compose_markdown`
13. `l_render_docx`
14. `l_emit_outputs`

## hitl route

- `create_hitl_request`
- `wait_for_hitl_response`

