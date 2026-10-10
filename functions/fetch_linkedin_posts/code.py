#input_type_name: PostsInput
#output_type_name: PostsResult
#function_name: fetch_linkedin_posts

"""Fetch a person's own recent LinkedIn posts, for building their voice notes.

LinkedIn's own API cannot list a member's past posts, so this goes through a
scraper the person pays for with their own key. The key never passes through
here: it lives in a Lemma connection (an OpenAPI connector account), and
`pod.connectors.execute` uses the invoking person's own account.

Providers (the name is the connection's auth-config name in Lemma):
- `monid`: Monid's API (spec https://monid.ai/openapi.json) running the
  `harvestapi/linkedin-profile-posts` scraper. About $0.0045 a post.
- `apify`: Apify's API (spec https://docs.apify.com/api/openapi.json) running the
  same scraper directly (`harvestapi~linkedin-profile-posts`). Apify bills it from
  the account's credits; new accounts get free monthly credits.

`estimate_only: true` calls nothing and returns the most the run could cost.
Only posts written by the profile itself are kept; reposts of other people's
posts are dropped, quote-reposts are kept with their own text only.
"""

import json
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from lemma_sdk import FunctionContext
from pydantic import BaseModel

ACTOR = "harvestapi/linkedin-profile-posts"
PRICE_PER_POST = {"monid": 0.0045, "apify": 0.004}
HARD_CAP = 150  # never fetch more than this many posts in one run


class PostsInput(BaseModel):
    handle: str
    profile_url: str
    months: int = 6
    max_posts: int = 60
    provider: str = "monid"
    estimate_only: bool = False
    save_images: bool = True


class PostsResult(BaseModel):
    provider: str
    estimate_only: bool
    max_cost_usd: float
    posts: int = 0
    first_date: str | None = None
    last_date: str | None = None
    images_saved: int = 0
    cost_usd: float | None = None
    files: list[str] = []
    note: str | None = None


def _limit(months: int) -> str:
    """The scraper's own time filter. The row count cap still applies."""
    if months <= 1:
        return "month"
    if months <= 3:
        return "3months"
    if months <= 6:
        return "6months"
    return "year"


def _clean_profile(url: str) -> str:
    url = url.strip()
    if not url.startswith("http"):
        url = "https://" + url.lstrip("/")
    return url.split("?")[0].rstrip("/") + "/"


def _public_id(url: str) -> str | None:
    m = re.search(r"linkedin\.com/in/([^/?#]+)", url)
    return m.group(1).lower() if m else None


def _result(resp: Any) -> Any:
    out = resp.to_dict() if hasattr(resp, "to_dict") else resp
    out = out.get("result", out) if isinstance(out, dict) else out
    # Some operations wrap the HTTP body once more.
    if isinstance(out, dict) and set(out) <= {"body", "status_code", "headers"} and "body" in out:
        out = out["body"]
    return out


def _explain(e: Exception, provider: str) -> str:
    text = str(e)
    if "401" in text or "UNAUTHORIZED" in text.upper() or "session has expired" in text.lower():
        return f"The {provider} key was refused (401). It may be wrong, expired or revoked: connect it again in Lemma."
    if "402" in text:
        return f"The {provider} account has no credit left (402). Top it up, then try again."
    low = text.lower()
    if "account_resolution" in low or "no account connected" in low or ("account" in low and "not connected" in low):
        return f"No {provider} key is connected for you yet. Add it in Lemma (the pod's About page, Connectors) first."
    if "not found" in text.lower() and "auth" in text.lower():
        return f"This organization has no '{provider}' connection set up yet. An owner adds it once in Lemma."
    return text[:400]


def run_monid(pod, body: dict) -> tuple[list[dict], float | None]:
    started = _result(pod.connectors.execute(
        "monid", "start_an_endpoint_run",
        {"body": {"provider": "apify", "endpoint": "/" + ACTOR, "input": {"body": body}}},
    ))
    run_id = started.get("runId") if isinstance(started, dict) else None
    if not run_id:
        raise RuntimeError(f"Monid did not start a run: {json.dumps(started)[:300]}")
    deadline = time.time() + 15 * 60
    run = started
    while time.time() < deadline:
        status = str(run.get("status", "")).upper()
        if status in ("COMPLETED", "SUCCEEDED"):
            break
        if status in ("FAILED", "ERROR", "STOPPED", "TIMED_OUT", "ABORTED"):
            raise RuntimeError(f"Monid run {run_id} ended {status}: {json.dumps(run.get('error') or run.get('providerResponse'))[:300]}")
        time.sleep(8)
        run = _result(pod.connectors.execute("monid", "get_a_run", {"runId": run_id}))
    else:
        raise RuntimeError(f"Monid run {run_id} was still running after 15 minutes.")
    items = run.get("output") or run.get("items") or []
    if isinstance(items, dict):
        items = items.get("items") or []
    cost = (run.get("cost") or {}).get("value")
    return items, cost


def run_apify(pod, body: dict) -> tuple[list[dict], float | None]:
    items = _result(pod.connectors.execute(
        "apify", "run_actor_synchronously_and_get_dataset_items",
        {"actorId": ACTOR.replace("/", "~"), "body": body},
    ))
    if isinstance(items, dict):
        items = items.get("items") or items.get("data") or []
    return items, None


