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
        <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-white mb-3">Something went wrong</h2>
            <p className="text-gray-400 text-sm mb-6">
              An unexpected error occurred. The team has been notified.
            </p>
            {this.state.eventId && (
              <p className="text-xs text-gray-600 mb-4 font-mono">Ref: {this.state.eventId}</p>
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
