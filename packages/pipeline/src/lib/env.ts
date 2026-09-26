import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load the repo-root .env regardless of cwd.
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../../.env") });

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

export const PKG_ROOT = path.resolve(here, "../..");
