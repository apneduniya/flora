import { buildSync } from "esbuild";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { ROOT_DIR, siteDir } from "./paths";

export const VIEWPORT = { width: 1440, height: 900 };

let bundle: string | null = null;
/** packages/core/src/inpage.ts bundled as an IIFE that defines window.__flora. */
export function inpageBundle(): string {
  if (bundle) return bundle;
  const out = buildSync({
    entryPoints: [join(ROOT_DIR, "packages/core/src/inpage.ts")],
    bundle: true,
    format: "iife",
    globalName: "__flora",
    target: "chrome120",
    write: false,
    minify: false,
  });
  bundle = `${out.outputFiles[0].text}\nwindow.__flora = __flora;`;
  return bundle;
}

export async function launch(opts: { headed?: boolean } = {}): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({ headless: !opts.headed });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: "en-US",
    timezoneId: "Asia/Kolkata",
    deviceScaleFactor: 1,
  });
  return { browser, context };
}

export async function injectFlora(page: Page) {
  const has = await page.evaluate(() => typeof (window as never as { __flora?: unknown }).__flora !== "undefined");
  if (!has) await page.evaluate(inpageBundle());
}

export function mhtmlPath(siteId: string) {
  return siteDir(siteId, "page.mhtml");
}

/** Opens the saved MHTML snapshot (default) or the live URL (--live). */
export async function openSite(page: Page, site: { id: string; url: string }, live = false) {
  if (live || !existsSync(mhtmlPath(site.id))) {
    if (!live) throw new Error(`no snapshot for ${site.id}; run "pnpm harness snapshot" first or pass --live`);
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  } else {
    await page.goto(pathToFileURL(mhtmlPath(site.id)).href, { waitUntil: "load", timeout: 45000 });
  }
  await page.waitForTimeout(500);
  await injectFlora(page);
}

export async function waitForFonts(page: Page, ms = 4000) {
  await page.evaluate((ms) => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ms))]), ms).catch(() => {});
}
