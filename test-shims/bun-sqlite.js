import BetterSqlite3 from "better-sqlite3";
class WrappedQuery {
    statement;
    constructor(statement) {
        this.statement = statement;
    }
    all(params) {
        if (typeof params === "undefined")
            return this.statement.all();
        if (Array.isArray(params))
            return this.statement.all(...params);
        return this.statement.all(params);
    }
    get(params) {
        if (typeof params === "undefined")
            return this.statement.get();
        if (Array.isArray(params))
            return this.statement.get(...params);
        return this.statement.get(params);
    }
    run(params) {
        if (typeof params === "undefined")
            return this.statement.run();
        if (Array.isArray(params))
            return this.statement.run(...params);
        return this.statement.run(params);
    }
}
export class Database extends BetterSqlite3 {
    run(sql, params) {
        const statement = this.prepare(sql);
        if (typeof params === "undefined")
            return statement.run();
        if (Array.isArray(params))
            return statement.run(...params);
        return statement.run(params);
    }
    query(sql) {
        return new WrappedQuery(this.prepare(sql));
    }
}
//# sourceMappingURL=bun-sqlite.js.map