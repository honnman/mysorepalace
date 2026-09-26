import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PKG_ROOT } from "./lib/env.js";
import { db } from "./lib/db.js";
import { logger } from "./lib/log.js";
import type { SourceType } from "./lib/types.js";

const log = logger("seed");

export interface SourceSeed {
  name: string;
  url: string;
  type: SourceType;
  language: string;
  active?: boolean;
}

export function loadSourceSeeds(): SourceSeed[] {
  return JSON.parse(readFileSync(path.join(PKG_ROOT, "sources.json"), "utf8"));
}

/**
 * Insert any sources from sources.json that aren't in the DB yet (matched by name).
 * Existing rows are left untouched, so deactivating a source in the DB sticks.
 */
export async function seedSources(): Promise<number> {
  const seeds = loadSourceSeeds();
  const { data, error } = await db()
    .from("sources")
    .upsert(
      seeds.map((s) => ({ ...s, active: s.active ?? true })),
      { onConflict: "name", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  const inserted = data?.length ?? 0;
  log.info(`sources seeded`, { inSeedFile: seeds.length, inserted });
  return inserted;
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  seedSources().catch((e) => {
    log.error(String(e));
    process.exit(1);
  });
}
