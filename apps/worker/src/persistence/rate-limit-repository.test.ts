import { describe, expect, it, vi } from "vitest";

import { D1RateLimitRepository } from "./rate-limit-repository";

describe("D1 release rate limiter", () => {
  it("hashes the actor key and enforces the returned atomic count", async () => {
    const first = vi.fn(async () => ({ request_count: 11 }));
    const bind = vi.fn(() => ({ first }));
    const prepare = vi.fn(() => ({ bind }));
    const repository = new D1RateLimitRepository(
      { prepare } as unknown as D1Database,
      () => new Date("2026-08-14T18:00:42.000Z"),
    );

    await expect(
      repository.allow({
        scope: "costly",
        actorKey: "server-owned-session",
        limit: 10,
        periodMs: 60_000,
      }),
    ).resolves.toBe(false);

    expect(prepare).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT"),
    );
    expect(bind).toHaveBeenCalledWith(
      "costly",
      expect.stringMatching(/^[a-f0-9]{64}$/),
      "2026-08-14T18:00:00.000Z",
      "2026-08-14T18:02:42.000Z",
    );
    expect(JSON.stringify(bind.mock.calls)).not.toContain(
      "server-owned-session",
    );
  });
});
