import { join } from "node:path";
import { activeSites, SITES, type Site } from "../sites";
import { readJson } from "./io";
import { DATA_DIR } from "./paths";

export function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  const [command = "", ...rest] = positional;
  return {
    command,
    rest,
    flags,
    live: flags.live === true,
    headed: flags.headed === true,
    repeats: Number(flags.repeats ?? 3),
    sites(): Site[] {
      if (typeof flags.sites === "string") {
        return flags.sites.split(",").map((id) => {
          const s = SITES.find((x) => x.id === id);
          if (!s) throw new Error(`unknown site ${id}`);
          return s;
        });
      }
      if (flags.all) return SITES;
      const lock = readJson<string[]>(join(DATA_DIR, "sites.lock.json"), []);
      return activeSites(lock);
    },
  };
}

export type Args = ReturnType<typeof parseArgs>;
