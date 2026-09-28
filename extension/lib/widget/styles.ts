// Widget styles. Lives inside a closed Shadow DOM, so site CSS can't reach it and it can't leak out.
export const STYLES = /* css */ `
:host {
  all: initial;
  --f-bg: rgba(255, 255, 255, 0.82);
  --f-bg-solid: #ffffff;
  --f-card: rgba(250, 248, 253, 0.9);
  --f-line: rgba(38, 24, 64, 0.09);
  --f-line-strong: rgba(38, 24, 64, 0.16);
  --f-text: #1c1629;
  --f-muted: #6f6781;
  --f-faint: #a39cb3;
  --f-accent-1: #7b5cff;
  --f-accent-2: #e2549d;
  --f-accent-3: #ff9a62;
  --f-grad: linear-gradient(135deg, var(--f-accent-1), var(--f-accent-2) 55%, var(--f-accent-3));
  --f-ring: rgba(123, 92, 255, 0.28);
  --f-ok: #19a974;
  --f-warn: #e8a317;
  --f-err: #e0424f;
  --f-shadow: 0 24px 60px -18px rgba(36, 18, 72, 0.35), 0 8px 22px -12px rgba(36, 18, 72, 0.25);
  --f-radius: 20px;
  font: 13px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  color: var(--f-text);
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  :host {
    --f-bg: rgba(22, 18, 32, 0.84);
    --f-bg-solid: #16121f;
    --f-card: rgba(34, 29, 48, 0.9);
    --f-line: rgba(255, 255, 255, 0.08);
    --f-line-strong: rgba(255, 255, 255, 0.16);
    --f-text: #f4f0fb;
    --f-muted: #aaa2bd;
    --f-faint: #6f6784;
    --f-ring: rgba(157, 134, 255, 0.35);
    --f-shadow: 0 24px 60px -18px rgba(0, 0, 0, 0.7), 0 8px 22px -12px rgba(0, 0, 0, 0.6);
  }
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; }

/* ---------- launcher ---------- */
.launcher {
  position: fixed; right: 22px; bottom: 22px; z-index: 2147483646;
  width: 48px; height: 48px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--f-grad); color: #fff;
  box-shadow: 0 10px 28px -8px rgba(226, 84, 157, 0.65), inset 0 1px 0 rgba(255,255,255,0.35);
  transition: transform .25s cubic-bezier(.2,.9,.3,1.4), box-shadow .2s, opacity .2s;
}
.launcher:hover { transform: translateY(-2px) scale(1.06); }
.launcher:active { transform: scale(0.96); }
.launcher svg { width: 24px; height: 24px; }
.launcher.saved::after {
  content: ""; position: absolute; top: 3px; right: 3px; width: 10px; height: 10px; border-radius: 50%;
  background: var(--f-ok); border: 2px solid #fff;
}
.launcher.hidden { opacity: 0; pointer-events: none; transform: scale(.6); }

/* ---------- panel ---------- */
.panel {
  position: fixed; right: 22px; bottom: 82px; z-index: 2147483647;
  width: 368px; max-height: min(640px, calc(100vh - 110px));
  display: flex; flex-direction: column;
  background: var(--f-bg);
  backdrop-filter: blur(22px) saturate(1.5); -webkit-backdrop-filter: blur(22px) saturate(1.5);
  border: 1px solid var(--f-line); border-radius: var(--f-radius);
  box-shadow: var(--f-shadow);
  overflow: hidden;
  transform-origin: bottom right;
  animation: pop .28s cubic-bezier(.2,.9,.3,1.2);
}
.panel[hidden] { display: none; }
@keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }

.head { display: flex; align-items: center; gap: 10px; padding: 14px 14px 10px 16px; }
.logo { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; background: var(--f-grad); color: #fff; flex: none; }
.logo svg { width: 16px; height: 16px; }
.title { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.title b { font-size: 14px; letter-spacing: -0.01em; }
.title span { font-size: 11.5px; color: var(--f-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: var(--f-muted); transition: background .15s, color .15s; }
.icon-btn:hover { background: var(--f-line); color: var(--f-text); }
.icon-btn svg { width: 16px; height: 16px; }

.body { padding: 2px 14px 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.body::-webkit-scrollbar { width: 8px; } .body::-webkit-scrollbar-thumb { background: var(--f-line-strong); border-radius: 8px; }

/* composer */
.composer {
  position: relative; border-radius: 16px; background: var(--f-bg-solid);
  border: 1px solid var(--f-line-strong); transition: border-color .15s, box-shadow .15s;
}
.composer:focus-within { border-color: var(--f-accent-1); box-shadow: 0 0 0 4px var(--f-ring); }
textarea {
  display: block; width: 100%; resize: none; border: 0; outline: 0; background: transparent; color: var(--f-text);
  font: inherit; font-size: 14px; line-height: 1.45; padding: 12px 48px 12px 14px; min-height: 48px; max-height: 120px;
}
textarea::placeholder { color: var(--f-faint); }
.send {
  position: absolute; right: 8px; bottom: 8px; width: 32px; height: 32px; border-radius: 10px;
  display: grid; place-items: center; background: var(--f-grad); color: #fff;
  box-shadow: 0 6px 14px -6px rgba(226, 84, 157, .8); transition: transform .15s, opacity .15s;
}
.send:hover { transform: translateY(-1px); } .send:disabled { opacity: .35; cursor: default; transform: none; }
.send svg { width: 16px; height: 16px; }
.hint { font-size: 11px; color: var(--f-faint); margin-top: -4px; padding-left: 4px; }

/* chips */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px;
  border: 1px solid var(--f-line-strong); background: var(--f-card); font-size: 12px; color: var(--f-text);
  transition: border-color .15s, transform .15s, background .15s;
}
.chip:hover { border-color: var(--f-accent-1); transform: translateY(-1px); }
.chip .dot { width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--f-line-strong); }
.chip.hide-idea { background: transparent; border-style: dashed; }
.chip svg { width: 13px; height: 13px; color: var(--f-muted); }
.chip.skeleton { width: 120px; height: 29px; border: 0; background: linear-gradient(90deg, var(--f-line) 0%, var(--f-line-strong) 50%, var(--f-line) 100%); background-size: 200% 100%; animation: sh 1.2s linear infinite; }
.chip.skeleton:nth-child(2) { width: 150px; } .chip.skeleton:nth-child(3) { width: 96px; }
.label-row { display: flex; align-items: baseline; justify-content: space-between; margin: 2px 2px -4px; }
.label-row .meta { font-size: 10.5px; }
.section-label { font-size: 10.5px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--f-faint); margin: 2px 2px -4px; }

/* cards */
.card { border: 1px solid var(--f-line); background: var(--f-card); border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 10px; animation: rise .25s ease-out; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.row { display: flex; align-items: center; gap: 8px; }
.between { justify-content: space-between; }
.name { font-weight: 650; font-size: 14px; letter-spacing: -0.01em; }
.sub { color: var(--f-muted); font-size: 12px; }
.meta { color: var(--f-faint); font-size: 11px; font-variant-numeric: tabular-nums; }

.swatches { display: flex; border-radius: 10px; overflow: hidden; height: 34px; border: 1px solid var(--f-line); }
.swatches span { flex: 1; }
.alts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.alt { border-radius: 12px; border: 1.5px solid var(--f-line); padding: 6px; display: flex; flex-direction: column; gap: 6px; text-align: left; transition: border-color .15s, transform .15s; background: var(--f-bg-solid); }
.alt:hover { transform: translateY(-1px); border-color: var(--f-line-strong); }
.alt.on { border-color: var(--f-accent-1); box-shadow: 0 0 0 3px var(--f-ring); }
.alt .mini { display: flex; height: 18px; border-radius: 6px; overflow: hidden; }
.alt .mini span { flex: 1; }
.alt small { font-size: 10.5px; color: var(--f-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.meter { height: 6px; border-radius: 6px; background: var(--f-line); overflow: hidden; flex: 1; }
.meter i { display: block; height: 100%; border-radius: 6px; background: var(--f-grad); }
.tag { font-size: 10.5px; padding: 2px 7px; border-radius: 999px; background: var(--f-line); color: var(--f-muted); white-space: nowrap; }
.tag.ok { background: rgba(25,169,116,.14); color: var(--f-ok); }
.tag.warn { background: rgba(232,163,23,.16); color: #b07b09; }

.actions { display: flex; gap: 8px; }
.btn {
  flex: 1; height: 36px; border-radius: 11px; font-weight: 600; font-size: 12.5px;
  border: 1px solid var(--f-line-strong); background: var(--f-bg-solid); transition: transform .12s, border-color .15s, background .15s;
}
.btn:hover { border-color: var(--f-accent-1); } .btn:active { transform: scale(.98); }
.btn.primary { background: var(--f-grad); color: #fff; border: 0; box-shadow: 0 8px 18px -10px rgba(226,84,157,.9); }
.btn.ghost { background: transparent; }
.btn:disabled { opacity: .5; cursor: default; }

/* loading */
.thinking { display: flex; align-items: center; gap: 10px; }
.orb { width: 26px; height: 26px; border-radius: 50%; background: var(--f-grad); animation: breathe 1.1s ease-in-out infinite; flex: none; }
@keyframes breathe { 0%,100% { transform: scale(.85); opacity: .7; } 50% { transform: scale(1); opacity: 1; } }
.shimmer { height: 10px; border-radius: 6px; background: linear-gradient(90deg, var(--f-line) 0%, var(--f-line-strong) 50%, var(--f-line) 100%); background-size: 200% 100%; animation: sh 1.2s linear infinite; }
@keyframes sh { to { background-position: -200% 0; } }

/* saved */
.saved-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 12px; background: var(--f-bg-solid); border: 1px solid var(--f-line); }
.saved-item .grow { flex: 1; min-width: 0; }
.saved-item .grow div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.link { color: var(--f-accent-1); font-weight: 600; font-size: 12px; }
.link.danger { color: var(--f-err); }

.error { border-color: rgba(224,66,79,.3); background: rgba(224,66,79,.06); }
.error code { font: 11.5px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--f-line); padding: 2px 6px; border-radius: 6px; }

/* toast */
.toast {
  position: fixed; right: 22px; bottom: 82px; z-index: 2147483647; padding: 10px 14px; border-radius: 12px;
  background: var(--f-bg-solid); border: 1px solid var(--f-line); box-shadow: var(--f-shadow); font-weight: 600; font-size: 12.5px;
  animation: pop .25s ease-out;
}

/* on-page target highlight */
.target {
  position: fixed; z-index: 2147483645; pointer-events: none; border-radius: 10px;
  box-shadow: 0 0 0 2px var(--f-accent-2), 0 0 0 9999px rgba(20, 10, 40, 0.28);
  background: rgba(226, 84, 157, 0.10);
  transition: all .2s ease-out;
}
.target .label {
  position: absolute; left: 0; top: -30px; padding: 4px 10px; border-radius: 8px; white-space: nowrap;
  background: var(--f-grad); color: #fff; font-size: 12px; font-weight: 600; box-shadow: 0 6px 16px -6px rgba(0,0,0,.4);
}
.target.below .label { top: auto; bottom: -30px; }
`;
