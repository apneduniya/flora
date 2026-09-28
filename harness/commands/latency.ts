import { buildRestyleRequest, type DesignTokens } from "@flora/core";
import { join } from "node:path";
import type { Args } from "../lib/args";
import { readJson, writeJson } from "../lib/io";
import { harnessJev } from "../lib/jev";
import { REPORT_DIR, siteDir } from "../lib/paths";
import { promptsFor } from "../sites";

/** Fresh, uncached, one-at-a-time restyle calls (3 prompts per site) to measure real per-request latency. */
export async function run(a: Args) {
  const jev = harnessJev("live", { noCache: true });
  const rows: { site: string; prompt: string; latencyMs: number; inputTokens: number }[] = [];
  for (const site of a.sites()) {
    const tokens = readJson<DesignTokens>(siteDir(site.id, "tokens.json"));
    for (const prompt of promptsFor(site).filter((p) => ["dark", "sepia", "site"].includes(p.id))) {
      const r = await jev.decide(buildRestyleRequest({ request: prompt.text, site: { category: site.category, currentDesign: tokens.summary } }));
      rows.push({ site: site.id, prompt: prompt.id, latencyMs: r.latencyMs, inputTokens: r.usage.input_tokens });
    }
  }
  const lat = rows.map((r) => r.latencyMs).sort((x, y) => x - y);
  const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(p * (lat.length - 1)))];
  const summary = { source: `sequential uncached benchmark ${new Date().toISOString()}`, calls: lat.length, p50: q(0.5), p90: q(0.9), p95: q(0.95), min: lat[0], max: lat[lat.length - 1] };
  writeJson(join(REPORT_DIR, "latency-benchmark.json"), { summary, rows });
  console.log(summary);
}
