import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const TIMEOUT_MS = 60_000;

/**
 * ffmpeg/ffprobe on untrusted uploads. No shell; a time limit; and `-protocol_whitelist file`,
 * so playlist-style inputs (HLS, concat) cannot make ffmpeg fetch URLs or read other files.
 */
async function run(cmd: 'ffmpeg' | 'ffprobe', args: string[]): Promise<string> {
  const { stdout } = await exec(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
  return stdout;
}

export interface Probe {
  formatName: string;
  durationMs: number | null;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
}

export async function probe(path: string): Promise<Probe | null> {
  try {
    const out = await run('ffprobe', [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-show_entries',
      'format=format_name,duration:stream=codec_type,width,height',
      '-of',
      'json',
      path,
    ]);
    const json = JSON.parse(out) as {
      format?: { format_name?: string; duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
    };
    const video = json.streams?.find((s) => s.codec_type === 'video');
    const duration = Number(json.format?.duration);
    return {
      formatName: json.format?.format_name ?? '',
      durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null,
      hasAudio: json.streams?.some((s) => s.codec_type === 'audio') ?? false,
      width: video?.width ?? null,
      height: video?.height ?? null,
    };
  } catch {
    return null;
  }
}

const COMMON = ['-nostdin', '-hide_banner', '-v', 'error', '-protocol_whitelist', 'file'];

/** Speech-quality mono Opus at 24 kbps: about 3 KB per second (NFR-04: clips under 100 KB). */
export async function toOpus(input: string, output: string): Promise<void> {
  await run('ffmpeg', [
    ...COMMON,
    '-i',
    input,
    '-map',
    '0:a:0',
    '-vn',
    '-ac',
    '1',
    '-ar',
    '24000',
    '-c:a',
    'libopus',
    '-b:a',
    '24k',
    '-f',
    'ogg',
    '-y',
    output,
  ]);
}

/** WebP, at most 800 px wide (NFR-04). */
export async function toWebp(input: string, output: string): Promise<void> {
  await run('ffmpeg', [
    ...COMMON,
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    "scale='min(800,iw)':-2",
    '-c:v',
    'libwebp',
    '-quality',
    '75',
    '-f',
    'webp',
    '-y',
    output,
  ]);
}
