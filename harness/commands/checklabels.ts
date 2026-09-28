import type { Args } from "../lib/args";
import { launch, openSite } from "../lib/browser";
import { extractCandidates } from "../lib/flora";
import { readJson, writeJson } from "../lib/io";
import { REPORT_DIR, siteDir } from "../lib/paths";
import { join } from "node:path";
import type { Labels } from "./label";
import { matchingCandidates } from "./pick";

/** No Jev needed: every label resolves in the replay, and is the target in our candidate list (recall)? */
export async function run(a: Args) {
  const { browser, context } = await launch();
  const rows: { site: string; task: string; resolves: boolean; inCandidates: boolean | null; candidates: number; landmark?: string | null; a11yLandmarks?: number }[] = [];
  const LANDMARKS = ["banner", "navigation", "complementary", "contentinfo", "main", "dialog", "alertdialog", "region", "search", "form"];
  for (const site of a.sites()) {
    const labels = readJson<Labels>(siteDir(site.id, "labels.json"), {});
    const page = await context.newPage();
    await openSite(page, site, a.live);
    const cands = await extractCandidates(page);
    // agent-browser accessibility tree (saved during recon): how many landmark nodes would an a11y-only list offer?
    const a11y = readJson<{ data?: { refs?: Record<string, { role: string; name: string }> } }>(siteDir(site.id, "a11y.json"), {});
    const a11yLandmarks = Object.values(a11y.data?.refs ?? {}).filter((r) => LANDMARKS.includes(r.role)).length;
    for (const task of site.picks) {
      const l = labels[task.id];
      if (!l) { console.log(`  ${site.id}/${task.id}: NO LABEL`); continue; }
      if (l.selector === null) { rows.push({ site: site.id, task: task.id, resolves: true, inCandidates: null, candidates: cands.length }); continue; }
      const sels = [l.selector, ...(l.alt ?? [])];
      const resolves = (await page.evaluate((ss) => ss.filter((s) => document.querySelector(s)).length, sels)) > 0;
      const m = resolves ? await matchingCandidates(page, sels, cands) : null;
      const inCandidates = !!m?.length;
      // Is the target (or an accepted alternative) itself an ARIA landmark, explicit or implicit?
      const landmark = await page.evaluate((ss) => {
        const implicit: Record<string, string> = { HEADER: "banner", NAV: "navigation", ASIDE: "complementary", FOOTER: "contentinfo", MAIN: "main", DIALOG: "dialog", FORM: "form", SECTION: "region" };
        for (const s of ss) {
          const el = document.querySelector(s);
          if (!el) continue;
          const role = el.getAttribute("role") ?? implicit[el.tagName];
          if (role && ["banner", "navigation", "complementary", "contentinfo", "main", "dialog", "alertdialog", "region", "search", "form"].includes(role)) return role;
        }
        return null;
      }, sels);
      rows.push({ site: site.id, task: task.id, resolves, inCandidates, candidates: cands.length, landmark, a11yLandmarks });
      if (!resolves || !inCandidates) console.log(`  ${site.id}/${task.id}: ${resolves ? "not in candidate list" : "SELECTOR DOES NOT RESOLVE"} (${l.selector})`);
    }
    await page.close();
  }
  await browser.close();
  const pos = rows.filter((r) => r.inCandidates !== null);
  console.log(`\n${rows.length} labels · ${rows.filter((r) => !r.resolves).length} unresolved · candidate recall ${pos.filter((r) => r.inCandidates).length}/${pos.length}`);
  console.log(`a11y-landmark-only recall: ${pos.filter((r) => r.landmark).length}/${pos.length} targets are ARIA landmarks (${[...new Set(pos.filter((r) => !r.landmark).map((r) => `${r.site}/${r.task}`))].join(", ")} are not)`);
  writeJson(join(REPORT_DIR, "label-check.json"), rows);
}
