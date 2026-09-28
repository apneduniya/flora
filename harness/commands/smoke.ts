import { harnessJev } from "../lib/jev";

export async function run() {
  const jev = harnessJev("live");
  const r = await jev.decide({
    state: { user_request: "please switch this website to dark mode" },
    questions: { wants_dark: { type: "noul", instructions: "`user_request` asks for a dark colour theme." } },
  });
  console.log(JSON.stringify({ model: r.model, answers: r.answers, usage: r.usage, latencyMs: r.latencyMs, requestId: r.requestId }, null, 2));
}
