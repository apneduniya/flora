import { join } from "node:path";
import type { Args } from "../lib/args";
import { writeJson } from "../lib/io";
import { DATA_DIR } from "../lib/paths";
import { SITES } from "../sites";

/** pnpm harness lock wikipedia,mdn,... — fixes the 20 measured sites after recon. */
export async function run(a: Args) {
  const ids = (a.rest[0] ?? "").split(",").filter(Boolean);
  for (const id of ids) if (!SITES.some((s) => s.id === id)) throw new Error(`unknown site ${id}`);
  writeJson(join(DATA_DIR, "sites.lock.json"), ids);
  console.log(`locked ${ids.length} sites`);
}
