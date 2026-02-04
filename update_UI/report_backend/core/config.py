from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

from .errors import ConfigError


def _strip_quotes(value: str) -> str:
    v = value.strip()
    if len(v) >= 2 and ((v[0] == v[-1] == '"') or (v[0] == v[-1] == "'")):
        return v[1:-1]
    return v


def _load_openai_env_from_dotenv_files() -> None:
    """
    Load selected env vars from update_UI/.env(.local) when they are not set in os.environ.
    We intentionally keep this minimal to avoid surprising side effects from other dotenv values.
    """

    wanted = {
        "OPENAI_API_KEY",
        "OPENAI_MODEL",
        "OPENAI_VISION_MODEL",
        # Quantitative comment mode/prompt (optional)
        "REPORT_AGENT_QUANT_COMMENT_MODE",
        "REPORT_AGENT_QUANT_VISION_PROMPT_PATH",
        "REPORT_AGENT_QUANT_COMMENT_TEMPERATURE",
        # LangSmith / LangChain tracing (optional)
        "LANGSMITH_API_KEY",
        "LANGSMITH_TRACING",
        "LANGSMITH_PROJECT",
        "LANGSMITH_ENDPOINT",
        "LANGCHAIN_API_KEY",
        "LANGCHAIN_TRACING_V2",
        "LANGCHAIN_PROJECT",
        "LANGCHAIN_ENDPOINT",
    }

    update_ui_dir = Path(__file__).resolve().parents[2]
    candidates = [
        update_ui_dir / ".env.local",
        update_ui_dir / ".env",
        Path.cwd() / ".env.local",
        Path.cwd() / ".env",
    ]

    for path in candidates:
        try:
            if not path.exists() or not path.is_file():
                continue
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[len("export ") :].lstrip()

                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if not key or key not in wanted:
                    continue
                if key in os.environ:
                    continue
                os.environ[key] = _strip_quotes(value)
        except Exception:
            continue


def _env(name: str) -> Optional[str]:
    value = os.environ.get(name)
    if value is None:
        return None
    value = value.strip()
    return value if value else None


def _env_bool(name: str, *, truthy: str = "true") -> bool:
    value = _env(name)
    if not value:
        return False
    return value.lower() == truthy


def _env_flag_1(name: str) -> bool:
    return _env(name) == "1"


@dataclass(frozen=True)
class Settings:
    openai_api_key: str
    openai_model: str
    openai_vision_model: str

    enable_image_grouping_with_method_context: bool

    # Compatibility / debug flags
    python_debug: bool
    docx_debug: bool
    enable_dify_debug_log: bool
    use_remote_python: bool

    # Storage
    storage_backend: Literal["local", "supabase"]
    storage_dir: Path

    # Templates
    template_path: Path

    # Supabase (optional)
    supabase_url: Optional[str]
    supabase_service_role_key: Optional[str]

    # Testing / dev
    mock_llm: bool


def load_settings() -> Settings:
    _load_openai_env_from_dotenv_files()
    mock_llm = _env_flag_1("REPORT_AGENT_MOCK_LLM")

    report_backend_dir = Path(__file__).resolve().parents[1]
    update_ui_dir = report_backend_dir.parent

    openai_api_key = _env("OPENAI_API_KEY")
    openai_model = _env("OPENAI_MODEL")
    openai_vision_model = _env("OPENAI_VISION_MODEL") or openai_model

    if not openai_api_key:
        raise ConfigError("OPENAI_API_KEY is required")
    if not openai_model:
        raise ConfigError("OPENAI_MODEL is required")
    if not openai_vision_model:
        raise ConfigError("OPENAI_VISION_MODEL fallback failed (OPENAI_MODEL is missing)")

    enable_image_grouping = _env_bool("ENABLE_IMAGE_GROUPING_WITH_METHOD_CONTEXT")

    python_debug = _env_flag_1("PYTHON_DEBUG")
    docx_debug = _env_flag_1("DOCX_DEBUG")
    enable_dify_debug_log = _env_bool("ENABLE_DIFY_DEBUG_LOG")
    use_remote_python = _env_bool("USE_REMOTE_PYTHON")

    storage_backend = (_env("STORAGE_BACKEND") or "local").lower()
    if storage_backend not in {"local", "supabase"}:
        raise ConfigError("STORAGE_BACKEND must be 'local' or 'supabase'")

    storage_dir_env = _env("REPORT_AGENT_STORAGE_DIR")
    if storage_dir_env:
        storage_dir = Path(storage_dir_env).expanduser()
        if not storage_dir.is_absolute():
            storage_dir = (update_ui_dir / storage_dir).resolve()
    else:
        storage_dir = (report_backend_dir / ".agent_data").resolve()

    template_env = _env("TEMPLATE_PATH")
    if template_env:
        raw_template_path = Path(template_env).expanduser()
        if raw_template_path.is_absolute():
            template_path = raw_template_path
        else:
            candidates = [
                (Path.cwd() / raw_template_path).resolve(),
                (report_backend_dir / raw_template_path).resolve(),
                (update_ui_dir / raw_template_path).resolve(),
            ]
            template_path = candidates[0]
            for c in candidates:
                if c.exists():
                    template_path = c
                    break
    else:
        template_candidates = [
            report_backend_dir / "templates" / "chapter_fixed_docxtpl_ready.docx",
            update_ui_dir / "templates" / "chapter_fixed_docxtpl_ready.docx",
            update_ui_dir / "templates" / "chapter_fixed_jinja.docx",
            update_ui_dir / "templates" / "chapter_fixed.docx",
        ]
        template_path = template_candidates[0].resolve()
        for c in template_candidates:
            if c.exists():
                template_path = c.resolve()
                break

    supabase_url = _env("NEXT_PUBLIC_SUPABASE_URL") or _env("SUPABASE_URL")
    supabase_service_role_key = _env("SUPABASE_SERVICE_ROLE_KEY")

    if storage_backend == "supabase":
        if not supabase_url or not supabase_service_role_key:
            raise ConfigError("Supabase storage selected but NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing")

    # Compatibility-only: log-level mapping can be implemented later.
    if use_remote_python:
        # We keep this for compatibility but do not use it in the new agent.
        pass

    return Settings(
        openai_api_key=openai_api_key,
        openai_model=openai_model,
        openai_vision_model=openai_vision_model,
        enable_image_grouping_with_method_context=enable_image_grouping,
        python_debug=python_debug,
        docx_debug=docx_debug,
        enable_dify_debug_log=enable_dify_debug_log,
        use_remote_python=use_remote_python,
        storage_backend=storage_backend,  # type: ignore[arg-type]
        storage_dir=storage_dir,
        template_path=template_path,
        supabase_url=supabase_url,
        supabase_service_role_key=supabase_service_role_key,
        mock_llm=mock_llm,
    )
