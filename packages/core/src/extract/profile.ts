// In-page: plain facts about the page (what kind of page, what's on it) for site-aware suggestions.
// Counting and detection happen here in code; Jev only judges which ideas suit the page.
import { redact } from "./candidates";

export interface PageFacts {
  host: string;
  title: string;
  description: string;
  words: "very little text" | "some text" | "a long article" | "lots of text";
  video: boolean;
  shopping: boolean; // prices / add-to-cart
  code: boolean; // code blocks (docs, Q&A)
  images: "few images" | "some images" | "image-heavy";
  headings: string[]; // first few headings, for topic
}

export function gatherPageFacts(doc: Document = document): PageFacts {
  const text = (doc.body?.innerText ?? "").replace(/\s+/g, " ");
  const wordCount = text ? text.split(" ").length : 0;
  const imgs = [...doc.images].filter((i) => i.width * i.height > 10000).length;
  const meta = doc.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute("content") ?? "";
  const headings = [...doc.querySelectorAll("h1, h2")]
    .map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 2)
    .slice(0, 5)
    .map((t) => redact(t).slice(0, 80));
  return {
    host: location.hostname,
    title: redact(doc.title).slice(0, 120),
    description: redact(meta).slice(0, 200),
    words: wordCount < 300 ? "very little text" : wordCount < 1500 ? "some text" : wordCount < 5000 ? "a long article" : "lots of text",
    video: !!doc.querySelector("video, iframe[src*='youtube'], iframe[src*='vimeo']"),
    shopping: /(?:₹|\$|€|£)\s?\d/.test(text.slice(0, 20000)) && /add to (cart|basket)|buy now|checkout/i.test(text.slice(0, 50000)),
    code: doc.querySelectorAll("pre, code").length >= 3,
    images: imgs < 5 ? "few images" : imgs < 25 ? "some images" : "image-heavy",
    headings,
  };
}
