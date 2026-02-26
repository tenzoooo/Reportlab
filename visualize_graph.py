import sys
import os

# プロジェクトパスを追加
sys.path.append(os.path.join(os.getcwd(), "update_UI", "report_backend"))

try:
    from graph.build_graph import build_graph
    from unittest.mock import MagicMock

    # モックの依存関係を作成
    mock_storage = MagicMock()
    mock_llm = MagicMock()
    template_path = "dummy_template.docx"

    # グラフを構築 (MVPモード)
    print("Building graph in MVP mode...")
    graph = build_graph(
        storage=mock_storage,
        llm=mock_llm,
        template_path=template_path,
        mode="mvp"
    )

    # グラフを描画 (Mermaid PNG)
    output_path = "graph_mvp.png"
    print(f"Generating visualization to {output_path}...")
    
    try:
        # LangGraph 0.1.x / 0.2.x の API
        png_data = graph.get_graph().draw_mermaid_png()
        
        with open(output_path, "wb") as f:
            f.write(png_data)
        
        print(f"SUCCESS: Graph visualization saved to: {os.path.abspath(output_path)}")
        
    except Exception as e:
        print(f"Failed to generate PNG directly: {e}")
        # フォールバック: Mermaidテキストを出力
        try:
            mermaid_text = graph.get_graph().draw_mermaid()
            print("\nMermaid Definition:")
            print(mermaid_text)
        except AttributeError:
             print("Could not retrieve Mermaid definition.")

except ImportError as e:
    print(f"ImportError: {e}")
    print("Please ensure 'langgraph' and project dependencies are installed.")
except Exception as e:
    import traceback
    traceback.print_exc()
    print(f"An error occurred: {e}")
