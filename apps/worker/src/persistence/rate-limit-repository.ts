export class D1RateLimitRepository {
  constructor(
    private readonly database: D1Database,
    private readonly clock: () => Date,
  ) {}

  async allow(input: {
    scope: string;
    actorKey: string;
    limit: number;
    periodMs: number;
  }) {
    const now = this.clock().getTime();
    const windowStartedAt = new Date(
      Math.floor(now / input.periodMs) * input.periodMs,
    ).toISOString();
    const expiresAt = new Date(now + input.periodMs * 2).toISOString();
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input.actorKey),
    );
    const actorHash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const row = await this.database
      .prepare(
        `INSERT INTO rate_limit_windows (
          scope, actor_hash, window_started_at, request_count, expires_at
        ) VALUES (?, ?, ?, 1, ?)
        ON CONFLICT (scope, actor_hash, window_started_at)
        DO UPDATE SET request_count = request_count + 1
        RETURNING request_count`,
      )
      .bind(input.scope, actorHash, windowStartedAt, expiresAt)
      .first<{ request_count: number }>();
    if (!row) throw new Error("rate-limit counter was not returned");
    return row.request_count <= input.limit;
  }
}
