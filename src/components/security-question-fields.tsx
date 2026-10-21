"use client";

import { useState } from "react";
import { SelectField, TextField } from "@/components/form";
import type { FormState } from "@/lib/form-state";
import { QUESTION_CODES, SECURITY_QUESTIONS } from "@/lib/security-questions";

/** Two question pickers + answers. A question chosen in one list is disabled in the other. */
export function SecurityQuestionFields({ state, legend = "Security questions" }: { state?: FormState; legend?: string }) {
  const [q1, setQ1] = useState(state?.values?.question1 ?? "");
  const [q2, setQ2] = useState(state?.values?.question2 ?? "");
  const options = (taken: string) =>
    QUESTION_CODES.map((code) => ({ value: code, label: SECURITY_QUESTIONS[code], disabled: code === taken }));
  const errors = state?.fieldErrors ?? {};

  return (
    <fieldset className="flex min-w-0 flex-col gap-4 rounded-xl border border-zinc-200 p-4">
      <legend className="px-1 text-sm font-semibold text-zinc-800">{legend}</legend>
      <p className="-mt-1 text-xs text-zinc-500">
        Used if you forget your password. Answers aren&apos;t case-sensitive. Pick answers only you know.
      </p>
      <SelectField
        label="Question 1"
        name="question1"
        options={options(q2)}
        placeholder="Choose a question"
        value={q1}
        onChange={(e) => setQ1(e.target.value)}
        errors={errors.question1}
      />
      <TextField label="Answer 1" name="answer1" autoComplete="off" errors={errors.answer1} />
      <SelectField
        label="Question 2"
        name="question2"
        options={options(q1)}
        placeholder="Choose a question"
        value={q2}
        onChange={(e) => setQ2(e.target.value)}
        errors={errors.question2}
      />
      <TextField label="Answer 2" name="answer2" autoComplete="off" errors={errors.answer2} />
    </fieldset>
  );
}
