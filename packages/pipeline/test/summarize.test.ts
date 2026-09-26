import { describe, expect, it } from "vitest";
import { checkSummary, type ClusterItem, type Summary } from "../src/summarize.js";

const items: ClusterItem[] = [
  {
    id: "a", title: "Dasara elephants arrive at Mysore Palace for Jamboo Savari rehearsals",
    snippet: "The first batch of nine elephants led by Abhimanyu were welcomed at the Jayamarthanda Gate with traditional puja.",
    url: "https://starofmysore.com/x", publisher: "Star of Mysore", source_name: "Star of Mysore",
    language: "en", published_at: null, category: "dasara",
  },
];

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const base: Summary = {
  headline: "Nine elephants begin Dasara preparations at the palace",
  summary_md: words(180),
  why_it_matters: "One. Two.",
  key_facts: ["a", "b", "c"],
  sources: [{ outlet: "Star of Mysore", url: "https://starofmysore.com/x" }],
  uncertainty: "",
};

describe("checkSummary", () => {
  it("accepts a compliant summary", () => {
    expect(checkSummary(base, items)).toEqual([]);
  });

  it("flags copied source wording, long quotes, and length", () => {
    const copied = { ...base, summary_md: `${words(170)} nine elephants led by Abhimanyu were welcomed at the Jayamarthanda Gate` };
    expect(checkSummary(copied, items).join()).toMatch(/copies source wording/);

    const quoted = { ...base, summary_md: `${words(170)} "this quote is definitely much longer than twelve words in total for sure"` };
    expect(checkSummary(quoted, items).join()).toMatch(/quote over 12 words/);

    expect(checkSummary({ ...base, summary_md: words(90) }, items).join()).toMatch(/90 words/);
    expect(checkSummary({ ...base, key_facts: ["a"] }, items).join()).toMatch(/key_facts/);
  });
});
