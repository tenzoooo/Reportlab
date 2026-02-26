import sys
import os

# プロジェクトパスを追加
sys.path.append(os.path.join(os.getcwd(), "update_UI", "report_backend"))

try:
    # ターゲット: graph.update_mvp.build_graph_update_mvp
    from graph.update_mvp.build_graph_update_mvp import build_graph_update_mvp
    from unittest.mock import MagicMock

    # モックの依存関係を作成
    mock_storage = MagicMock()
    mock_llm = MagicMock()
    mock_llm.text_model = "test-model"
    mock_llm.vision_model = "test-vision-model"

    # グラフを構築
    print("Building graph (update_mvp)...")
    graph = build_graph_update_mvp(
        storage=mock_storage,
        llm=mock_llm
    )

    # グラフを描画 (Mermaid Text)
    output_path = "graph_update_mvp.mmd"
    print(f"Generating visualization to {output_path}...")
    
    try:
        mermaid_text = graph.get_graph().draw_mermaid()
        with open(output_path, "w") as f:
            f.write(mermaid_text)
        print(f"SUCCESS: Mermaid definition saved to: {os.path.abspath(output_path)}")
        
    except Exception as e:
        print(f"Failed to generate Mermaid: {e}")

except ImportError as e:
    import traceback
    traceback.print_exc()
    print(f"ImportError: {e}")
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"An error occurred: {e}")
