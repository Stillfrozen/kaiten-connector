import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Privacy contract: the connector must not surface card content to the model.
// Four forbidden categories (in Russian, from the product owner):
//   1. Комментарии            — card comments
//   2. ФИО исполнителей        — assignee full names
//   3. Описание               — card description
//   4. Текст критериев приемки — acceptance-criteria text
//
// This file is a static regression guard. It reads every .ts file under
// src/mcp/ and src/kaiten/endpoints.ts, strips comment lines (so our own
// "PRIVACY: …" documentation doesn't trip it), and asserts that none of the
// forbidden patterns appear. If a future contributor re-introduces a leak,
// this test fails before it ships.

const ROOT = join(import.meta.dirname, "..");

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkTs(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

// Strip //-comments and /* */-comments so "PRIVACY:" docstrings don't match.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const mcpFiles = walkTs(join(ROOT, "src", "mcp"));
const endpointsFile = join(ROOT, "src", "kaiten", "endpoints.ts");

interface LeakRule {
  name: string;
  pattern: RegExp;
  scope: string[]; // file paths to scan
}

const RULES: LeakRule[] = [
  // ФИО исполнителей: no tool may surface a full_name value. Type declarations
  // in kaiten/types.ts are excluded — they describe the raw API, not our
  // output shape.
  {
    name: "no full_name in MCP tool output",
    pattern: /\.full_name\b/,
    scope: mcpFiles,
  },
  // Card description: must never be passed through. Matches card.description,
  // x.description where x is a Card-like binding. String-typed literals like
  // "description: ..." in tool metadata are fine (they describe the tool).
  {
    name: "no card.description leak",
    pattern: /\bcard\.description\b/,
    scope: mcpFiles,
  },
  // Comments: the endpoint wrapper must not exist and no tool may call it.
  {
    name: "no getCardComments call or wrapper",
    pattern: /\bgetCardComments\b/,
    scope: [...mcpFiles, endpointsFile],
  },
  {
    name: "no shapeComments helper",
    pattern: /\bshapeComments\b/,
    scope: mcpFiles,
  },
  // Acceptance-criteria text: checklist item.text is the primary AC surface.
  {
    name: "no checklist items[].text leak",
    pattern: /\bi\.text\b|items?\[.*\]\.text\b/,
    scope: mcpFiles,
  },
  // Custom property values: commonly carry AC prose too; we only emit structure.
  {
    name: "no bare card.properties dump",
    pattern: /\bproperties:\s*card\.properties\b/,
    scope: mcpFiles,
  },
  // Time-log free-text comment field.
  {
    name: "no time-log comment leak",
    pattern: /\bt\.comment\b|\bcomment:\s*t\.comment\b/,
    scope: mcpFiles,
  },
];

for (const rule of RULES) {
  test(`PRIVACY: ${rule.name}`, () => {
    const hits: string[] = [];
    for (const file of rule.scope) {
      const stripped = stripComments(readFileSync(file, "utf8"));
      if (rule.pattern.test(stripped)) {
        hits.push(file.replace(ROOT + "/", ""));
      }
    }
    assert.deepEqual(
      hits,
      [],
      `Privacy leak detected. Pattern ${String(rule.pattern)} found in:\n  ${hits.join("\n  ")}\n` +
        `Review the forbidden-output contract in tests/privacy.test.ts before changing this.`
    );
  });
}
