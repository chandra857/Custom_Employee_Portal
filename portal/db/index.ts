import { getDatabase } from '@netlify/database';

type SqlValue = string | number | boolean | Date | Uint8Array | null | undefined;

type QueryResult = {
  rows: unknown[];
  rowCount: number | null;
};

type QueryClient = {
  query: (query: string, values?: unknown[]) => Promise<QueryResult>;
};

function postgresPlaceholders(query: string) {
  let position = 0;
  return query.replace(/\?/g, () => `$${++position}`);
}

export class PreparedStatement {
  private values: unknown[] = [];

  constructor(private readonly query: string) {}

  bind(...values: SqlValue[]) {
    this.values = values.map((value) => value ?? null);
    return this;
  }

  private async execute(client?: QueryClient) {
    const target = client ?? (getDatabase().pool as unknown as QueryClient);
    return target.query(postgresPlaceholders(this.query), this.values);
  }

  async first<T>() {
    const result = await this.execute();
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T>() {
    const result = await this.execute();
    return { results: result.rows as T[] };
  }

  async run() {
    const result = await this.execute();
    return { success: true, meta: { changes: result.rowCount ?? 0 } };
  }

  executeWith(client: QueryClient) {
    return this.execute(client);
  }
}

export const database = {
  prepare(query: string) {
    return new PreparedStatement(query);
  },

  async batch(statements: PreparedStatement[]) {
    const pool = getDatabase().pool;
    const client = await pool.connect();
    const queryClient = client as unknown as QueryClient;

    try {
      await client.query('BEGIN');
      const results = [];
      for (const statement of statements) results.push(await statement.executeWith(queryClient));
      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};
