# flora: Jev restyle spike

Tests whether "**Jev chooses, code builds**" works for restyling real websites. TypeSafe's Jev picks from a
40-palette / 8-font catalog, and deterministic code compiles the picks into CSS. It also tests whether Jev
can pick the right element for requests like "hide the sidebar". The output is a go/no-go report.

```
packages/core   shared TS: token extraction, catalog, Jev client + question builders, CSS compiler/stamper
harness         Playwright CLI: snapshot → extract → restyle → label → pick → report
extension       WXT MV3 side-panel extension (spike UI), re-applies saved themes with no model call
server          localhost Hono proxy that holds the TypeSafe key for the extension
```

## Setup

```sh
pnpm install
cp .env.example .env        # then set TYPESAFE_API_KEY
pnpm test                   # catalog contrast rules + compiler unit tests
pnpm harness smoke          # one live Jev call
```

## Run the spike

The 20 measured sites are locked in `harness/data/sites.lock.json`. Recon notes, including which sites
blocked automated browsers, are in `harness/data/recon.md`.

```sh
pnpm harness snapshot              # live → before.png + page.mhtml (already done; re-run to refresh)
pnpm harness extract               # tokens.json + candidates.json per site
pnpm harness restyle --repeats 3   # 20 sites × 6 prompts × (3 repeats + 1 no-summary), plus renders
pnpm harness label                 # confirm or correct the agent-drafted pick labels (headed browser)
pnpm harness pick                  # element picking against confirmed labels
pnpm harness report                # harness/report/index.html + report.md
```

Useful extras:

- `pnpm harness preview --sites hn --palette midnight` checks the compiler without Jev.
- `pnpm harness checklabels` checks that labels resolve and measures candidate recall, without Jev.
- `pnpm harness exttest --sites wikipedia` checks extension persistence on live pages.
- Pass `--sites a,b` to limit a run, `--live` to skip the MHTML replay, and `JEV_MODE=replay` to rebuild
  results from the cache.
- `JEV_MODE=mock` dry-runs the pipeline with random answers. It is **not** real Jev output and uses a
  separate cache.

Every Jev call is cached under `harness/.jev-cache/`, keyed by request plus repeat number, so a re-run
costs nothing.

### Human review

1. Open `harness/report/index.html`.
2. Enter your name, then rate each case 1–5 on "matches request" and "looks good".
3. Click **Export**, move the file to `harness/report/ratings-<name>.json`, and run `pnpm harness report`
   again.

Every rater file is merged into the results.

## Try the extension yourself

**Option A: auto-loaded Chrome.** From the repo root:

```sh
pnpm dev:ext
```

This starts the key-holding proxy on `http://localhost:8787` and opens a fresh Chrome window with flora
already installed, with hot reload.

**Option B: your own Chrome.**

```sh
pnpm --filter @flora/server dev          # keep this running (reads TYPESAFE_API_KEY from flora/.env)
pnpm --filter @flora/extension build     # outputs extension/build/chrome-mv3
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick
`extension/build/chrome-mv3`.

**Using it:** on any site, open flora with the floating button (bottom-right), the toolbar icon, or
**Alt+Shift+F**.

- **Restyle:** type a look, e.g. "dark mode", "warm sepia reading mode" or "cyberpunk neon look". Jev picks
  a palette and fonts. Click an alternative to preview it instantly (no extra model call), then click
  **Save for this site**.
- **Hide something:** try "hide the sidebar", "hide the cookie banner" or "hide the orange top bar". flora
  highlights what it found; choose **Hide it**, **Not this one**, or **Cancel**, then save.
- **Saved looks** re-apply on every visit with no network call. The widget lists them, and you can undo
  each hide or reset the site.
- The floating button can be hidden from the widget. The toolbar icon and the shortcut still open it.

## Design notes

These follow TypeSafe's jev-1.13 guidance and patterns from existing Jev projects:

- **Numbers:** anything numeric (colours, sizes, contrast) is converted to words in code before Jev sees it.
- **Questions:** one request asks every question. Each Choice has an escape option (`keep_original` or
  `none_of_these`), and page text is marked as untrusted data.
- **Answer checks:** answers are validated before use, meaning the choice must be among the offered keys
  and probabilities must sum to 1. 429s trigger a global cooldown, and `x-typesafe-request-id` is logged.
- **Large pages:** above 240 candidates, element picking uses two stages (jev-browser style): groups of
  30, keeping top groups until 90% of the probability mass, then picking the element.
- **Contrast:** checked in code after injection. Role rules use a specificity boost so they beat site
  rules marked `!important`.
- **Known limits:** SVG logos and icons keep their original colours, and so does text over images or
  gradients.
