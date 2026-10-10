#input_type_name: FetchInput
#output_type_name: FetchResult
#function_name: fetch_items

"""Fetch new items for each source the person follows, and store them as `pending`.

Each `sources` row carries its own search terms in `where`, so nothing here is
specific to a field. Two fetcher types run in this function:

- `papers`: `where` = {"pubmed": "<PubMed query>", "europepmc": "<Europe PMC query>",
  "preprints": "<terms for medRxiv/bioRxiv, through Europe PMC>",
  "clinicaltrials": "<ClinicalTrials.gov terms>", "arxiv": "<arXiv query>"}.
  Any subset; a missing key is skipped.
- `feeds`: `where` = {"feeds": ["https://…/rss", …], "google_news": ["query", …],
  "region": "US", "language": "en"}.

`web` sources are skipped: the screener agent finds those with web search.
Every fetcher is best-effort: one that fails is recorded on the source row and the
others carry on. An item already in `source_items` (same `external_id`) is skipped,
so re-running is safe. Nothing is judged here: the screener decides what to keep.
"""

import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote_plus

import httpx
from lemma_sdk import FunctionContext
from pydantic import BaseModel

UA = "Mozilla/5.0 (compatible; content-manager/1.0)"
NCBI = {"tool": "content_manager"}


class FetchInput(BaseModel):
    source_ids: list[str] | None = None
    days: int = 7
    max_per_source: int = 30


class FetchResult(BaseModel):
    sources: int
    found: int
    new: int
    pending: int
    by_source: dict[str, dict[str, Any]]


def _iso(value: Any) -> str | None:
    if value in (None, ""):
        return None
    value = str(value).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return f"{value}T00:00:00+00:00"
    if re.match(r"^\d{4}-\d{2}$", value):
        return f"{value}-01T00:00:00+00:00"
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except Exception:
        pass
    try:
        return parsedate_to_datetime(value).astimezone(timezone.utc).isoformat()
    except Exception:
        return None


def _plain(html: str | None, limit: int = 6000) -> str:
    t = re.sub(r"<[^>]+>", " ", html or "")
    return re.sub(r"\s+", " ", t).strip()[:limit]


def _text(el: ET.Element | None) -> str | None:
    if el is None:
        return None
    return " ".join("".join(el.itertext()).split()) or None


# ---------- papers ----------

def pubmed(client: httpx.Client, query: str, days: int, limit: int) -> list[dict]:
    search = client.get(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
        params={"db": "pubmed", "term": query, "retmode": "json", "retmax": limit, "sort": "pub+date",
                "datetype": "edat", "reldate": days, **NCBI},
    )
    search.raise_for_status()
    ids = search.json().get("esearchresult", {}).get("idlist", [])
    if not ids:
        return []
    time.sleep(0.4)
    fetched = client.get(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
        params={"db": "pubmed", "id": ",".join(ids), "retmode": "xml", **NCBI},
    )
    fetched.raise_for_status()
    months = {m: f"{i:02d}" for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
    out = []
    for article in ET.fromstring(fetched.text).findall(".//PubmedArticle"):
        pmid = article.findtext(".//PMID")
        abstract = " ".join(p for p in (_text(n) for n in article.findall(".//Abstract/AbstractText")) if p)
        if not pmid or not abstract:
            continue  # nothing to judge without an abstract
        published = None
        for path in (".//ArticleDate", ".//JournalIssue/PubDate"):
            node = article.find(path)
            if node is not None and node.findtext("Year"):
                month = node.findtext("Month") or "01"
                month = months.get(month[:3].lower(), month)
                day = node.findtext("Day") or "01"
                if month.isdigit():
                    published = _iso(f"{node.findtext('Year')}-{month.zfill(2)}-{day.zfill(2) if day.isdigit() else '01'}")
                    break
        authors = []
        for a in article.findall(".//AuthorList/Author"):
            name = a.findtext("CollectiveName") or " ".join(p for p in (a.findtext("ForeName"), a.findtext("LastName")) if p)
            if name:
                authors.append(name)
        out.append({
            "external_id": f"pubmed:{pmid}", "title": _text(article.find(".//ArticleTitle")),
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/", "publisher": article.findtext(".//Journal/Title"),
            "authors": authors[:12], "published_at": published, "excerpt": abstract,
        })
    return out


def europepmc(client: httpx.Client, query: str, days: int, limit: int, preprints_only: bool) -> list[dict]:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days)
    q = f"({query}) AND FIRST_PDATE:[{start.isoformat()} TO {end.isoformat()}]"
    if preprints_only:
        q = "SRC:PPR AND " + q
    r = client.get(
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
        # No `sort` parameter: Europe PMC answers 503 to it. The date window bounds the results.
        params={"query": q, "format": "json", "resultType": "core", "pageSize": min(100, limit * 3)},
    )
    r.raise_for_status()
    out = []
    for p in (r.json().get("resultList") or {}).get("result") or []:
        abstract = p.get("abstractText")
        if not abstract or not p.get("title"):
            continue
        doi = p.get("doi")
        server = ((p.get("bookOrReportDetails") or {}).get("publisher") or "").strip()
        journal = ((p.get("journalInfo") or {}).get("journal") or {}).get("title")
        publisher = f"{server} preprint" if p.get("source") == "PPR" and server else journal or server or p.get("source")
        ext = f"doi:{doi.lower()}" if doi else f"epmc:{p.get('source')}:{p.get('id')}"
        out.append({
            "external_id": ext, "title": _plain(p.get("title"), 500),
            "url": f"https://doi.org/{doi}" if doi else f"https://europepmc.org/article/{p.get('source')}/{p.get('id')}",
            "publisher": publisher, "authors": [n.strip() for n in (p.get("authorString") or "").rstrip(".").split(",") if n.strip()][:12],
            "published_at": _iso(p.get("firstPublicationDate")), "excerpt": _plain(abstract),
        })
        if len(out) >= limit:
            break
    return out


