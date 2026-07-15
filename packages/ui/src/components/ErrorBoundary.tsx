"use client";

import * as Sentry from "@sentry/nextjs";
import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  eventId: string | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, eventId: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    const eventId = Sentry.captureException(err, {
      extra: { componentStack: info.componentStack },
    });
    this.setState({ eventId: eventId ?? null });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center">
            <h2 className="mb-3 text-xl font-semibold">Something went wrong</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              An unexpected error occurred. The team has been notified.
            </p>
            {this.state.eventId && (
              <p className="mb-4 font-mono text-xs text-muted-foreground">
                Ref: {this.state.eventId}
              </p>
            )}
            <Button type="button" onClick={() => this.setState({ hasError: false, eventId: null })}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
