// Security questions for password recovery (DESIGN §3.1). Codes are stored; texts can be reworded freely.
export const SECURITY_QUESTIONS = {
  first_school: "What was the name of your first school?",
  mother_town: "In which town was your mother born?",
  first_pet: "What was your first pet's name?",
  childhood_friend: "What is your childhood best friend's name?",
  first_phone: "What was the brand of your first mobile phone?",
  childhood_street: "What is the name of the street you grew up on?",
  nickname: "What was your childhood nickname?",
  first_trip_city: "Which city did you first travel to by train or flight?",
} as const;

export type QuestionCode = keyof typeof SECURITY_QUESTIONS;

export const QUESTION_CODES = Object.keys(SECURITY_QUESTIONS) as QuestionCode[];

export function isQuestionCode(value: string): value is QuestionCode {
  return Object.hasOwn(SECURITY_QUESTIONS, value);
}

/** Answers match regardless of case and extra spaces: "  Zilla  Parishad " = "zilla parishad". */
export function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, " ").toLowerCase();
}
