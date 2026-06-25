"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

/**
 * NPS Survey prompt — shows after 30 days, then quarterly.
 * Checks on mount and displays a non-intrusive banner.
 */
export function NpsSurveyPrompt() {
  const [visible, setVisible] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    api
      .get<{ shouldPrompt: boolean }>("/auth/me/nps/should-prompt")
      .then((res) => {
        if (res.shouldPrompt) setVisible(true);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit() {
    if (score === null) return;
    try {
      await api.post("/auth/me/nps", { score, comment: comment || undefined });
      setSubmitted(true);
      setTimeout(() => setVisible(false), 3000);
    } catch {
      // non-fatal
    }
  }

  if (!visible || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-full max-w-md -translate-x-1/2 px-4">
      <Card className="p-5 shadow-2xl">
        {submitted ? (
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Thank you for your feedback! 🎉</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                How likely are you to recommend zerotrust?
              </h3>
              <Button
                type="button"
                onClick={() => setDismissed(true)}
                className="h-7 w-7 text-muted-foreground"
                variant="ghost"
                size="icon"
                aria-label="Dismiss NPS survey"
              >
                ✕
              </Button>
            </div>
            <div className="mb-3 flex gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <Button
                  type="button"
                  key={i}
                  onClick={() => setScore(i)}
                  className="h-9 w-9 p-0 text-xs"
                  variant={score === i ? "default" : "secondary"}
                >
                  {i}
                </Button>
              ))}
            </div>
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Not likely</span>
              <span>Very likely</span>
            </div>
            {score !== null && (
              <>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Any additional feedback? (optional)"
                  rows={2}
                  className="mb-3 bg-muted"
                />
                <Button type="button" onClick={handleSubmit} className="w-full">
                  Submit feedback
                </Button>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
