#!/usr/bin/env node
// PostToolUse: run Prettier on the one file that was just edited.
//
// `pnpm check:format` is not part of `pnpm verify` or CI, so formatting drift is only ever caught
// by a human running `pnpm format`. Formatting on write keeps that permanently clean for free.
//
// Prettier is invoked through its own CJS bin with `node` rather than through `node_modules/.bin/`
// or `pnpm exec`, so the hook behaves the same on the Windows leg of the CI matrix as on macOS and
// Linux. `--ignore-unknown` means unsupported extensions are skipped instead of erroring, and
// Prettier applies `.prettierignore` itself — which is why dist/, coverage/, the lockfile and the
// recorded fixtures need no special-casing here.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PRETTIER_BIN = path.join(REPO_ROOT, "node_modules", "prettier", "bin", "prettier.cjs");

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return undefined;
  }
}

const payload = readPayload();
const raw = payload?.tool_input?.file_path;

if (typeof raw === "string" && raw.length > 0 && existsSync(PRETTIER_BIN)) {
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(payload?.cwd ?? REPO_ROOT, raw);
  if (!path.relative(REPO_ROOT, absolute).startsWith("..") && existsSync(absolute)) {
    spawnSync(process.execPath, [PRETTIER_BIN, "--write", "--ignore-unknown", absolute], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
  }
}

// Never fail the tool call over formatting.
process.exit(0);
