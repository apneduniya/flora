// Localhost proxy for the spike extension: holds TYPESAFE_API_KEY so it never ships in the extension.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createJevClient, JevError, type JevRequest } from "@flora/core";
import { Hono } from "hono";
import { cors } from "hono/cors";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
if (!process.env.TYPESAFE_API_KEY) console.warn("⚠ TYPESAFE_API_KEY is not set (flora/.env); /decide will fail.");

const jev = createJevClient({
  apiKey: process.env.TYPESAFE_API_KEY,
  baseUrl: process.env.TYPESAFE_BASE_URL,
  model: process.env.JEV_MODEL ?? "jev-latest",
  concurrency: 3,
  mode: "live",
  onCall: (l) => console.log(`jev ${l.error ? `ERROR ${l.error}` : `${l.latencyMs}ms`} · ${l.questions}q · ${l.inputTokens} tok · $${l.costUsd.toFixed(6)}`),
});

const app = new Hono();
// Only the extension (and local tools) may call the proxy.
app.use("*", cors({ origin: (o) => (o?.startsWith("chrome-extension://") || o?.startsWith("http://localhost") ? o : null) }));
app.get("/health", (c) => c.json({ ok: true, keyConfigured: !!process.env.TYPESAFE_API_KEY, model: jev.model }));
app.post("/decide", async (c) => {
  const body = (await c.req.json()) as JevRequest;
  if (!body?.questions || body.state === undefined) return c.json({ error: "expected { state, questions }" }, 400);
  try {
    return c.json(await jev.decide(body));
  } catch (e) {
    const status = e instanceof JevError && e.status ? e.status : 502;
    return c.json({ error: (e as Error).message }, status as 400);
  }
});

const port = Number(process.env.FLORA_SERVER_PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => console.log(`flora proxy on http://localhost:${port}`));
