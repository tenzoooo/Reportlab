from __future__ import annotations

from fastapi import FastAPI

from app.api.routes_jobs import build_router
from core.config import load_settings
from core.storage import build_storage
from llm.client import LLMClient


def create_app() -> FastAPI:
    settings = load_settings()
    storage = build_storage(backend=settings.storage_backend, storage_dir=settings.storage_dir)
    llm = LLMClient(settings)

    app = FastAPI(title="Report Agent Backend", version="0.1.0")
    app.include_router(build_router(storage=storage, llm=llm, template_path=str(settings.template_path)))
    return app


app = create_app()

