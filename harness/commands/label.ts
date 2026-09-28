// Headed labelling tool. MHTML replays run with page scripts disabled, so element picking uses
// Chrome's DevTools inspect mode (CDP Overlay) and commands come from the terminal.
import { createInterface } from "node:readline/promises";
import type { CDPSession } from "playwright";
import type { Args } from "../lib/args";
import { launch, openSite } from "../lib/browser";
import { readJson, writeJson } from "../lib/io";
import { siteDir } from "../lib/paths";

export interface Label {
  selector: string | null; // null = target does not exist (negative task)
  /** Other elements that also count as correct (e.g. any of several ad slots, or a wrapper). */
  alt?: string[];
  rect?: { x: number; y: number; w: number; h: number };
  text?: string;
  tag?: string;
  source: "agent" | "human";
  confirmed: boolean;
  corrected?: boolean; // human changed an agent draft
  note?: string;
}
export type Labels = Record<string, Label>;

const HIGHLIGHT = { contentColor: { r: 145, g: 47, b: 99, a: 0.35 }, borderColor: { r: 145, g: 47, b: 99, a: 0.9 }, showInfo: true };

async function describe(cdp: CDPSession, objectId: string) {
  const { result } = (await cdp.send("Runtime.callFunctionOn", {
    objectId,
    returnByValue: true,
    functionDeclaration: `function () {
      const r = this.getBoundingClientRect();
      return { selector: window.__flora.cssPath(this), tag: this.tagName.toLowerCase(),
        rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
        text: (this.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 80) };
    }`,
  })) as { result: { value: { selector: string; tag: string; rect: Label["rect"]; text: string } } };
  return result.value;
}

async function parentOf(cdp: CDPSession, objectId: string) {
  const { result } = (await cdp.send("Runtime.callFunctionOn", { objectId, functionDeclaration: "function () { return this.parentElement; }" })) as {
    result: { objectId?: string };
  };
  return result.objectId;
}

async function highlightSelector(cdp: CDPSession, selector: string) {
  const { root } = (await cdp.send("DOM.getDocument", { depth: 0 })) as { root: { nodeId: number } };
  const { nodeId } = (await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector })) as { nodeId: number };
  if (nodeId) await cdp.send("Overlay.highlightNode", { nodeId, highlightConfig: HIGHLIGHT });
  return !!nodeId;
}

export async function run(a: Args) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const { browser, context } = await launch({ headed: true });
  const onlyUnconfirmed = a.flags.all !== true;

  for (const site of a.sites()) {
    const path = siteDir(site.id, "labels.json");
    const labels = readJson<Labels>(path, {});
    const tasks = site.picks.filter((t) => !onlyUnconfirmed || !labels[t.id]?.confirmed);
    if (!tasks.length) continue;

    const page = await context.newPage();
    await openSite(page, site, a.live);
    const cdp = await context.newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("Overlay.enable");

    let picked: { objectId: string; info: Awaited<ReturnType<typeof describe>> } | null = null;
    cdp.on("Overlay.inspectNodeRequested", async ({ backendNodeId }: { backendNodeId: number }) => {
      const { object } = (await cdp.send("DOM.resolveNode", { backendNodeId })) as { object: { objectId: string } };
      picked = { objectId: object.objectId, info: await describe(cdp, object.objectId) };
      console.log(`\n   picked <${picked.info.tag}> ${picked.info.selector}\n   "${picked.info.text}"  ${picked.info.rect?.w}×${picked.info.rect?.h}`);
      await cdp.send("Overlay.setInspectMode", { mode: "searchForNode", highlightConfig: HIGHLIGHT });
    });

    console.log(`\n=== ${site.id} (${tasks.length} task(s)) ===`);
    for (const task of tasks) {
      picked = null;
      const draft = labels[task.id];
      console.log(`\n▶ "${task.text}"${task.negative ? "  (expected: not on page)" : ""}`);
      if (draft) {
        console.log(`   agent draft: ${draft.selector ?? "NONE (not on page)"}${draft.alt?.length ? ` (+${draft.alt.length} alternatives)` : ""}${draft.note ? ` — ${draft.note}` : ""}`);
        if (draft.selector && !(await highlightSelector(cdp, draft.selector))) console.log("   (draft selector not found in page)");
      }
      await cdp.send("Overlay.setInspectMode", { mode: "searchForNode", highlightConfig: HIGHLIGHT });
      console.log("   click an element in the browser, then: [enter]=save pick (or accept draft)  p=parent  n=not on page  s=skip");

      for (;;) {
        const cmd = (await rl.question("   > ")).trim().toLowerCase();
        if (cmd === "s") break;
        if (cmd === "p" && picked) {
          const pid = await parentOf(cdp, picked.objectId);
          if (pid) {
            picked = { objectId: pid, info: await describe(cdp, pid) };
            await cdp.send("Overlay.highlightNode", { objectId: pid, highlightConfig: HIGHLIGHT });
            console.log(`   parent <${picked.info.tag}> ${picked.info.selector}  ${picked.info.rect?.w}×${picked.info.rect?.h}`);
          }
          continue;
        }
        if (cmd === "n") {
          labels[task.id] = { selector: null, source: draft?.source ?? "human", confirmed: true, corrected: !!draft && draft.selector !== null };
          break;
        }
        if (cmd === "") {
          const p = picked as typeof picked;
          if (p) {
            const same = !!draft && (draft.selector === p.info.selector || !!draft.alt?.includes(p.info.selector));
            labels[task.id] = same ? { ...draft!, confirmed: true, corrected: false } : { ...p.info, source: draft?.source ?? "human", confirmed: true, corrected: !!draft };
          } else if (draft) {
            labels[task.id] = { ...draft, confirmed: true, corrected: false };
          } else {
            console.log("   nothing picked yet");
            continue;
          }
          break;
        }
      }
      writeJson(path, labels);
      await cdp.send("Overlay.hideHighlight").catch(() => {});
    }
    await page.close();
  }
  rl.close();
  await browser.close();
}
