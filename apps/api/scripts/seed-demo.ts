// Publishes a small synthetic A1 course so a fresh dev setup has lessons to show.
// Goes through the studio API as the synthetic author and reviewer (same rules as real content):
// six A1 lessons with quizzes, trade vocabulary, and the A1 checkpoint (reading, listening, writing).
// Needs the API running, `scripts/dev-services.sh up`, and ffmpeg (placeholder audio is a short tone).
// Usage: pnpm --filter @tomcom/api seed:demo   (API_URL defaults to http://localhost:3000)
// All Telugu below is a sample for the demo and still needs the Telugu reviewer.
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

// ── Question builders (content-schema shapes; answers are indices) ──
const q = (type: string, prompt: L10n, payload: unknown, answer: unknown, why: L10n) => ({
  id: randomUUID(),
  type,
  prompt,
  payload,
  answer,
  explanation: why,
  difficulty: 1,
});
const mcq = (prompt: L10n, options: string[], answer: number, why: L10n) =>
  q('mcq', prompt, { options }, answer, why);
const gap = (text: string, options: string[], answer: number, why: L10n) =>
  q('fill_gap', t('ఖాళీని పూరించండి', 'Fill the gap'), { text, options }, answer, why);
const pairs = (left: string[], right: string[], answer: number[], why: L10n) =>
  q('match_pairs', t('జతచేయండి', 'Match the pairs'), { left, right }, answer, why);
