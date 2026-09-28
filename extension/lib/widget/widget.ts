// The in-page flora widget: launcher + panel, rendered in a closed Shadow DOM.
import { FONT_BY_ID, PALETTE_BY_ID, type PickResult, type RestylePicks, type Suggestion } from "@flora/core";
import { ICONS } from "./icons";
import { STYLES } from "./styles";

export interface PickOption {
  id: string;
  selector: string;
  description: string; // what Jev saw
  label: string; // what the user sees
  p: number;
}

export interface SavedSummary {
  palette?: string;
  font?: string;
  prompt?: string;
  hides: { request: string; description: string }[];
}

/** Everything the widget needs from the page-side controller. */
export type RunResult =
  | { kind: "restyle"; picks: RestylePicks; latencyMs: number; costUsd: number; applyMs: number; note?: string }
  | { kind: "pick"; result: PickResult; options: PickOption[]; latencyMs: number }
  | { kind: "undone"; note: string };

/** Everything the widget needs from the page-side controller. */
export interface Controller {
  host: string;
  /** Jev decides what the prompt means (new look, adjust, fix images, page element, undo) and it's applied. */
  run(prompt: string, hint?: "hide" | "restyle"): Promise<RunResult>;
  preview(picks: RestylePicks): void;
  previewHide(selector: string | null): void;
  save(): Promise<void>;
  revert(): Promise<void>;
  saved(): SavedSummary;
  removeHide(index: number): Promise<void>;
  clearSite(): Promise<void>;
  hideLauncher(hidden: boolean): Promise<void>;
  /** Site-aware ideas (cached per site); rejects if Jev is unreachable. */
  suggestions(): Promise<{ items: Suggestion[]; cached: boolean; ms: number }>;
}

type View =
  | { kind: "home" }
  | { kind: "loading"; label: string; started: number }
  | { kind: "restyle"; prompt: string; picks: RestylePicks; latencyMs: number; costUsd: number; applyMs: number; dirty: boolean; note?: string }
  | { kind: "pick"; prompt: string; result: PickResult; options: PickOption[]; index: number; latencyMs: number }
  | { kind: "hidden"; request: string }
  | { kind: "error"; message: string };

/** Shown only if site-aware ideas can't be fetched (e.g. the local server is down). */
const FALLBACK: Suggestion[] = [
  { id: "dark", kind: "restyle", text: "Dark mode" },
  { id: "sepia", kind: "restyle", text: "Warm sepia reading mode" },
  { id: "hc", kind: "restyle", text: "High contrast for low vision" },
  { id: "h_sidebar", kind: "hide", text: "Hide the sidebar" },
  { id: "h_cookie", kind: "hide", text: "Hide the cookie banner" },
];

