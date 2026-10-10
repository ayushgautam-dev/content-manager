#input_type_name: ScanInput
#output_type_name: ScanResult
#function_name: scan_sources

"""Fetch what's new for each topic from the sources a server can reach.

Google News (RSS, in the region and language set on each topic) and Reddit (RSS: the JSON API refuses server
IPs, and RSS rate-limits fast, so requests are spaced and retried once). X and
LinkedIn have no free server route; the scout covers them with web search.
Every source is best-effort: one that fails is recorded on the topic and the
others carry on.
"""

import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote_plus

import httpx
from lemma_sdk import FunctionContext
from pydantic import BaseModel

UA = "Mozilla/5.0 (compatible; content-manager-radar/1.0)"
PER_QUERY = 12


class ScanInput(BaseModel):
    topic_ids: list[str] | None = None
    hours: int = 48


class ScanResult(BaseModel):
    topics: int
    found: int
    new: int
    by_source: dict[str, dict[str, Any]]


def _iso(ts: Any) -> str | None:
    if ts in (None, ""):
        return None
    try:
        from email.utils import parsedate_to_datetime

        try:
            return parsedate_to_datetime(str(ts)).astimezone(timezone.utc).isoformat()
        except Exception:
            return datetime.fromisoformat(str(ts).replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def _text(html: str | None, limit: int = 600) -> str:
    t = re.sub(r"<[^>]+>", " ", html or "")
    t = re.sub(r"\s+", " ", t).strip()
    return t[:limit]


def _list(v: Any) -> list[str]:
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str) and v.strip().startswith("["):
        import json

        try:
            return _list(json.loads(v))
        except Exception:
            return []
    return []


def _atom_or_rss(xml: str) -> list[dict]:
    root = ET.fromstring(xml)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    items = []
    for e in root.findall(".//a:entry", ns):
        link = e.find("a:link", ns)
        items.append({
            "title": (e.findtext("a:title", default="", namespaces=ns) or "").strip(),
            "url": link.get("href") if link is not None else None,
            "author": (e.findtext("a:author/a:name", default="", namespaces=ns) or "").strip(),
            "excerpt": _text(e.findtext("a:content", default="", namespaces=ns)),
            "published_at": _iso(e.findtext("a:published", default="", namespaces=ns) or e.findtext("a:updated", default="", namespaces=ns)),
        })
    for i in root.findall(".//item"):
        src = i.find("source")
        items.append({
            "title": (i.findtext("title") or "").strip(),
            "url": (i.findtext("link") or "").strip(),
            "author": (src.text if src is not None else "") or "",
            "excerpt": _text(i.findtext("description")),
            "published_at": _iso(i.findtext("pubDate")),
        })
    return [x for x in items if x.get("url")]


def reddit(client: httpx.Client, sub: str) -> list[dict]:
    url = f"https://www.reddit.com/r/{sub}/top/.rss"
    r = client.get(url, params={"t": "day", "limit": PER_QUERY})
    if r.status_code == 429:
        time.sleep(6)
        r = client.get(url, params={"t": "day", "limit": PER_QUERY})
    r.raise_for_status()
    time.sleep(2.5)
    return [{**x, "source": "reddit", "raw": {"subreddit": sub}} for x in _atom_or_rss(r.text)[:PER_QUERY]]


def news(client: httpx.Client, kw: str, hours: int, region: str, lang: str) -> list[dict]:
    days = max(1, round(hours / 24))
    region = (region or "US").upper()
    lang = (lang or "en").lower()
    r = client.get(f"https://news.google.com/rss/search?q={quote_plus(kw)}+when:{days}d&hl={lang}-{region}&gl={region}&ceid={region}:{lang}")
    r.raise_for_status()
    return [{**x, "source": "news"} for x in _atom_or_rss(r.text)[:PER_QUERY]]


async def scan_sources(ctx: FunctionContext, data: ScanInput) -> ScanResult:
    pod = ctx.pod
    topics = pod.records.list("topics", limit=100, filter=[{"field": "active", "op": "eq", "value": True}]).to_dict()["items"]
    if data.topic_ids:
        topics = [t for t in topics if str(t["id"]) in set(data.topic_ids)]
    now = datetime.now(timezone.utc)

    totals: dict[str, dict[str, Any]] = {}
    found_all: list[dict] = []
    with httpx.Client(headers={"User-Agent": UA}, timeout=15, follow_redirects=True) as client:
        for t in topics:
            kws = _list(t.get("keywords"))[:4]
            report: dict[str, dict[str, Any]] = {}

            def run(source: str, fn, *args):
                rep = report.setdefault(source, {"found": 0})
                try:
                    items = fn(client, *args)
                    for it in items:
                        it["topic_id"] = str(t["id"])
                    found_all.extend(items)
                    rep["found"] += len(items)
                except httpx.HTTPStatusError as e:
                    rep["error"] = f"{e.response.status_code} from {source}"
                except Exception as e:  # network, parse
                    rep["error"] = str(e)[:160]
                time.sleep(0.4)  # be a polite client

            if t.get("news", True):
                for kw in kws:
                    run("news", news, kw, data.hours, t.get("region") or "US", t.get("language") or "en")
            for sub in _list(t.get("reddit"))[:6]:
                if report.get("reddit", {}).get("error", "").startswith(("403", "429")):
                    break  # blocked or rate-limited: stop asking this run
                run("reddit", reddit, sub.removeprefix("r/"))

            pod.table("topics").update(t["id"], {"last_scanned_at": now.isoformat(), "last_scan": report})
            for s, rep in report.items():
                agg = totals.setdefault(s, {"found": 0, "errors": []})
                agg["found"] += rep.get("found", 0)
                if rep.get("error"):
                    agg["errors"].append(f"{t['name']}: {rep['error']}")

    # De-duplicate within this run and against what we already have.
    unique: dict[str, dict] = {}
    for it in found_all:
        url = (it.get("url") or "").split("#")[0]
        if url and url not in unique:
            it["url"] = url[:600]
            unique[url] = it
    new: list[dict] = []
    urls = list(unique)
    for i in range(0, len(urls), 100):
        chunk = urls[i : i + 100]
        quoted = ",".join("'" + u.replace("'", "''") + "'" for u in chunk)
        have = {r["url"] for r in pod.query(f"select url from signals where url in ({quoted})").to_dict()["items"]}
        new.extend(unique[u] for u in chunk if u not in have)
    rows = [
        {k: v for k, v in it.items() if k in ("topic_id", "source", "url", "title", "author", "excerpt", "published_at", "raw") and v not in (None, "")}
        | {"status": "new", "title": (it.get("title") or "")[:500], "excerpt": (it.get("excerpt") or "")[:2000]}
        for it in new
    ]
    for i in range(0, len(rows), 200):
        pod.records.bulk_create("signals", rows[i : i + 200])
    for s in totals:
        totals[s]["new"] = sum(1 for r in rows if r["source"] == s)
    return ScanResult(topics=len(topics), found=len(unique), new=len(rows), by_source=totals)
