export async function withRetry<T>(fn: () => Promise<T>, attempts = 5, baseMs = 200): Promise<T> {
  let lastErr: any = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err || "").toLowerCase();
      const transient = /closed|econnreset|etimedout|connection terminated|timeout|socket hang up/.test(msg);
      if (!transient || i === attempts - 1) break;
      const delay = baseMs * Math.pow(2, i);
      try {
        // Helpful runtime log to observe retry behaviour
        // eslint-disable-next-line no-console
        console.warn(`[prisma-retry] transient error, attempt ${i + 1}/${attempts}, retrying in ${delay}ms: ${msg}`);
      } catch (e) {}
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