def clinicaltrials(client: httpx.Client, query: str, days: int, limit: int) -> list[dict]:
    r = client.get(
        "https://clinicaltrials.gov/api/v2/studies",
        params={"format": "json", "query.term": query, "pageSize": min(limit * 3, 100), "sort": "LastUpdatePostDate:desc"},
    )
    r.raise_for_status()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date()
    out = []
    for study in r.json().get("studies", []):
        p = study.get("protocolSection", {})
        ident, status = p.get("identificationModule", {}), p.get("statusModule", {})
        nct = ident.get("nctId")
        date = _iso((status.get("lastUpdatePostDateStruct") or {}).get("date") or (status.get("studyFirstPostDateStruct") or {}).get("date"))
        summary = (p.get("descriptionModule") or {}).get("briefSummary")
        if not nct or not date or not summary or datetime.fromisoformat(date).date() < cutoff:
            continue
        design = p.get("designModule", {})
        out.append({
            "external_id": f"nct:{nct}", "title": ident.get("briefTitle") or ident.get("officialTitle"),
            "url": f"https://clinicaltrials.gov/study/{nct}", "publisher": "ClinicalTrials.gov registration",
            "authors": [], "published_at": date,
            "excerpt": f"{summary}\n\nStatus: {status.get('overallStatus')}. Type: {design.get('studyType')}. "
                       f"Conditions: {', '.join((p.get('conditionsModule') or {}).get('conditions') or [])}.",
        })
        if len(out) >= limit:
            break
    return out


def arxiv(client: httpx.Client, query: str, days: int, limit: int) -> list[dict]:
    r = client.get(
        "https://export.arxiv.org/api/query",
        params={"search_query": query, "sortBy": "submittedDate", "sortOrder": "descending", "max_results": min(limit * 2, 100)},
    )
    r.raise_for_status()
    ns = {"a": "http://www.w3.org/2005/Atom"}
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    for e in ET.fromstring(r.text).findall("a:entry", ns):
        published = _iso(e.findtext("a:published", default="", namespaces=ns))
        if published and datetime.fromisoformat(published) < cutoff:
            continue
        aid = (e.findtext("a:id", default="", namespaces=ns) or "").rsplit("/abs/", 1)[-1]
        aid = re.sub(r"v\d+$", "", aid)
        if not aid:
            continue
        out.append({
            "external_id": f"arxiv:{aid}", "title": _plain(e.findtext("a:title", default="", namespaces=ns), 500),
            "url": f"https://arxiv.org/abs/{aid}", "publisher": "arXiv preprint",
            "authors": [_text(a.find("a:name", ns)) for a in e.findall("a:author", ns)][:12],
            "published_at": published, "excerpt": _plain(e.findtext("a:summary", default="", namespaces=ns)),
        })
        if len(out) >= limit:
            break
    return out


# ---------- feeds ----------

def _parse_feed(xml: str) -> list[dict]:
    root = ET.fromstring(xml)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    items = []
    for e in root.findall(".//a:entry", ns):
        link = next((l.get("href") for l in e.findall("a:link", ns) if l.get("rel") in (None, "alternate")), None)
        items.append({
            "title": _plain(e.findtext("a:title", default="", namespaces=ns), 500), "url": link,
            "author": _plain(e.findtext("a:author/a:name", default="", namespaces=ns), 200),
            "excerpt": _plain(e.findtext("a:summary", default="", namespaces=ns) or e.findtext("a:content", default="", namespaces=ns), 2000),
            "published_at": _iso(e.findtext("a:published", default="", namespaces=ns) or e.findtext("a:updated", default="", namespaces=ns)),
        })
    for i in root.findall(".//item"):
        src = i.find("source")
        items.append({
            "title": _plain(i.findtext("title"), 500), "url": (i.findtext("link") or "").strip(),
            "author": (src.text if src is not None else "") or _plain(i.findtext("{http://purl.org/dc/elements/1.1/}creator"), 200),
            "excerpt": _plain(i.findtext("description"), 2000), "published_at": _iso(i.findtext("pubDate")),
        })
    return [x for x in items if x.get("url") and x.get("title")]


