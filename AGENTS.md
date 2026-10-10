# Working on Content Manager

Notes for whoever changes this repository, person or agent: what each part is for, how
to test it, and what has broken before.

## The shape

The repository root is a Lemma pod bundle. `lemma pods import . --with-files` (or the
Install button, which runs the same import) creates every table, function, agent,
schedule and the app, and uploads `files/`.

| Path | What it is |
|---|---|
| `pod.json` | Bundle header. `contents.with_files` ships `files/`; `studio_slug` is the app's public slug. |
| `tables/` | Ten shared tables (`enable_rls: false`): the team sees each person's drafts. |
| `functions/` | Python, run server-side under their own grants. |
| `agents/` | JSON plus `instruction.md`. Grants live in the JSON and are replaced on import. |
| `schedules/` | `daily-sources` and `daily-radar` ship off; `learn` is on. |
| `apps/studio/source/` | The **built** app. Never edit by hand; run `studio/build.sh`. |
| `studio/` | The app's Vite + React + lemma-sdk project. |
| `files/` | Pod file contents, with `.files.json` (per-file metadata) and `.folder.json` per folder. |
| `setup.sh`, `SETUP-PROMPT.md` | The terminal and agent install routes. |
| `scripts/env.sh` | `cm …` pins `--server/--org/--pod`; reads `scripts/local.env` (not committed). |

## The flow, in one breath

Studio's five questions write a `founders` row and four `setup_jobs`, then start
`setup`. Setup spawns a copy of itself for the brand (`/brand/capture.py` → the BRAND
block of `tokens.css`, the logo, `theme.json`), writes `topics` and `sources`, starts the
`screener`, writes `/playbook/sector-rules.md` when the field needs it, and writes first
notes under `/people/<handle>/`. The `scout` turns `source_items` and the news into
`sparks`; the `writer` turns a spark, item, story or note into a `drafts` row with slides
under `/people/<handle>/decks/<draft_id>/v<N>/`. Approving or removing a draft fires
`learn`.

## Testing a change

```bash
source scripts/env.sh                                   # needs scripts/local.env
lemma --server cloud pods import . --pod "$CM_POD_ID" --with-files --dry-run
lemma --server cloud pods import . --pod "$CM_POD_ID" --with-files
cm functions run fetch_items --data '{"days":7}'
cm agents run setup "[setup] <handle>"                  # needs a founders row + setup_jobs
cm agents run writer "[app-draft] item <item_id> for <handle>"
```

Look at what agents make: download a draft's `sheet.png` and look at it, and check every
number in the text against its source. An import that prints "updated" proves nothing
about the slides.

## What has broken before

- **`lemma files cat` adds a header line** to its output. Redirected into `render.py` or
  `tokens.css` it corrupts them. Agents copy files with `lemma files download`.
- **Pod storage serves SVG as `application/octet-stream`**, and browsers refuse to draw
  that in `<img>`. Studio fetches SVG bytes and wraps them in an `image/svg+xml` Blob
  (`useImageUrl` in `studio/src/lib/files.ts`).
- **A `package.json` in `apps/studio/source/`** makes every import run npm and a Vite
  build that needs `VITE_LEMMA_*` values a fresh pod does not have. Ship the build.
- **`.env.local` is read by production builds.** Dev-only settings (the API proxy, the
  CLI token command) go in `studio/.env.development.local`. `build.sh` also moves `.env`
  files aside and refuses output containing a UUID.
- **Brand colours leaking into dark mode.** `lib/theme.tsx` applies the brand's light
  colours only when the page is light; dark mode borrows just the accent and fonts.
- **`type="url"` inputs** reject `example.com`, the format people type. Onboarding uses
  text inputs with its own check.
- **Europe PMC answers 503 to a `sort` parameter**; `fetch_items` sends none.
- **Grants are bound to the table that existed when they were applied.** After deleting
  or recreating a table, re-import `functions/`, `agents/` and `schedules/`.
- **The writer once echoed a person's old sentences** when told to use only what they
  had said before. The six-word rule in `craft.md` and the writer's instruction exist for
  that; check it on drafts once a person has voice notes.
- **zsh does not split words.** `for i in $ids` and `${VAR:+--flag "$VAR"}` behave
  differently from bash.

## Rules that stay

- Nothing is posted. The writer never approves or marks a draft posted.
- No keys in tables, files, code, the app or a chat. Optional scraper keys live in Lemma
  connector accounts (OpenAPI connectors named `monid` and `apify`).
- Never generate, edit or search for a photo of a real person. Portraits come only from
  posts the person published.
- Every factual claim traces to a source on the draft.
