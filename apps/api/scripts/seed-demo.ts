// Publishes a small synthetic A1 course so a fresh dev setup has lessons to show.
// Goes through the studio API as the synthetic author and reviewer (same rules as real content).
// Needs the API running, `scripts/dev-services.sh up`, and ffmpeg (placeholder audio is a short tone).
// Usage: pnpm --filter @tomcom/api seed:demo   (API_URL defaults to http://localhost:3000)
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  process.loadEnvFile('.env.local');
} catch {
  // CI/containers pass the environment directly.
}

const API = process.env.API_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.DEV_STAFF_PASSWORD;
const OTP = process.env.DEV_OTP ?? '123456';
const AUTHOR = '+915599990003';
const REVIEWER = '+915599990004';

if (process.env.APP_ENV && process.env.APP_ENV !== 'dev') {
  throw new Error('seed-demo only runs against a dev API');
}
if (!PASSWORD) throw new Error('DEV_STAFF_PASSWORD missing in .env.local');

async function call<T>(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

async function login(phone: string): Promise<string> {
  // A second run inside the code cooldown is told how long to wait; wait it out instead of failing.
  let start: { challengeToken: string } | undefined;
  for (let attempt = 0; !start; attempt++) {
    try {
      start = await call<{ challengeToken: string }>('POST', '/v1/staff-auth/login', null, {
        phone,
        password: PASSWORD,
      });
    } catch (e) {
      const wait = /"retryAfterSeconds":(\d+)/.exec(String(e))?.[1];
      if (!wait || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, (Number(wait) + 1) * 1000));
    }
  }
  const done = await call<{ tokens: { accessToken: string } }>(
    'POST',
    '/v1/staff-auth/verify',
    null,
    {
      challengeToken: start.challengeToken,
      code: OTP,
      device: { clientId: 'seed-demo-device-01', platform: 'android', appVersion: '0.1.0' },
    },
  );
  return done.tokens.accessToken;
}

