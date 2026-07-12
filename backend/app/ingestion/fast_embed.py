"""Fast local embeddings for bulk exam uploads (no external API latency)."""

from __future__ import annotations

import hashlib
import math
import re

_TOKEN_RE = re.compile(r"[a-z0-9_]+")


def fast_embed(text: str, dims: int = 96) -> list[float]:
    """Deterministic bag-of-tokens embedding — instant, good enough for keyword RAG."""
    vec = [0.0] * dims
    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        return [((digest[i % len(digest)] / 255.0) * 2 - 1) for i in range(dims)]

    for token in tokens:
        h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
        idx = h % dims
        sign = 1.0 if (h >> 8) & 1 else -1.0
        vec[idx] += sign

    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]
