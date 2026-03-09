import BetterSqlite3 from "better-sqlite3";
type QueryParams = unknown[] | Record<string, unknown> | undefined;
declare class WrappedQuery {
    private readonly statement;
    constructor(statement: BetterSqlite3.Statement);
    all(params?: QueryParams): unknown[];
    get(params?: QueryParams): unknown;
    run(params?: QueryParams): BetterSqlite3.RunResult;
}
export declare class Database extends BetterSqlite3 {
    run(sql: string, params?: QueryParams): BetterSqlite3.RunResult;
    query(sql: string): WrappedQuery;
}
export {};
//# sourceMappingURL=bun-sqlite.d.ts.map