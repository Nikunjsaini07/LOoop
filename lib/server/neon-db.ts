import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

function replaceCallWithCast(sql: string, funcName: string, targetFunc: string): string {
  let idx = 0;
  while ((idx = sql.toLowerCase().indexOf(funcName.toLowerCase(), idx)) !== -1) {
    if (idx > 0 && /[a-zA-Z0-9_]/.test(sql[idx - 1])) {
      idx += funcName.length;
      continue;
    }
    const openParen = sql.indexOf('(', idx + funcName.length);
    if (openParen === -1) break;
    let depth = 1;
    let end = openParen + 1;
    while (end < sql.length && depth > 0) {
      if (sql[end] === '(') depth++;
      else if (sql[end] === ')') depth--;
      end++;
    }
    const args = sql.slice(openParen + 1, end - 1);
    const replacement = `${targetFunc}(${args})::text`;
    sql = sql.slice(0, idx) + replacement + sql.slice(end);
    idx += replacement.length;
  }
  return sql;
}

export function convertSql(query: string): string {
  let paramIndex = 1;
  let sql = query.replace(/\?/g, () => `$${paramIndex++}`);

  sql = replaceCallWithCast(sql, 'json_group_array', 'json_agg');
  sql = replaceCallWithCast(sql, 'json_group_object', 'json_object_agg');
  sql = sql.replace(/\bjson_object\s*\(/gi, 'json_build_object(');
  sql = sql.replace(/\bjson\s*\(/gi, '"json"(');
  sql = sql.replace(/\bchar\(10\)/gi, 'chr(10)');
  sql = sql.replace(/\bRETURNING\s+value\b/gi, 'RETURNING app_state.value');
  sql = sql.replace(/\s+IS\s+NOT\s+(?!NULL\b|TRUE\b|FALSE\b)/gi, ' IS DISTINCT FROM ');

  if (/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql)) {
    sql = sql.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, 'INSERT INTO');
    if (!/\bON\s+CONFLICT\b/i.test(sql)) {
      sql = sql.trimEnd();
      if (sql.endsWith(';')) sql = sql.slice(0, -1) + ' ON CONFLICT DO NOTHING;';
      else sql += ' ON CONFLICT DO NOTHING';
    }
  }

  return sql;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }>;
  run<T = unknown>(): Promise<{ success: boolean; meta: Record<string, unknown> }>;
  raw<T = unknown>(): Promise<T[]>;
}

export interface NeonD1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

class PreparedStatement implements D1PreparedStatement {
  private client: NeonQueryFunction<false, false>;
  private rawQuery: string;
  private params: unknown[];

  constructor(client: NeonQueryFunction<false, false>, query: string, params: unknown[] = []) {
    this.client = client;
    this.rawQuery = query;
    this.params = params;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new PreparedStatement(this.client, this.rawQuery, values);
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const converted = convertSql(this.rawQuery);
    const rows = (await this.client.query(converted, this.params)) as Record<string, unknown>[];
    if (!rows || rows.length === 0) return null;
    const firstRow = rows[0];
    if (colName) return (firstRow[colName] as T) ?? null;
    return firstRow as T;
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }> {
    const converted = convertSql(this.rawQuery);
    const rows = (await this.client.query(converted, this.params)) as T[];
    return {
      results: rows,
      success: true,
      meta: { changes: 0, served_by: 'neon-postgresql' },
    };
  }

  async run<T = unknown>(): Promise<{ success: boolean; meta: Record<string, unknown> }> {
    const converted = convertSql(this.rawQuery);
    await this.client.query(converted, this.params);
    return {
      success: true,
      meta: { changes: 1, served_by: 'neon-postgresql' },
    };
  }

  async raw<T = unknown>(): Promise<T[]> {
    const res = await this.all<T>();
    return res.results;
  }

  getSql(): string {
    return convertSql(this.rawQuery);
  }

  getParams(): unknown[] {
    return this.params;
  }
}

export function createNeonDatabase(connectionString: string): NeonD1Database {
  const client = neon(connectionString);

  return {
    prepare(query: string): D1PreparedStatement {
      return new PreparedStatement(client, query);
    },

    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }[]> {
      const results: { results: T[]; success: boolean; meta: Record<string, unknown> }[] = [];
      for (const stmt of statements) {
        const ps = stmt as PreparedStatement;
        const res = await ps.all<T>();
        results.push(res);
      }
      return results;
    },

    async exec(query: string): Promise<{ count: number; duration: number }> {
      const start = Date.now();
      const converted = convertSql(query);
      await client.query(converted);
      return { count: 1, duration: Date.now() - start };
    },
  };
}
