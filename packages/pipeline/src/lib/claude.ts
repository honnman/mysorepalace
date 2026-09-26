import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PKG_ROOT, requireEnv } from "./env.js";

/** Minimal surface we use — lets tests inject a fake client. */
export type ClaudeClient = Pick<Anthropic, "messages">;

let client: ClaudeClient | undefined;

export function claude(): ClaudeClient {
  client ??= new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  return client;
}

export function model(): string {
  return requireEnv("ANTHROPIC_MODEL");
}

export function loadPrompt(name: "classify" | "summarize"): string {
  return readFileSync(path.join(PKG_ROOT, "prompts", `${name}.md`), "utf8");
}

export class ClaudeRefusalError extends Error {}

/**
 * One structured-output call: the response is constrained to `schema` and
 * parsed/validated by the SDK. Throws on refusal or unparseable output.
 */
export async function callStructured<S extends z.ZodType>(opts: {
  client?: ClaudeClient;
  model?: string;
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const c = opts.client ?? claude();
  const response = await c.messages.parse({
    model: opts.model ?? model(),
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: zodOutputFormat(opts.schema) },
  });

  if (response.stop_reason === "refusal") {
    throw new ClaudeRefusalError("Model declined the request (stop_reason=refusal)");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Model output truncated (stop_reason=max_tokens)");
  }
  if (response.parsed_output == null) {
    throw new Error("Model output did not match the expected schema");
  }
  return response.parsed_output as z.infer<S>;
}
