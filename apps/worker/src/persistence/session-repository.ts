export interface GuestSession {
  id: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionRepository {
  findActiveByTokenHash(
    tokenHash: string,
    now: string,
  ): Promise<GuestSession | null>;
  create(session: GuestSession): Promise<void>;
}

export class D1SessionRepository implements SessionRepository {
  constructor(private readonly database: D1Database) {}

  async findActiveByTokenHash(tokenHash: string, now: string) {
    const row = await this.database
      .prepare(
        `SELECT id, token_hash, created_at, expires_at
         FROM sessions
         WHERE token_hash = ? AND expires_at > ?`,
      )
      .bind(tokenHash, now)
      .first<{
        id: string;
        token_hash: string;
        created_at: string;
        expires_at: string;
      }>();
    return row
      ? {
          id: row.id,
          tokenHash: row.token_hash,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        }
      : null;
  }

  async create(session: GuestSession) {
    await this.database
      .prepare(
        `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
         VALUES (?, NULL, ?, ?, ?)`,
      )
      .bind(session.id, session.tokenHash, session.createdAt, session.expiresAt)
      .run();
  }
}
