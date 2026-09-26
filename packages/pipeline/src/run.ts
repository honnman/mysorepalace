import { pathToFileURL } from "node:url";
import { logger } from "./lib/log.js";
import { seedSources } from "./seed.js";
import { fixtureFetcher, ingest, rssFetcher } from "./ingest.js";
import { classify } from "./classify.js";
import { cluster } from "./cluster.js";
import { summarize } from "./summarize.js";

const log = logger("run");

/**
 * ingest → classify → cluster → summarize.
 * Every step only touches work that isn't done yet (unclassified items,
 * unclustered items, clusters without a story), so re-running is safe.
 * A failing step is logged and later steps still run on whatever is ready.
 */
export async function run(opts: { fixtures?: boolean } = {}) {
  const started = Date.now();
  const steps: [string, () => Promise<unknown>][] = [
    ["seed", seedSources],
    ["ingest", () => ingest(opts.fixtures ? fixtureFetcher() : rssFetcher)],
    ["classify", classify],
    ["cluster", cluster],
    ["summarize", summarize],
  ];

  const failures: string[] = [];
  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (e) {
      failures.push(name);
      log.error(`step ${name} failed`, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  log.info("pipeline finished", { seconds: Math.round((Date.now() - started) / 1000), failures });
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  run({ fixtures: process.argv.includes("--fixtures") }).then((failures) => {
    process.exit(failures.length ? 1 : 0);
  });
}
