"use client";

import { useEffect, useState } from "react";
import { brand } from "@/config/brand";

type FeedbackType = "nps" | "thumbs";

interface Props {
  type?: FeedbackType;
  context?: string;
  /** Show after this many ms on the page. Default: 30 000 (30 s). */
  delay?: number;
  /** localStorage key to track dismissal. */
  storageKey?: string;
}

const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("za_token");
}

async function submitFeedback(payload: {
  type: FeedbackType;
  score: number;
  comment?: string;
  context?: string;
}) {
  const token = getToken();
  if (!token) return;
  await fetch(`${brand.apiUrl}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

export default function FeedbackWidget({
  type = "nps",
  context = "general",
  delay = 30_000,
  storageKey = `za_feedback_${context}`,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<"prompt" | "comment" | "done">("prompt");
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey);
    if (dismissed && Date.now() < parseInt(dismissed)) return;

    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay, storageKey]);

  function dismiss() {
    localStorage.setItem(storageKey, String(Date.now() + DISMISS_TTL_MS));
    setVisible(false);
  }

  async function handleScore(value: number) {
    setScore(value);
    setStep("comment");
  }

  async function handleSubmit() {
    if (score === null) return;
    setSubmitting(true);
    try {
      await submitFeedback({ type, score, comment: comment || undefined, context });
    } catch {
      // non-blocking
    } finally {
      setSubmitting(false);
      setStep("done");
      localStorage.setItem(storageKey, String(Date.now() + DISMISS_TTL_MS));
      setTimeout(() => setVisible(false), 2500);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 right-4 z-40 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-5 transition-all"
      role="dialog"
      aria-label="Feedback"
    >
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-gray-500 hover:text-gray-300 text-lg leading-none"
        aria-label="Close"
      >
        ×
      </button>

      {step === "prompt" && type === "nps" && (
        <>
          <p className="text-sm font-medium text-white mb-1">How likely are you to recommend us?</p>
          <p className="text-xs text-gray-500 mb-4">0 = not at all · 10 = extremely likely</p>
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: 11 }, (_, i) => (
              <button
                key={i}
                onClick={() => handleScore(i)}
                className="w-8 h-8 text-xs rounded-md border border-gray-600 hover:border-indigo-500 hover:bg-indigo-600 text-gray-300 hover:text-white transition-colors"
              >
                {i}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "prompt" && type === "thumbs" && (
        <>
          <p className="text-sm font-medium text-white mb-4">Was this page helpful?</p>
          <div className="flex gap-3">
            <button
              onClick={() => handleScore(1)}
              className="flex-1 py-2 rounded-lg border border-gray-600 hover:border-emerald-500 hover:bg-emerald-900/30 text-gray-300 hover:text-emerald-300 transition-colors text-xl"
              aria-label="Thumbs up"
            >
              👍
            </button>
            <button
              onClick={() => handleScore(-1)}
              className="flex-1 py-2 rounded-lg border border-gray-600 hover:border-red-500 hover:bg-red-900/30 text-gray-300 hover:text-red-300 transition-colors text-xl"
              aria-label="Thumbs down"
            >
              👎
            </button>
          </div>
        </>
      )}

      {step === "comment" && (
        <>
          <p className="text-sm font-medium text-white mb-3">
            {score !== null && score >= 9
              ? "Great! What do you love most?"
              : score !== null && score >= 7
                ? "Thanks! What could be better?"
                : "Sorry to hear that. What would improve your experience?"}
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment…"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {submitting ? "Sending…" : "Send"}
            </button>
            <button
              onClick={dismiss}
              className="px-3 py-2 border border-gray-600 text-gray-400 text-sm rounded-lg hover:border-gray-400 transition-colors"
            >
              Skip
            </button>
          </div>
        </>
      )}

      {step === "done" && (
        <p className="text-sm text-center text-emerald-400 py-2">Thanks for your feedback!</p>
      )}
    </div>
  );
}
