import type { ExecuteValues, FieldPacket, QueryResult, QueryValues } from "mysql2";

declare module "mysql2/promise" {
  // mysql2 implements these through declaration mixins. Re-declaring the two
  // documented Promise methods keeps them visible with bundler module resolution.
  interface Connection {
    query<T extends QueryResult>(sql: string, values?: QueryValues): Promise<[T, FieldPacket[]]>;
    execute<T extends QueryResult>(
      sql: string,
      values?: ExecuteValues,
    ): Promise<[T, FieldPacket[]]>;
  }
}
