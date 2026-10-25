import { cookies } from 'next/headers';
import { API_BASE_URL } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/session';

/** Studio audio/image preview: proxied so the browser never holds an API token. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 });
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response(null, { status: 401 });
  const res = await fetch(`${API_BASE_URL}/v1/studio/media/${id}/content`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return new Response(null, { status: res.status });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
