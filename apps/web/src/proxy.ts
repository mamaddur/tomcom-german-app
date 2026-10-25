import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 "proxy" (formerly middleware): redirects / to the default locale.
export default createMiddleware(routing);

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
