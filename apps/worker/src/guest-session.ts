import type { AppContext } from "./http";
import {
  D1SessionRepository,
  type SessionRepository,
} from "./persistence/session-repository";

const cookieName = "scout_guest";
const lifetimeSeconds = 60 * 60 * 24 * 30;

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readCookie(header: string | undefined) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === cookieName) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function resolveGuestSession(
  context: AppContext,
  clock: () => Date,
  repository: SessionRepository = new D1SessionRepository(context.env.DB),
) {
  const token = readCookie(context.req.header("cookie"));
  const now = clock();
  if (token && /^[a-f0-9-]{36}$/.test(token)) {
    const existing = await repository.findActiveByTokenHash(
      await hashToken(token),
      now.toISOString(),
    );
    if (existing) return existing.id;
  }

  const newToken = crypto.randomUUID();
  const session = {
    id: crypto.randomUUID(),
    tokenHash: await hashToken(newToken),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + lifetimeSeconds * 1_000).toISOString(),
  };
  await repository.create(session);
  const secure = context.env.APP_ENV === "production" ? "; Secure" : "";
  context.header(
    "set-cookie",
    `${cookieName}=${encodeURIComponent(newToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetimeSeconds}${secure}`,
  );
  return session.id;
}
