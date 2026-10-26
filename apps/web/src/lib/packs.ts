import 'server-only';
import { unzipSync } from 'fflate';
import { API_BASE_URL, ApiProblem } from './api';
import { normalizePhrase } from './text';

export type L10n = Record<string, string>;
export interface German {
  text: string;
  audio: string;
}
export type PackScreen =
  | { id: string; order: number; type: 'explain'; body: L10n; examples?: German[] }
  | { id: string; order: number; type: 'vocab'; vocabIds: string[] }
  | {
      id: string;
      order: number;
      type: 'dialogue';
      lines: Array<{ speaker: string; german: German; meaning: L10n }>;
    }
  | { id: string; order: number; type: 'practice'; prompt: L10n; target: German };
export interface PackQuestion {
  id: string;
  type: 'mcq' | 'listen_choose' | 'fill_gap' | 'match_pairs' | 'word_order';
  prompt: L10n;
  payload: Record<string, unknown>;
  answer: unknown;
  explanation: L10n;
}
export interface PackLesson {
  id: string;
  order: number;
  title: L10n;
  description: L10n;
  estMinutes: number;
  screens: PackScreen[];
  questions: PackQuestion[];
}
export interface PackVocab {
  id: string;
  german: German;
  article?: string;
  plural?: string;
  meaning: L10n;
}
export interface PackManifest {
  level: string;
  version: number;
  settings: { passMark: number; questionsPerQuiz: number };
  lessons: PackLesson[];
  vocab: PackVocab[];
  media: Array<{ id: string; path: string }>;
}
export interface LoadedPack {
  manifest: PackManifest;
  /** Audio and images by media id. */
  media: Map<string, { bytes: Uint8Array; type: string }>;
}

const TYPES: Record<string, string> = {
  opus: 'audio/ogg; codecs=opus',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  webp: 'image/webp',
  png: 'image/png',
};

/** Packs never change once published (ADR-008), so a loaded pack is kept for the process lifetime. */
const cache = new Map<string, Promise<LoadedPack>>();

async function fetchPackBytes(path: string, accessToken: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    throw new ApiProblem(0, 'network_error');
  }
  if (!res.ok) throw new ApiProblem(res.status, 'pack_unavailable');
  return new Uint8Array(await res.arrayBuffer());
}

/** Downloads, unzips and parses one published pack. Only the files the manifest names are read. */
export function loadPack(level: string, version: number, accessToken: string): Promise<LoadedPack> {
  const key = `${level}/${version}`;
  let loaded = cache.get(key);
  if (!loaded) {
    loaded = (async () => {
      const zip = unzipSync(
        await fetchPackBytes(`/v1/packs/${level}/${version}/download`, accessToken),
      );
      const manifestFile = zip['manifest.json'];
      if (!manifestFile) throw new ApiProblem(500, 'pack_invalid');
      const manifest = JSON.parse(new TextDecoder().decode(manifestFile)) as PackManifest;
      const media = new Map<string, { bytes: Uint8Array; type: string }>();
      for (const m of manifest.media) {
        const bytes = zip[m.path];
        if (!bytes) continue;
        const ext = m.path.split('.').pop()?.toLowerCase() ?? '';
        media.set(m.id, { bytes, type: TYPES[ext] ?? 'application/octet-stream' });
      }
      return { manifest, media };
    })();
    cache.set(key, loaded);
    loaded.catch(() => cache.delete(key));
  }
  return loaded;
}

/** Every published pack the student can use, one per level. */
export async function currentPacks(accessToken: string): Promise<LoadedPack[]> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/v1/packs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    throw new ApiProblem(0, 'network_error');
  }
  if (!res.ok) throw new ApiProblem(res.status, 'pack_unavailable');
  const packs = (await res.json()) as Array<{ level: string; version: number }>;
  const newest = new Map<string, number>();
  for (const p of packs) newest.set(p.level, Math.max(newest.get(p.level) ?? 0, p.version));
  const order = ['A1', 'A2', 'B1'];
  return Promise.all(
    [...newest.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([level, version]) => loadPack(level, version, accessToken)),
  );
}

export const mediaUrl = (pack: LoadedPack, audioId: string) =>
  `/api/learn/media/${pack.manifest.level}/${pack.manifest.version}/${audioId}`;

/**
 * German phrase → recording URL for every phrase in the pack (explanations, dialogues, practice,
 * vocabulary), so the tutor's tappable phrases can play a lesson recording (FR-603).
 */
export function recordingIndex(packs: LoadedPack[]): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (pack: LoadedPack, g?: German) => {
    if (g?.text && g.audio) out[normalizePhrase(g.text)] ??= mediaUrl(pack, g.audio);
  };
  for (const pack of packs) {
    for (const lesson of pack.manifest.lessons) {
      for (const s of lesson.screens) {
        if (s.type === 'explain') for (const e of s.examples ?? []) add(pack, e);
        if (s.type === 'dialogue') for (const l of s.lines) add(pack, l.german);
        if (s.type === 'practice') add(pack, s.target);
      }
    }
    for (const v of pack.manifest.vocab) add(pack, v.german);
  }
  return out;
}
