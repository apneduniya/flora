import { compileTheme, parseRestyle, type DesignTokens } from "@flora/core";
import type { Args } from "../lib/args";
import { launch, openSite, waitForFonts } from "../lib/browser";
import { applyTheme, measureBreakage } from "../lib/flora";
import { readJson } from "../lib/io";
import { siteDir } from "../lib/paths";

/** Compiler check without Jev: pnpm harness preview --sites hn --palette midnight [--font inter] [--radius soft] */
export async function run(a: Args) {
  const { browser, context } = await launch();
  const palette = String(a.flags.palette ?? "midnight");
  const picks = { ...parseRestyle({ answers: {} }), palette, font: String(a.flags.font ?? "keep_original"), radius: (a.flags.radius ?? "keep") as never };
  for (const site of a.sites()) {
    const tokens = readJson<DesignTokens>(siteDir(site.id, "tokens.json"));
    const page = await context.newPage();
    await openSite(page, site, a.live);
    const applied = await applyTheme(page, tokens, compileTheme(tokens, picks));
    await waitForFonts(page);
    const shot = siteDir(site.id, "shots", `preview-${palette}.png`);
    await page.screenshot({ path: shot });
    const b = await measureBreakage(page);
    console.log(`${site.id}: stamped ${applied.stamped} in ${applied.ms}ms · low contrast ${(b.lowContrastShare * 100).toFixed(1)}% of ${b.textSampled} · invisible ${b.invisible} · recoloured ${(b.coverage * 100).toFixed(0)}%\n  ${shot}\n  worst: ${b.worst.slice(0, 4).map((w) => `"${w.text}" ${w.ratio} fg=${w.fgRole}:${w.fg} bg=${w.bgRole}:${w.bg}`).join("\n         ")}`);
    await page.close();
  }
  await browser.close();
}
