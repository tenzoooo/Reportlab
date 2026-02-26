import sys
import os
import asyncio

# プロジェクトのルートをパスに追加
sys.path.append(os.path.join(os.getcwd(), "update_UI", "report_backend"))

from graph.nodes.past_report_hints import past_report_hints
from graph.state import AgentState, PastReportData, MethodNumberEvidence
from core.storage import Storage
from llm.client import LLMClient

# モックストレージ
class MockStorage(Storage):
    def __init__(self, file_map):
        self.file_map = file_map

    def get_bytes(self, key: str) -> bytes:
        if key in self.file_map:
            with open(self.file_map[key], "rb") as f:
                return f.read()
        raise FileNotFoundError(f"Key {key} not found in mock storage")

# ダミーLLM（CレイヤはLLMを使わないが引数に必要）
class MockLLM(LLMClient):
    def __init__(self):
        pass

def run_test():
    # 1. テストデータの準備
    docx_path = "定義書一覧/4319013_梅澤ひかる_OPアンプの実験_2.docx"
    pdf_path = "update_UI/test.pdf"
    
    print(f"Testing with file: {docx_path}")

    # ストレージにファイルを登録
    storage = MockStorage({
        "past_report_1.docx": docx_path,
        "past_report_2.pdf": pdf_path
    })

    # 2. Stateの初期化
    from graph.state import JobMeta
    state = AgentState(
        job_meta=JobMeta(
            job_id="test_job",
            run_id="test_run",
            user_id="test_user",
            session_id="test_session"
        )
    )
    
    # 過去レポート情報をセット
    state.past_reports = [
        PastReportData(
            report_id="rep_001",
            filename="report.docx",
            storage_key="past_report_1.docx"
        ),
        # PastReportData(
        #     report_id="rep_002",
        #     filename="test.pdf",
        #     storage_key="past_report_2.pdf"
        # )
    ]

    # Bレイヤで抽出されたはずの「実験タイトル」をダミーでセット
    # これが過去レポート内のセクション名とマッチングされる
    state.pdf.method_numbers = [
        MethodNumberEvidence(exp_key="4.1", title="反転増幅回路", heading_line="", page=1, line_index=1, method_id="m1", global_index=10),
        MethodNumberEvidence(exp_key="4.2", title="非反転増幅回路", heading_line="", page=2, line_index=1, method_id="m2", global_index=20),
        MethodNumberEvidence(exp_key="4.3", title="周波数特性", heading_line="", page=3, line_index=1, method_id="m3", global_index=30),
    ]

    # 3. Cレイヤ実行
    print("Running C-Layer (past_report_hints)...")
    try:
        new_state = past_report_hints(state, storage=storage, llm=MockLLM())
    except Exception as e:
        print(f"Error during execution: {e}")
        import traceback
        traceback.print_exc()
        return

    # 4. 結果表示
    print("\n=== Result ===")
    for report in new_state.past_reports:
        print(f"Report: {report.filename} (Error: {report.hints_error})")
        if not report.hints:
            print("  No hints found.")
        for hint in report.hints:
            print(f"  - Experiment Match: {hint.name}")
            print(f"    Tables Count    : {hint.tables_count}")
            print(f"    Graphs Count    : {hint.graphs_count}")
            print("-" * 20)

if __name__ == "__main__":
    run_test()
