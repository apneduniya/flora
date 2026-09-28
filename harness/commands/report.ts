import { FONT_BY_ID, PALETTE_BY_ID, type DesignTokens } from "@flora/core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Args } from "../lib/args";
import { readJson, readJsonl, writeJson } from "../lib/io";
import { REPORT_DIR, siteDir } from "../lib/paths";
import type { Site } from "../sites";
import type { PickRow } from "./pick";
import type { RenderRow, RestyleRow } from "./restyle";
import { writeFileSync, mkdirSync } from "node:fs";

type Ratings = Record<string, { rater: string; match: number; look: number }[]>;
type AgentNotes = Record<string, { broken: boolean; reason: string }>;

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function quantile(xs: number[], q: number) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

interface Target {
  metric: string;
  target: string;
  value: string;
  pass: boolean | null; // null = not measured yet
  layer: "jev" | "compiler" | "human" | "picking";
}

export async function run(a: Args) {
  const sites = a.sites();
  const tokens = new Map<string, DesignTokens>();
  const restyle: RestyleRow[] = [];
  const renders: RenderRow[] = [];
  const picks: PickRow[] = [];
  for (const s of sites) {
    const t = siteDir(s.id, "tokens.json");
    if (existsSync(t)) tokens.set(s.id, readJson<DesignTokens>(t));
    restyle.push(...readJsonl<RestyleRow>(siteDir(s.id, "runs", "restyle.jsonl")));
    renders.push(...readJsonl<RenderRow>(siteDir(s.id, "runs", "renders.jsonl")));
    picks.push(...readJsonl<PickRow>(siteDir(s.id, "runs", "pick.jsonl")).filter((r) => !r.error));
  }
  // Merge every exported rater file (ratings.json, ratings-<name>.json).
  const ratings: Ratings = {};
  if (existsSync(REPORT_DIR)) {
    for (const f of readdirSync(REPORT_DIR).filter((f) => /^ratings.*\.json$/.test(f))) {
      for (const [k, v] of Object.entries(readJson<Record<string, unknown>>(join(REPORT_DIR, f)))) {
        if (k.startsWith("__") || !Array.isArray(v)) continue;
        ratings[k] = [...(ratings[k] ?? []), ...(v as Ratings[string]).filter((x) => x.match > 0)];
      }
    }
  }
  const notes = readJson<AgentNotes>(join(REPORT_DIR, "agent-notes.json"), {});
  const labelCheck = readJson<{ inCandidates: boolean | null; landmark?: string | null }[]>(join(REPORT_DIR, "label-check.json"), []);
  const labelPos = labelCheck.filter((r) => r.inCandidates !== null);

  // ---- restyle metrics ----
  const ok = restyle.filter((r) => !r.error);
  const live = ok.filter((r) => !r.cached && r.latencyMs > 0);
  const main = ok.filter((r) => r.variant === "with_summary" && r.repeat === 1);
  const noSummary = ok.filter((r) => r.variant === "no_summary");
  const groups = new Map<string, RestyleRow[]>();
  for (const r of ok.filter((r) => r.variant === "with_summary")) {
    const k = `${r.site}/${r.prompt}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const multi = [...groups.values()].filter((g) => g.length > 1);
  const stablePalette = multi.filter((g) => new Set(g.map((r) => r.picks.palette)).size === 1).length;
  const stableFont = multi.filter((g) => new Set(g.map((r) => r.picks.font)).size === 1).length;
  // Latency: prefer the sequential uncached benchmark, then the first live run's log, then live rows here.
  type Lat = { p50: number; p95: number; calls: number; source: string };
  const bench = readJson<{ summary?: Lat }>(join(REPORT_DIR, "latency-benchmark.json"), {}).summary;
  const original = readJson<Lat | Record<string, never>>(join(REPORT_DIR, "latency-original.json"), {}) as Lat | undefined;
  const latSrc: Lat | undefined = bench ?? (original && "p50" in original ? original : undefined);
  const latP50 = latSrc ? latSrc.p50 : quantile(live.map((r) => r.latencyMs), 0.5);
  const latP95 = latSrc ? latSrc.p95 : quantile(live.map((r) => r.latencyMs), 0.95);
  const costPer = mean(ok.map((r) => r.costUsd));
  const semAcc = main.length ? main.filter((r) => r.semanticOk).length / main.length : NaN;
  const semAccNoSum = noSummary.length ? noSummary.filter((r) => r.semanticOk).length / noSummary.length : NaN;
  const r1 = renders.filter((r) => r.rank === 1 && r.breakage);
  const lowContrast = mean(r1.map((r) => r.breakage!.lowContrastShare));
  const coverage = mean(r1.map((r) => r.breakage!.coverage));

  // ---- human ratings ----
  const rated = Object.values(ratings).filter((v) => v.length);
  const matchGood = rated.filter((v) => mean(v.map((x) => x.match)) >= 4).length;

  // ---- picking ----
  const pos = picks.filter((r) => !r.negative);
  const neg = picks.filter((r) => r.negative);
  const top1 = pos.length ? pos.filter((r) => r.top1Ok).length / pos.length : NaN;
  const top3 = pos.length ? pos.filter((r) => r.top3Ok).length / pos.length : NaN;
  const fp = neg.length ? neg.filter((r) => !r.top1Ok).length / neg.length : NaN;
  const recall = pos.length ? pos.filter((r) => r.labelInCandidates).length / pos.length : NaN;
  const threshold = chooseThreshold(picks);

  const T: Target[] = [
    { layer: "jev", metric: "Restyle latency p50 (from India)", target: "< 600ms", value: fmtMs(latP50), pass: n(latP50) ? latP50 < 600 : null },
    { layer: "jev", metric: "Cost per restyle", target: "< $0.001", value: n(costPer) ? `$${costPer.toFixed(6)}` : "—", pass: n(costPer) ? costPer < 0.001 : null },
    { layer: "jev", metric: "Automatic semantic accuracy", target: "≥ 90%", value: n(semAcc) ? pct(semAcc) : "—", pass: n(semAcc) ? semAcc >= 0.9 : null },
    { layer: "jev", metric: "Stability across repeats (palette)", target: "≥ 85%", value: multi.length ? pct(stablePalette / multi.length) : "—", pass: multi.length ? stablePalette / multi.length >= 0.85 : null },
    { layer: "human", metric: 'Human "matches request" ≥ 4/5', target: "≥ 70% of cases", value: rated.length ? `${pct(matchGood / rated.length)} of ${rated.length}` : "not rated yet", pass: rated.length ? matchGood / rated.length >= 0.7 : null },
    { layer: "compiler", metric: "Text failing contrast after restyle", target: "< 5%", value: n(lowContrast) ? pct(lowContrast) : "—", pass: n(lowContrast) ? lowContrast < 0.05 : null },
    { layer: "picking", metric: "Pick top-1 / top-3", target: "≥ 80% / ≥ 95%", value: n(top1) ? `${pct(top1)} / ${pct(top3)}` : "—", pass: n(top1) ? top1 >= 0.8 && top3 >= 0.95 : null },
    { layer: "picking", metric: "Precision above confidence threshold", target: "≥ 95% while auto-acting ≥ 70%", value: threshold ? `${pct(threshold.precision)} at p≥${threshold.t.toFixed(2)}, auto-acts on ${pct(threshold.coverage)}` : "—", pass: threshold ? threshold.precision >= 0.95 && threshold.coverage >= 0.7 : null },
  ];

  const extra = {
    restyleCalls: restyle.length,
    restyleErrors: restyle.filter((r) => r.error).length,
    liveCalls: live.length,
    latencyP95: latP95,
    latencySource: latSrc?.source ?? "live rows in this run",
    latencyFirstLiveRun: original && "p50" in original ? original : null,
    semanticAccuracyNoSummary: semAccNoSum,
    stabilityFont: multi.length ? stableFont / multi.length : NaN,
    paletteConfidenceMedian: quantile(main.map((r) => r.picks.paletteConfidence), 0.5),
    outOfCatalogRate: main.length ? main.filter((r) => r.picks.outOfCatalog > 0.5).length / main.length : NaN,
    coverage,
    invisibleTextCases: r1.filter((r) => r.breakage!.invisible > 0).length,
    meanLayoutShiftPx: mean(r1.map((r) => r.shift?.meanShiftPx ?? 0)),
    compileMsMean: mean(r1.map((r) => r.compileMs)),
    applyMsMean: mean(r1.map((r) => r.applyMs)),
    pickFalsePositiveRate: fp,
    pickCandidateRecall: n(recall) ? recall : labelPos.length ? labelPos.filter((r) => r.inCandidates).length / labelPos.length : NaN,
    a11yLandmarkOnlyRecall: labelPos.length ? labelPos.filter((r) => r.landmark).length / labelPos.length : NaN,
    pickActionAccuracy: pos.length ? pos.filter((r) => r.actionOk).length / pos.length : NaN,
    pickLatencyP50: quantile(picks.map((r) => r.latencyMs).filter((x) => x > 0), 0.5),
    pickTwoStageShare: picks.length ? picks.filter((r) => r.stages === 2).length / picks.length : NaN,
    totalCostUsd: restyle.reduce((s, r) => s + r.costUsd, 0) + picks.reduce((s, r) => s + r.costUsd, 0),
    perPromptAccuracy: Object.fromEntries(
      [...new Set(main.map((r) => r.prompt))].map((p) => {
        const rows = main.filter((r) => r.prompt === p);
        return [p, rows.filter((r) => r.semanticOk).length / rows.length];
      }),
    ),
  };

  const mock = restyle.some((r) => r.model === "MOCK");
  if (mock) console.log("⚠ report includes MOCK rows (JEV_MODE=mock): numbers are NOT real Jev results");
  mkdirSync(REPORT_DIR, { recursive: true });
  writeJson(join(REPORT_DIR, "metrics.json"), { targets: T, extra, threshold });
  writeFileSync(join(REPORT_DIR, "report.md"), markdown(T, extra, threshold, main, sites, tokens));
  const page = html(T, extra, sites, tokens, main, renders, picks, notes);
  writeFileSync(join(REPORT_DIR, "index.html"), mock ? page.replace("<h1>", '<p style="background:#b00020;color:#fff;padding:8px;font-weight:bold">MOCK DATA: pipeline dry-run with random answers, not real Jev results</p><h1>') : page);
  console.log(markdownTable(T));
  console.log(`\nreport: ${join(REPORT_DIR, "index.html")}`);
}

const n = (x: number) => Number.isFinite(x);
const fmtMs = (x: number) => (n(x) ? `${Math.round(x)}ms` : "—");

/** Lowest target-probability threshold whose precision is ≥ 95%; reports how often we'd auto-act. */
function chooseThreshold(rows: PickRow[]) {
  const scored = rows.filter((r) => !r.negative);
  if (scored.length < 5) return null;
  let best: { t: number; precision: number; coverage: number } | null = null;
  for (let t = 0; t <= 0.95; t += 0.05) {
    const acted = scored.filter((r) => r.targetP >= t && r.target !== "none_of_these");
    if (!acted.length) continue;
    const precision = acted.filter((r) => r.top1Ok).length / acted.length;
    const coverage = acted.length / scored.length;
    if (precision >= 0.95) return { t, precision, coverage };
    if (!best || precision > best.precision) best = { t, precision, coverage };
  }
  return best;
}

function markdownTable(T: Target[]) {
  const mark = (p: boolean | null) => (p === null ? "⏳" : p ? "✅" : "❌");
  return [
    "| Layer | Metric | Target | Result | |",
    "|---|---|---|---|---|",
    ...T.map((t) => `| ${t.layer} | ${t.metric} | ${t.target} | ${t.value} | ${mark(t.pass)} |`),
  ].join("\n");
}

function markdown(T: Target[], extra: Record<string, unknown>, threshold: unknown, main: RestyleRow[], sites: Site[], tokens: Map<string, DesignTokens>) {
  const failing = T.filter((t) => t.pass === false);
  const pending = T.filter((t) => t.pass === null);
  const verdict = pending.length
    ? `**Incomplete**: ${pending.length} target(s) not measured yet (${pending.map((t) => t.metric).join("; ")}).`
    : failing.length
      ? `**No-go as-is**: ${failing.length} target(s) missed (${failing.map((t) => `${t.metric} [${t.layer}]`).join("; ")}). See the layer column for what to fix.`
      : "**Go**: every target met.";
  const gaps = main.filter((r) => !r.semanticOk || r.picks.outOfCatalog > 0.5);
  return `# flora Jev restyle spike: report

Generated ${new Date().toISOString()} · ${sites.length} sites · ${tokens.size} with tokens

## Verdict
${verdict}

## Targets
${markdownTable(T)}

## Other numbers
\`\`\`json
${JSON.stringify(extra, null, 2)}
\`\`\`

## Pick threshold
\`\`\`json
${JSON.stringify(threshold, null, 2)}
\`\`\`

## Catalog gaps (wrong palette kind, or Jev flagged out-of-catalog)
${gaps.length ? gaps.map((r) => `- ${r.site} · "${r.promptText}" → ${r.picks.palette} (conf ${r.picks.paletteConfidence.toFixed(2)}, out-of-catalog ${r.picks.outOfCatalog.toFixed(2)})`).join("\n") : "- none"}
`;
}

function swatch(hex: string, label: string) {
  return `<span class="sw" style="background:${hex}" title="${esc(label)} ${hex}"></span>`;
}

function html(
  T: Target[],
  extra: Record<string, unknown>,
  sites: Site[],
  tokens: Map<string, DesignTokens>,
  main: RestyleRow[],
  renders: RenderRow[],
  picks: PickRow[],
  notes: AgentNotes,
) {
  const img = (site: string, file: string) => `../data/${site}/${file}`;
  const mark = (p: boolean | null) => (p === null ? "⏳" : p ? "✅" : "❌");
  const extraction = sites
    .map((s) => {
      const t = tokens.get(s.id);
      if (!t) return `<tr><td>${s.id}</td><td colspan=3>no tokens</td></tr>`;
      const roleCells = Object.entries(t.roles)
        .map(([r, id]) => {
          const k = t.clusters.find((c) => c.id === id);
          return k ? `<div>${swatch(k.hex, r)} <b>${r}</b> ${esc(k.name)}</div>` : `<div class="dim">${r}: —</div>`;
        })
        .join("");
      return `<tr><td><b>${s.id}</b><br><img class="thumb" src="${img(s.id, "before.png")}"></td><td>${roleCells}</td>
        <td>${t.clusters.map((c) => swatch(c.hex, c.name)).join("")}<br><span class="dim">${t.cssVars.length} colour vars</span></td>
        <td class="small">${esc(t.summary)}<br><label>roles look right? <select data-rate="extract/${s.id}/ok"><option></option><option>yes</option><option>no</option></select></label></td></tr>`;
    })
    .join("");

  // Cases: sort worst first (agent-flagged broken, then low contrast).
  const cases = main
    .map((r) => {
      const key = `${r.site}/${r.prompt}`;
      const rs = renders.filter((x) => x.site === r.site && x.prompt === r.prompt).sort((a, b) => a.rank - b.rank);
      const b = rs.find((x) => x.rank === 1)?.breakage;
      return { r, key, rs, b, note: notes[key] };
    })
    .sort((x, y) => Number(!!y.note?.broken) - Number(!!x.note?.broken) || (y.b?.lowContrastShare ?? 0) - (x.b?.lowContrastShare ?? 0));

  const caseHtml = cases
    .map(({ r, key, rs, b, note }) => {
      const pal = PALETTE_BY_ID.get(r.picks.palette);
      const font = FONT_BY_ID.get(r.picks.font);
      const alts = rs
        .map((x) => `<figure><img src="${img(r.site, x.shot)}"><figcaption>#${x.rank} ${esc(x.palette)}</figcaption></figure>`)
        .join("");
      return `<section class="case ${note?.broken ? "broken" : ""}" id="${key}">
        <h3>${esc(r.site)} · “${esc(r.promptText)}” ${r.semanticOk ? "✅" : "❌"}</h3>
        <p class="small">palette <b>${esc(pal?.name ?? r.picks.palette)}</b> (conf ${r.picks.paletteConfidence.toFixed(2)}; top: ${r.picks.paletteTop.map((t) => `${t.id} ${t.p}`).join(", ")}) · font <b>${esc(font?.name ?? r.picks.font)}</b> · ${r.picks.density} · corners ${r.picks.radius} · reading ${r.picks.readingMode.toFixed(2)} · out-of-catalog ${r.picks.outOfCatalog.toFixed(2)} · ${r.cached ? "cached" : `${r.latencyMs}ms`}</p>
        ${b ? `<p class="small">contrast failures ${pct(b.lowContrastShare)} of ${b.textSampled} text samples · invisible ${b.invisible} · recoloured ${pct(b.coverage)}</p>` : ""}
        ${note ? `<p class="note">agent note: ${note.broken ? "⚠️ looks broken" : "looks OK"}: ${esc(note.reason)}</p>` : ""}
        <div class="row"><figure><img src="${img(r.site, "before.png")}"><figcaption>before</figcaption></figure>${alts}</div>
        <div class="rate">Matches request <select data-rate="${key}/match">${opts()}</select>
        Looks good / not broken <select data-rate="${key}/look">${opts()}</select></div>
      </section>`;
    })
    .join("");

  const pickRows = picks
    .map(
      (p) => `<tr class="${p.top1Ok ? "" : "bad"}"><td>${p.site}</td><td>${esc(p.text)}${p.negative ? " <i>(neg)</i>" : ""}</td><td>${p.top1Ok ? "✅" : "❌"}</td><td>${p.top3Ok ? "✅" : "❌"}</td>
      <td>${esc(p.target)}</td><td>${p.targetP.toFixed(2)}</td><td>${p.targetConfidence.toFixed(2)}</td><td>${p.action}${p.actionOk ? "" : " ❌"}</td>
      <td>${p.labelInCandidates === false ? "missing" : p.labelInCandidates ? "yes" : "—"}</td><td>${p.candidates}/${p.stages}</td><td>${p.latencyMs}ms</td><td>${p.labelSource}${p.confirmed ? "" : " (unconfirmed)"}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>flora spike report</title>
<style>
body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#222;max-width:1500px}
table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}
.sw{display:inline-block;width:18px;height:18px;border:1px solid #0002;border-radius:3px;vertical-align:middle;margin-right:2px}
.thumb{width:220px;display:block;margin-top:4px;border:1px solid #ddd}.dim{color:#888}.small{font-size:12px;color:#444}
.case{border:1px solid #ddd;border-radius:8px;padding:12px;margin:16px 0}.case.broken{border-color:#c33;background:#fff6f6}
.row{display:flex;gap:8px;overflow-x:auto}.row figure{margin:0}.row img{width:340px;border:1px solid #ccc}figcaption{font-size:12px;color:#555}
.note{background:#fff8e1;padding:4px 8px;border-radius:4px}.rate{margin-top:8px}tr.bad td{background:#fff3f3}
#bar{position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid #eee;z-index:2}
</style></head><body>
<div id="bar">Rater name <input id="rater" placeholder="your name"> <button onclick="exportRatings()">Export ratings.json</button>
<span class="small">Ratings save in this browser; export and put the file at harness/report/ratings.json, then re-run <code>pnpm harness report</code>.</span></div>
<h1>flora Jev restyle spike</h1>
<h2>Targets</h2><table><tr><th>Layer</th><th>Metric</th><th>Target</th><th>Result</th><th></th></tr>
${T.map((t) => `<tr><td>${t.layer}</td><td>${t.metric}</td><td>${t.target}</td><td>${esc(t.value)}</td><td>${mark(t.pass)}</td></tr>`).join("")}</table>
<details><summary>Other numbers</summary><pre>${esc(JSON.stringify(extra, null, 2))}</pre></details>
<h2>1 · Token extraction (check the roles by eye)</h2><table><tr><th>Site</th><th>Roles</th><th>Clusters</th><th>Summary sent to Jev</th></tr>${extraction}</table>
<h2>2 · Restyle cases (worst first)</h2>${caseHtml || "<p>No restyle runs yet.</p>"}
<h2>3 · Element picking</h2><table><tr><th>Site</th><th>Task</th><th>Top-1</th><th>Top-3</th><th>Pick</th><th>p</th><th>conf</th><th>Action</th><th>Label in list</th><th>Cands/stages</th><th>Latency</th><th>Label</th></tr>${pickRows}</table>
<script>
const KEY='flora-ratings';const store=JSON.parse(localStorage.getItem(KEY)||'{}');
document.getElementById('rater').value=localStorage.getItem('flora-rater')||'';
document.getElementById('rater').oninput=e=>localStorage.setItem('flora-rater',e.target.value);
for(const s of document.querySelectorAll('select[data-rate]')){s.value=store[s.dataset.rate]||'';s.onchange=()=>{store[s.dataset.rate]=s.value;localStorage.setItem(KEY,JSON.stringify(store));};}
function exportRatings(){const rater=document.getElementById('rater').value||'anon';const out={};
for(const [k,v] of Object.entries(store)){if(!v||k.startsWith('extract/'))continue;const [site,prompt,field]=k.split('/');const key=site+'/'+prompt;
out[key]=out[key]||[{rater,match:0,look:0}];out[key][0][field]=Number(v);}
out.__extract=Object.fromEntries(Object.entries(store).filter(([k])=>k.startsWith('extract/')));
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));a.download='ratings-'+rater+'.json';a.click();}
</script></body></html>`;
}

const opts = () => ["", "1", "2", "3", "4", "5"].map((v) => `<option>${v}</option>`).join("");
