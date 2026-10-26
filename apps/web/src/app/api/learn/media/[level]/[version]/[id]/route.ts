import { cookies } from 'next/headers';
import { loadPack } from '@/lib/packs';
import { LEARNER_ACCESS_COOKIE } from '@/lib/session';

/** A lesson recording from a published pack, proxied so the browser never holds an API token. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ level: string; version: string; id: string }> },
) {
  const { level, version, id } = await params;
  if (!/^(A1|A2|B1)$/.test(level) || !/^\d{1,5}$/.test(version) || !/^[0-9a-f-]{36}$/.test(id)) {
    return new Response(null, { status: 404 });
  }
  const token = (await cookies()).get(LEARNER_ACCESS_COOKIE)?.value;
  if (!token) return new Response(null, { status: 401 });
  let file;
  try {
    file = (await loadPack(level, Number(version), token)).media.get(id);
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!file) return new Response(null, { status: 404 });
  return new Response(Buffer.from(file.bytes), {
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(file.bytes.length),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
