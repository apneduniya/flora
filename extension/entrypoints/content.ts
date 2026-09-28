import {
  buildRestyleRequest, buildSuggestionPool, buildSuggestRequest, NONE, parseRestyle, parseRoute, pickElement, pickSuggestions,
  type DesignTokens, type JevClient, type JevRequest, type JevResult, type RestylePicks, type Suggestion,
} from "@flora/core";
import { applyExtraCss, applyTheme, compileTheme, extractCandidates, extractTokens, gatherPageFacts, removeTheme } from "@flora/core/inpage";
import { SETTINGS_KEY, siteKey, type ContentRequest, type JevReply, type Settings, type SiteTheme } from "../lib/messages";
import { FloraWidget, type Controller, type PickOption, type RunResult } from "../lib/widget/widget";

const HIDE_ID = "flora-hides";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  async main() {
    if (window.top !== window) return; // widget only in the top frame
    const host = location.hostname;
    const key = siteKey(host);

    // Tokens always come from the untouched page, before any theme is applied.
    let original: DesignTokens | null = null;
    const tokens = () => (original ??= extractTokens());

    let saved: SiteTheme = ((await browser.storage.local.get(key))[key] as SiteTheme | undefined) ?? { hides: [], savedAt: 0 };
    const settings: Settings = ((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as Settings | undefined) ?? { launcherHidden: false };

    // Applied but not yet saved: a look, or "none" when the user undid a saved look.
    let previewPicks: RestylePicks | "none" | null = null;
    let lookPrompt = ""; // the request behind the look on screen (for follow-ups like "a bit warmer")
    let pendingHide: string | null = null;

    // Full-screen overlays (consent walls, sign-in modals) usually lock page scrolling; hiding one unlocks it.
    const isBlockingOverlay = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (cs.position === "fixed" || cs.position === "sticky") && r.width * r.height > innerWidth * innerHeight * 0.5;
    };
    const hideCss = (sels: string[], unlock: boolean) =>
      sels.map((s) => `${s} { display: none !important; }`).join("\n") + (unlock ? "\nhtml, body { overflow: auto !important; }" : "");
    let pendingUnlock = false;
    const applyHides = () =>
      applyExtraCss(
        HIDE_ID,
        hideCss([...saved.hides.map((h) => h.selector), ...(pendingHide ? [pendingHide] : [])], saved.hides.some((h) => h.unlockScroll) || pendingUnlock),
      );
    const applyPicks = (picks: RestylePicks | undefined) => {
      if (picks) applyTheme(tokens(), compileTheme(tokens(), picks));
      else removeTheme();
    };

    // Re-apply the saved theme on every visit: extraction + compile + stamping, no model call.
    if (saved.picks || saved.hides.length) {
      const t0 = performance.now();
      applyPicks(saved.picks);
      applyHides();
      console.debug(`[flora] re-applied saved look in ${Math.round(performance.now() - t0)}ms`);
    }

    const jev = {
      model: "proxy",
      async decide(request: JevRequest): Promise<JevResult> {
        const r = (await browser.runtime.sendMessage({ type: "flora:jev", request })) as JevReply;
        if (!r.ok) throw new Error(r.error);
        return r.result;
      },
    } as unknown as JevClient;

    const store = async () => {
      saved.savedAt = Date.now();
      if (!saved.picks && !saved.hides.length) await browser.storage.local.remove(key);
      else await browser.storage.local.set({ [key]: saved });
    };

    let candidateDescriptions = new Map<string, { selector: string; description: string; label: string }>();
    const REGION_LABEL: Record<string, string> = { header: "Top bar", nav: "Menu", left: "Left column", right: "Right column", main: "Main area", footer: "Footer", overlay: "Pop-up / floating" };
    const friendly = (c: { region: string; description: string }) => {
      const text = c.description.match(/text starts: "([^"]*)/)?.[1];
      const label = c.description.match(/labelled "([^"]+)"/)?.[1];
      return `${REGION_LABEL[c.region] ?? "Section"} · ${label ? `“${label}”` : text ? `“${text.slice(0, 70)}”` : "no text (image or embed)"}`;
    };

    async function pick(prompt: string) {
        const cands = extractCandidates();
        candidateDescriptions = new Map(cands.map((c) => [c.id, { selector: c.selector, description: c.description, label: friendly(c) }]));
        const t0 = performance.now();
        const result = await pickElement(jev, prompt, cands, { title: document.title, url: location.href });
        const options: PickOption[] =
          result.target === NONE || result.targetPresent < 0.3
            ? []
            : result.targetTop
                .filter((t) => t.id !== NONE && candidateDescriptions.has(t.id) && t.p >= 0.03)
                .map((t) => ({ id: t.id, p: t.p, ...candidateDescriptions.get(t.id)! }))
                // Only offer selectors that match exactly one element, and never login/payment forms.
                .filter((o) => {
                  const all = document.querySelectorAll(o.selector);
                  return all.length === 1 && !all[0].querySelector("input[type=password], input[autocomplete^=cc-]");
                });
        return { result, options, latencyMs: Math.round(performance.now() - t0) };
      }

    const ctl: Controller = {
      host,
      async run(prompt, hint) {
        lastPrompt = prompt;
        if (hint === "hide") return { kind: "pick", ...(await pick(prompt)) };
        const current = previewPicks === "none" ? undefined : previewPicks ?? saved.picks;
        const previous = current ? lookPrompt || saved.prompt || null : null;
        // One call: what the request means + the restyle picks for it (speculative fan-out).
        const res = await jev.decide(buildRestyleRequest({ request: prompt, previous, withRoute: true, site: { currentDesign: tokens().summary } }));
        const { route } = parseRoute(res, !!previous);
        if (route === "page_element") return { kind: "pick", ...(await pick(prompt)) };
        if (route === "undo") {
          if (previewPicks && previewPicks !== "none") {
            previewPicks = null;
            applyPicks(saved.picks);
            return { kind: "undone", note: "Back to your saved look." };
          }
          previewPicks = "none";
          applyPicks(undefined);
          return { kind: "undone", note: "Original look restored. Save to keep it that way." };
        }
        let picks = parseRestyle(res);
        let note: string | undefined;
        if (route === "fix_images" && current) {
          picks = { ...current, protectImages: true };
          note = "Photos keep their natural look now";
        } else {
          if (current?.protectImages) picks.protectImages = true;
          if (route === "refine_look") note = `Adjusted from “${previous}”`;
          lookPrompt = route === "refine_look" && previous ? `${previous}, ${prompt}` : prompt;
        }
        const t0 = performance.now();
        applyPicks(picks);
        previewPicks = picks;
        return { kind: "restyle", picks, note, latencyMs: res.latencyMs, costUsd: res.costUsd, applyMs: Math.round(performance.now() - t0) } satisfies RunResult;
      },
      preview(picks) {
        applyPicks(picks);
        previewPicks = picks;
      },
      previewHide(selector) {
        pendingHide = selector;
        pendingUnlock = !!selector && isBlockingOverlay(selector);
        applyHides();
      },
      async save() {
        if (previewPicks === "none") {
          delete saved.picks;
          delete saved.prompt;
        } else if (previewPicks) {
          saved.picks = previewPicks;
          saved.prompt = lookPrompt || lastPrompt;
        }
        if (pendingHide) {
          const d = [...candidateDescriptions.values()].find((c) => c.selector === pendingHide);
          saved.hides.push({ selector: pendingHide, description: d?.label ?? pendingHide, request: lastPrompt, unlockScroll: pendingUnlock });
        }
        previewPicks = null;
        pendingHide = null;
        pendingUnlock = false;
        await store();
      },
      async revert() {
        previewPicks = null;
        pendingHide = null;
        applyPicks(saved.picks);
        applyHides();
      },
      saved() {
        return {
          palette: saved.picks?.palette !== "keep_original" ? saved.picks?.palette : undefined,
          font: saved.picks?.font,
          prompt: saved.prompt,
          hides: saved.hides.map((h) => ({ request: h.request, description: h.description })),
        };
      },
      async removeHide(i) {
        saved.hides.splice(i, 1);
        applyHides();
        await store();
      },
      async clearSite() {
        saved = { hides: [], savedAt: 0 };
        previewPicks = null;
        pendingHide = null;
        applyPicks(undefined);
        applyHides();
        await store();
      },
      async suggestions() {
        // Cached per site + page type (first path segment) for a week: repeat visits show ideas instantly.
        const t0 = performance.now();
        const ideasKey = `flora:ideas:${host}${location.pathname.split("/").slice(0, 2).join("/")}`;
        const hit = (await browser.storage.local.get(ideasKey))[ideasKey] as { at: number; items: Suggestion[] } | undefined;
        if (hit && Date.now() - hit.at < 7 * 24 * 3600 * 1000) return { items: hit.items, cached: true, ms: 0 };
        const cands = extractCandidates();
        const pool = buildSuggestionPool(tokens(), cands);
        const res = await jev.decide(buildSuggestRequest(gatherPageFacts(), tokens(), pool));
        const items = pickSuggestions(pool, res);
        await browser.storage.local.set({ [ideasKey]: { at: Date.now(), items } });
        return { items, cached: false, ms: Math.round(performance.now() - t0) };
      },
      async hideLauncher(hidden) {
        settings.launcherHidden = hidden;
        await browser.storage.local.set({ [SETTINGS_KEY]: settings });
      },
    };

    let lastPrompt = "";

    const widget = new FloraWidget(ctl, { launcherHidden: settings.launcherHidden });
    browser.runtime.onMessage.addListener((msg: ContentRequest) => {
      if (msg?.type === "flora:toggle") widget.toggle();
    });
  },
});
