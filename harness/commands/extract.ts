import type { Args } from "../lib/args";
import { launch, openSite } from "../lib/browser";
import { extractCandidates, extractTokens } from "../lib/flora";
import { writeJson } from "../lib/io";
import { siteDir } from "../lib/paths";

/** Replays each snapshot and writes tokens.json + candidates.json. */
export async function run(a: Args) {
  const { browser, context } = await launch();
  for (const site of a.sites()) {
    const page = await context.newPage();
    try {
      await openSite(page, site, a.live);
      const tokens = await extractTokens(page);
      const candidates = await extractCandidates(page);
      writeJson(siteDir(site.id, "tokens.json"), tokens);
      writeJson(siteDir(site.id, "candidates.json"), candidates);
      const roleNames = Object.entries(tokens.roles)
        .map(([r, id]) => `${r}=${tokens.clusters.find((c) => c.id === id)?.name ?? "-"}`)
        .join(", ");
      console.log(`✓ ${site.id}: ${tokens.clusters.length} clusters, ${tokens.cssVars.length} colour vars, ${candidates.length} candidates, ${tokens.stats.ms}ms\n    ${roleNames}\n    "${tokens.summary}"`);
    } catch (e) {
      console.log(`✗ ${site.id}: ${(e as Error).message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
}
