import { describe, expect, it } from "vitest";
import { canonicalUrl, normalizeTitle, stripPublisherSuffix, titleHash, toSnippet, urlHash } from "../src/lib/text.js";
import { dedupe, fixtureFetcher, toCandidate, type Candidate } from "../src/ingest.js";
import type { Source } from "../src/lib/types.js";

const src = (over: Partial<Source> = {}): Source => ({
  id: "src-1", name: "Star of Mysore", url: "https://example.com/feed", type: "rss", language: "en", active: true, ...over,
});

describe("canonicalUrl / urlHash", () => {
  it("ignores tracking params, fragments, www, trailing slash and scheme", () => {
    const a = "https://www.starofmysore.com/dasara-elephants/?utm_source=rss&utm_medium=feed#comments";
    const b = "http://starofmysore.com/dasara-elephants";
    expect(canonicalUrl(a)).toBe("https://starofmysore.com/dasara-elephants");
    expect(urlHash(a)).toBe(urlHash(b));
  });

  it("keeps meaningful query params, order-independent", () => {
    expect(urlHash("https://x.com/a?id=1&p=2")).toBe(urlHash("https://x.com/a?p=2&id=1"));
    expect(urlHash("https://x.com/a?id=1")).not.toBe(urlHash("https://x.com/a?id=2"));
  });
});

describe("title hashing", () => {
  it("normalises case, punctuation and whitespace", () => {
    expect(titleHash("Dasara elephants  ARRIVE at Mysore Palace!")).toBe(titleHash("dasara elephants arrive at mysore palace"));
    expect(titleHash("Dasara elephants arrive")).not.toBe(titleHash("Dasara elephants depart"));
  });

  it("keeps Kannada text intact (combining marks are not stripped)", () => {
    expect(normalizeTitle("ಮೈಸೂರು ಅರಮನೆ")).toBe("ಮೈಸೂರು ಅರಮನೆ");
  });

  it("strips Google News publisher suffix", () => {
    expect(stripPublisherSuffix("Palace lit up for Dasara - Star of Mysore", "Star of Mysore")).toBe("Palace lit up for Dasara");
    expect(stripPublisherSuffix("Palace lit up for Dasara - The Hindu")).toBe("Palace lit up for Dasara");
  });
});

describe("toSnippet", () => {
  it("strips HTML and caps at 500 chars", () => {
    const long = `<p>${"word ".repeat(300)}</p>`;
    const s = toSnippet(long)!;
    expect(s.length).toBeLessThanOrEqual(500);
    expect(s).not.toContain("<p>");
    expect(toSnippet("<b>Tom &amp; Jerry</b>")).toBe("Tom & Jerry");
    expect(toSnippet("   ")).toBeNull();
  });
});

describe("dedupe", () => {
  const cand = (title: string, url: string): Candidate => toCandidate(src(), { title, link: url })!;

  it("drops items already in the DB by URL or title hash", () => {
    const a = cand("Palace illumination extended", "https://a.com/1");
    const b = cand("Elephants arrive", "https://a.com/2");
    const c = cand("Something new", "https://a.com/3");
    const out = dedupe([a, b, c], [a.external_id], [b.hash]);
    expect(out.map((x) => x.title)).toEqual(["Something new"]);
  });

  it("drops duplicates within the same batch (same story via a different URL)", () => {
    const a = cand("Palace illumination extended", "https://a.com/1");
    const b = cand("Palace Illumination Extended!", "https://news.google.com/rss/articles/xyz");
    const c = cand("Other story", "https://a.com/1?utm_source=twitter");
    expect(dedupe([a, b, c], [], [])).toEqual([a]);
  });

  it("dedupes the fixture feeds: direct + Google News copies of the same story collapse", async () => {
    const fetch = fixtureFetcher();
    const sources = [
      src({ id: "s1", name: "Star of Mysore" }),
      src({ id: "s2", name: "Google News: Mysore Palace", type: "gnews" }),
    ];
    const all: Candidate[] = [];
    for (const s of sources) for (const e of await fetch(s)) all.push(toCandidate(s, e)!);
    const out = dedupe(all, [], []);
    expect(all).toHaveLength(5);
    expect(out).toHaveLength(4); // gnews copy of the elephants story is dropped
    expect(out.every((c) => (c.snippet ?? "").length <= 500)).toBe(true);
  });
});
