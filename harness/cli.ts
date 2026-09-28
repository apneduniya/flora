// pnpm harness <command> [--sites a,b] [--live] [--repeats 3] [--headed]
import { parseArgs } from "./lib/args";

const commands: Record<string, () => Promise<{ run: (a: ReturnType<typeof parseArgs>) => Promise<void> }>> = {
  smoke: () => import("./commands/smoke"),
  snapshot: () => import("./commands/snapshot"),
  extract: () => import("./commands/extract"),
  restyle: () => import("./commands/restyle"),
  label: () => import("./commands/label"),
  pick: () => import("./commands/pick"),
  report: () => import("./commands/report"),
  lock: () => import("./commands/lock"),
  preview: () => import("./commands/preview"),
  checklabels: () => import("./commands/checklabels"),
  exttest: () => import("./commands/exttest"),
  latency: () => import("./commands/latency"),
  suggest: () => import("./commands/suggest"),
};

const args = parseArgs(process.argv.slice(2));
const load = commands[args.command];
if (!load) {
  console.log(`usage: pnpm harness <${Object.keys(commands).join("|")}> [--sites a,b] [--live] [--repeats N] [--headed]`);
  process.exit(args.command ? 1 : 0);
}
const mod = await load();
await mod.run(args);
