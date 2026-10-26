import { cookies } from 'next/headers';
import { API_BASE_URL, filterQuery } from '@/lib/api';
import { ACCESS_COOKIE } from '@/lib/session';

/** FR-905 downloads, proxied so the browser never holds an API token. */
export async function GET(req: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;
  const PATHS: Record<string, string> = {
    xlsx: 'export.xlsx',
    pdf: 'export.pdf',
    readiness: 'readiness.xlsx',
  };
  const path = PATHS[format];
  if (!path) return new Response(null, { status: 404 });
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response(null, { status: 401 });
  const url = new URL(req.url);
  const query = new URLSearchParams(filterQuery(Object.fromEntries(url.searchParams)));
  const locale = url.searchParams.get('locale');
  if (locale === 'te' || locale === 'en') query.set('locale', locale);
  const res = await fetch(`${API_BASE_URL}/v1/admin/reports/${path}?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) return new Response(null, { status: res.status });
  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
