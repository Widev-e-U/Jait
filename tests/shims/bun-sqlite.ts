import BetterSqlite3 from "better-sqlite3";

type QueryParams = unknown[] | Record<string, unknown> | undefined;

class WrappedQuery {
  constructor(private readonly statement: BetterSqlite3.Statement) {}

  all(params?: QueryParams) {
    if (typeof params === "undefined") return this.statement.all();
    if (Array.isArray(params)) return this.statement.all(...params);
    return this.statement.all(params);
  }

  get(params?: QueryParams) {
    if (typeof params === "undefined") return this.statement.get();
    if (Array.isArray(params)) return this.statement.get(...params);
    return this.statement.get(params);
  }

  run(params?: QueryParams) {
    if (typeof params === "undefined") return this.statement.run();
    if (Array.isArray(params)) return this.statement.run(...params);
    return this.statement.run(params);
  }
}

export class Database extends BetterSqlite3 {
  run(sql: string, params?: QueryParams) {
    const statement = this.prepare(sql);
    if (typeof params === "undefined") return statement.run();
    if (Array.isArray(params)) return statement.run(...params);
    return statement.run(params);
  }

  query(sql: string) {
    return new WrappedQuery(this.prepare(sql));
  }
}