def feed(client: httpx.Client, url: str, days: int, limit: int) -> list[dict]:
    r = client.get(url)
    r.raise_for_status()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    for x in _parse_feed(r.text):
        if x["published_at"] and datetime.fromisoformat(x["published_at"]) < cutoff:
            continue
        out.append({"external_id": "url:" + x["url"].split("#")[0][:280], "title": x["title"], "url": x["url"],
                    "publisher": x.get("author") or None, "authors": [], "published_at": x["published_at"], "excerpt": x["excerpt"]})
        if len(out) >= limit:
            break
    return out


def google_news(client: httpx.Client, query: str, days: int, limit: int, region: str, lang: str) -> list[dict]:
    region, lang = (region or "US").upper(), (lang or "en").lower()
    url = f"https://news.google.com/rss/search?q={quote_plus(query)}+when:{max(1, days)}d&hl={lang}-{region}&gl={region}&ceid={region}:{lang}"
    return feed(client, url, days, limit)


async def fetch_items(ctx: FunctionContext, data: FetchInput) -> FetchResult:
    pod = ctx.pod
    days = max(1, min(data.days, 60))
    limit = max(1, min(data.max_per_source, 60))
    rows = pod.records.list("sources", limit=100, filter=[{"field": "active", "op": "eq", "value": True}]).to_dict()["items"]
    if data.source_ids:
        rows = [s for s in rows if str(s["id"]) in set(data.source_ids)]
    rows = [s for s in rows if s.get("type") in ("papers", "feeds")]
    now = datetime.now(timezone.utc)

    report: dict[str, dict[str, Any]] = {}
    found: list[dict] = []
    with httpx.Client(headers={"User-Agent": UA}, timeout=30, follow_redirects=True) as client:
        for src in rows:
            where = src.get("where") or {}
            rep: dict[str, Any] = {"found": 0}
            jobs: list[tuple[str, Any, tuple]] = []
            if src["type"] == "papers":
                if where.get("pubmed"):
                    jobs.append(("pubmed", pubmed, (where["pubmed"], days, limit)))
                if where.get("europepmc"):
                    jobs.append(("europepmc", europepmc, (where["europepmc"], days, limit, False)))
                if where.get("preprints"):
                    jobs.append(("preprints", europepmc, (where["preprints"], days, max(5, limit // 2), True)))
                if where.get("clinicaltrials"):
                    jobs.append(("clinicaltrials", clinicaltrials, (where["clinicaltrials"], days, max(5, limit // 3))))
                if where.get("arxiv"):
                    jobs.append(("arxiv", arxiv, (where["arxiv"], days, limit)))
            else:
                for u in (where.get("feeds") or [])[:10]:
                    jobs.append((u[:60], feed, (u, days, limit)))
                for q in (where.get("google_news") or [])[:6]:
                    jobs.append((f"news: {q[:40]}", google_news, (q, days, max(5, limit // 2), where.get("region"), where.get("language"))))
            for label, fn, args in jobs:
                try:
                    items = fn(client, *args)
                    for it in items:
                        it["source_id"] = str(src["id"])
                    found.extend(items)
                    rep["found"] += len(items)
                    rep.setdefault("by", {})[label] = len(items)
                except httpx.HTTPStatusError as e:
                    rep.setdefault("errors", []).append(f"{label}: {e.response.status_code}")
                except Exception as e:  # network, parse
                    rep.setdefault("errors", []).append(f"{label}: {str(e)[:120]}")
                time.sleep(0.4)  # be a polite client
            report[src["name"]] = rep

    unique: dict[str, dict] = {}
    for it in found:
        if it.get("title") and it["external_id"] not in unique:
            unique[it["external_id"]] = it
    ids = list(unique)
    have: set[str] = set()
    for i in range(0, len(ids), 100):
        quoted = ",".join("'" + x.replace("'", "''") + "'" for x in ids[i : i + 100])
        have |= {r["external_id"] for r in pod.query(f"select external_id from source_items where external_id in ({quoted})").to_dict()["items"]}
    stamp = now.isoformat()
    new_rows = [
        {k: v for k, v in it.items() if v not in (None, "", [])}
        | {"title": (it["title"] or "")[:500], "excerpt": (it.get("excerpt") or "")[:6000], "status": "pending", "fetched_at": stamp}
        for eid, it in unique.items()
        if eid not in have
    ]
    for i in range(0, len(new_rows), 100):
        pod.records.bulk_create("source_items", new_rows[i : i + 100])
    for src in rows:
        rep = report.get(src["name"], {})
        rep["new"] = sum(1 for r in new_rows if r["source_id"] == str(src["id"]))
        pod.table("sources").update(src["id"], {"last_fetched_at": stamp, "last_fetch": rep})
    pending = pod.query("select count(*) as n from source_items where status = 'pending'").to_dict()["items"][0]["n"]
    return FetchResult(sources=len(rows), found=len(unique), new=len(new_rows), pending=int(pending), by_source=report)
