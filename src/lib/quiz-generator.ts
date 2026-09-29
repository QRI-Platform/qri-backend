import { env } from "../config/env";

export interface GeneratedQuestion {
  questionText: string;
  /** In display order. */
  options: string[];
  /** Index into options. */
  correctOption: number;
  explanation: string | null;
  hint: string | null;
}

/**
 * Their raw response. Verified against the live service on Day 3 - the
 * written description differed from this in almost every respect, so
 * this mirrors what actually comes back, not what was documented.
 */
interface TheirResponse {
  data?: {
    test_paper?: {
      questions?: {
        question_text?: string;
        options?: Record<string, string>;
        correct?: string;
        explanation?: string | null;
        hint?: string | null;
      }[];
    };
  };
  success?: boolean;
  message?: string;
}

/** One question as their service sends it. */
type TheirQuestion = NonNullable<
  NonNullable<NonNullable<TheirResponse["data"]>["test_paper"]>["questions"]
>[number];

/**
 * Turns one of their questions into our shape.
 *
 * Two conversions are needed. Their options are an object keyed
 * option1..option4, while we store an ordered array - order matters,
 * since the correct answer is an index into it. And their `correct` is
 * the key name ("option3"), not a position.
 *
 * Returns null for anything malformed rather than throwing: one bad
 * question shouldn't lose the other nine.
 */
function convert(raw: TheirQuestion): GeneratedQuestion | null {
  if (!raw.question_text || !raw.options || !raw.correct) return null;

  /**
   * Sorted by key so option1..option4 keep their order. Object key
   * order in JSON is not guaranteed, and if the order shifted, the
   * correct answer would point at the wrong choice.
   */
  const keys = Object.keys(raw.options).sort();
  const options = keys.map((key) => raw.options![key]);

  const correctOption = keys.indexOf(raw.correct);
  // Their `correct` naming a key that isn't there would silently make
  // every answer wrong, so drop the question instead.
  if (correctOption === -1) return null;
  if (options.length < 2) return null;

  return {
    questionText: raw.question_text,
    options,
    correctOption,
    explanation: raw.explanation ?? null,
    hint: raw.hint ?? null,
  };
}

/**
 * Asks the AI developer's service for a set of questions.
 *
 * Note this is a GET with query parameters, not a POST with a body -
 * confirmed against their live endpoint on Day 3.
 */
export async function generateQuestions(params: {
  subject: string;
  difficulty: string;
  count: number;
  examTrack: string;
  userId: string;
}): Promise<{ ok: boolean; questions: GeneratedQuestion[]; error?: string }> {
  if (!env.AI_SERVICE_URL) {
    return { ok: false, questions: [], error: "The practice service isn't connected." };
  }

  const controller = new AbortController();
  /**
   * Generous, because ten generated questions is far more work than a
   * single chat answer and the real duration is still unmeasured - this
   * call is where that finally gets logged.
   */
  const timeout = setTimeout(() => controller.abort(), 180_000);
  const startedAt = Date.now();

  try {
    const url = new URL("/api/v1/subgraph/test", env.AI_SERVICE_URL);
    url.searchParams.set("total_no_of_questions", String(params.count));
    url.searchParams.set("level", params.difficulty);
    url.searchParams.set("subject_name", params.subject);
    url.searchParams.set("exam_type", params.examTrack);
    url.searchParams.set("user_id", params.userId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    const elapsed = Date.now() - startedAt;

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`Question generation failed (${response.status}) after ${elapsed}ms:`, detail.slice(0, 500));
      return { ok: false, questions: [], error: "Couldn't prepare the questions." };
    }

    const body = (await response.json()) as TheirResponse;
    const raw = body.data?.test_paper?.questions ?? [];

    const questions = raw
      .map(convert)
      .filter((q): q is GeneratedQuestion => q !== null);

    console.log(
      `Generated ${questions.length}/${raw.length} usable questions for ${params.subject} (${params.difficulty}) in ${elapsed}ms`,
    );

    if (questions.length === 0) {
      return { ok: false, questions: [], error: "Couldn't prepare the questions." };
    }

    return { ok: true, questions };
  } catch (err) {
    console.error(`Question generation failed after ${Date.now() - startedAt}ms:`, err);
    return { ok: false, questions: [], error: "Couldn't prepare the questions." };
  } finally {
    clearTimeout(timeout);
  }
}