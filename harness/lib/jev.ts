// Harness Jev client: live TypeSafe API with an on-disk record/replay cache.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createJevClient, type JevCallLog, type JevResponse } from "@flora/core";
import { CACHE_DIR, ROOT_DIR } from "./paths";

let envLoaded = false;
export function loadEnv() {
  if (envLoaded) return;
  envLoaded = true;
  const p = join(ROOT_DIR, ".env");
  if (existsSync(p)) process.loadEnvFile(p);
}

export const callLog: JevCallLog[] = [];

/**
 * Pipeline dry-run only (JEV_MODE=mock): answers are random-but-valid, NOT model output.
 * Uses its own cache dir so mock results can never be mistaken for real ones.
 */
const mockFetch: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string; criteria?: unknown }> };
  const answers: Record<string, unknown> = {};
  for (const [id, q] of Object.entries(body.questions)) {
    if (q.type === "noul") answers[id] = { type: "noul", noul: Math.random() };
    else if (q.type === "choice") {
      const keys = Object.keys(q.criteria as object);
      const w = keys.map(() => Math.random() ** 3);
      const sum = w.reduce((a, b) => a + b, 0);
      const probabilities = Object.fromEntries(keys.map((k, i) => [k, w[i] / sum]));
      const choice = keys[w.indexOf(Math.max(...w))];
      answers[id] = { type: "choice", choice, probabilities, confidence: Math.random() };
    } else {
      const n = (q.criteria as unknown[]).length;
      answers[id] = { type: "score", score: Math.random() * (n - 1), legend: {}, probabilities: {}, confidence: Math.random() };
    }
  }
  await new Promise((r) => setTimeout(r, 50));
  return new Response(JSON.stringify({ model: "MOCK", answers, usage: { input_tokens: JSON.stringify(body).length / 4, output_tokens: 0 } }), { status: 200 });
};

export function harnessJev(mode: "live" | "record" | "replay" | "mock" = (process.env.JEV_MODE as never) ?? "record", opts: { noCache?: boolean } = {}) {
  loadEnv();
  const mock = mode === "mock";
  const apiKey = mock ? "mock" : process.env.TYPESAFE_API_KEY;
  if (!apiKey && mode !== "replay") {
    throw new Error("TYPESAFE_API_KEY is not set. Put it in flora/.env (see .env.example), or run with JEV_MODE=replay.");
  }
  const cacheDir = mock ? `${CACHE_DIR}-mock` : CACHE_DIR;
  mkdirSync(cacheDir, { recursive: true });
  if (mock) console.log("⚠ JEV_MODE=mock: random answers for a pipeline dry-run, not real Jev output");
  return createJevClient({
    fetch: mock ? mockFetch : undefined,
    apiKey,
    baseUrl: process.env.TYPESAFE_BASE_URL,
    model: process.env.JEV_MODEL ?? "jev-latest",
    concurrency: Number(process.env.JEV_CONCURRENCY ?? 4),
    mode: mock ? "live" : mode,
    hash: (s) => createHash("sha256").update(s).digest("hex").slice(0, 32),
    cache: opts.noCache ? undefined : {
      async get(key) {
        const p = join(cacheDir, `${key}.json`);
        return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as JevResponse) : undefined;
      },
      async set(key, value) {
        writeFileSync(join(cacheDir, `${key}.json`), JSON.stringify(value));
      },
    },
    onCall: (l) => {
      callLog.push(l);
      const tag = l.error ? `ERROR ${l.error}` : l.cached ? "cached" : `${l.latencyMs}ms`;
      console.log(`  jev ${tag} · ${l.questions}q · ${l.inputTokens} in-tok · $${l.costUsd.toFixed(6)}${l.attempts > 1 ? ` · ${l.attempts} attempts` : ""}`);
    },
  });
}
