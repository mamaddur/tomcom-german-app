import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import {
  ACCESS_COOKIE,
  cookieOptions,
  LEARNER_ACCESS_COOKIE,
  LEARNER_REFRESH_COOKIE,
  LEARNER_REFRESH_MAX_AGE,
  REFRESH_COOKIE,
  REFRESH_MAX_AGE,
  secondsUntilExpiry,
} from './lib/session';

const intl = createMiddleware(routing);
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

/**
 * Next.js 16 proxy: locale routing, plus renewing the staff and student sessions. When the 5-minute access
 * token is about to expire, it is swapped using the refresh token. If the API refuses (30 minutes
 * idle, 12-hour cap, revoked), the session cookies are cleared and pages redirect to the login.
 */
export default async function proxy(request: NextRequest) {
  let response = intl(request);
  response = await renewSession(request, response, ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_MAX_AGE);
  return renewSession(
    request,
    response,
    LEARNER_ACCESS_COOKIE,
    LEARNER_REFRESH_COOKIE,
    LEARNER_REFRESH_MAX_AGE,
  );
}

async function renewSession(
  request: NextRequest,
  response: NextResponse,
  accessName: string,
  refreshName: string,
  refreshMaxAge: number,
): Promise<NextResponse> {
  const access = request.cookies.get(accessName)?.value;
  const refresh = request.cookies.get(refreshName)?.value;
  if (!refresh || (access && secondsUntilExpiry(access) > 30)) return response;

  const res = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
    cache: 'no-store',
  }).catch(() => null);

  if (res?.ok) {
    const tokens = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresInSeconds: number;
    };
    // Pass the new token to this render too, not only to the browser.
    request.cookies.set(accessName, tokens.accessToken);
    const next = rewriteWithCookies(request, response);
    next.cookies.set(accessName, tokens.accessToken, cookieOptions(tokens.expiresInSeconds));
    next.cookies.set(refreshName, tokens.refreshToken, cookieOptions(refreshMaxAge));
    return next;
  }
  if (res && res.status === 401) {
    request.cookies.delete(accessName);
    const next = rewriteWithCookies(request, response);
    next.cookies.delete(accessName);
    next.cookies.delete(refreshName);
    return next;
  }
  return response; // API unreachable: leave the session alone.
}

/** Keeps next-intl's redirect/rewrite, but forwards the updated request cookies to the page. */
function rewriteWithCookies(request: NextRequest, intlResponse: NextResponse): NextResponse {
  if (intlResponse.headers.get('location')) return intlResponse;
  const headers = new Headers(request.headers);
  headers.set('cookie', request.cookies.toString());
  const rewrite = intlResponse.headers.get('x-middleware-rewrite');
  const next = rewrite
    ? NextResponse.rewrite(rewrite, { request: { headers } })
    : NextResponse.next({ request: { headers } });
  intlResponse.headers.forEach((value, key) => {
    if (key !== 'x-middleware-rewrite' && key !== 'x-middleware-next') next.headers.set(key, value);
  });
  return next;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
