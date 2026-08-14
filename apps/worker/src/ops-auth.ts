const COOKIE_NAME = "scout_ops";
const SESSION_SECONDS = 60 * 60;

function encode(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function digest(value: string) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function matches(left: string, right: string) {
  const [leftDigest, rightDigest] = await Promise.all([
    digest(left),
    digest(right),
  ]);
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1)
    difference |= leftDigest[index] ^ rightDigest[index];
  return difference === 0;
}

async function signature(expiresAt: string, token: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encode(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(expiresAt),
      ),
    ),
  );
}

export async function createOpsSession(
  candidate: string,
  configuredToken: string,
  now: Date,
) {
  if (!(await matches(candidate, configuredToken))) return null;
  const expiresAt = String(Math.floor(now.getTime() / 1000) + SESSION_SECONDS);
  return `${expiresAt}.${await signature(expiresAt, configuredToken)}`;
}

export async function verifyOpsSession(
  request: Request,
  configuredToken: string,
  now: Date,
) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  const value = cookie?.slice(COOKIE_NAME.length + 1);
  if (!value) return false;
  const [expiresAt, suppliedSignature, ...rest] = value.split(".");
  if (
    rest.length > 0 ||
    !expiresAt ||
    !suppliedSignature ||
    !/^\d{10}$/.test(expiresAt) ||
    Number(expiresAt) <= Math.floor(now.getTime() / 1000)
  )
    return false;
  return matches(
    suppliedSignature,
    await signature(expiresAt, configuredToken),
  );
}

export function opsSessionCookie(
  value: string,
  secure: boolean,
  maxAge = SESSION_SECONDS,
) {
  return `${COOKIE_NAME}=${value}; HttpOnly; SameSite=Strict; Path=/api/v1/ops; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
