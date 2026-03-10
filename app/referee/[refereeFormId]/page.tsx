"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

type RefereeFormContext = {
  refereeFormId: string;
  nomineeName: string;
  refereeName: string;
  awardName: string;
  questions: string[];
  submissionStatus: string;
  submittedAt: string;
  isSubmitted: boolean;
};

export default function RefereeAwardPage() {
  const params = useParams<{ refereeFormId: string }>();
  const searchParams = useSearchParams();
  const refereeFormId = params.refereeFormId;
  const token = searchParams.get("token") || "";

  const [context, setContext] = useState<RefereeFormContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [answers, setAnswers] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function loadContext() {
      try {
        setLoading(true);

        if (!token) {
          throw new Error("Missing secure token in form link.");
        }

        const response = await fetch(
          `/api/airtable/referee-forms/${refereeFormId}/context?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as RefereeFormContext & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || "Failed to load referee form context.");
        }

        setContext(payload);
        setAnswers(payload.questions.map(() => ""));
        setSubmitted(Boolean(payload.isSubmitted));
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load referee form context.");
      } finally {
        setLoading(false);
      }
    }

    if (refereeFormId) {
      loadContext();
    }
  }, [refereeFormId, token]);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError("");

    if (!context) {
      return;
    }

    const hasEmpty = answers.some((answer) => answer.trim().length === 0);
    if (hasEmpty) {
      setSubmitError("All award-specific questions are required.");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`/api/airtable/referee-forms/${refereeFormId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nomineeName: context.nomineeName,
          refereeName: context.refereeName,
          awardName: context.awardName,
          token,
          answers: context.questions.map((question, index) => ({
            question,
            answer: answers[index],
          })),
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        setSubmitError(payload.error || "Failed to submit referee form.");
        return;
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit referee form.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="nominations-page">
      <div className="hero-bg" />
      <section className="hero-card">
        <p className="kicker">South Asian Inspirational Awards</p>
        <h1>Award Reference Form</h1>
        <p>Complete the referee statement for the nominee listed below.</p>
      </section>

      <section className="panel referee-page">
        {loading && <p className="supporting-text">Loading referee form...</p>}
        {error && <p className="error-text">{error}</p>}

        {context && !loading && !error && (
          <form className="form-grid" onSubmit={submitForm}>
            <label>
              Referee name
              <input type="text" value={context.refereeName} readOnly />
            </label>

            <label>
              Nominee name
              <input type="text" value={context.nomineeName} readOnly />
            </label>

            <label className="full-row">
              Award
              <input type="text" value={context.awardName} readOnly />
            </label>

            {context.questions.map((question, index) => (
              <label className="full-row" key={`${context.refereeFormId}-${index}`}>
                {question}
                <textarea
                  rows={4}
                  value={answers[index] || ""}
                  disabled={submitted}
                  onChange={(event) =>
                    setAnswers((current) =>
                      current.map((entry, i) => (i === index ? event.target.value : entry)),
                    )
                  }
                  placeholder="Type your response"
                />
              </label>
            ))}

            {submitError && <p className="error-text">{submitError}</p>}

            <button type="submit" className="primary-btn" disabled={submitting || submitted}>
              {submitted ? "Submitted" : submitting ? "Submitting..." : "Submit Referral"}
            </button>

            {submitted && (
              <p className="success-text">
                {context.submittedAt
                  ? `This referral was already submitted on ${context.submittedAt} and is now locked.`
                  : "This referral has already been submitted and is now locked."}
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
