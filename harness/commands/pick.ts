import { NONE, pickElement, type Candidate } from "@flora/core";
import type { Page } from "playwright";
import type { Args } from "../lib/args";
import { launch, openSite } from "../lib/browser";
import { extractCandidates } from "../lib/flora";
import { appendJsonl, readJson, resetFile, writeJson } from "../lib/io";
import { harnessJev } from "../lib/jev";
import { siteDir } from "../lib/paths";
import type { Labels } from "./label";

export interface PickRow {
  site: string;
  task: string;
  text: string;
  negative: boolean;
  labelSource: string;
  confirmed: boolean;
  candidates: number;
  stages: 1 | 2;
  expectedAction: string;
  action: string;
  actionOk: boolean;
  target: string;
  targetConfidence: number;
  targetP: number;
  marginP: number; // top-1 minus top-2 probability
  targetPresent: number;
  top1Ok: boolean;
  top3Ok: boolean;
  /** Whether any candidate matches the label at all (candidate-list recall). */
  labelInCandidates: boolean | null;
  latencyMs: number;
  inputTokens: number;
  costUsd: number;
  error?: string;
}

/** In-page: which candidate ids match the labelled element (same element, or ancestor/descendant with IoU ≥ 0.8). */
export async function matchingCandidates(page: Page, labelSelectors: string[], cands: Candidate[]) {
  return page.evaluate(
    ([sels, list]) => {
      const targets = sels.map((s) => document.querySelector(s)).filter((t): t is Element => !!t);
      if (!targets.length) return null;
      const ids = new Set<string>();
      for (const target of targets) {
        const r = target.getBoundingClientRect();
        const tr = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
        for (const c of list) {
          const el = document.querySelector(c.selector);
          if (!el) continue;
          if (el === target || ((el.contains(target) || target.contains(el)) && window.__flora.rectIoU(c.rect, tr) >= 0.8)) ids.add(c.id);
        }
      }
      return [...ids];
    },
    [labelSelectors, cands.map((c) => ({ id: c.id, selector: c.selector, rect: c.rect }))] as const,
  );
}

export async function run(a: Args) {
  const jev = harnessJev();
  const includeUnconfirmed = a.flags.unconfirmed === true;
  const { browser, context } = await launch();

  for (const site of a.sites()) {
    const labels = readJson<Labels>(siteDir(site.id, "labels.json"), {});
    const runsPath = siteDir(site.id, "runs", "pick.jsonl");
    resetFile(runsPath);
    const page = await context.newPage();
    await openSite(page, site, a.live);
    const cands = await extractCandidates(page);
    writeJson(siteDir(site.id, "candidates.json"), cands);
    const meta = { title: await page.title(), url: site.url };
    console.log(`▶ ${site.id}: ${cands.length} candidates`);

    for (const task of site.picks) {
      const label = labels[task.id];
      if (!label || (!label.confirmed && !includeUnconfirmed)) {
        console.log(`  ${task.id}: no ${label ? "confirmed " : ""}label, skipped`);
        continue;
      }
      const negative = label.selector === null;
      const matches = negative ? [] : await matchingCandidates(page, [label.selector!, ...(label.alt ?? [])], cands);
      const base = {
        site: site.id, task: task.id, text: task.text, negative, labelSource: label.source, confirmed: label.confirmed,
        candidates: cands.length, expectedAction: task.action,
        labelInCandidates: negative ? null : matches === null ? false : matches.length > 0,
      };
      try {
        const r = await pickElement(jev, task.text, cands, meta);
        const ok = (id: string) => (negative ? id === NONE : !!matches?.includes(id));
        const top1Ok = negative ? r.target === NONE || r.targetPresent < 0.5 : ok(r.target);
        const row: PickRow = {
          ...base,
          stages: r.stages,
          action: r.action,
          actionOk: negative ? true : r.action === task.action,
          target: r.target,
          targetConfidence: r.targetConfidence,
          targetP: r.targetTop[0]?.p ?? 0,
          marginP: (r.targetTop[0]?.p ?? 0) - (r.targetTop[1]?.p ?? 0),
          targetPresent: r.targetPresent,
          top1Ok,
          top3Ok: negative ? top1Ok : r.targetTop.some((t) => ok(t.id)),
          latencyMs: r.calls.reduce((s, c) => s + c.latencyMs, 0),
          inputTokens: r.calls.reduce((s, c) => s + c.inputTokens, 0),
          costUsd: r.calls.reduce((s, c) => s + c.costUsd, 0),
        };
        appendJsonl(runsPath, row);
        console.log(`  ${task.id.padEnd(9)} ${row.top1Ok ? "✓" : "✗"} target=${row.target} p=${row.targetP.toFixed(2)} conf=${row.targetConfidence.toFixed(2)} action=${row.action}${row.labelInCandidates === false ? " (label not in candidate list)" : ""}`);
      } catch (e) {
        appendJsonl(runsPath, { ...base, error: (e as Error).message });
        console.log(`  ${task.id}: ERROR ${(e as Error).message}`);
      }
    }
    await page.close();
  }
  await browser.close();
}
