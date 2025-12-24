from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .errors import StorageError


class Storage(Protocol):
    def put_bytes(self, key: str, data: bytes) -> str: ...
    def get_bytes(self, key: str) -> bytes: ...
    def put_json(self, key: str, data: Any) -> str: ...
    def get_json(self, key: str) -> Any: ...
    def exists(self, key: str) -> bool: ...


@dataclass
class LocalStorage:
    root: Path

    def _path(self, key: str) -> Path:
        safe = key.lstrip("/").replace("..", "__")
        return self.root / safe

    def put_bytes(self, key: str, data: bytes) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return key

    def get_bytes(self, key: str) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise StorageError(f"Missing key: {key}")
        return path.read_bytes()

    def put_json(self, key: str, data: Any) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return key

    def get_json(self, key: str) -> Any:
        path = self._path(key)
        if not path.exists():
            raise StorageError(f"Missing key: {key}")
        return json.loads(path.read_text(encoding="utf-8"))

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


def build_storage(*, backend: str, storage_dir: Path) -> Storage:
    storage_dir.mkdir(parents=True, exist_ok=True)
    if backend == "local":
        return LocalStorage(storage_dir)
    raise StorageError("Supabase storage backend is not implemented yet in this repo")

