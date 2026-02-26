# MCP Server Starter Kit

Pythonを使用したシンプルなModel Context Protocol (MCP) サーバーの例です。
`fastmcp` ライブラリを使用して、計算機能（足し算・掛け算）をツールとして提供します。

## 1. セットアップ

Python環境が必要です。以下のコマンドで依存ライブラリをインストールしてください。

```bash
pip install fastmcp
```

## 2. 動作確認 (MCP Inspector)

MCPサーバーは通常、Claude Desktopなどのクライアントから呼び出されますが、開発中はブラウザベースのデバッガ「MCP Inspector」を使ってテストするのが便利です。

`npx` (Node.js) が使える場合、以下のコマンドでサーバーをテストできます。

```bash
npx @modelcontextprotocol/inspector python server.py
```

コマンド実行後、ブラウザでInspectorが立ち上がり、定義したツール (`add`, `multiply`) をGUIから実行して試すことができます。

## 3. Claude Desktopでの利用

Claude Desktopアプリ（macOS/Windows）で使用するには、設定ファイル (`~/Library/Application Support/Claude/claude_desktop_config.json`) に以下を追加します：

```json
{
  "mcpServers": {
    "my-demo-server": {
      "command": "/path/to/your/python", 
      "args": ["/absolute/path/to/mcp_starter/server.py"]
    }
  }
}
```
※ `/path/to/your/python` と `/absolute/path/to/...` はご自身の環境に合わせて書き換えてください。

## 4. コードの拡張

`server.py` を編集して、新しいツールを追加してください。

```python
@mcp.tool()
def my_new_tool(param: str) -> str:
    """ツールの説明"""
    return f"Hello {param}!"
```
