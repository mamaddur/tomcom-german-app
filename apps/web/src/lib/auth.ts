import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, ApiProblem, type Me } from './api';
import { ACCESS_COOKIE } from './session';

export const CONTENT_ROLES = ['author', 'reviewer', 'super_admin'] as const;

/**
 * The signed-in staff member, or a redirect to the login. With `roles`, other staff get a 403
 * page from the caller via `allowed: false` (the API enforces the same rule again).
 */
export async function requireStaff(locale: string, roles?: readonly string[]) {
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!accessToken) redirect(`/${locale}/login`);
  let me: Me;
  try {
    me = await api<Me>('/v1/me', { accessToken });
  } catch (err) {
    if (err instanceof ApiProblem && err.status === 401) redirect(`/${locale}/login`);
    throw err;
  }
  if (me.role === 'learner') redirect(`/${locale}/login`);
  return { me, accessToken, allowed: !roles || roles.includes(me.role) };
}

/** For server actions: the access token, or an error result the form can show. */
export async function accessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}
