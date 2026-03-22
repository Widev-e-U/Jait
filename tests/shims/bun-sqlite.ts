/**
 * bun:sqlite shim for Vitest (runs under Node.js).
 *
 * Uses Node 22's built-in `node:sqlite` (DatabaseSync) instead of the
 * `better-sqlite3` native addon, avoiding the deprecated `prebuild-install`.
 */
// @ts-ignore — node:sqlite types may not be available in all @types/node versions
import { DatabaseSync } from "node:sqlite";

type QueryParams = unknown[] | Record<string, unknown> | undefined;

function spreadParams(params?: QueryParams): unknown[] {
  if (typeof params === "undefined") return [];
  if (Array.isArray(params)) return params;
  return [params];
}

class WrappedQuery {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

  all(params?: QueryParams) {
    return this.statement.all(...spreadParams(params));
  }

  get(params?: QueryParams) {
    return this.statement.get(...spreadParams(params));
  }

  run(params?: QueryParams) {
    return this.statement.run(...spreadParams(params));
  }
}

export class Database extends DatabaseSync {
  run(sql: string, params?: QueryParams) {
    const statement = this.prepare(sql);
    return statement.run(...spreadParams(params));
  }

  query(sql: string) {
    return new WrappedQuery(this.prepare(sql));
  }
}
