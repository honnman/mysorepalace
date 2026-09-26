import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

const repoRoot = path.join(__dirname, "../..");
// Single .env at the repo root, shared with the pipeline.
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", undefined, true);

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
