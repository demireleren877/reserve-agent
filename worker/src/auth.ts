// Firebase ID token verification using Google's JWKS.
// Tokens are RS256 JWTs. We cache the JWKS for the duration of the response's max-age.

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

interface JWK {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

interface JWKS {
  keys: JWK[];
}

interface CachedKeys {
  keys: Map<string, CryptoKey>;
  expiresAt: number;
}

let cache: CachedKeys | null = null;

async function loadKeys(): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new AuthError(500, "jwks_fetch_failed");

  const cacheControl = res.headers.get("cache-control") ?? "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const ttlSec = maxAgeMatch?.[1] ? parseInt(maxAgeMatch[1], 10) : 3600;

  const jwks = (await res.json()) as JWKS;
  const keys = new Map<string, CryptoKey>();
  for (const jwk of jwks.keys) {
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keys.set(jwk.kid, cryptoKey);
  }

  cache = { keys, expiresAt: now + ttlSec * 1000 };
  return keys;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface VerifiedToken {
  uid: string;
  email: string;
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJSON<T>(seg: string): T {
  const bytes = b64urlDecode(seg);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

interface JwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface FirebaseClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  auth_time: number;
  user_id?: string;
  email?: string;
  email_verified?: boolean;
  firebase?: { sign_in_provider?: string };
}

export async function verifyIdToken(
  token: string,
  projectId: string,
): Promise<VerifiedToken> {
  if (!projectId) throw new AuthError(500, "firebase_project_id_unset");

  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError(401, "malformed_token");
  const [headerSeg, payloadSeg, signatureSeg] = parts as [string, string, string];

  let header: JwtHeader;
  let claims: FirebaseClaims;
  try {
    header = decodeJSON<JwtHeader>(headerSeg);
    claims = decodeJSON<FirebaseClaims>(payloadSeg);
  } catch {
    throw new AuthError(401, "decode_failed");
  }

  if (header.alg !== "RS256") throw new AuthError(401, "bad_alg");
  if (!header.kid) throw new AuthError(401, "missing_kid");

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) throw new AuthError(401, "token_expired");
  if (claims.iat > now + 60) throw new AuthError(401, "token_iat_in_future");
  if (claims.aud !== projectId) throw new AuthError(401, "bad_audience");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`)
    throw new AuthError(401, "bad_issuer");
  if (!claims.sub) throw new AuthError(401, "missing_sub");

  const keys = await loadKeys();
  const key = keys.get(header.kid);
  if (!key) throw new AuthError(401, "unknown_kid");

  const signed = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const sig = b64urlDecode(signatureSeg);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    sig,
    signed,
  );
  if (!ok) throw new AuthError(401, "bad_signature");

  return {
    uid: claims.sub,
    email: claims.email ?? "",
  };
}
