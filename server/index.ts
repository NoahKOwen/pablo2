import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors, { type CorsOptionsDelegate } from "cors";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startRetryWorker, stopRetryWorker } from "./retryWorker";
import { startDepositScanner } from "./services/depositScanner";

const app = express();

// Trust only the first proxy (Replit reverse proxy)
app.set("trust proxy", 1);

// Explicitly check NODE_ENV - default to production if not set (safer for deployments)
const isDevelopment = process.env.NODE_ENV === "development";
app.set("env", isDevelopment ? "development" : "production");

// ─────────────────────────────────────────────────────────────────────────────
// Helmet (CSP loosened in dev for Vite HMR)
app.use(
  helmet({
    contentSecurityPolicy: isDevelopment
      ? false
      : {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "wss:", "https:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            workerSrc: ["'self'", "blob:"],
            reportUri: ["/csp-report"],
          },
          reportOnly: false,
        },
    crossOriginEmbedderPolicy: false,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// CORS: allow prod domain, Replit previews, localhost/127.0.0.1, and configured APP/CLIENT url
const APP_URL = process.env.APP_URL?.trim();     // e.g. "http://localhost:5000"
const CLIENT_URL = process.env.CLIENT_URL?.trim();

function safeHost(u: string): string | null {
  try {
    const host = new URL(u).host;
    return host ? host : null;
  } catch {
    return null;
  }
}

const allowedHosts = new Set<string>(["xnrt.org", "www.xnrt.org"]);

function addAllowedUrl(u?: string) {
  if (!u) return;
  const host = safeHost(u);
  if (host) allowedHosts.add(host);
}

addAllowedUrl(APP_URL);
addAllowedUrl(CLIENT_URL);

// Replit domains vary
const REPLIT_RE = /\.(repl\.co|replit\.app)$/i;

// Local dev origins (WSL/Windows friendly)
const LOCAL_RE = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

const corsDelegate: CorsOptionsDelegate<Request> = (req, cb) => {
  const origin = req.header("Origin") || "";

  if (!origin) {
    // No origin (same-origin/CLI); allow
    return cb(null, { origin: true, credentials: true });
  }

  // Some contexts send Origin: null (file://). Allow only in dev.
  if (origin === "null") {
    return cb(null, { origin: isDevelopment, credentials: true });
  }

  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    return cb(null, { origin: false });
  }

  const allow =
    allowedHosts.has(host) ||
    REPLIT_RE.test(host) ||
    LOCAL_RE.test(host);

  cb(null, { origin: allow, credentials: true });
};

app.use(cors(corsDelegate));
app.options("*", cors(corsDelegate));

// ─────────────────────────────────────────────────────────────────────────────
// Body & cookie parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight API logger (truncates long JSON + redacts sensitive keys)
const SENSITIVE_KEYS = new Set([
  "password",
  "pass",
  "token",
  "accessToken",
  "refreshToken",
  "csrf",
  "csrfToken",
  "secret",
  "authorization",
  "email",
  "phone",
]);

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (key, value) => {
      if (!key) return value;
      if (SENSITIVE_KEYS.has(key)) return "[REDACTED]";
      return value;
    });
  } catch {
    return "";
  }
}

app.use((req, res, next) => {
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const path = req.path;
  let capturedJson: unknown;

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    capturedJson = body;
    return originalJson(body as any);
  }) as any;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;
    const duration = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - start);

    let line = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
    if (capturedJson !== undefined) {
      const s = safeStringify(capturedJson);
      if (s) line += ` :: ${s}`;
    }
    if (line.length > 200) line = line.slice(0, 199) + "…";
    log(line);
  });

  next();
});

// Basic liveness/readiness endpoints
app.get("/healthz", (_req, res) =>
  res.status(200).json({ ok: true, env: app.get("env") })
);
app.get("/readyz", (_req, res) => res.status(200).json({ ready: true }));

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const message = err?.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error(err);
  });

  if (isDevelopment) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const HOST = process.env.HOST || "0.0.0.0";
  const PORT = Number(process.env.PORT || "5000");

  server.listen(
    {
      host: HOST,
      port: PORT,
      reusePort: !isDevelopment, // safer locally; still fine on Replit/prod
    },
    () => {
      log(`serving on http://${HOST}:${PORT}`);

      const enableScanner =
        (process.env.ENABLE_SCANNER ?? (isDevelopment ? "false" : "true"))
          .toLowerCase() === "true";

      try {
        startRetryWorker();
      } catch (e) {
        console.error("[retryWorker] failed to start:", e);
      }

      if (enableScanner) {
        try {
          startDepositScanner();
        } catch (e) {
          console.error("[depositScanner] failed to start:", e);
        }
      } else {
        log("[depositScanner] disabled (set ENABLE_SCANNER=true to enable)");
      }
    }
  );

  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      console.error(`[server] Port ${PORT} is already in use. Stop the other process or change PORT.`);
    } else {
      console.error("[server] error:", err);
    }
  });

  const shutdown = (sig: string) => {
    log(`${sig} received, shutting down gracefully`);
    stopRetryWorker();
    server.close(() => {
      log("Server closed");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})();
