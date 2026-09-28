import { parseRestyle } from "@flora/core";
import { join } from "node:path";
import { chromium } from "playwright";
import type { Args } from "../lib/args";
import { writeJson } from "../lib/io";
import { REPORT_DIR, ROOT_DIR, siteDir } from "../lib/paths";

/**
 * Extension persistence check (no Jev): load the built extension, save a theme + hide for a site in
 * chrome.storage, reload the live page, and confirm it re-applies with no request to the proxy.
 */
export async function run(a: Args) {
  const ext = join(ROOT_DIR, "extension/build/chrome-mv3");
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: !a.headed,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  console.log(`extension loaded: ${sw.url().split("/")[2]}`);
  const results: Record<string, unknown>[] = [];

  for (const site of a.sites()) {
    const page = await ctx.newPage();
    const proxyCalls: string[] = [];
    ctx.on("request", (r) => r.url().startsWith("http://localhost:8787") && proxyCalls.push(r.url()));
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    const host = new URL(page.url()).hostname;
    const hideSel = String(a.flags.hide ?? "footer");
    await sw.evaluate(
      async ([key, picks, sel]) => {
        await (globalThis as unknown as { chrome: { storage: { local: { set(v: unknown): Promise<void> } } } }).chrome.storage.local.set({ [key]: { picks, prompt: "dark mode", hides: [{ selector: sel, description: "test", request: "hide the footer" }], savedAt: Date.now() } });
      },
      [`flora:site:${host}`, { ...parseRestyle({ answers: {} }), palette: "midnight" }, hideSel] as const,
    );
    const t0 = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!document.getElementById("flora-theme"), null, { timeout: 15000 });
    const ms = Date.now() - t0;
    const state = await page.evaluate((sel) => ({
      stamped: document.querySelectorAll("[data-flora-bg],[data-flora-fg]").length,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      hidden: (() => { const el = document.querySelector(sel); return el ? getComputedStyle(el).display === "none" : "not found"; })(),
    }), hideSel);
    await page.screenshot({ path: siteDir(site.id, "shots", "ext-reload.png") });
    results.push({ site: site.id, reapplyMs: ms, ...state, proxyCalls: proxyCalls.length });
    console.log(`${site.id}: re-applied on reload in ${ms}ms (from navigation start) · stamped ${state.stamped} · body ${state.bodyBg} · "${hideSel}" hidden: ${state.hidden} · proxy calls: ${proxyCalls.length}`);
    await page.close();
  }
  await ctx.close();
  writeJson(join(REPORT_DIR, "ext-test.json"), results);
}
