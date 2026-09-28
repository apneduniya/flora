import { writeFileSync } from "node:fs";
import type { Args } from "../lib/args";
import { launch, mhtmlPath, VIEWPORT } from "../lib/browser";
import { writeJson } from "../lib/io";
import { siteDir } from "../lib/paths";

/** Loads each live site once and saves before.png + an MHTML snapshot for deterministic replay. */
export async function run(a: Args) {
  const { browser, context } = await launch({ headed: a.headed });
  for (const site of a.sites()) {
    const page = await context.newPage();
    const t0 = Date.now();
    try {
      const resp = await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(Number(a.flags.wait ?? 2000));
      await page.screenshot({ path: siteDir(site.id, "before.png") });
      const cdp = await context.newCDPSession(page);
      const { data } = (await cdp.send("Page.captureSnapshot", { format: "mhtml" })) as { data: string };
      writeFileSync(mhtmlPath(site.id), data);
      const meta = {
        url: site.url,
        finalUrl: page.url(),
        status: resp?.status() ?? null,
        title: await page.title(),
        bytes: data.length,
        ms: Date.now() - t0,
        viewport: VIEWPORT,
        capturedAt: new Date().toISOString(),
      };
      writeJson(siteDir(site.id, "meta.json"), meta);
      console.log(`✓ ${site.id} ${meta.status} "${meta.title.slice(0, 60)}" ${(data.length / 1e6).toFixed(1)}MB`);
    } catch (e) {
      console.log(`✗ ${site.id}: ${(e as Error).message.split("\n")[0]}`);
      writeJson(siteDir(site.id, "meta.json"), { url: site.url, error: (e as Error).message, capturedAt: new Date().toISOString() });
    } finally {
      await page.close();
    }
  }
  await browser.close();
}
