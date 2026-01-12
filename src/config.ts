/**
 * Configuration module - loads from environment variables
 * No secrets embedded; all sensitive values from env
 */

export interface Config {
  // Server
  port: number;
  host: string;

  // Database (Ruvector Postgres)
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
    // Connection pool settings
    poolMin: number;
    poolMax: number;
    // Query safety
    statementTimeoutMs: number;
  };

  // Query limits (per SPARC spec)
  query: {
    defaultPageSize: number;
    maxPageSize: number;
    queryTimeoutMs: number;
  };

  // Environment
  nodeEnv: string;
  logLevel: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function parseIntEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }
  return parsed;
}

function parseBoolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadConfig(): Config {
  return {
    port: parseIntEnv('PORT', 3000),
    host: optionalEnv('HOST', '0.0.0.0'),

    database: {
      host: requireEnv('RUVECTOR_DB_HOST'),
      port: parseIntEnv('RUVECTOR_DB_PORT', 5432),
      database: requireEnv('RUVECTOR_DB_NAME'),
      user: requireEnv('RUVECTOR_DB_USER'),
      password: requireEnv('RUVECTOR_DB_PASSWORD'),
      ssl: parseBoolEnv('RUVECTOR_DB_SSL', true),
      poolMin: parseIntEnv('DB_POOL_MIN', 2),
      poolMax: parseIntEnv('DB_POOL_MAX', 10),
      statementTimeoutMs: parseIntEnv('DB_STATEMENT_TIMEOUT_MS', 30000),
    },

    query: {
      defaultPageSize: parseIntEnv('QUERY_DEFAULT_PAGE_SIZE', 20),
      maxPageSize: parseIntEnv('QUERY_MAX_PAGE_SIZE', 100),
      queryTimeoutMs: parseIntEnv('QUERY_TIMEOUT_MS', 30000),
    },

    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    logLevel: optionalEnv('LOG_LEVEL', 'info'),
  };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// For testing - reset config
export function resetConfig(): void {
  configInstance = null;
}
