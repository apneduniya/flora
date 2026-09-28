import { buildRestyleRequest, compileTheme, parseRestyle, PALETTE_BY_ID, type DesignTokens, type RestylePicks } from "@flora/core";
import { performance } from "node:perf_hooks";
import type { Args } from "../lib/args";
import { launch, openSite, waitForFonts } from "../lib/browser";
import { applyTheme, blockRects, layoutShift, measureBreakage } from "../lib/flora";
import { appendJsonl, readJson, resetFile } from "../lib/io";
import { harnessJev } from "../lib/jev";
import { siteDir } from "../lib/paths";
import { matchesExpect, promptsFor } from "../sites";

export interface RestyleRow {
  site: string;
  prompt: string;
  promptText: string;
  variant: "with_summary" | "no_summary";
  repeat: number;
  picks: RestylePicks;
  semanticOk: boolean;
  latencyMs: number;
  inputTokens: number;
  costUsd: number;
  cached: boolean;
  model: string;
  requestId?: string;
  error?: string;
}

export interface RenderRow {
  site: string;
  prompt: string;
  palette: string;
  rank: 1 | 2 | 3;
  shot: string;
  compileMs: number;
  applyMs: number;
  stamped: number;
  breakage?: Awaited<ReturnType<typeof measureBreakage>>;
  shift?: Awaited<ReturnType<typeof layoutShift>>;
}

/**
 * For each site × prompt: N repeats with the site summary, 1 without (A/B), then renders the
 * top-1 pick (with breakage checks) and the rank-2/3 palettes (screenshots only).
 */
export async function run(a: Args) {
  const jev = harnessJev();
  const { browser, context } = await launch();
  const noRender = a.flags["no-render"] === true;

  for (const site of a.sites()) {
    const tokens = readJson<DesignTokens>(siteDir(site.id, "tokens.json"));
    const runsPath = siteDir(site.id, "runs", "restyle.jsonl");
    const rendersPath = siteDir(site.id, "runs", "renders.jsonl");
    resetFile(runsPath);
    if (!noRender) resetFile(rendersPath);
    console.log(`▶ ${site.id}`);

    for (const prompt of promptsFor(site)) {
      const jobs: { variant: RestyleRow["variant"]; repeat: number }[] = [];
      for (let r = 1; r <= a.repeats; r++) jobs.push({ variant: "with_summary", repeat: r });
      jobs.push({ variant: "no_summary", repeat: 1 });

      const rows = await Promise.all(
        jobs.map(async ({ variant, repeat }): Promise<RestyleRow> => {
          const req = buildRestyleRequest({
            request: prompt.text,
            site: variant === "with_summary" ? { category: site.category, currentDesign: tokens.summary } : null,
          });
          try {
            // Repeats must be independent calls, so the repeat number salts the cache key.
            const res = await jev.decide(req, { cacheSalt: `repeat:${repeat}` });
            const picks = parseRestyle(res);
            const pal = PALETTE_BY_ID.get(picks.palette);
            return {
              site: site.id, prompt: prompt.id, promptText: prompt.text, variant, repeat, picks,
              semanticOk: pal ? matchesExpect(pal.tags, prompt.expect) : false,
              latencyMs: res.latencyMs, inputTokens: res.usage.input_tokens, costUsd: res.costUsd, cached: res.cached,
              model: res.model, requestId: res.requestId,
            };
          } catch (e) {
            return {
              site: site.id, prompt: prompt.id, promptText: prompt.text, variant, repeat,
              picks: parseRestyle({ answers: {} }), semanticOk: false, latencyMs: 0, inputTokens: 0, costUsd: 0,
              cached: false, model: "", error: (e as Error).message,
            };
          }
        }),
      );
      for (const r of rows) appendJsonl(runsPath, r);
      const main = rows.find((r) => r.variant === "with_summary" && r.repeat === 1)!;
      console.log(`  ${prompt.id.padEnd(8)} → ${main.picks.palette} (${main.picks.paletteConfidence.toFixed(2)}) + ${main.picks.font} ${main.semanticOk ? "✓" : "✗"}${main.error ? ` ERROR ${main.error}` : ""}`);
      if (noRender || main.error) continue;

      // Render rank 1 with checks, then ranks 2 and 3 (other picks unchanged).
      const ranks = main.picks.paletteTop.slice(0, 3);
      for (let i = 0; i < Math.max(1, ranks.length); i++) {
        const palette = i === 0 ? main.picks.palette : ranks[i].id;
        const picks = { ...main.picks, palette };
        const page = await context.newPage();
        try {
          await openSite(page, site, a.live);
          const before = i === 0 ? await blockRects(page) : [];
          const t0 = performance.now();
          const theme = compileTheme(tokens, picks);
          const compileMs = Math.round(performance.now() - t0);
          const applied = await applyTheme(page, tokens, theme);
          await waitForFonts(page);
          const shot = `after-${prompt.id}-r${i + 1}.png`;
          await page.screenshot({ path: siteDir(site.id, "shots", shot) });
          const row: RenderRow = { site: site.id, prompt: prompt.id, palette, rank: (i + 1) as 1 | 2 | 3, shot: `shots/${shot}`, compileMs, applyMs: applied.ms, stamped: applied.stamped };
          if (i === 0) {
            row.breakage = await measureBreakage(page);
            row.shift = await layoutShift(page, before);
          }
          appendJsonl(rendersPath, row);
        } catch (e) {
          console.log(`    render ${palette} failed: ${(e as Error).message.split("\n")[0]}`);
        } finally {
          await page.close();
        }
      }
    }
  }
  await browser.close();
}
