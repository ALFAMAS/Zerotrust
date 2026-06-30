"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/config/brand";

import { apiPost } from "@/lib/apiClient";

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

async function submitFeedback(payload: {
  type: FeedbackType;
  score: number;
  comment?: string;
  context?: string;
}) {
  await apiPost("/feedback", payload);
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
    if (dismissed && Date.now() < parseInt(dismissed, 10)) return;

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
      await submitFeedback({
        type,
        score,
        comment: comment || undefined,
        context,
      });
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
    <Card
      className="fixed bottom-20 right-4 z-40 w-80 bg-popover p-5 shadow-2xl transition-all"
      role="dialog"
      aria-label="Feedback"
    >
      <Button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 h-7 w-7 text-muted-foreground"
        variant="ghost"
        size="icon"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </Button>

      {step === "prompt" && type === "nps" && (
        <>
          <p className="mb-1 text-sm font-medium text-foreground">
            How likely are you to recommend us?
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            0 = not at all · 10 = extremely likely
          </p>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 11 }, (_, i) => (
              <Button
                type="button"
                key={i}
                onClick={() => handleScore(i)}
                className="h-8 w-8 p-0 text-xs"
                variant="outline"
              >
                {i}
              </Button>
            ))}
          </div>
        </>
      )}

      {step === "prompt" && type === "thumbs" && (
        <>
          <p className="mb-4 text-sm font-medium text-foreground">Was this page helpful?</p>
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => handleScore(1)}
              className="flex-1 text-xl hover:border-emerald-500 hover:bg-emerald-900/30 hover:text-emerald-300"
              variant="outline"
              aria-label="Thumbs up"
            >
              👍
            </Button>
            <Button
              type="button"
              onClick={() => handleScore(-1)}
              className="flex-1 text-xl hover:border-red-500 hover:bg-red-900/30 hover:text-red-300"
              variant="outline"
              aria-label="Thumbs down"
            >
              👎
            </Button>
          </div>
        </>
      )}

      {step === "comment" && (
        <>
          <p className="mb-3 text-sm font-medium text-foreground">
            {score !== null && score >= 9
              ? "Great! What do you love most?"
              : score !== null && score >= 7
                ? "Thanks! What could be better?"
                : "Sorry to hear that. What would improve your experience?"}
          </p>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional comment…"
            rows={3}
            className="mb-3 resize-none"
          />
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
              {submitting ? "Sending…" : "Send"}
            </Button>
            <Button variant="outline" onClick={dismiss}>
              Skip
            </Button>
          </div>
        </>
      )}

      {step === "done" && (
        <p className="py-2 text-center text-sm text-emerald-400">Thanks for your feedback!</p>
      )}
    </Card>
  );
}
