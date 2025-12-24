from __future__ import annotations

import random
import time
from collections.abc import Callable
from typing import TypeVar


T = TypeVar("T")


def retry(
    func: Callable[[], T],
    *,
    attempts: int,
    base_delay_s: float = 0.5,
    max_delay_s: float = 8.0,
    jitter_s: float = 0.2,
    retry_on: tuple[type[Exception], ...] = (Exception,),
) -> T:
    last_exc: Exception | None = None
    for i in range(attempts):
        try:
            return func()
        except retry_on as exc:  # type: ignore[misc]
            last_exc = exc
            if i >= attempts - 1:
                break
            delay = min(max_delay_s, base_delay_s * (2**i))
            delay += random.uniform(0, jitter_s)
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc

