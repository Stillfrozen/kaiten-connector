// Shared helpers for shaping MCP tool responses.

export type TextContent = {
  content: [{ type: "text"; text: string }];
};

/** Wrap a JSON-serializable value as an MCP text-content response. */
export function textResult(data: unknown): TextContent {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
