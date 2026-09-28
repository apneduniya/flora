import type { JevRequest, JevResult, RestylePicks } from "@flora/core";

/** Saved per hostname in chrome.storage.local; re-applied on every visit with no model call. */
export interface SiteTheme {
  picks?: RestylePicks;
  prompt?: string;
  hides: { selector: string; description: string; request: string; unlockScroll?: boolean }[];
  savedAt: number;
}

export interface Settings {
  launcherHidden: boolean;
}

export type BackgroundRequest = { type: "flora:jev"; request: JevRequest };
export type JevReply = { ok: true; result: JevResult } | { ok: false; error: string };
export type ContentRequest = { type: "flora:toggle" };

export const siteKey = (host: string) => `flora:site:${host}`;
export const SETTINGS_KEY = "flora:settings";
export const PROXY = "http://localhost:8787";
