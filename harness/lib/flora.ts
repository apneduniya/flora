// Typed wrappers around window.__flora calls made through page.evaluate.
import type { Page } from "playwright";
import type { Candidate, CompiledTheme, DesignTokens } from "@flora/core";
import type { BreakageReport } from "@flora/core";

type Rect = { x: number; y: number; w: number; h: number };
type F = typeof import("@flora/core/inpage");
declare global {
  interface Window {
    __flora: F;
  }
}

export const extractTokens = (page: Page) => page.evaluate(() => window.__flora.extractTokens()) as Promise<DesignTokens>;
export const extractCandidates = (page: Page) => page.evaluate(() => window.__flora.extractCandidates()) as Promise<Candidate[]>;
export const blockRects = (page: Page) =>
  page.evaluate(() => window.__flora.blockRects(30)) as Promise<{ selector: string; rect: Rect }[]>;
export const applyTheme = (page: Page, tokens: DesignTokens, theme: CompiledTheme) =>
  page.evaluate(([t, th]) => window.__flora.applyTheme(t, th, { observe: false }), [tokens, theme] as const);
export const measureBreakage = (page: Page) => page.evaluate(() => window.__flora.measureBreakage()) as Promise<BreakageReport>;

/** Mean vertical displacement of the largest blocks, relative to viewport height. */
export async function layoutShift(page: Page, before: { selector: string; rect: Rect }[]) {
  const after = await page.evaluate((sels) => {
    return sels.map((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    });
  }, before.map((b) => b.selector));
  let moved = 0;
  let sum = 0;
  let n = 0;
  after.forEach((r, i) => {
    if (!r) return;
    const dy = Math.abs(r.y - before[i].rect.y);
    sum += dy;
    n++;
    if (dy > 50) moved++;
  });
  return { blocks: n, meanShiftPx: n ? Math.round(sum / n) : 0, movedOver50px: moved };
}