/** A hint of each idea's colour for its chip dot. */
const IDEA_DOT: Record<string, string> = {
  dark: "#1e1e2a", light: "#f5f5f0", calm: "#8fb3e0", hc: "#ffd400", sepia: "#d9c29a", bigger: "#b9a7ff", legible: "#7aa2f7",
  compact: "#9aa0a8", devdark: "#0f172a", terminal: "#39ff14", neon: "#ff2e97", cinema: "#000000", space: "#1a1033",
  cozy: "#d4a373", sporty: "#e0424f", newspaper: "#b91c1c", book: "#a0522d", mono: "#111111", corporate: "#1967d2",
  playful: "#e2549d", pastel: "#f7cfe3", nature: "#4d7c0f", kitchen: "#c2410c", ocean: "#0369a1", shopcalm: "#a6c8e8",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => (n < 0.001 ? `$${n.toFixed(5)}` : `$${n.toFixed(4)}`);

export class FloraWidget {
  private root: ShadowRoot;
  private hostEl: HTMLElement;
  private launcher: HTMLButtonElement;
  private panel: HTMLElement;
  private body!: HTMLElement;
  private target: HTMLElement;
  private view: View = { kind: "home" };
  private timer = 0;
  private targetEl: Element | null = null;
  private ideas: { items: Suggestion[]; state: "loading" | "ready" | "fallback"; cached?: boolean; ms?: number } = { items: [], state: "loading" };
  private ideasRequested = false;

  constructor(private ctl: Controller, opts: { launcherHidden: boolean }) {
    const host = document.createElement("flora-widget");
    host.setAttribute("data-flora-ui", "");
    // Top layer (Popover API): renders above every site element whatever its z-index, including
    // consent screens and modals that also use the maximum z-index.
    host.setAttribute("popover", "manual");
    host.style.cssText = "position:fixed;inset:auto 0 0 auto;width:0;height:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;color-scheme:normal;";
    this.hostEl = host;
    // Closed shadow root: page scripts and page CSS can't reach in.
    this.root = host.attachShadow({ mode: "closed" });
    this.root.innerHTML = `<style>${STYLES}</style>
      <div class="target" hidden><span class="label"></span></div>
      <section class="panel" hidden role="dialog" aria-label="flora">
        <header class="head">
          <div class="logo">${ICONS.flora}</div>
          <div class="title"><b>flora</b><span>${esc(ctl.host)}</span></div>
          <button class="icon-btn" data-action="close" title="Close (Esc)">${ICONS.close}</button>
        </header>
        <div class="body"></div>
      </section>
      <button class="launcher" title="flora: restyle this site (Alt+Shift+F)">${ICONS.flora}</button>`;
    this.launcher = this.root.querySelector(".launcher")!;
    this.panel = this.root.querySelector(".panel")!;
    this.body = this.root.querySelector(".body")!;
    this.target = this.root.querySelector(".target")!;
    this.launcher.classList.toggle("hidden", opts.launcherHidden);
    this.refreshBadge();

    this.launcher.addEventListener("click", () => this.toggle());
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.root.addEventListener("keydown", (e) => this.onKey(e as KeyboardEvent));
    window.addEventListener("scroll", () => this.placeTarget(), { passive: true });
    window.addEventListener("resize", () => this.placeTarget());
    (document.body ?? document.documentElement).appendChild(host);
    this.raise();
  }

  /** (Re)enter the top layer so flora stays above anything the site put there since. */
  private raise() {
    const h = this.hostEl as HTMLElement & { showPopover?: () => void; hidePopover?: () => void };
    try {
      if (h.matches(":popover-open")) h.hidePopover?.();
      h.showPopover?.();
    } catch {
      /* Popover API unavailable: z-index fallback still applies */
    }
  }

  toggle(force?: boolean) {
    const open = force ?? this.panel.hidden;
    this.panel.hidden = !open;
    if (open) {
      this.raise();
      this.loadIdeas();
      this.render();
      setTimeout(() => this.root.querySelector("textarea")?.focus(), 30);
    } else {
      this.showTarget(null);
      this.ctl.previewHide(null);
    }
  }

  private loadIdeas() {
    if (this.ideasRequested) return;
    this.ideasRequested = true;
    this.ctl
      .suggestions()
      .then((r) => (this.ideas = { items: r.items.length ? r.items : FALLBACK, state: r.items.length ? "ready" : "fallback", cached: r.cached, ms: r.ms }))
      .catch(() => (this.ideas = { items: FALLBACK, state: "fallback" }))
      .finally(() => this.view.kind === "home" && !this.panel.hidden && this.render());
  }

  refreshBadge() {
    const s = this.ctl.saved();
    this.launcher.classList.toggle("saved", !!s.palette || s.hides.length > 0);
  }

  // ---------- rendering ----------
  private set(view: View) {
    this.view = view;
    this.render();
  }

  private render() {
    clearInterval(this.timer);
    const v = this.view;
    const composer = `
      <div class="composer">
        <textarea rows="1" placeholder="Describe a look, or what to hide…" aria-label="Describe a change"></textarea>
        <button class="send" data-action="submit" title="Apply (Enter)">${ICONS.send}</button>
      </div>`;
    let main = "";
    if (v.kind === "home") main = this.homeHtml();
    if (v.kind === "loading") main = this.loadingHtml(v);
    if (v.kind === "restyle") main = this.restyleHtml(v);
    if (v.kind === "pick") main = this.pickHtml(v);
    if (v.kind === "hidden")
      main = `<div class="card"><div class="row"><span class="tag ok">Hidden</span><span class="sub">“${esc(v.request)}”</span></div>
        <div class="actions"><button class="btn primary" data-action="save">Save for this site</button><button class="btn" data-action="revert">Undo</button></div></div>`;
    if (v.kind === "error") main = `<div class="card error"><div class="name">Something went wrong</div><div class="sub">${v.message}</div><div class="actions"><button class="btn" data-action="home">Back</button></div></div>`;
    // Keep what the user is typing (and the caret) across re-renders, e.g. when ideas finish loading.
    const prev = this.body.querySelector("textarea");
    const draft = prev?.value ?? "";
    const hadFocus = !!prev && this.root.activeElement === prev;
    const sel = prev ? [prev.selectionStart, prev.selectionEnd] : null;
    this.body.innerHTML = composer + main + this.savedHtml();
    const ta = this.body.querySelector("textarea")!;
    if (v.kind === "home" || v.kind === "error") ta.value = draft;
    if (hadFocus) {
      ta.focus();
      if (sel) ta.setSelectionRange(sel[0], sel[1]);
    }
    ta.addEventListener("input", () => this.autosize(ta));
    if (v.kind === "loading") {
      this.timer = window.setInterval(() => {
        const el = this.body.querySelector(".elapsed");
        if (el) el.textContent = `${Math.round(performance.now() - v.started)}ms`;
      }, 50);
    }
    this.showTarget(v.kind === "pick" ? v.options[v.index] : null);
  }

  private homeHtml() {
    const i = this.ideas;
    const chips =
      i.state === "loading"
        ? `<span class="chip skeleton"></span><span class="chip skeleton"></span><span class="chip skeleton"></span>`
        : i.items
            .map((s) =>
              s.kind === "hide"
                ? `<button class="chip hide-idea" data-action="suggest" data-kind="hide" data-text="${esc(s.text)}" title="Detected on this page">${ICONS.eyeOff}${esc(s.text)}</button>`
                : `<button class="chip" data-action="suggest" data-kind="restyle" data-text="${esc(s.text)}"><span class="dot" style="background:${IDEA_DOT[s.id] ?? "#a39cb3"}"></span>${esc(s.text)}</button>`,
            )
            .join("");
    const note = i.state === "loading" ? "Jev is looking at this page…" : i.state === "fallback" ? "general ideas" : i.cached ? "picked for this site" : `picked for this site · ${i.ms}ms`;
    return `<div class="hint">Enter to apply · Shift+Enter for a new line</div>
      <div class="label-row"><span class="section-label" style="margin:0">Ideas for this page</span><span class="meta">${note}</span></div>
      <div class="chips">${chips}</div>`;
  }

  private loadingHtml(v: Extract<View, { kind: "loading" }>) {
    return `<div class="card"><div class="thinking"><div class="orb"></div><div style="flex:1"><div class="name">${esc(v.label)}</div><div class="meta elapsed">0ms</div></div></div>
      <div class="shimmer"></div><div class="shimmer" style="width:70%"></div></div>`;
  }

  private restyleHtml(v: Extract<View, { kind: "restyle" }>) {
    const p = v.picks;
    const pal = PALETTE_BY_ID.get(p.palette);
    const font = FONT_BY_ID.get(p.font);
    const colors = pal ? [pal.colors.bg, pal.colors.surface, pal.colors.text, pal.colors.accent, pal.colors.link] : [];
    // Jev's ranking, in a stable order, so clicking between alternatives never reshuffles them.
    const alts = p.paletteTop.filter((t) => PALETTE_BY_ID.has(t.id)).slice(0, 3);
    const isTop = p.paletteTop[0]?.id === p.palette;
    const conf = Math.round((p.paletteTop.find((t) => t.id === p.palette)?.p ?? p.paletteConfidence) * 100);
    return `<div class="card">
      <div class="row between"><div><div class="name">${esc(pal?.name ?? "Original colours")}</div>
        <div class="sub">${font ? esc(font.name) : "Original fonts"} · ${p.density} spacing${p.radius !== "keep" ? ` · ${p.radius} corners` : ""}</div></div>
        <span class="tag ${isTop ? (conf >= 60 ? "ok" : "warn") : ""}">${isTop ? `${conf}% match` : "Alternative"}</span></div>
      ${colors.length ? `<div class="swatches">${colors.map((c) => `<span style="background:${c}"></span>`).join("")}</div>` : ""}
      ${alts.length > 1 ? `<div class="section-label">Alternatives: click to preview</div><div class="alts">${alts
        .map((a) => {
          const ap = PALETTE_BY_ID.get(a.id)!;
          const mini = [ap.colors.bg, ap.colors.text, ap.colors.accent].map((c) => `<span style="background:${c}"></span>`).join("");
          return `<button class="alt ${a.id === p.palette ? "on" : ""}" data-action="alt" data-id="${a.id}"><div class="mini">${mini}</div><small>${esc(ap.name)}</small></button>`;
        })
        .join("")}</div>` : ""}
      ${v.note ? `<div class="row"><span class="tag ok">Adjusted</span><span class="sub">${esc(v.note)}</span></div>` : ""}
      ${p.outOfCatalog > 0.5 ? `<div class="sub">This asks for more than colours and fonts can do. The closest match is shown.</div>` : ""}
      <div class="actions"><button class="btn primary" data-action="save" title="Re-applies every time you visit ${esc(this.ctl.host)}">Save for this site</button><button class="btn" data-action="revert" title="Back to how it was">Undo</button></div>
      <div class="meta">Jev ${v.latencyMs}ms · applied in ${v.applyMs}ms · ${money(v.costUsd)}</div>
    </div>`;
  }

  private pickHtml(v: Extract<View, { kind: "pick" }>) {
    const o = v.options[v.index];
    const pct = Math.round(o.p * 100);
    const next = v.options[v.index + 1];
    const sure = o.p >= 0.7 && o.p - (next?.p ?? 0) >= 0.35;
    const desc = o.label;
    return `<div class="card">
      <div class="row between"><div class="name">${v.result.action === "hide" ? "Hide this?" : `${esc(v.result.action.replace("_", " "))} this?`}</div>
        <span class="tag ${sure ? "ok" : "warn"}">${sure ? "Confident" : "Check the highlight"}</span></div>
      <div class="sub">${esc(desc.slice(0, 150))}</div>
      <div class="row"><div class="meter"><i style="width:${pct}%"></i></div><span class="meta">${pct}%</span></div>
      <div class="actions"><button class="btn primary" data-action="hide">Hide it</button>
        ${next ? `<button class="btn" data-action="next">Not this one</button>` : ""}
        <button class="btn ghost" data-action="home">Cancel</button></div>
      <div class="meta">Jev ${v.latencyMs}ms · ${v.result.stages === 2 ? "2 passes (large page)" : "1 pass"} · option ${v.index + 1} of ${v.options.length}</div>
    </div>`;
  }

  private savedHtml() {
    const s = this.ctl.saved();
    if (!s.palette && !s.hides.length) return "";
    const pal = s.palette ? PALETTE_BY_ID.get(s.palette) : undefined;
    const items = [
      pal
        ? `<div class="saved-item"><div class="swatches" style="height:22px;width:44px;flex:none">${[pal.colors.bg, pal.colors.text, pal.colors.accent].map((c) => `<span style="background:${c}"></span>`).join("")}</div>
            <div class="grow"><div><b>${esc(pal.name)}</b></div><div class="meta">“${esc(s.prompt ?? "")}”</div></div></div>`
        : "",
      ...s.hides.map(
        (h, i) => `<div class="saved-item"><div class="grow"><div><b>Hidden</b> · ${esc(h.request)}</div><div class="meta">${esc(h.description.slice(0, 70))}</div></div>
          <button class="link" data-action="unhide" data-i="${i}">Show</button></div>`,
      ),
    ].join("");
    return `<div class="section-label">Saved on this site</div>${items}
      <div class="row between"><button class="link danger" data-action="clear">Reset this site</button><button class="link" data-action="hide-launcher">Hide floating button</button></div>`;
  }

  private autosize(ta: HTMLTextAreaElement) {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(120, ta.scrollHeight)}px`;
  }

  // ---------- on-page highlight ----------
  private showTarget(o: PickOption | null) {
    this.targetEl = o ? document.querySelector(o.selector) : null;
    if (this.targetEl) this.targetEl.scrollIntoView({ block: "center", behavior: "smooth" });
    this.target.hidden = !this.targetEl;
    this.placeTarget();
  }

  private placeTarget() {
    if (!this.targetEl || this.target.hidden) return;
    const r = this.targetEl.getBoundingClientRect();
    Object.assign(this.target.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    this.target.classList.toggle("below", r.top < 40);
    this.target.querySelector(".label")!.textContent = "flora will hide this";
  }

  // ---------- events ----------
  private onKey(e: KeyboardEvent) {
    e.stopPropagation(); // keep site shortcuts from firing while typing
    if (e.key === "Escape") this.toggle(false);
    if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName === "TEXTAREA") {
      e.preventDefault();
      void this.submit();
    }
  }

  private async onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!el) return;
    const v = this.view;
    switch (el.dataset.action) {
      case "close": return this.toggle(false);
      case "home": this.ctl.previewHide(null); return this.set({ kind: "home" });
      case "submit": return this.submit();
      case "suggest": {
        const ta = this.root.querySelector("textarea")!;
        ta.value = el.dataset.text!;
        return this.submit(el.dataset.kind as "hide" | "restyle");
      }
      case "alt":
        if (v.kind === "restyle") {
          const picks = { ...v.picks, palette: el.dataset.id! };
          this.ctl.preview(picks);
          this.set({ ...v, picks, dirty: true });
        }
        return;
      case "next":
        if (v.kind === "pick") this.set({ ...v, index: v.index + 1 });
        return;
      case "hide":
        if (v.kind === "pick") {
          this.ctl.previewHide(v.options[v.index].selector);
          this.set({ kind: "hidden", request: v.prompt });
        }
        return;
      case "save":
        await this.ctl.save();
        this.refreshBadge();
        this.toast(`Saved for ${this.ctl.host}. It re-applies on every visit.`);
        return this.set({ kind: "home" });
      case "revert":
        await this.ctl.revert();
        return this.set({ kind: "home" });
      case "unhide":
        await this.ctl.removeHide(Number(el.dataset.i));
        this.refreshBadge();
        return this.render();
      case "clear":
        await this.ctl.clearSite();
        this.refreshBadge();
        this.toast("This site is back to its original look.");
        return this.set({ kind: "home" });
      case "hide-launcher":
        await this.ctl.hideLauncher(true);
        this.launcher.classList.add("hidden");
        this.toast("Floating button hidden. Open flora from the toolbar or Alt+Shift+F.");
        return;
    }
  }

  private async submit(hint?: "hide" | "restyle") {
    const ta = this.root.querySelector("textarea");
    const prompt = ta?.value.trim();
    if (!prompt) return;
    this.set({ kind: "loading", label: hint === "hide" ? "Finding it on the page…" : "Thinking…", started: performance.now() });
    try {
      const r = await this.ctl.run(prompt, hint);
      if (r.kind === "undone") {
        this.toast(r.note);
        return this.set({ kind: "home" });
      }
      if (r.kind === "pick") {
        if (!r.options.length) {
          return this.set({ kind: "error", message: `Couldn't find “${esc(prompt)}” on this page. Try describing it differently, e.g. “hide the right column”.` });
        }
        return this.set({ kind: "pick", prompt, result: r.result, options: r.options, index: 0, latencyMs: r.latencyMs });
      }
      this.set({ kind: "restyle", prompt, picks: r.picks, latencyMs: r.latencyMs, costUsd: r.costUsd, applyMs: r.applyMs, note: r.note, dirty: true });
    } catch (err) {
      const msg = (err as Error).message;
      const offline = /proxy unreachable|Failed to fetch/i.test(msg);
      this.set({
        kind: "error",
        message: offline
          ? `The local flora server isn't running. Start it with <code>pnpm --filter @flora/server dev</code> and try again.`
          : esc(msg),
      });
    }
  }

  private toast(text: string) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    this.panel.hidden = true;
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
}
