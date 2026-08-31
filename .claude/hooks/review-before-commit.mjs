#!/usr/bin/env node
// PreToolUse reminder for `git commit`: nudges toward running the pr-review-toolkit agents against
// the staged diff first. It never blocks and never auto-approves — the only field it emits besides
// `hookEventName` is `additionalContext`, so the normal permission prompt for `git commit` still
// runs. settings.json's `if` restricts this hook to Bash calls whose command matches `git commit`;
// the regex below is defense-in-depth if that filter is absent.
import { readFileSync } from "node:fs";

function readCommand() {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    return typeof payload?.tool_input?.command === "string" ? payload.tool_input.command : "";
  } catch {
    return "";
  }
}

const command = readCommand();

if (!/\bgit\s+commit\b/.test(command)) {
  process.exit(0);
}

const reason =
  "Before this commit lands, look at the staged diff (`git diff --cached`) and decide which of the " +
  "pr-review-toolkit agents actually apply — code-reviewer, code-simplifier, silent-failure-hunter, " +
  "type-design-analyzer — rather than running all of them by default. Skip an agent when the diff " +
  "gives it nothing to check (e.g. no new error handling or fallback logic → skip silent-failure-hunter; " +
  "no new/changed types → skip type-design-analyzer; docs-only or config-only diff → skip all four). " +
  "Run the ones whose concern is actually present in the diff and address what they surface. This is a " +
  "reminder, not a gate — you decide both which agents run and when review is sufficient.";

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: reason,
    },
  }),
);

process.exit(0);
