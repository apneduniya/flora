// Minimal TypeSafe System One client (POST /v1/systemone), shaped after docs.typesafe.ai/api.
// Runtime-agnostic: no Node imports, so the extension proxy and the harness share it.

export type Criteria = string | Record<string, unknown> | unknown[] | null;

export type Question =
  | { type: "noul"; instructions: Criteria; criteria?: { true?: Criteria; false?: Criteria } }
  | { type: "choice"; instructions: Criteria; criteria: Record<string, Criteria> }
  | { type: "score"; instructions: Criteria; criteria: Criteria[] };

export interface JevRequest {
  state: unknown;
  questions: Record<string, Question>;
  model?: string;
}

export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export interface JevResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface JevResult extends JevResponse {
  requestId?: string;
  latencyMs: number;
  costUsd: number;
  cached: boolean;
  attempts: number;
}

export interface JevCache {
  get(key: string): Promise<JevResponse | undefined>;
  set(key: string, value: JevResponse): Promise<void>;
}

export interface JevClientOptions {
  apiKey?: string;
  baseUrl?: string; // default https://api.typesafe.ai
  /** Full endpoint override, e.g. the local flora proxy "http://localhost:8787/decide". */
  endpoint?: string;
  model?: string; // default jev-latest
  concurrency?: number; // default 4
  maxRetries?: number; // default 4
  timeoutMs?: number; // default 20000
  /** "live" = always call, "record" = use cache else call and store, "replay" = cache only. */
  mode?: "live" | "record" | "replay";
  cache?: JevCache;
  hash?: (s: string) => Promise<string> | string;
  onCall?: (log: JevCallLog) => void;
  fetch?: typeof fetch;
}

export interface JevCallLog {
  key?: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cached: boolean;
  attempts: number;
  questions: number;
  error?: string;
}

/** $0.042 per million input tokens; output is free (TypeSafe pricing, Sept 2026). */
export const INPUT_USD_PER_TOKEN = 0.042 / 1_000_000;

export class JevError extends Error {
  constructor(message: string, readonly status?: number, readonly body?: string) {
    super(message);
  }
}

