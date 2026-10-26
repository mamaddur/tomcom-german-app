/** Today's date in India (IST), as the API counts learning days (FR-204). */
export const istToday = (now = new Date()) =>
  new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/** Consecutive IST days with learning time, ending today or yesterday (FR-204). */
export function streakDays(
  activity: Array<{ date: string; seconds: number }>,
  now = new Date(),
): number {
  const days = new Set(activity.filter((a) => a.seconds > 0).map((a) => a.date));
  const cursor = new Date(now.getTime() + 5.5 * 3600 * 1000);
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let n = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    n++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return n;
}

export type LessonState = 'passed' | 'open' | 'locked';

/**
 * FR-202/FR-203: a lesson is open when the one before it is passed (or always, when TOMCOM turns
 * sequential unlock off). Passed lessons stay open to read again.
 */
export function lessonStates(
  lessonIds: string[],
  passed: Set<string>,
  sequentialUnlock: boolean,
): LessonState[] {
  return lessonIds.map((id, i) =>
    passed.has(id)
      ? 'passed'
      : !sequentialUnlock || i === 0 || passed.has(lessonIds[i - 1]!)
        ? 'open'
        : 'locked',
  );
}
