from typing import Optional
"""Optional, read-only, allowlisted media-link lookup for an existing FastAPI app.

Only use with legally sourced, licensed, consenting-adult media and an independently
implemented, jurisdiction-appropriate age-assurance gate. This module does not
crawl websites, bypass age gates, or verify rights/consent on its own.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Request, APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

router = APIRouter(prefix="/media", tags=["media"])
CATALOG_PATH = Path(os.environ.get("MEDIA_CATALOG_PATH", "media_catalog.json"))

class MediaResult(BaseModel):
    title: str
    url: str
    tags: list[str] = []
    source: str


def require_verified_adult(
    request: Request,
    authorization: Optional[str] = Header(default=None)
) -> None:
    if (
        os.getenv("LOCAL_MEDIA_TEST") == "1"
        and os.getenv("APP_ENV") == "development"
        and request.client is not None
        and request.client.host in ("127.0.0.1", "::1")
        and request.url.hostname in ("127.0.0.1", "localhost")
    ):
        return

    """Replace this dependency with your actual server-side age-assurance check.

    Fails closed until replaced. A simple self-attested `age >= 18` or a
    client-generated header is not sufficient age assurance.
    """
    raise HTTPException(status_code=403, detail="Age assurance integration required")


def load_catalog() -> list[dict]:
    if not CATALOG_PATH.is_file():
        return []
    items = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(items, list):
        raise ValueError("Catalog must be an array")
    return items


def is_allowed(item: dict) -> bool:
    url = item.get("url", "")
    p = urlparse(url)
    domains = {s.strip().lower() for s in os.environ.get("MEDIA_ALLOWED_DOMAINS", "").split(",") if s.strip()}
    hostname = (p.hostname or "").lower()
    return (
        p.scheme == "https" and hostname in domains and not p.username and not p.password
        and item.get("licensed") is True and item.get("consenting_adults") is True
        and item.get("approved") is True and bool(item.get("title"))
    )


@router.get("/search", response_model=list[MediaResult])
def search_media(
    q: str = Query(min_length=2, max_length=100),
    _: None = Depends(require_verified_adult),
):
    keywords = [w for w in re.findall(r"\w+", q.casefold()) if len(w) >= 2]
    results = []
    for item in load_catalog():
        if not isinstance(item, dict) or not is_allowed(item):
            continue
        haystack = " ".join([str(item.get("title", "")), *map(str, item.get("tags", []))]).casefold()
        if keywords and all(w in haystack for w in keywords):
            results.append(MediaResult(title=item["title"], url=item["url"], tags=item.get("tags", []), source=urlparse(item["url"]).hostname or ""))
        if len(results) >= 10:
            break
    return results
