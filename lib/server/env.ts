// Unified environment accessor for Node.js (Next.js) and Cloudflare Workers
type GlobalWithEnv = typeof globalThis & {
  env?: {
    [key: string]: string | undefined | D1Database;
    DB?: D1Database;
  };
  DB?: D1Database;
};

export const env = ((globalThis as GlobalWithEnv).env ??
  (typeof process !== 'undefined' ? process.env : {})) as {
  [key: string]: string | undefined | D1Database;
  DB?: D1Database;
};