def _ensure_folder(pod, path: str) -> None:
    parts = [p for p in path.split("/") if p]
    for i in range(1, len(parts) + 1):
        try:
            pod.files.create_folder("/" + "/".join(parts[:i]))
        except Exception:
            pass  # already there


async def fetch_linkedin_posts(ctx: FunctionContext, data: PostsInput) -> PostsResult:
    pod = ctx.pod
    provider = data.provider.strip().lower()
    if provider not in PRICE_PER_POST:
        return PostsResult(provider=provider, estimate_only=True, max_cost_usd=0,
                           note=f"Unknown provider '{provider}'. This function knows monid and apify.")
    handle = re.sub(r"[^a-z0-9_-]", "", data.handle.lower())
    months = max(1, min(data.months, 12))
    max_posts = max(1, min(data.max_posts, HARD_CAP))
    max_cost = round(max_posts * PRICE_PER_POST[provider], 2)
    if data.estimate_only:
        return PostsResult(provider=provider, estimate_only=True, max_cost_usd=max_cost,
                           note=f"Up to {max_posts} posts from the last {months} month(s): at most about ${max_cost:.2f} on {provider}. Nothing was fetched.")

    profile = _clean_profile(data.profile_url)
    body = {"targetUrls": [profile], "maxPosts": max_posts, "postedLimit": _limit(months),
            "includeReposts": False, "includeQuotePosts": True, "scrapeReactions": False, "scrapeComments": False}
    try:
        items, cost = run_monid(pod, body) if provider == "monid" else run_apify(pod, body)
    except Exception as e:
        return PostsResult(provider=provider, estimate_only=False, max_cost_usd=max_cost, note=_explain(e, provider))

    me = _public_id(profile)
    cutoff = datetime.now(timezone.utc) - timedelta(days=31 * months)
    posts = []
    for p in items or []:
        if not isinstance(p, dict) or not p.get("content"):
            continue
        author = (p.get("author") or {}).get("publicIdentifier")
        if me and author and author.lower() != me:
            continue  # someone else's post that the scraper surfaced
        date = ((p.get("postedAt") or {}).get("date") or "")[:10]
        if date:
            try:
                if datetime.fromisoformat(date).replace(tzinfo=timezone.utc) < cutoff:
                    continue
            except ValueError:
                pass
        e = p.get("engagement") or {}
        posts.append({
            "id": str(p.get("id")), "date": date, "url": p.get("linkedinUrl"),
            "kind": "quote_repost" if p.get("repost") else "original",
            "text": p.get("content"), "likes": e.get("likes"), "comments": e.get("comments"), "shares": e.get("shares"),
            "image_urls": [i.get("url") for i in (p.get("postImages") or []) if isinstance(i, dict) and i.get("url")],
        })
    posts.sort(key=lambda x: x["date"], reverse=True)

    base = f"/people/{handle}/voice"
    _ensure_folder(pod, base + "/images")
    saved = 0
    if data.save_images:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            for p in posts:
                p["images"] = []
                if p["kind"] != "original":
                    continue
                for n, u in enumerate(p.pop("image_urls")[:4]):
                    if saved >= 80:
                        break
                    try:
                        r = client.get(u)
                        r.raise_for_status()
                        ext = "png" if "png" in r.headers.get("content-type", "") else "jpg"
                        path = f"{base}/images/{p['date']}_{p['id']}_{n}.{ext}"
                        try:
                            pod.files.delete(path)
                        except Exception:
                            pass
                        from io import BytesIO
                        pod.files.upload_file(BytesIO(r.content), path=path, filename=path.rsplit("/", 1)[1],
                                              directory_path=base + "/images", search_enabled=False)
                        p["images"].append(path)
                        saved += 1
                    except Exception:
                        continue  # an expired image link is not worth failing the run
    for p in posts:
        p.pop("image_urls", None)

    lines = [f"# LinkedIn posts by {handle}", "",
             f"Fetched {datetime.now(timezone.utc).date().isoformat()} through {provider}: {len(posts)} posts, "
             f"newest first. Their own words: read them for facts, stories and how they write; never copy sentences.", ""]
    for p in posts:
        meta = f"{p['date']} · {p['likes'] or 0} likes · {p['comments'] or 0} comments"
        if p["kind"] != "original":
            meta += " · quote repost"
        if p.get("images"):
            meta += f" · {len(p['images'])} image(s)"
        lines += [f"## {meta}", "", p["url"] or "", "", (p["text"] or "").strip(), "", "---", ""]
    pod.files.write_text(f"{base}/posts.md", "\n".join(lines))
    pod.files.write_text(f"{base}/posts.json", json.dumps(posts, ensure_ascii=False, indent=1), search_enabled=False)

    dates = [p["date"] for p in posts if p["date"]]
    return PostsResult(
        provider=provider, estimate_only=False, max_cost_usd=max_cost, posts=len(posts),
        first_date=min(dates) if dates else None, last_date=max(dates) if dates else None,
        images_saved=saved, cost_usd=cost, files=[f"{base}/posts.md", f"{base}/posts.json", f"{base}/images/"],
        note=None if posts else "The scraper returned no posts by this profile in that window. Check the profile URL.",
    )
