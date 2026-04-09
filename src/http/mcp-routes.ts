import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer as createMcpServer } from "../mcp/server.js";
import * as oauth from "../oauth.js";
import { createRateLimiter } from "./rate-limit.js";

// Session store — capped to prevent unbounded memory growth from stuck sessions.
const MAX_SESSIONS = 256;
const transports: Record<string, StreamableHTTPServerTransport> = {};

function sendJsonRpcError(
  res: Response,
  status: number,
  code: number,
  message: string
): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

async function createNewSession(req: Request, res: Response): Promise<void> {
  if (Object.keys(transports).length >= MAX_SESSIONS) {
    sendJsonRpcError(res, 503, -32000, "Too many sessions");
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      transports[sid] = transport;
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid && transports[sid]) {
      delete transports[sid];
    }
  };

  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  try {
    if (sessionId && transports[sessionId]) {
      await transports[sessionId].handleRequest(req, res, req.body);
      return;
    }
    if (!sessionId && isInitializeRequest(req.body)) {
      await createNewSession(req, res);
      return;
    }
    if (sessionId) {
      sendJsonRpcError(res, 404, -32001, "Session not found");
      return;
    }
    sendJsonRpcError(res, 400, -32000, "Bad Request: no session ID");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error handling MCP request:", message);
    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, "Internal server error");
    }
  }
}

async function handleMcpStream(req: Request, res: Response): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(404).send("Session not found");
    return;
  }
  await transport.handleRequest(req, res);
}

export function registerMcpRoutes(app: Express): void {
  // MCP endpoint is authenticated but worth limiting to prevent bearer abuse.
  const mcpLimiter = createRateLimiter(60_000, 120); // 120 req / min / IP

  app.post("/mcp", mcpLimiter, oauth.requireBearerAuth, (req, res) => {
    void handleMcpPost(req, res);
  });
  app.get("/mcp", mcpLimiter, oauth.requireBearerAuth, (req, res) => {
    void handleMcpStream(req, res);
  });
  app.delete("/mcp", mcpLimiter, oauth.requireBearerAuth, (req, res) => {
    void handleMcpStream(req, res);
  });
}

/** Close all active MCP transports (SIGINT handler). */
export async function closeAllMcpSessions(): Promise<void> {
  for (const sid in transports) {
    await transports[sid]?.close();
    delete transports[sid];
  }
}
