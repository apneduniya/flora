import type { BackgroundRequest, JevReply } from "../lib/messages";
import { PROXY } from "../lib/messages";

export default defineBackground(() => {
  // Toolbar icon and Alt+Shift+F open the in-page widget.
  const toggle = (tabId?: number) => tabId && browser.tabs.sendMessage(tabId, { type: "flora:toggle" }).catch(() => {});
  browser.action.onClicked.addListener((tab) => toggle(tab.id));
  browser.commands?.onCommand.addListener(async (cmd) => {
    if (cmd !== "toggle-flora") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    toggle(tab?.id);
  });

  // All network calls go through the service worker; the TypeSafe key lives in the local proxy, never here.
  browser.runtime.onMessage.addListener((msg: BackgroundRequest, _sender, sendResponse) => {
    if (msg?.type !== "flora:jev") return;
    fetch(`${PROXY}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg.request) })
      .then(async (r) => {
        const body = await r.json();
        sendResponse((r.ok ? { ok: true, result: body } : { ok: false, error: body.error ?? `HTTP ${r.status}` }) satisfies JevReply);
      })
      .catch((e) => sendResponse({ ok: false, error: `proxy unreachable (${PROXY}): ${e.message}` } satisfies JevReply));
    return true; // async response
  });
});
