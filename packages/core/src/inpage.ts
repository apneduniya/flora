// Bundled to an IIFE for Playwright (window.__flora) and imported directly by the extension content script.
export { extractTokens, resolveColor, effectiveBackground } from "./extract/tokens";
export { extractCandidates, blockRects, cssPath, rectIoU } from "./extract/candidates";
export { gatherPageFacts } from "./extract/profile";
export { applyTheme, removeTheme, applyExtraCss, measureBreakage, stampAll } from "./compile/stamp";
export { compileTheme } from "./compile/css";
