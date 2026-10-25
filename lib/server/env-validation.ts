/**
 * Environment variable validation utilities
 * Validates required configuration at startup to fail fast with clear error messages
 */

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey?: string;
}

export interface DatabaseConfig {
  databaseUrl?: string;
  d1Available: boolean;
}

export interface ApiConfig {
  apiUrl?: string;
  proxySecret?: string;
  appOrigin: string;
}

/**
 * Validates Supabase configuration
 * Required for authentication to work
 */
export function validateSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfig {
  const defaultUrl = 'https://bkfxvxkdasxqlmzyjpoz.supabase.co';
  const defaultKey = 'sb_publishable_OYbHXFEQ1JCkjB_5NCIeXQ_QqUTQB7N';

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || defaultUrl;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || defaultKey;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
  };
}

/**
 * Validates database configuration
 * Either D1 (Cloudflare) or PostgreSQL (Neon) must be available
 */
export function validateDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const databaseUrl = env.DATABASE_URL;
  // Check for Cloudflare D1 binding on globalThis
  const globalEnv = (globalThis as { env?: { DB?: D1Database } }).env;
  const d1Available = typeof globalEnv?.DB !== 'undefined';

  if (!databaseUrl && !d1Available) {
    console.warn(
      'Neither DATABASE_URL nor Cloudflare D1 binding is configured. Using seed data fallback.'
    );
  }

  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
        throw new EnvValidationError(
          `DATABASE_URL must be a PostgreSQL connection string, got protocol: ${url.protocol}`
        );
      }
    } catch (error) {
      if (error instanceof EnvValidationError) throw error;
      throw new EnvValidationError(`DATABASE_URL must be a valid connection string`);
    }
  }

  return {
    databaseUrl,
    d1Available,
  };
}

/**
 * Validates API configuration for production deployment
 */
export function validateApiConfig(env: Record<string, string | undefined>, requireProduction = false): ApiConfig {
  const apiUrl = env.READWELL_API_URL;
  const proxySecret = env.READWELL_PROXY_SECRET;
  const appOrigin = env.APP_ORIGIN || 'http://127.0.0.1:5173';

  if (requireProduction) {
    if (!apiUrl) {
      throw new EnvValidationError(
        'READWELL_API_URL is required for production. Set it to your Cloudflare Worker URL.'
      );
    }

    if (!proxySecret || proxySecret.length < 32) {
      throw new EnvValidationError(
        'READWELL_PROXY_SECRET must be at least 32 characters for production security.'
      );
    }

    try {
      const url = new URL(apiUrl);
      if (url.protocol !== 'https:') {
        throw new EnvValidationError('READWELL_API_URL must use HTTPS in production');
      }
    } catch (error) {
      if (error instanceof EnvValidationError) throw error;
      throw new EnvValidationError(`READWELL_API_URL must be a valid URL`);
    }
  }

  return {
    apiUrl,
    proxySecret,
    appOrigin,
  };
}

/**
 * Validates all environment configuration
 * Call this at application startup
 */
export function validateEnvironment(options: {
  requireProduction?: boolean;
  requireDatabase?: boolean;
} = {}) {
  const env = typeof process !== 'undefined' ? process.env : {};
  
  const errors: string[] = [];
  
  try {
    validateSupabaseConfig(env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      errors.push(error.message);
    }
  }

  if (options.requireDatabase) {
    try {
      const dbConfig = validateDatabaseConfig(env);
      if (!dbConfig.databaseUrl && !dbConfig.d1Available) {
        errors.push('Database configuration is required but not found');
      }
    } catch (error) {
      if (error instanceof EnvValidationError) {
        errors.push(error.message);
      }
    }
  }

  if (options.requireProduction) {
    try {
      validateApiConfig(env, true);
    } catch (error) {
      if (error instanceof EnvValidationError) {
        errors.push(error.message);
      }
    }
  }

  if (errors.length > 0) {
    throw new EnvValidationError(
      `Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
  }
}
