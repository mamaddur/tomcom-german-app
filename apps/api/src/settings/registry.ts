import { z } from 'zod';

/**
 * Every admin-configurable setting (FR-1101), with its allowed range and default.
 * Security limits (OTP, login lockout) are deliberately NOT here: they are guardrails, not
 * product settings, and change only through code review (CLAUDE.md rule 8).
 */
export const SETTINGS = {
  'quiz.passMark': {
    schema: z.number().min(0.5).max(1),
    default: 0.8,
    description:
      'Share of correct answers that passes a lesson quiz and unlocks the next lesson (FR-402).',
  },
  'quiz.questionsPerQuiz': {
    schema: z.number().int().min(5).max(30),
    default: 10,
    description: 'Questions drawn from the bank for each quiz attempt (FR-403).',
  },
  'unlock.sequential': {
    schema: z.boolean(),
    default: true,
    description:
      'Lessons unlock one after another; if off, all lessons of an unlocked level are open.',
  },
  'tutor.dailyMessageLimit': {
    schema: z.number().int().min(0).max(500),
    default: 30,
    description: 'AI tutor messages per learner per day (FR-607, NFR-22).',
  },
  'pronunciation.dailyAttemptLimit': {
    schema: z.number().int().min(0).max(1000),
    default: 100,
    description: 'Scored pronunciation attempts per learner per day (NFR-22).',
  },
  'usage.monthlyAlertPercent': {
    schema: z.number().int().min(50).max(100),
    default: 80,
    description:
      'Alert admins when AI and speech usage reaches this share of the monthly budget (NFR-22).',
  },
  'reminders.dailyGoalTime': {
    schema: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    default: '19:00',
    description: 'Daily goal reminder time, IST, HH:MM (FR-803).',
  },
  'reminders.inactivityDays': {
    schema: z.array(z.number().int().min(1).max(60)).min(1).max(5),
    default: [3, 7],
    description: 'Send an inactivity reminder after these many days without learning (FR-803).',
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]['default'];

/** Module switches (FR-1103). Optional modules can be turned off without an app release. */
export const FEATURE_FLAGS = {
  'module.tutor': { default: true, description: 'AI tutor (M6)' },
  'module.pronunciation': { default: true, description: 'Pronunciation practice (M5)' },
  'module.certificates': { default: true, description: 'Level certificates (M7)' },
  'module.placementTest': { default: true, description: 'Optional placement test (FR-105)' },
  'module.mockExams': {
    default: false,
    description: 'Mock exams in the external exam format (FR-406); off until the exam is chosen',
  },
  'module.tradePacks': { default: true, description: 'Trade-specific vocabulary packs (FR-306)' },
  'module.bookmarks': { default: true, description: 'Word list with spaced repetition (FR-308)' },
} as const;

export type FeatureKey = keyof typeof FEATURE_FLAGS;
