import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

// Hermetic harness (test-plan Phase 3): a minimal fake Supabase client for route
// handler tests. It is NOT a real client — it returns caller-configured
// {data,error} results and captures write payloads (.upsert/.insert/.delete) so
// tests can assert which branch ran and what identity was bound, without a DB.
// Build via vi.mock("@/lib/supabase", () => ({ createClient: () => fake.client })).

export interface QueryResult<T = unknown> {
  data: T;
  error: { message: string } | null;
}

export interface WriteCall {
  table: string;
  op: "upsert" | "insert" | "delete";
  rows?: unknown;
  options?: unknown;
}

export interface RpcCall {
  name: string;
  args: Record<string, unknown> | undefined;
}

export interface TableConfig {
  /** Result for read chains (select…single/maybeSingle, or awaiting the builder). */
  read?: QueryResult;
  /** Result returned by upsert/insert/delete (default {data:null,error:null}). */
  write?: QueryResult;
}

export interface FakeSupabaseOptions {
  /** auth method stubs, e.g. { signInWithPassword: async () => ({data,error}) }. */
  auth?: Record<string, (...args: never[]) => unknown>;
  /** rpc(name,args) → result; receives the captured call for routing by name. */
  rpc?: (name: string, args: Record<string, unknown> | undefined) => QueryResult | Promise<QueryResult>;
  /** per-table read/write results. */
  tables?: Record<string, TableConfig>;
}

const OK: QueryResult = { data: null, error: null };

class FakeQuery implements PromiseLike<QueryResult> {
  private mode: "read" | "write" = "read";
  constructor(
    private readonly table: string,
    private readonly cfg: TableConfig,
    private readonly writes: WriteCall[],
  ) {}

  // --- no-op chain methods (filters/ordering don't affect the fake result) ---
  select(..._args: unknown[]): this {
    return this;
  }
  eq(..._args: unknown[]): this {
    return this;
  }
  in(..._args: unknown[]): this {
    return this;
  }
  lte(..._args: unknown[]): this {
    return this;
  }
  gte(..._args: unknown[]): this {
    return this;
  }
  order(..._args: unknown[]): this {
    return this;
  }
  limit(..._args: unknown[]): this {
    return this;
  }

  // --- writes: capture payload, switch to write-result mode ---
  upsert(rows: unknown, options?: unknown): this {
    this.writes.push({ table: this.table, op: "upsert", rows, options });
    this.mode = "write";
    return this;
  }
  insert(rows: unknown): this {
    this.writes.push({ table: this.table, op: "insert", rows });
    this.mode = "write";
    return this;
  }
  delete(): this {
    this.writes.push({ table: this.table, op: "delete" });
    this.mode = "write";
    return this;
  }

  // --- terminals ---
  single(): Promise<QueryResult> {
    return Promise.resolve(this.result());
  }
  maybeSingle(): Promise<QueryResult> {
    return Promise.resolve(this.result());
  }
  then<R1 = QueryResult, R2 = never>(
    onfulfilled?: ((value: QueryResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }

  // LOAD-BEARING: after a write op (upsert/insert/delete) the builder switches to
  // write-mode, so a DIRECT await of `.upsert(...)` (no .single()) resolves the
  // configured `write` result via then(). The submit/grade SWALLOW tests depend
  // on this to inject an upsert error; don't change result()/then() so that a
  // post-write await silently returns the read result, or those tests go vacuous.
  private result(): QueryResult {
    if (this.mode === "write") return this.cfg.write ?? OK;
    return this.cfg.read ?? OK;
  }
}

export interface FakeSupabase {
  /** Pass this into vi.mock as createClient's return value. */
  client: SupabaseClient<Database>;
  /** Captured .upsert/.insert/.delete calls, in order. */
  writes: WriteCall[];
  /** Captured .rpc(name,args) calls, in order. */
  rpcCalls: RpcCall[];
}

/** Build a fake Supabase client + capture buffers for hermetic route tests. */
export function makeFakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const writes: WriteCall[] = [];
  const rpcCalls: RpcCall[] = [];
  const tables = options.tables ?? {};

  const client = {
    auth: {
      signOut: () => Promise.resolve({ error: null }), // real supabase-js returns { error } only
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      ...options.auth,
    },
    from: (table: string) => new FakeQuery(table, tables[table] ?? {}, writes),
    rpc: (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const r = options.rpc?.(name, args) ?? OK;
      return Promise.resolve(r);
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, writes, rpcCalls };
}
