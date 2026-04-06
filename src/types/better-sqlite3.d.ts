declare module "better-sqlite3" {
  interface Statement {
    run(params?: unknown): { changes: number; lastInsertRowid: number | bigint };
    get(params?: unknown): unknown;
    all(params?: unknown): unknown[];
  }

  class Database {
    constructor(filename: string, options?: Record<string, unknown>);
    pragma(source: string): unknown;
    exec(source: string): this;
    prepare(source: string): Statement;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  }

  export default Database;
}
