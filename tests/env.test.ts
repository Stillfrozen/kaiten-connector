import { test } from "node:test";
import assert from "node:assert/strict";
import { env, stripSurroundingQuotes } from "../src/env.js";

// --- stripSurroundingQuotes (pure, no env state) ---

test("stripSurroundingQuotes: removes matching double quotes", () => {
  assert.equal(stripSurroundingQuotes('"hello"'), "hello");
});

test("stripSurroundingQuotes: removes matching single quotes", () => {
  assert.equal(stripSurroundingQuotes("'hello'"), "hello");
});

test("stripSurroundingQuotes: leaves unquoted value alone", () => {
  assert.equal(stripSurroundingQuotes("hello"), "hello");
});

test("stripSurroundingQuotes: leaves mismatched quotes alone", () => {
  assert.equal(stripSurroundingQuotes("\"hello'"), "\"hello'");
});

test("stripSurroundingQuotes: leaves unbalanced (only leading) alone", () => {
  assert.equal(stripSurroundingQuotes('"hello'), '"hello');
});

test("stripSurroundingQuotes: leaves unbalanced (only trailing) alone", () => {
  assert.equal(stripSurroundingQuotes('hello"'), 'hello"');
});

test("stripSurroundingQuotes: strips exactly one pair, keeps inner quotes", () => {
  assert.equal(stripSurroundingQuotes('""nested""'), '"nested"');
});

test("stripSurroundingQuotes: empty quoted string -> empty string", () => {
  assert.equal(stripSurroundingQuotes('""'), "");
});

test("stripSurroundingQuotes: empty string -> empty string", () => {
  assert.equal(stripSurroundingQuotes(""), "");
});

test("stripSurroundingQuotes: single char -> unchanged", () => {
  assert.equal(stripSurroundingQuotes("a"), "a");
  assert.equal(stripSurroundingQuotes('"'), '"');
});

test("stripSurroundingQuotes: preserves inner content including commas", () => {
  assert.equal(
    stripSurroundingQuotes('"https://a.com/cb,https://b.com/cb"'),
    "https://a.com/cb,https://b.com/cb"
  );
});

// --- env() integration with process.env ---

const TEST_KEY = "__KAITEN_MCP_TEST_VAR__";

function withEnv(value: string | undefined, fn: () => void) {
  const prev = process.env[TEST_KEY];
  if (value === undefined) delete process.env[TEST_KEY];
  else process.env[TEST_KEY] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[TEST_KEY];
    else process.env[TEST_KEY] = prev;
  }
}

test("env: undefined when unset", () => {
  withEnv(undefined, () => {
    assert.equal(env(TEST_KEY), undefined);
  });
});

test("env: strips Railway-style double quotes", () => {
  withEnv('"mycompany.kaiten.ru"', () => {
    assert.equal(env(TEST_KEY), "mycompany.kaiten.ru");
  });
});

test("env: strips single quotes", () => {
  withEnv("'kaiten-claude'", () => {
    assert.equal(env(TEST_KEY), "kaiten-claude");
  });
});

test("env: leaves unquoted value alone", () => {
  withEnv("plain-value", () => {
    assert.equal(env(TEST_KEY), "plain-value");
  });
});

test("env: empty quoted string treated as unset", () => {
  withEnv('""', () => {
    assert.equal(env(TEST_KEY), undefined);
  });
});

test("env: empty string treated as unset", () => {
  withEnv("", () => {
    assert.equal(env(TEST_KEY), undefined);
  });
});

test("env: preserves quotes inside value, only strips outer pair", () => {
  withEnv('"pre"mid"post"', () => {
    assert.equal(env(TEST_KEY), 'pre"mid"post');
  });
});

test("env: comma-separated list with outer quotes works after split", () => {
  withEnv('"https://claude.ai/cb,https://other.com/cb"', () => {
    const raw = env(TEST_KEY) || "";
    const parts = raw.split(",").map((s) => stripSurroundingQuotes(s.trim()));
    assert.deepEqual(parts, [
      "https://claude.ai/cb",
      "https://other.com/cb",
    ]);
  });
});
