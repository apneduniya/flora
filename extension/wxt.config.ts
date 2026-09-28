import { existsSync } from "node:fs";
import { defineConfig } from "wxt";

// `pnpm dev` launches a browser with flora loaded. Use Chrome if installed, otherwise Brave.
const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const hasChrome = existsSync("/Applications/Google Chrome.app");

export default defineConfig({
  // Visible folder (".output" is hidden in Finder's "Load unpacked" picker).
  outDir: "build",
  webExt: {
    ...(hasChrome || !existsSync(BRAVE) ? {} : { binaries: { chrome: BRAVE } }),
    startUrls: ["https://en.wikipedia.org/wiki/Coffee"],
  },
  manifest: {
    name: "flora (Jev restyle spike)",
    description: "Restyle or tidy any website by describing it. Jev chooses, code builds.",
    permissions: ["storage", "tabs", "activeTab"],
    // localhost: the spike proxy that holds the TypeSafe key.
    host_permissions: ["<all_urls>", "http://localhost:8787/*"],
    action: { default_title: "flora: restyle this site (Alt+Shift+F)" },
    commands: {
      "toggle-flora": { suggested_key: { default: "Alt+Shift+F" }, description: "Open flora on this page" },
    },
  },
});
