import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const PORT = Number(process.env.PORT || "5000");

  // WSL2 + Windows Chrome: localhost sometimes resolves to IPv6 ::1 and WS breaks.
  // You can override via HMR_HOST if needed.
  const isWSL = Boolean(process.env.WSL_DISTRO_NAME);
  const defaultHmrHost = process.env.HMR_HOST?.trim() || (isWSL ? "127.0.0.1" : undefined);

  const serverOptions = {
    middlewareMode: true as const,
    allowedHosts: true as const,
    hmr: {
      server, // ✅ attach to SAME HTTP server
      protocol: "ws" as const,
      host: defaultHmrHost, // ✅ avoids localhost IPv6 weirdness on WSL
      clientPort: PORT, // ✅ prevents ws://localhost:undefined
    },
  };

  // Resolve the Vite config (it's a function via defineConfig)
  const userConfig =
    typeof viteConfig === "function"
      ? await viteConfig({ command: "serve", mode: "development" } as any)
      : viteConfig;

  const vite = await createViteServer({
    ...userConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
      },
    },
    server: {
      ...(typeof userConfig === "object" && userConfig && "server" in userConfig
        ? (userConfig as any).server
        : {}),
      ...serverOptions,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);

  // ✅ CRITICAL: without this, ws://localhost:5000 will fail/reset in middleware mode
  vite.ws.listen();

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip SPA fallback for static files - let Vite middleware handle them
    const hasFileExtension = /\.[a-z0-9]+$/i.test(url.split("?")[0]);
    if (hasFileExtension && !url.endsWith(".html")) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(import.meta.dirname, "..", "client", "index.html");

      // Reload index.html each request (dev)
      let template = await fs.promises.readFile(clientTemplate, "utf-8");

      // Optional cache-bust main entry (safe, but not required)
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist/public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use((req, res, next) => {
    if (req.method === "GET" && (req.path === "/" || req.path.endsWith(".html"))) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  app.use(
    express.static(distPath, {
      maxAge: "1y",
      immutable: true,
      setHeaders(res, file) {
        if (file.endsWith(".js")) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        }
        if (file.endsWith(".css")) {
          res.setHeader("Content-Type", "text/css; charset=utf-8");
        }
        if (file.endsWith(".webmanifest")) {
          res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
        }
      },
    })
  );

  app.get("*", (req, res) => {
    if (/\.[a-z0-9]+$/i.test(req.path)) {
      return res.status(404).end();
    }
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