export function createJevClient(opts: JevClientOptions = {}) {
  const endpoint = opts.endpoint ?? `${(opts.baseUrl ?? "https://api.typesafe.ai").replace(/\/$/, "")}/v1/systemone`;
  const model = opts.model ?? "jev-latest";
  const mode = opts.mode ?? (opts.cache ? "record" : "live");
  const maxRetries = opts.maxRetries ?? 4;
  const doFetch = opts.fetch ?? fetch;

  // Simple semaphore.
  let active = 0;
  const queue: (() => void)[] = [];
  const limit = opts.concurrency ?? 4;
  const acquire = () =>
    active < limit ? (active++, Promise.resolve()) : new Promise<void>((r) => queue.push(() => (active++, r())));
  const release = () => {
    active--;
    queue.shift()?.();
  };

  // Global cooldown after a 429 (AnyFilter pattern): every request waits it out.
  let coolUntil = 0;
  let coolMs = 0;

  async function call(body: JevRequest & { model: string }): Promise<{ res: JevResponse; attempts: number; requestId?: string }> {
    let attempt = 0;
    for (;;) {
      attempt++;
      const wait = coolUntil - Date.now();
      if (wait > 0) await sleep(wait);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
      try {
        const r = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
          },
          // Truncated page text can split an emoji into a lone surrogate, which the API rejects (HTTP 400).
          // (JSON.stringify escapes a lone surrogate as "\ud83e", so each string is fixed before serialising.)
          body: JSON.stringify(body, (_k, v) => (typeof v === "string" ? wellFormed(v) : v)),
          signal: ctrl.signal,
        });
        const requestId = r.headers.get("x-typesafe-request-id") ?? undefined;
        if (r.ok) {
          coolMs = 0;
          const res = (await r.json()) as JevResponse;
          const bad = validateAnswers(body.questions, res);
          if (bad) throw new JevError(`Jev returned an invalid answer: ${bad}`, r.status);
          return { res, attempts: attempt, requestId };
        }
        const text = await r.text();
        if (r.status === 401 || r.status === 403) throw new JevError(`Jev auth error ${r.status}: check TYPESAFE_API_KEY`, r.status, text);
        const retryable = r.status === 408 || r.status === 429 || r.status >= 500;
        if (!retryable || attempt > maxRetries) throw new JevError(`Jev HTTP ${r.status}: ${text.slice(0, 500)}`, r.status, text);
        const ms = Number(r.headers.get("retry-after-ms"));
        const s = Number(r.headers.get("retry-after"));
        const delay = Number.isFinite(ms) && ms > 0 ? ms : Number.isFinite(s) && s > 0 ? s * 1000 : backoff(attempt);
        if (r.status === 429) {
          coolMs = Math.min(300_000, Math.max(delay, coolMs ? coolMs * 2 : 2000));
          coolUntil = Date.now() + coolMs;
        }
        await sleep(Math.min(delay, 60_000));
      } catch (e) {
        if (e instanceof JevError) throw e;
        if (attempt > maxRetries) throw new JevError(`Jev request failed: ${(e as Error).message}`);
        await sleep(backoff(attempt));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return {
    model,
    /** `cacheSalt` separates otherwise-identical calls in the cache (e.g. repeat 1/2/3 of a stability test). */
    async decide(req: JevRequest, callOpts: { cacheSalt?: string } = {}): Promise<JevResult> {
      const body = { model: req.model ?? model, state: req.state, questions: req.questions };
      const key = opts.cache && opts.hash ? await opts.hash(JSON.stringify(body) + (callOpts.cacheSalt ?? "")) : undefined;
      const questions = Object.keys(req.questions).length;

      if (key && mode !== "live") {
        const hit = await opts.cache!.get(key);
        if (hit) {
          const out = { ...hit, latencyMs: 0, costUsd: hit.usage.input_tokens * INPUT_USD_PER_TOKEN, cached: true, attempts: 0 };
          opts.onCall?.({ key, model: hit.model, latencyMs: 0, inputTokens: hit.usage.input_tokens, outputTokens: hit.usage.output_tokens, costUsd: out.costUsd, cached: true, attempts: 0, questions });
          return out;
        }
        if (mode === "replay") throw new JevError(`replay mode: no cached response for ${key}`);
      }

      await acquire();
      const t0 = performance.now();
      try {
        const { res, attempts, requestId } = await call(body);
        const latencyMs = Math.round(performance.now() - t0);
        const costUsd = res.usage.input_tokens * INPUT_USD_PER_TOKEN;
        if (key) await opts.cache!.set(key, res);
        opts.onCall?.({ key, model: res.model, latencyMs, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, costUsd, cached: false, attempts, questions });
        return { ...res, requestId, latencyMs, costUsd, cached: false, attempts };
      } catch (e) {
        opts.onCall?.({ key, model: body.model, latencyMs: Math.round(performance.now() - t0), inputTokens: 0, outputTokens: 0, costUsd: 0, cached: false, attempts: maxRetries + 1, questions, error: (e as Error).message });
        throw e;
      } finally {
        release();
      }
    },
  };
}

export type JevClient = ReturnType<typeof createJevClient>;

const wellFormed = (s: string) =>
  typeof (s as { toWellFormed?: () => string }).toWellFormed === "function"
    ? (s as unknown as { toWellFormed: () => string }).toWellFormed()
    : s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(8000, 400 * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);

/**
 * Rejects malformed responses before anything acts on them (jev-ultrafast pattern): every question
 * answered with the right type, choices among the offered keys, probabilities summing to ~1.
 */
export function validateAnswers(questions: Record<string, Question>, res: JevResponse): string | null {
  if (!res || typeof res.answers !== "object") return "missing answers";
  for (const [id, q] of Object.entries(questions)) {
    const a = res.answers[id];
    if (!a) return `no answer for ${id}`;
    if (a.type !== q.type) return `${id}: expected ${q.type}, got ${a.type}`;
    if (a.type === "noul" && !(a.noul >= 0 && a.noul <= 1)) return `${id}: noul out of range`;
    if (a.type === "choice" && q.type === "choice") {
      const keys = Object.keys(q.criteria);
      if (!keys.includes(a.choice)) return `${id}: choice ${a.choice} not offered`;
      const sum = Object.values(a.probabilities).reduce((t, p) => t + p, 0);
      if (Math.abs(sum - 1) > 0.02) return `${id}: probabilities sum to ${sum.toFixed(3)}`;
    }
  }
  return null;
}

/** Top-n options of a choice answer, most probable first. */
export function topChoices(a: Answer | undefined, n = 3): { id: string; p: number }[] {
  if (!a || a.type !== "choice") return [];
  return Object.entries(a.probabilities)
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([id, p]) => ({ id, p: Math.round(p * 1000) / 1000 }));
}
