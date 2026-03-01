import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

interface SecretAuthOptions {
  envKey: 'PIPELINE_API_SECRET' | 'PIPELINE_SYNC_SECRET';
  headerName?: 'x-pipeline-secret';
  allowSession?: boolean;
}

const SESSION_COOKIE_NAME = 'pipeline_session';
const SESSION_DEFAULT_TTL_SECONDS = 60 * 60 * 12;

interface PipelineSessionPayload {
  username: string;
  expiresAt: number;
}

interface PipelineCredentials {
  username: string;
  password: string;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName !== name) {
      continue;
    }

    try {
      return decodeURIComponent(rawValue.join('='));
    } catch {
      return null;
    }
  }

  return null;
}

function getSessionSigningSecret() {
  return process.env.PIPELINE_AUTH_SECRET || process.env.PIPELINE_API_SECRET || null;
}

function getSessionTTLSeconds() {
  const raw = Number(process.env.PIPELINE_SESSION_TTL_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return SESSION_DEFAULT_TTL_SECONDS;
  }

  return Math.floor(raw);
}

function signSessionPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createPipelineSessionToken(username: string) {
  const secret = getSessionSigningSecret();
  if (!secret) {
    throw new Error(
      'PIPELINE_AUTH_SECRET or PIPELINE_API_SECRET must be configured for session signing.'
    );
  }

  const expiresAt = Date.now() + getSessionTTLSeconds() * 1000;
  const payload = Buffer.from(
    JSON.stringify({
      username,
      expiresAt,
    })
  ).toString('base64url');
  const signature = signSessionPayload(payload, secret);

  return `${payload}.${signature}`;
}

function parsePipelineSessionToken(token: string): PipelineSessionPayload | null {
  const secret = getSessionSigningSecret();
  if (!secret) {
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    return null;
  }

  const expected = signSessionPayload(payload, secret);
  if (!safeEqual(signature, expected)) {
    return null;
  }

  let parsed: { username?: unknown; expiresAt?: unknown } | null = null;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      username?: unknown;
      expiresAt?: unknown;
    };
  } catch {
    return null;
  }

  if (!parsed || typeof parsed.username !== 'string' || typeof parsed.expiresAt !== 'number') {
    return null;
  }

  if (parsed.expiresAt <= Date.now()) {
    return null;
  }

  return {
    username: parsed.username,
    expiresAt: parsed.expiresAt,
  };
}

export function getPipelineSessionFromRequest(request: Request) {
  const token = parseCookieValue(request.headers.get('cookie'), SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }

  return parsePipelineSessionToken(token);
}

export function applyPipelineSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getSessionTTLSeconds(),
  });
}

export function clearPipelineSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function getPipelineCredentials(): PipelineCredentials | null {
  const username = process.env.PIPELINE_ADMIN_USERNAME;
  const password = process.env.PIPELINE_ADMIN_PASSWORD;

  if (!username || !password) {
    return null;
  }

  return {
    username,
    password,
  };
}

export function verifyPipelineCredentials(username: string, password: string) {
  const credentials = getPipelineCredentials();
  if (!credentials) {
    return false;
  }

  return safeEqual(username, credentials.username) && safeEqual(password, credentials.password);
}

export function requireSecretAuth(request: Request, options: SecretAuthOptions) {
  const headerName = options.headerName ?? 'x-pipeline-secret';
  const allowSession = options.allowSession !== false;
  const expectedSecret = process.env[options.envKey];

  if (allowSession && getPipelineSessionFromRequest(request)) {
    return null;
  }

  if (!expectedSecret) {
    return NextResponse.json(
      {
        success: false,
        errorCode: `${options.envKey}_NOT_CONFIGURED`,
        message: `${options.envKey} is not configured.`,
      },
      { status: 500 }
    );
  }

  const secret = request.headers.get(headerName)?.trim();
  if (!secret || !safeEqual(secret, expectedSecret)) {
    return NextResponse.json(
      {
        success: false,
        errorCode: 'UNAUTHORIZED',
        message: 'Unauthorized request.',
      },
      { status: 401 }
    );
  }

  return null;
}