const order = (words: string[], why: L10n) =>
  q(
    'word_order',
    t('వాక్యాన్ని సరిగా అమర్చండి', 'Put the sentence in order'),
    { words },
    words.map((_, i) => i),
    why,
  );

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
  const examples = (...texts: string[]) => Promise.all(texts.map(g));
  const listen = async (german: string, options: string[], answer: number, why: L10n) =>
    q(
      'listen_choose',
      t('విని సరైనది ఎంచుకోండి', 'Listen and choose'),
      { audio: (await g(german)).audio, options },
      answer,
      why,
    );

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
  const pliers = await vocab('Zange', 'die', 'Zangen', t('ప్లయర్స్', 'pliers'), [
    'electrician',
    'plumber',
  ]);
  const goggles = await vocab(
    'Schutzbrille',
    'die',
    'Schutzbrillen',
    t('రక్షణ కళ్ళద్దాలు', 'safety goggles'),
    ['welder'],
  );
  const pipe = await vocab('Rohr', 'das', 'Rohre', t('పైపు', 'pipe'), ['plumber']);
  const helmet = await vocab('Helm', 'der', 'Helme', t('హెల్మెట్', 'helmet'), [
    'welder',
    'electrician',
  ]);
  await vocab('Tisch', 'der', 'Tische', t('బల్ల', 'table'), ['hospitality']);
  await vocab('Rechnung', 'die', 'Rechnungen', t('బిల్లు', 'bill'), ['hospitality']);

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
            examples: await examples('Guten Morgen!', 'Guten Abend!'),
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
        gap(
          'Ich ___ Ravi.',
          ['heiße', 'bist'],
          0,
          t('"Ich heiße" అంటే నా పేరు.', '"Ich heiße" means my name is.'),
        ),
        pairs(
          ['Hallo', 'Danke'],
          ['ధన్యవాదాలు', 'నమస్కారం'],
          [1, 0],
          t('Hallo = నమస్కారం, Danke = ధన్యవాదాలు.', 'Hallo = hello, Danke = thanks.'),
        ),
        order(['Ich', 'heiße', 'Ravi'], t('నా పేరు రవి.', 'My name is Ravi.')),
        await listen(
          'Guten Morgen!',
          ['Guten Morgen', 'Gute Nacht'],
          0,
          t('"Guten Morgen" అంటే శుభోదయం.', '"Guten Morgen" means good morning.'),
        ),
      ],
    },
    {
      title: t('మిమ్మల్ని పరిచయం చేసుకోండి', 'Introducing yourself'),
      description: t(
        'మీ పేరు, ఊరు, పని చెప్పండి',
        'Say your name, where you are from and your job',
      ),
      estMinutes: 14,
      screens: [
        {
          type: 'explain',
          body: {
            body: t(
              '"Ich heiße …" అంటే "నా పేరు …". "Ich komme aus …" అంటే "నేను … నుండి వచ్చాను".',
              '"Ich heiße …" means "My name is …". "Ich komme aus …" means "I come from …".',
            ),
            examples: await examples(
              'Ich heiße Ravi.',
              'Ich komme aus Indien.',
              'Ich bin Elektriker.',
            ),
          },
        },
        {
          type: 'dialogue',
          body: {
            lines: [
              {
                speaker: 'Anna',
                german: await g('Wie heißen Sie?'),
                meaning: t('మీ పేరు ఏమిటి?', 'What is your name?'),
              },
              {
                speaker: 'Ravi',
                german: await g('Ich heiße Ravi. Ich komme aus Indien.'),
                meaning: t(
                  'నా పేరు రవి. నేను భారతదేశం నుండి వచ్చాను.',
                  'My name is Ravi. I come from India.',
                ),
              },
            ],
          },
        },
      ],
      questions: [
        mcq(
          t('"Wie heißen Sie?" అంటే ఏమిటి?', 'What does "Wie heißen Sie?" mean?'),
          ['What is your name?', 'How are you?', 'Where do you live?'],
          0,
          t('"Wie heißen Sie?" అంటే మీ పేరు ఏమిటి?', '"Wie heißen Sie?" asks for your name.'),
        ),
        gap(
          'Ich ___ aus Indien.',
          ['komme', 'heiße'],
          0,
          t('"komme aus" అంటే నుండి వచ్చాను.', '"komme aus" means come from.'),
        ),
        order(
          ['Ich', 'komme', 'aus', 'Indien'],
          t('నేను భారతదేశం నుండి వచ్చాను.', 'I come from India.'),
        ),
        await listen(
          'Ich bin Elektriker.',
          ['Ich bin Elektriker.', 'Ich bin müde.'],
          0,
          t('"Elektriker" అంటే ఎలక్ట్రీషియన్.', '"Elektriker" means electrician.'),
        ),
      ],
    },
    {
      title: t('సంఖ్యలు 1 నుండి 10', 'Numbers 1 to 10'),
      description: t('ఒకటి నుండి పది వరకు', 'From one to ten'),
      estMinutes: 15,
      screens: [
        {
          type: 'explain',
          body: {
            body: t(
              'సంఖ్యలను వినండి, తర్వాత మీరు చెప్పండి. పని ప్రదేశంలో సంఖ్యలు చాలా అవసరం.',
              'Listen to the numbers, then say them yourself. Numbers are very useful at work.',
            ),
            examples: await examples('eins', 'zwei', 'drei', 'vier', 'fünf'),
          },
        },
        {
          type: 'explain',
          body: {
            body: t('ఇప్పుడు ఆరు నుండి పది వరకు.', 'Now six to ten.'),
            examples: await examples('sechs', 'sieben', 'acht', 'neun', 'zehn'),
          },
        },
      ],
      questions: [
        mcq(
          t('"drei" అంటే ఎంత?', 'What number is "drei"?'),
          ['2', '3', '4'],
          1,
          t('"drei" అంటే మూడు.', '"drei" is three.'),
        ),
        pairs(
          ['eins', 'zwei'],
          ['2', '1'],
          [1, 0],
          t('eins = 1, zwei = 2.', 'eins = 1, zwei = 2.'),
        ),
        mcq(
          t('"zehn" అంటే ఎంత?', 'What number is "zehn"?'),
          ['5', '10', '8'],
          1,
          t('"zehn" అంటే పది.', '"zehn" is ten.'),
        ),
        await listen(
          'sieben',
          ['sieben', 'sechs'],
          0,
          t('"sieben" అంటే ఏడు.', '"sieben" is seven.'),
        ),
      ],
    },
    {
      title: t('రోజులు, సమయం', 'Days and time'),
      description: t('వారం రోజులు, సమయం అడగడం', 'Days of the week and asking the time'),
      estMinutes: 16,
      screens: [
        {
          type: 'explain',
          body: {
            body: t(
              'వారంలో రోజులు సోమవారం నుండి మొదలవుతాయి. "Montag" అంటే సోమవారం.',
              'The week starts on Monday. "Montag" means Monday.',
            ),
            examples: await examples('Montag', 'Dienstag', 'Mittwoch', 'Samstag'),
          },
        },
        {
          type: 'dialogue',
          body: {
            lines: [
              {
                speaker: 'Anna',
                german: await g('Wie spät ist es?'),
                meaning: t('సమయం ఎంత?', 'What time is it?'),
              },
              {
                speaker: 'Ravi',
                german: await g('Es ist acht Uhr.'),
                meaning: t('ఎనిమిది గంటలు.', "It is eight o'clock."),
              },
            ],
          },
        },
      ],
      questions: [
        mcq(
          t('"Montag" అంటే ఏ రోజు?', 'Which day is "Montag"?'),
          ['Monday', 'Sunday', 'Friday'],
          0,
          t('"Montag" అంటే సోమవారం.', '"Montag" is Monday.'),
        ),
        mcq(
          t('"Wie spät ist es?" అంటే?', 'What does "Wie spät ist es?" mean?'),
          ['What time is it?', 'How are you?', 'Who are you?'],
          0,
          t('సమయం అడగడం.', 'It asks the time.'),
        ),
        gap('Es ist acht ___.', ['Uhr', 'Tag'], 0, t('"Uhr" అంటే గంట.', '"Uhr" means o\'clock.')),
      ],
    },
    {
      title: t('పని ప్రదేశంలో', 'At the workplace'),
      description: t('పనిముట్లు, der / die / das', 'Tools and der / die / das'),
      estMinutes: 18,
      tradeTags: ['electrician', 'welder', 'plumber'],
      screens: [
        { type: 'vocab', body: { vocabIds: [hammer, cable, sw, pliers, goggles, pipe] } },
        {
          type: 'explain',
          body: {
            body: t(
              'జర్మన్‌లో ప్రతి పదానికి der, die లేదా das ఉంటుంది. పదంతో పాటే నేర్చుకోండి.',
              'Every German noun has der, die or das. Learn it together with the word.',
            ),
            examples: await examples('Gib mir den Hammer, bitte.', 'Wo ist die Zange?'),
          },
        },
        {
          type: 'practice',
          body: {
            prompt: t('సుత్తి కావాలని అడగండి', 'Ask for the hammer'),
            target: await g('Gib mir den Hammer, bitte.'),
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
        mcq(
          t('"das Kabel" అంటే ఏమిటి?', 'What is "das Kabel"?'),
          ['pipe', 'cable', 'helmet'],
          1,
          t('"das Kabel" అంటే తీగ.', '"das Kabel" means cable.'),
        ),
        gap(
          '___ Zange ist hier.',
          ['Die', 'Der'],
          0,
          t('"Zange" కు "die" వస్తుంది.', '"Zange" takes "die".'),
        ),
        await listen(
          'Wo ist die Zange?',
          ['Wo ist die Zange?', 'Wo ist der Hammer?'],
          0,
          t('"Zange" అంటే ప్లయర్స్.', '"Zange" means pliers.'),
        ),
      ],
    },
    {
      title: t('భద్రత, సూచనలు', 'Safety and instructions'),
      description: t('హెచ్చరికలు, పని సూచనలు', 'Warnings and work instructions'),
      estMinutes: 18,
      tradeTags: ['welder', 'electrician'],
      screens: [
        {
          type: 'explain',
          body: {
            body: t(
              'పని ప్రదేశంలో హెచ్చరికలు చాలా ముఖ్యం. "Achtung!" అంటే జాగ్రత్త!',
              'Warnings matter on a worksite. "Achtung!" means attention, be careful!',
            ),
            examples: await examples('Achtung!', 'Vorsicht!', 'Gefahr!', 'Nicht berühren!'),
          },
        },
        { type: 'vocab', body: { vocabIds: [helmet, goggles] } },
        {
          type: 'dialogue',
          body: {
            lines: [
              {
                speaker: 'Chef',
                german: await g('Bitte Helm tragen!'),
                meaning: t('దయచేసి హెల్మెట్ ధరించండి!', 'Please wear a helmet!'),
              },
              {
                speaker: 'Ravi',
                german: await g('Ja, sofort.'),
                meaning: t('అలాగే, వెంటనే.', 'Yes, right away.'),
              },
            ],
          },
        },
      ],
      questions: [
        mcq(
          t('"Gefahr!" అంటే ఏమిటి?', 'What does "Gefahr!" mean?'),
          ['Danger', 'Thanks', 'Welcome'],
          0,
          t('"Gefahr" అంటే ప్రమాదం.', '"Gefahr" means danger.'),
        ),
        mcq(
          t('"Nicht berühren!" అంటే ఏమిటి?', 'What does "Nicht berühren!" mean?'),
          ['Do not touch!', 'Come here!', 'Wait!'],
          0,
          t('తాకవద్దు.', 'Do not touch.'),
        ),
        order(['Bitte', 'Helm', 'tragen'], t('దయచేసి హెల్మెట్ ధరించండి.', 'Please wear a helmet.')),
        await listen(
          'Achtung!',
          ['Achtung!', 'Danke!'],
          0,
          t('"Achtung" అంటే జాగ్రత్త.', '"Achtung" means attention.'),
        ),
      ],
    },
  ];

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
  }

  const pack = await call<{ pack: { version: number; lessonCount: number } }>(
    'POST',
    '/v1/studio/levels/A1/publish',
    reviewer,
    {},
  );

  // The A1 checkpoint: authored by the author, published by a different person (four eyes).
  const word = (te: string, en: string, ok: string, bad: string[], right = 0) =>
    mcq(t(te, en), [ok, ...bad], right, t('', '')) as ReturnType<typeof mcq>;
  const reading = [
    word('"Danke" అంటే?', 'What does "Danke" mean?', 'Thank you', ['Please', 'Sorry']),
    word('"Guten Abend" అంటే?', 'What does "Guten Abend" mean?', 'Good evening', [
      'Good morning',
      'Goodbye',
    ]),
    word('"Hammer" అంటే?', 'What is "Hammer"?', 'Hammer', ['Cable', 'Pipe']),
    word('"Gefahr" అంటే?', 'What does "Gefahr" mean?', 'Danger', ['Help', 'Welcome']),
    word('"fünf" అంటే?', 'What number is "fünf"?', '5', ['4', '6']),
    word('"Montag" అంటే?', 'What is "Montag"?', 'Monday', ['Sunday', 'Tuesday']),
  ].map((x) => ({ ...x, explanation: t('సమాధానం సరైనది.', 'The answer is correct.') }));
  const listening = [
    await listen(
      'Guten Morgen!',
      ['Guten Morgen', 'Gute Nacht'],
      0,
      t('శుభోదయం.', 'Good morning.'),
    ),
    await listen(
      'Danke, gut. Und Ihnen?',
      ['Danke, gut. Und Ihnen?', 'Wie heißen Sie?'],
      0,
      t('ధన్యవాదాలు, బాగున్నాను.', 'Thanks, fine.'),
    ),
    await listen('sieben', ['sieben', 'sechs'], 0, t('ఏడు.', 'Seven.')),
    await listen('Achtung!', ['Achtung!', 'Danke!'], 0, t('జాగ్రత్త.', 'Attention.')),
  ];
  const writing = [
    {
      id: randomUUID(),
      prompt: t(
        'మీ గురించి జర్మన్‌లో రాయండి: మీ పేరు, మీరు ఎక్కడి నుండి, మీ పని.',
        'Write about yourself in German: your name, where you are from, your job.',
      ),
      payload: { minWords: 10, maxWords: 60 },
      explanation: t(
        'పేరు, ఊరు, పని ఉంటే మార్కులు ఇవ్వండి.',
        'Give marks for name, origin and job.',
      ),
      difficulty: 1,
    },
    {
      id: randomUUID(),
      prompt: t(
        'ఒక సహోద్యోగిని ఉదయం పలకరిస్తూ రాయండి.',
        'Write a short morning greeting to a colleague.',
      ),
      payload: { minWords: 10, maxWords: 60 },
      explanation: t(
        'పలకరింపు, ప్రశ్న ఉంటే మార్కులు ఇవ్వండి.',
        'Give marks for a greeting and a question.',
      ),
      difficulty: 1,
    },
  ];
  await call('PUT', '/v1/studio/checkpoints/A1', author, {
    expectedRevision: 0,
    content: {
      passMark: 0.6,
      draw: { reading: 4, listening: 3, writing: 1 },
      sections: { reading, listening, writing },
    },
  });
  await call('POST', '/v1/studio/checkpoints/A1/publish', reviewer, {});

  console.log(
    `Published A1 pack v${pack.pack.version} with ${pack.pack.lessonCount} lessons and the A1 checkpoint ` +
      '(placeholder tone audio, synthetic content).',
  );
}

run().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
