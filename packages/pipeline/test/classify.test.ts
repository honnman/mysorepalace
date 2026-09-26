import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildClassifyUserMessage, classifyBatch, type ClassifyInput } from "../src/classify.js";
import { loadPrompt, type ClaudeClient } from "../src/lib/claude.js";
import { CATEGORIES } from "../src/lib/types.js";

const fixtures: ClassifyInput[] = JSON.parse(
  readFileSync(path.join(__dirname, "../fixtures/classify-items.json"), "utf8"),
);

// Canned model output for the fixture items (what a well-behaved model should return).
const canned = {
  results: [
    { id: "item-elephants", category: "dasara", relevance: 0.95, reason: "Dasara elephants at the palace." },
    { id: "item-illumination", category: "palace", relevance: 0.9, reason: "Visitor-facing palace timings." },
    { id: "item-durbar", category: "royal_family", relevance: 0.85, reason: "Public ceremonial role during Navaratri." },
    { id: "item-land-case", category: "reject", relevance: 0.1, reason: "Royal family property litigation is out of scope." },
    { id: "item-crime", category: "reject", relevance: 0.05, reason: "Unrelated crime news." },
    { id: "item-kannada", category: "dasara", relevance: 1.3, reason: "Kannada report of the elephants' arrival." },
    { id: "not-sent", category: "palace", relevance: 0.9, reason: "Hallucinated id." },
  ],
};

function fakeClient() {
  const parse = vi.fn().mockResolvedValue({ stop_reason: "end_turn", parsed_output: canned, content: [] });
  return { client: { messages: { parse } } as unknown as ClaudeClient, parse };
}

describe("classify prompt", () => {
  const prompt = loadPrompt("classify");

  it("defines every category and the out-of-scope royal topics", () => {
    for (const c of CATEGORIES) expect(prompt).toContain(`**${c}**`);
    for (const topic of ["disputes", "property", "health", "personal"]) expect(prompt).toMatch(new RegExp(topic, "i"));
    expect(prompt).toMatch(/untrusted/i);
  });

  it("puts every fixture item (including Kannada) into the user message", () => {
    const msg = buildClassifyUserMessage(fixtures);
    for (const f of fixtures) expect(msg).toContain(f.id);
    expect(msg).toContain("ಮೈಸೂರು ಅರಮನೆಗೆ");
  });
});

describe("classifyBatch smoke test (mocked Claude)", () => {
  it("sends the prompt + model and keeps only relevant items (>= 0.6, not reject)", async () => {
    const { client, parse } = fakeClient();
    const { classified, missing } = await classifyBatch(fixtures, client, "test-model");

    expect(parse).toHaveBeenCalledOnce();
    const req = parse.mock.calls[0]![0];
    expect(req.model).toBe("test-model");
    expect(req.system).toBe(loadPrompt("classify"));
    expect(req.output_config.format).toBeDefined();

    expect(missing).toEqual([]);
    expect(classified.map((c) => c.id)).not.toContain("not-sent");
    const kept = classified.filter((c) => c.keep).map((c) => c.id).sort();
    expect(kept).toEqual(["item-durbar", "item-elephants", "item-illumination", "item-kannada"]);
    expect(classified.find((c) => c.id === "item-kannada")!.relevance).toBe(1);
  });

  it("reports items the model skipped so they are retried", async () => {
    const { client } = fakeClient();
    const extra = { id: "item-extra", title: "Extra", snippet: null, publisher: null, language: "en" };
    const { missing } = await classifyBatch([...fixtures, extra], client, "test-model");
    expect(missing).toEqual(["item-extra"]);
  });

  it("throws on a refusal instead of silently classifying nothing", async () => {
    const parse = vi.fn().mockResolvedValue({ stop_reason: "refusal", parsed_output: null, content: [] });
    const client = { messages: { parse } } as unknown as ClaudeClient;
    await expect(classifyBatch(fixtures, client, "test-model")).rejects.toThrow(/refusal/);
  });
});
