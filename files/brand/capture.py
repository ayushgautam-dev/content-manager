#!/usr/bin/env python3
"""Read a website's look: colours, fonts and logo candidates.

    python capture.py https://example.com out/

Writes into out/:
    brand.json        colours by visual weight, fonts in use, logo candidates
    page.png          a screenshot of the top of the page (look at it)
    logo-*.{svg,png}  the logo candidates it could download

The script only measures; the setup agent decides. It loads the page in a real
browser, reads the computed style of every visible element, and weights each
colour by the area it covers, so the brand colour of a big button counts for
more than a link colour in the footer. Fonts are checked against Google Fonts so
the agent knows which ones it can use as they are and which need the closest
open alternative.
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse


def _ensure(module: str, package: str) -> None:
    try:
        __import__(module)
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", package], check=True)


def _browser_path() -> str | None:
    for name in ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "chrome"):
        found = shutil.which(name)
        if found:
            return found
    mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    return mac if os.path.exists(mac) else None


MEASURE_JS = r"""
() => {
  const colors = {};     // rgb -> {area, roles:Set}
  const fonts = {};      // family -> {chars, roles:Set}
  const add = (c, area, role) => {
    if (!c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c)) return;
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return;
    if (m[4] !== undefined && parseFloat(m[4]) < 0.5) return;
    const hex = '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
    colors[hex] = colors[hex] || {area: 0, roles: new Set()};
    colors[hex].area += area;
    colors[hex].roles.add(role);
  };
  const vw = window.innerWidth, vh = Math.max(window.innerHeight, 900);
  document.querySelectorAll('body, body *').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.top > vh * 3) return;
    const area = Math.min(r.width, vw) * Math.min(r.height, vh);
    const tag = el.tagName.toLowerCase();
    const isButton = tag === 'button' || (tag === 'a' && /btn|button|cta/i.test(el.className || '')) || el.getAttribute('role') === 'button';
    const role = isButton ? 'button' : /^h[1-3]$/.test(tag) ? 'heading' : tag === 'a' ? 'link' : tag === 'body' ? 'page' : 'block';
    add(cs.backgroundColor, area, role + '-bg');
    const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ');
    if (text) {
      add(cs.color, text.length * parseFloat(cs.fontSize), role + '-text');
      const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      fonts[fam] = fonts[fam] || {chars: 0, roles: new Set(), weights: new Set()};
      fonts[fam].chars += text.length;
      fonts[fam].roles.add(role);
      fonts[fam].weights.add(cs.fontWeight);
    }
    if (tag === 'svg' || tag === 'path') add(cs.fill, area / 4, 'icon');
  });
  const logos = [];
  const near = el => { const r = el.getBoundingClientRect(); return r.top < 220 && r.width > 16; };
  document.querySelectorAll('img, svg, a[class*=logo] img, [class*=logo] img, [id*=logo] img').forEach(el => {
    const hay = ((el.getAttribute('alt') || '') + ' ' + (el.getAttribute('src') || '') + ' ' + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '') + ' ' + (el.closest('a') ? el.closest('a').getAttribute('href') || '' : '') + ' ' + (el.parentElement ? el.parentElement.className || '' : '')).toLowerCase();
    const r = el.getBoundingClientRect();
    const isLogo = /logo|brand|wordmark/.test(hay) || (near(el) && el.closest('header, nav') && el.closest('a') && /^\/?$|^https?:\/\/[^/]+\/?$/.test(el.closest('a').getAttribute('href') || 'x'));
    if (!isLogo || r.width < 16) return;
    if (el.tagName.toLowerCase() === 'svg') logos.push({kind: 'inline-svg', svg: el.outerHTML.slice(0, 200000), width: r.width, height: r.height, top: r.top});
    else logos.push({kind: 'img', src: el.currentSrc || el.src, width: r.width, height: r.height, top: r.top});
  });
  const links = [...document.querySelectorAll('link[rel*=icon], link[rel=apple-touch-icon], meta[property="og:image"], meta[name=theme-color]')]
    .map(l => ({rel: l.getAttribute('rel') || l.getAttribute('property') || l.getAttribute('name'), href: l.getAttribute('href') || l.getAttribute('content'), sizes: l.getAttribute('sizes')}));
  const ser = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, {...v, roles: [...v.roles], weights: v.weights ? [...v.weights] : undefined}]));
  return {title: document.title, colors: ser(colors), fonts: ser(fonts), logos, links,
          bodyBg: getComputedStyle(document.body).backgroundColor};
}
"""


def _google_font_exists(client, family: str) -> bool:
    if not family or family.lower() in ("inherit", "initial", "system-ui", "sans-serif", "serif", "-apple-system"):
        return False
    r = client.get("https://fonts.googleapis.com/css2", params={"family": family})
    return r.status_code == 200 and "@font-face" in r.text


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    url, out = sys.argv[1], Path(sys.argv[2]).resolve()
    if not urlparse(url).scheme:
        url = "https://" + url
    out.mkdir(parents=True, exist_ok=True)
    _ensure("playwright", "playwright")
    _ensure("httpx", "httpx")
    import httpx
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        exe = _browser_path()
        try:
            browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        except Exception:
            subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
            browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        try:
            page.goto(url, wait_until="networkidle", timeout=45000)
        except Exception:
            page.goto(url, wait_until="load", timeout=45000)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(out / "page.png"))
        data = page.evaluate(MEASURE_JS)
        final_url = page.url
        browser.close()

    total = sum(v["area"] for v in data["colors"].values()) or 1
    colors = sorted(
        ({"hex": k, "share": round(v["area"] / total, 4), "roles": v["roles"]} for k, v in data["colors"].items()),
        key=lambda c: -c["share"],
    )[:24]
    chars = sum(v["chars"] for v in data["fonts"].values()) or 1
    fonts = sorted(
        ({"family": k, "share": round(v["chars"] / chars, 3), "roles": v["roles"], "weights": v.get("weights")} for k, v in data["fonts"].items()),
        key=lambda f: -f["share"],
    )[:8]

    saved = []
    with httpx.Client(timeout=20, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 (brand capture)"}) as client:
        for f in fonts:
            try:
                f["on_google_fonts"] = _google_font_exists(client, f["family"])
            except Exception:
                f["on_google_fonts"] = None
        # Header logos first (closest to the top), then icons the page declares.
        candidates = sorted(data["logos"], key=lambda c: (c.get("top", 9999) > 220, c.get("top", 9999)))[:6]
        for l in data["links"]:
            if l.get("href") and l.get("rel") not in ("theme-color",):
                candidates.append({"kind": l["rel"], "src": urljoin(final_url, l["href"]), "sizes": l.get("sizes")})
        for i, c in enumerate(candidates[:12]):
            try:
                if c["kind"] == "inline-svg":
                    svg = c["svg"]
                    if "xmlns" not in svg[:200]:
                        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
                    path = out / f"logo-{i}.svg"
                    path.write_text(svg)
                else:
                    src = c.get("src") or ""
                    if src.startswith("data:"):
                        head, b64 = src.split(",", 1)
                        ext = "svg" if "svg" in head else "png"
                        raw = base64.b64decode(b64) if ";base64" in head else b64.encode()
                    else:
                        r = client.get(urljoin(final_url, src))
                        r.raise_for_status()
                        raw = r.content
                        ctype = r.headers.get("content-type", "")
                        ext = "svg" if "svg" in ctype or src.lower().split("?")[0].endswith(".svg") else \
                              "ico" if "icon" in ctype or src.lower().endswith(".ico") else \
                              "jpg" if "jpeg" in ctype else "webp" if "webp" in ctype else "png"
                    path = out / f"logo-{i}.{ext}"
                    path.write_bytes(raw)
                saved.append({"file": path.name, "from": c["kind"], "src": (c.get("src") or "")[:300],
                              "in_header": (c.get("top") is not None and c["top"] <= 220),
                              "width": c.get("width"), "height": c.get("height"), "sizes": c.get("sizes")})
            except Exception as e:  # one bad candidate never stops the rest
                saved.append({"from": c["kind"], "src": (c.get("src") or "")[:300], "error": str(e)[:160]})

    def _sat(hexs: str) -> float:
        r, g, b = (int(hexs[i:i + 2], 16) / 255 for i in (1, 3, 5))
        return max(r, g, b) - min(r, g, b)  # chroma: pale tints and greys score low
    # Candidates for the accent: coloured (not grey) colours, by weight. Buttons first.
    accents = sorted((c for c in colors if _sat(c["hex"]) > 0.3),
                     key=lambda c: (not any(r.startswith("button") for r in c["roles"]), -c["share"]))[:6]
    theme_color = next((l["href"] for l in data["links"] if l.get("rel") == "theme-color"), None)
    result = {"url": final_url, "title": data["title"], "page_background": data["bodyBg"], "theme_color": theme_color,
              "colors": colors, "accent_candidates": accents, "fonts": fonts, "logos": saved, "screenshot": "page.png"}
    (out / "brand.json").write_text(json.dumps(result, indent=1))
    print(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
