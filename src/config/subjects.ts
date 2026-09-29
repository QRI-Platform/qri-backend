/**
 * Every subject a student can practise, and which classes each applies
 * to.
 *
 * Structured like plans.ts: one catalogue file, with short codes stored
 * in the database rather than display names. A subject can be renamed
 * for students without touching any stored progress.
 */

export interface Subject {
  /** Stored in the database and used in URLs. Never change these. */
  code: string;
  name: string;
  /** Inclusive class range this subject is offered for. */
  minGrade: number;
  maxGrade: number;
}

export const SUBJECTS: Subject[] = [
  // --- Offered throughout ---
  { code: "hindi", name: "Hindi", minGrade: 6, maxGrade: 12 },
  { code: "english", name: "English", minGrade: 6, maxGrade: 12 },
  { code: "maths", name: "Maths", minGrade: 6, maxGrade: 12 },

  // --- Classes 6-8 only: these split into specialised subjects later ---
  { code: "science", name: "Science", minGrade: 6, maxGrade: 8 },
  { code: "social_science", name: "Social Science", minGrade: 6, maxGrade: 8 },
  { code: "computer", name: "Computer", minGrade: 6, maxGrade: 8 },
  { code: "gk", name: "General Knowledge", minGrade: 6, maxGrade: 8 },

  // --- Class 9 onwards ---
  { code: "physics", name: "Physics", minGrade: 9, maxGrade: 12 },
  { code: "chemistry", name: "Chemistry", minGrade: 9, maxGrade: 12 },
  { code: "biology", name: "Biology", minGrade: 9, maxGrade: 12 },
  { code: "commerce", name: "Commerce", minGrade: 9, maxGrade: 12 },
  { code: "history", name: "History", minGrade: 9, maxGrade: 12 },
  { code: "geography", name: "Geography", minGrade: 9, maxGrade: 12 },
  { code: "polity", name: "Polity", minGrade: 9, maxGrade: 12 },
  { code: "economy", name: "Economy", minGrade: 9, maxGrade: 12 },
];

/** Levels in every subject's path. */
export const TOTAL_LEVELS = 50;

/** Percentage needed to unlock the next level. */
export const PASS_PERCENTAGE = 80;

/** Questions in one level's quiz. */
export const QUESTIONS_PER_LEVEL = 10;

/**
 * Difficulty sent to the AI developer's question generator, based on
 * how far into the path the level is.
 */
const DIFFICULTY_BANDS = [
  { maxLevel: 10, difficulty: "very easy" },
  { maxLevel: 20, difficulty: "easy" },
  { maxLevel: 30, difficulty: "medium" },
  { maxLevel: 40, difficulty: "hard" },
  { maxLevel: 50, difficulty: "difficult" },
];

export function difficultyForLevel(level: number): string {
  const band = DIFFICULTY_BANDS.find((b) => level <= b.maxLevel);
  // Anything past the last band gets the hardest setting rather than
  // failing - a level number should never break question generation.
  return band?.difficulty ?? "difficult";
}

/**
 * Badges are awarded at these level counts.
 *
 * Front-loaded on purpose: the first badge at level 5 rather than 10.
 * Ten levels is a hundred questions, all passed at 80% or better -
 * too far for a first reward, and a student who quits before earning
 * anything was never motivated by the badges at all.
 *
 * Deliberately derived from the highest level reached rather than
 * stored: a stored badge can drift out of step with actual progress,
 * and there's nothing here a calculation can't answer.
 */
export const BADGE_TIERS = [
  { minLevel: 5, code: "noob", name: "Noob" },
  { minLevel: 15, code: "rookie", name: "Rookie" },
  { minLevel: 25, code: "warrior", name: "Warrior" },
  { minLevel: 35, code: "master", name: "Master" },
  { minLevel: 50, code: "prime_master", name: "Prime Master" },
];

/** Every badge earned in a subject, given levels completed there. */
export function badgesForProgress(levelsCompleted: number) {
  return BADGE_TIERS.filter((tier) => levelsCompleted >= tier.minLevel);
}

/** The highest badge earned, or null if fewer than ten levels are done. */
export function highestBadge(levelsCompleted: number) {
  const earned = badgesForProgress(levelsCompleted);
  return earned[earned.length - 1] ?? null;
}

export function getSubject(code: string): Subject | null {
  return SUBJECTS.find((s) => s.code === code) ?? null;
}

/**
 * Subjects a given class can practise. A student's grade can be null if
 * they somehow skipped it, so that returns nothing rather than
 * everything.
 */
export function subjectsForGrade(grade: number | null): Subject[] {
  if (grade === null) return [];
  return SUBJECTS.filter((s) => grade >= s.minGrade && grade <= s.maxGrade);
}

/**
 * Whether a student of this class may practise this subject.
 *
 * Every game endpoint must call this. Without it, a Class 6 student
 * could type /game/physics into the address bar and get a subject
 * they're not meant to see.
 */
export function isSubjectAllowedForGrade(code: string, grade: number | null): boolean {
  return subjectsForGrade(grade).some((s) => s.code === code);
}