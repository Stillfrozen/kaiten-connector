import cors from "cors";
import express, { type Express } from "express";
import { env } from "../env.js";
import * as oauth from "../oauth.js";
import { registerMcpRoutes } from "./mcp-routes.js";
import { createRateLimiter } from "./rate-limit.js";

/** Build the Express app with all middleware, OAuth routes, /health, and /mcp. */
export function createApp(): Express {
  const app = express();

  // Don't advertise the framework in response headers.
  app.disable("x-powered-by");

  // Trust the first reverse proxy (Railway/Render ingress). Prevents clients
  // from spoofing X-Forwarded-* headers directly.
  app.set("trust proxy", 1);

  // Baseline security headers on every response. Cheap, defense-in-depth.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  // Small body limits — OAuth and MCP JSON-RPC payloads are tiny
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  app.use(
    cors({
      exposedHeaders: ["Mcp-Session-Id", "Last-Event-Id", "Mcp-Protocol-Version"],
      origin: env("CORS_ORIGIN") ?? "https://claude.ai",
      credentials: true,
    })
  );

  // OAuth endpoints are unauthenticated and attractive to attackers — tight cap.
  const oauthLimiter = createRateLimiter(60_000, 20); // 20 req / min / IP

  // --- OAuth endpoints (no auth, but rate-limited) ---
  app.get(
    "/.well-known/oauth-protected-resource",
    oauth.protectedResourceMetadata
  );
  app.get("/.well-known/oauth-authorization-server", oauth.authServerMetadata);
  app.post("/oauth/register", oauthLimiter, oauth.registerClient);
  app.get("/oauth/authorize", oauthLimiter, oauth.authorize);
  app.post("/oauth/authorize", oauthLimiter, oauth.authorizeApprove);
  app.post("/oauth/token", oauthLimiter, oauth.token);

  // Health check (no auth) — minimal info, no internal state.
  app.get("/health", (_req, res) => {
    const configured = !!env("KAITEN_HOST") && !!env("KAITEN_TOKEN");
    res.json({ status: configured ? "ok" : "misconfigured" });
  });

  registerMcpRoutes(app);

  return app;
}