const tmp = mkdtempSync(join(tmpdir(), 'seed-demo-'));
let tone = 0;
/** Placeholder recording: a one-second tone, not speech. Real native-speaker audio replaces it (FR-302). */
async function audio(token: string): Promise<string> {
  const file = join(tmp, `tone-${tone}.wav`);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${300 + (tone++ % 8) * 40}:duration=1`,
    file,
  ]);
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)]), 'tone.wav');
  return (await call<{ id: string }>('POST', '/v1/studio/media', token, form)).id;
}

type L10n = { te: string; en: string };
const t = (te: string, en: string): L10n => ({ te, en });

async function run(): Promise<void> {
  const author = await login(AUTHOR);
  const reviewer = await login(REVIEWER);

  const existing = await call<unknown[]>('GET', '/v1/studio/levels/A1/packs', reviewer);
  if (existing.length > 0) {
    console.log('A1 already has a published pack; nothing to do.');
    return;
  }

  // One recording per German text; each lesson refers to it by id.
  const cache = new Map<string, string>();
  const g = async (text: string) => {
    if (!cache.has(text)) cache.set(text, await audio(author));
    return { text, audio: cache.get(text)! };
  };

  const vocab = async (
    german: string,
    article: 'der' | 'die' | 'das',
    plural: string,
    meaning: L10n,
    tradeTags: string[],
  ) =>
    (
      await call<{ id: string }>('POST', '/v1/studio/vocab', author, {
        german,
        audioId: (await g(german)).audio,
        article,
        plural,
        meaning,
        tradeTags,
      })
    ).id;
  const hammer = await vocab('Hammer', 'der', 'Hämmer', t('సుత్తి', 'hammer'), [
    'electrician',
    'welder',
  ]);
  const cable = await vocab('Kabel', 'das', 'Kabel', t('తీగ', 'cable'), ['electrician']);
  const sw = await vocab('Schalter', 'der', 'Schalter', t('స్విచ్', 'switch'), ['electrician']);

  const mcq = (prompt: L10n, options: string[], answer: number, why: L10n) => ({
    id: randomUUID(),
    type: 'mcq',
    prompt,
    payload: { options },
    answer,
    explanation: why,
    difficulty: 1,
  });

  const lessons = [
    {
      title: t('పలకరింపులు', 'Greetings'),
      description: t('పలకరించడం నేర్చుకోండి', 'Learn to greet people'),
      estMinutes: 12,
      screens: [
        {
          type: 'explain',
          body: {
            body: t(
              'రోజు సమయాన్ని బట్టి పలకరింపు మారుతుంది. ఉదయం "Guten Morgen" అంటారు.',
              'The greeting depends on the time of day. In the morning say "Guten Morgen".',
            ),
            examples: [await g('Guten Morgen!'), await g('Guten Abend!')],
          },
        },
        {
          type: 'dialogue',
          body: {
            lines: [
              {
                speaker: 'Anna',
                german: await g('Guten Morgen! Wie geht es Ihnen?'),
                meaning: t('శుభోదయం! మీరు ఎలా ఉన్నారు?', 'Good morning! How are you?'),
              },
              {
                speaker: 'Ravi',
                german: await g('Danke, gut. Und Ihnen?'),
                meaning: t('ధన్యవాదాలు, బాగున్నాను. మీరు?', 'Thanks, fine. And you?'),
              },
            ],
          },
        },
        {
          type: 'practice',
          body: {
            prompt: t('ఉదయం ఎవరినైనా పలకరించండి', 'Greet someone in the morning'),
            target: await g('Guten Morgen!'),
          },
        },
      ],
      questions: [
        mcq(
          t('"Good morning" అంటే జర్మన్‌లో ఏమిటి?', 'How do you say "Good morning" in German?'),
          ['Guten Morgen', 'Gute Nacht', 'Danke'],
          0,
          t('"Guten Morgen" అంటే శుభోదయం.', '"Guten Morgen" means good morning.'),
        ),
        {
          id: randomUUID(),
          type: 'fill_gap',
          prompt: t('ఖాళీని పూరించండి', 'Fill the gap'),
          payload: { text: 'Ich ___ Ravi.', options: ['heiße', 'bist'] },
          answer: 0,
          explanation: t('"Ich heiße" అంటే నా పేరు.', '"Ich heiße" means my name is.'),
          difficulty: 1,
        },
        {
          id: randomUUID(),
          type: 'match_pairs',
          prompt: t('జతచేయండి', 'Match the pairs'),
          payload: { left: ['Hallo', 'Danke'], right: ['ధన్యవాదాలు', 'నమస్కారం'] },
          answer: [1, 0],
          explanation: t('Hallo = నమస్కారం, Danke = ధన్యవాదాలు.', 'Hallo = hello, Danke = thanks.'),
          difficulty: 1,
        },
        {
          id: randomUUID(),
          type: 'word_order',
          prompt: t('వాక్యాన్ని సరిగా అమర్చండి', 'Put the sentence in order'),
          payload: { words: ['Ich', 'heiße', 'Ravi'] },
          answer: [0, 1, 2],
          explanation: t('నా పేరు రవి.', 'My name is Ravi.'),
          difficulty: 1,
        },
        {
          id: randomUUID(),
          type: 'listen_choose',
          prompt: t('విని సరైనది ఎంచుకోండి', 'Listen and choose'),
          payload: {
            audio: (await g('Guten Morgen!')).audio,
            options: ['Guten Morgen', 'Gute Nacht'],
          },
          answer: 0,
          explanation: t('"Guten Morgen" అంటే శుభోదయం.', '"Guten Morgen" means good morning.'),
          difficulty: 1,
        },
      ],
    },
    {
      title: t('మిమ్మల్ని పరిచయం చేసుకోండి', 'Introducing yourself'),
      description: t('మీ పేరు, ఊరు చెప్పండి', 'Say your name and where you are from'),
      estMinutes: 14,
      screens: [
        {
          type: 'explain',
          body: {
            body: t('"Ich heiße …" అంటే "నా పేరు …".', '"Ich heiße …" means "My name is …".'),
            examples: [await g('Ich heiße Ravi.'), await g('Ich komme aus Indien.')],
          },
        },
      ],
      questions: [
        mcq(
          t('"Ich heiße Ravi" అంటే ఏమిటి?', 'What does "Ich heiße Ravi" mean?'),
          ['My name is Ravi', 'I am hungry', 'See you later'],
          0,
          t('నా పేరు రవి.', 'My name is Ravi.'),
        ),
      ],
    },
    {
      title: t('పనిప్రదేశంలో', 'At the workplace'),
      description: t('పనిముట్లు, సూచనలు', 'Tools and instructions'),
      estMinutes: 16,
      tradeTags: ['electrician'],
      screens: [
        { type: 'vocab', body: { vocabIds: [hammer, cable, sw] } },
        {
          type: 'explain',
          body: {
            body: t(
              'పనిముట్ల పేర్లకు ముందు der, die, das వస్తాయి.',
              'Tool names come with der, die or das.',
            ),
            examples: [await g('Gib mir den Hammer, bitte.')],
          },
        },
      ],
      questions: [
        mcq(
          t('"Hammer" అంటే ఏమిటి?', 'What is "Hammer"?'),
          ['hammer', 'cable', 'switch'],
          0,
          t('"der Hammer" అంటే సుత్తి.', '"der Hammer" means hammer.'),
        ),
      ],
    },
  ];

  const ids: string[] = [];
  for (const l of lessons) {
    const lesson = await call<{ id: string }>('POST', '/v1/studio/lessons', author, {
      level: 'A1',
      title: l.title,
    });
    await call('PUT', `/v1/studio/lessons/${lesson.id}`, author, {
      expectedRevision: 1,
      title: l.title,
      description: l.description,
      estMinutes: l.estMinutes,
      tradeTags: l.tradeTags ?? [],
      screens: l.screens.map((s) => ({ id: randomUUID(), ...s })),
      questions: l.questions,
    });
    await call('POST', `/v1/studio/lessons/${lesson.id}/transition`, author, { to: 'in_review' });
    await call('POST', `/v1/studio/lessons/${lesson.id}/transition`, reviewer, { to: 'approved' });
    ids.push(lesson.id);
  }

  const pack = await call<{ pack: { version: number; lessonCount: number } }>(
    'POST',
    '/v1/studio/levels/A1/publish',
    reviewer,
    {},
  );
  console.log(
    `Published A1 pack v${pack.pack.version} with ${pack.pack.lessonCount} lessons (placeholder tone audio, synthetic content).`,
  );
}

run().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
