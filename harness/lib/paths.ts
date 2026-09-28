import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HARNESS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const ROOT_DIR = dirname(HARNESS_DIR);
export const DATA_DIR = join(HARNESS_DIR, "data");
export const REPORT_DIR = join(HARNESS_DIR, "report");
export const CACHE_DIR = join(HARNESS_DIR, ".jev-cache");

export function siteDir(id: string, ...rest: string[]) {
  const p = join(DATA_DIR, id, ...rest);
  mkdirSync(rest.length ? dirname(p) : p, { recursive: true });
  return p;
}
