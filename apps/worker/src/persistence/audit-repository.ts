export interface AuditRecord {
  id: string;
  occurredAt: string;
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  correlationId: string;
  details: Record<string, unknown>;
}

export interface AuditRepository {
  append(record: AuditRecord): Promise<void>;
}

export class D1AuditRepository implements AuditRepository {
  constructor(private readonly database: D1Database) {}

  async append(record: AuditRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO audit_events
          (id, occurred_at, actor_id, action, subject_type, subject_id, correlation_id, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        record.occurredAt,
        record.actorId,
        record.action,
        record.subjectType,
        record.subjectId,
        record.correlationId,
        JSON.stringify(record.details),
      )
      .run();
  }
}
