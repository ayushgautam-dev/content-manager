#!/usr/bin/env python3
"""Render a deck of LinkedIn slides from one HTML file.

    python render.py deck.html out/            # -> out/slides/01.png …, out/deck.pdf, out/sheet.png
    python render.py deck.html out/ --check    # also fail (exit 2) on layout problems

The deck is ordinary HTML: every slide is a `<section class="slide">`, and the
page links /brand/tokens.css (copied next to it) for the look. Slides are
1080×1350 (4:5, the tallest LinkedIn shows in the feed). The renderer only
screenshots — design lives in the HTML, not in here.

Prints a JSON manifest on stdout:
    {"slides": [...], "pdf": "...", "sheet": "...", "problems": [...]}

`problems` lists what a person would notice on a phone: text running out of its
box or off the slide, slides with too many words, type smaller than 30px.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

W, H = 1080, 1350
MAX_WORDS = 45
MIN_FONT_PX = 30

CHECK_JS = """
(args) => {
  const [W, H, MAX_WORDS, MIN_FONT_PX] = args;
  const out = [];
  document.querySelectorAll('section.slide').forEach((slide, i) => {
    const n = i + 1;
    const r = slide.getBoundingClientRect();
    if (Math.round(r.width) !== W || Math.round(r.height) !== H)
      out.push(`slide ${n}: is ${Math.round(r.width)}x${Math.round(r.height)}, not ${W}x${H}`);
    const words = (slide.innerText || '').trim().split(/\\s+/).filter(Boolean).length;
    if (words > MAX_WORDS) out.push(`slide ${n}: ${words} words (keep it under ${MAX_WORDS})`);
    slide.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const hasText = [...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim());
      if (hasText && parseFloat(cs.fontSize) < MIN_FONT_PX && !el.closest('[data-small-ok]'))
        out.push(`slide ${n}: "${el.textContent.trim().slice(0, 40)}" is ${cs.fontSize} (min ${MIN_FONT_PX}px)`);
      if (el.scrollHeight > el.clientHeight + 2 && cs.overflow !== 'visible' && el.clientHeight > 0)
        out.push(`slide ${n}: text overflows its box: "${el.textContent.trim().slice(0, 40)}"`);
      const b = el.getBoundingClientRect();
      if (hasText && (b.right > r.right + 1 || b.bottom > r.bottom + 1 || b.left < r.left - 1 || b.top < r.top - 1))
        out.push(`slide ${n}: "${el.textContent.trim().slice(0, 40)}" runs off the slide`);
    });
  });
  return out;
}
"""


def _browser_path() -> str | None:
    for name in ("google-chrome-stable", "google-chrome", "chromium", "chromium-browser", "chrome"):
        found = shutil.which(name)
        if found:
            return found
    mac = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    return mac if os.path.exists(mac) else None


def _ensure(module: str, package: str) -> None:
    try:
        __import__(module)
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", package], check=True)


def contact_sheet(slides: list[Path], out: Path, cols: int = 4, thumb_w: int = 360) -> None:
    from PIL import Image, ImageDraw

    thumb_h = round(thumb_w * H / W)
    gap, label = 24, 44
    rows = math.ceil(len(slides) / cols)
    cols = min(cols, len(slides))
    sheet = Image.new("RGB", (gap + cols * (thumb_w + gap), gap + rows * (thumb_h + label + gap)), "#eeedf2")
    draw = ImageDraw.Draw(sheet)
    for i, path in enumerate(slides):
        img = Image.open(path).convert("RGB").resize((thumb_w, thumb_h), Image.LANCZOS)
        x = gap + (i % cols) * (thumb_w + gap)
        y = gap + (i // cols) * (thumb_h + label + gap)
        sheet.paste(img, (x, y + label))
        draw.text((x, y + 8), f"{i + 1}", fill="#3b3a45", font_size=28)
    sheet.save(out, optimize=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("deck")
    ap.add_argument("out")
    ap.add_argument("--check", action="store_true", help="exit 2 when there are layout problems")
    args = ap.parse_args()

    _ensure("playwright", "playwright")
    _ensure("PIL", "pillow")
    from playwright.sync_api import sync_playwright

    deck = Path(args.deck).resolve()
    out = Path(args.out).resolve()
    (out / "slides").mkdir(parents=True, exist_ok=True)
    for old in (out / "slides").glob("*.png"):
        old.unlink()

    with sync_playwright() as p:
        exe = _browser_path()
        try:
            browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        except Exception:
            subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
            browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.goto(deck.as_uri(), wait_until="networkidle")
        page.evaluate("document.fonts.ready")
        page.add_style_tag(content="html,body{margin:0!important;padding:0!important}"
                                   " section.slide{break-after:page;overflow:hidden}")
        count = page.locator("section.slide").count()
        if count == 0:
            print(json.dumps({"error": "no <section class=\"slide\"> in the deck"}))
            return 1
        problems = page.evaluate(CHECK_JS, [W, H, MAX_WORDS, MIN_FONT_PX])
        slides = []
        for i in range(count):
            path = out / "slides" / f"{i + 1:02d}.png"
            page.locator("section.slide").nth(i).screenshot(path=str(path))
            slides.append(path)
        pdf = out / "deck.pdf"
        page.add_style_tag(content=f"@page {{ size: {W}px {H}px; margin: 0 }}")
        page.pdf(path=str(pdf), width=f"{W}px", height=f"{H}px", print_background=True,
                 margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
        browser.close()

    sheet = out / "sheet.png"
    contact_sheet(slides, sheet)
    print(json.dumps({"slides": [str(s) for s in slides], "pdf": str(pdf), "sheet": str(sheet),
                      "problems": problems}, indent=1))
    return 2 if (args.check and problems) else 0


if __name__ == "__main__":
    sys.exit(main())
