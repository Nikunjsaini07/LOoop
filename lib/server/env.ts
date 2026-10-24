// Unified environment accessor for Node.js (Next.js) and Cloudflare Workers
type GlobalWithEnv = typeof globalThis & {
  env?: Record<string, unknown>;
  DB?: D1Database;
};

export const env = ((globalThis as GlobalWithEnv).env ??
  (typeof process !== 'undefined' ? process.env : {})) as Record<string, any>;
