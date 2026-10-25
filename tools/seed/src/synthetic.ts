/**
 * Deterministic synthetic learners, batches and trainers.
 *
 * Phone numbers use the prefix +91 55… . Indian mobile numbers start with 6–9, so these
 * can never reach a real person. Build step 2 lets the OTP flow accept this prefix only
 * outside production, with a fixed dev OTP and no SMS sent.
 */

export const SYNTHETIC_PHONE_PREFIX = '+9155';

export const DISTRICTS = [
  'adilabad',
  'bhadradri_kothagudem',
  'hanumakonda',
  'hyderabad',
  'jagtial',
  'jangaon',
  'jayashankar_bhupalpally',
  'jogulamba_gadwal',
  'kamareddy',
  'karimnagar',
  'khammam',
  'kumuram_bheem_asifabad',
  'mahabubabad',
  'mahabubnagar',
  'mancherial',
  'medak',
  'medchal_malkajgiri',
  'mulugu',
  'nagarkurnool',
  'nalgonda',
  'narayanpet',
  'nirmal',
  'nizamabad',
  'peddapalli',
  'rajanna_sircilla',
  'ranga_reddy',
  'sangareddy',
  'siddipet',
  'suryapet',
  'vikarabad',
  'wanaparthy',
  'warangal',
  'yadadri_bhuvanagiri',
] as const;

// Placeholder trade list until TOMCOM confirms it (open question D).
export const TRADES = [
  'nursing_aide',
  'electrician',
  'plumber',
  'welder',
  'driver',
  'hospitality',
] as const;

const FIRST_NAMES = [
  'Test-Anil',
  'Test-Bhavani',
  'Test-Chandu',
  'Test-Divya',
  'Test-Eshwar',
  'Test-Gowri',
  'Test-Harish',
  'Test-Indira',
  'Test-Kiran',
  'Test-Lakshmi',
  'Test-Mahesh',
  'Test-Naveen',
  'Test-Padma',
  'Test-Ramu',
  'Test-Sravani',
  'Test-Venkat',
];
const LAST_NAMES = ['Synthetic', 'Sample', 'Demo', 'Dummy'];
const LEVELS = ['none', 'A1', 'A2'] as const;

export interface SyntheticLearner {
  key: string;
  phone: string;
  firstName: string;
  lastName: string;
  district: (typeof DISTRICTS)[number];
  trade: (typeof TRADES)[number];
  selfDeclaredLevel: (typeof LEVELS)[number];
  uiLocale: 'te' | 'en';
  batchCode: string;
}

export interface SyntheticBatch {
  code: string;
  name: string;
  district: (typeof DISTRICTS)[number];
  trade: (typeof TRADES)[number];
  trainerKey: string;
}

export interface SyntheticTrainer {
  key: string;
  phone: string;
  firstName: string;
  lastName: string;
}

export interface SyntheticDataset {
  seed: number;
  trainers: SyntheticTrainer[];
  batches: SyntheticBatch[];
  learners: SyntheticLearner[];
}

/** mulberry32: small, fast, deterministic PRNG. Not for anything security-related. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function syntheticPhone(index: number): string {
  return `${SYNTHETIC_PHONE_PREFIX}${String(index).padStart(8, '0')}`;
}

export function generateDataset(
  opts: { seed?: number; learners?: number; batches?: number } = {},
): SyntheticDataset {
  const seed = opts.seed ?? 42;
  const learnerCount = opts.learners ?? 200;
  const batchCount = opts.batches ?? 8;
  const rand = prng(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

  let phoneIndex = 1;
  const trainers: SyntheticTrainer[] = Array.from(
    { length: Math.max(1, Math.ceil(batchCount / 2)) },
    (_, i) => ({
      key: `trainer-${i + 1}`,
      phone: syntheticPhone(phoneIndex++),
      firstName: pick(FIRST_NAMES),
      lastName: 'Trainer',
    }),
  );

  const batches: SyntheticBatch[] = Array.from({ length: batchCount }, (_, i) => {
    const district = pick(DISTRICTS);
    const trade = pick(TRADES);
    return {
      code: `TST-${String(i + 1).padStart(3, '0')}`,
      name: `Synthetic batch ${i + 1} (${trade}, ${district})`,
      district,
      trade,
      trainerKey: trainers[i % trainers.length]!.key,
    };
  });

  const learners: SyntheticLearner[] = Array.from({ length: learnerCount }, (_, i) => {
    const batch = pick(batches);
    return {
      key: `learner-${i + 1}`,
      phone: syntheticPhone(phoneIndex++),
      firstName: pick(FIRST_NAMES),
      lastName: pick(LAST_NAMES),
      district: rand() < 0.8 ? batch.district : pick(DISTRICTS),
      trade: batch.trade,
      selfDeclaredLevel: pick(LEVELS),
      uiLocale: rand() < 0.75 ? 'te' : 'en',
      batchCode: batch.code,
    };
  });

  return { seed, trainers, batches, learners };
}
