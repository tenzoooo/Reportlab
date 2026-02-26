from fastmcp import FastMCP

# MCPサーバーの定義
mcp = FastMCP("Demo Calculator Server")

@mcp.tool()
def add(a: int, b: int) -> int:
    """2つの数値を足し算します"""
    return a + b

@mcp.tool()
def multiply(a: int, b: int) -> int:
    """2つの数値を掛け算します"""
    return a * b

@mcp.resource("config://settings")
def get_config() -> str:
    """設定情報を返します（リソースの例）"""
    return "This is a demo configuration."

if __name__ == "__main__":
    # stdioモードで実行（MCPクライアントと通信するための標準的な方法）
    mcp.run()
