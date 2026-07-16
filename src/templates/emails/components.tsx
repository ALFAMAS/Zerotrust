/**
 * Shared React Email building blocks for all transactional emails.
 *
 * Every template composes <EmailShell> (branded header + card + footer) with
 * the primitives below, so the visual system lives in one place. Rendering to
 * HTML happens in each template via `renderEmail()`.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  render,
  Section,
  Text,
} from "@react-email/components";
import type { ReactElement, ReactNode } from "react";

// ── palette (kept in sync with the previous hand-rolled templates) ─────────
export const palette = {
  page: "#f4f4f5",
  card: "#ffffff",
  headerBg: "#1e1b4b",
  accent: "#6366f1",
  heading: "#111827",
  body: "#374151",
  muted: "#6b7280",
  faint: "#9ca3af",
  border: "#e5e7eb",
  codeBg: "#f9fafb",
  danger: "#e11d48",
  warnText: "#92400e",
  warnBg: "#fffbeb",
  warnBorder: "#fde68a",
} as const;

const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif";

export interface EmailShellProps {
  lang: string;
  appName: string;
  /** Inbox preview line (hidden in the rendered email body). */
  preview: string;
  children: ReactNode;
  /** Footer lines, rendered small and centered below a divider. */
  footer?: ReactNode;
}

/** Branded outer frame: page background, header bar, white card, footer. */
export function EmailShell({ lang, appName, preview, children, footer }: EmailShellProps) {
  return (
    <Html lang={lang}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: palette.page, fontFamily: fontStack }}>
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            padding: "40px 16px",
          }}
        >
          <Section
            style={{
              backgroundColor: palette.card,
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <Section
              style={{
                backgroundColor: palette.headerBg,
                padding: "32px 40px",
                textAlign: "center",
              }}
            >
              <Heading
                as="h1"
                style={{
                  margin: 0,
                  color: palette.accent,
                  fontSize: "28px",
                  fontWeight: 700,
                  letterSpacing: "-0.5px",
                }}
              >
                {appName}
              </Heading>
            </Section>
            <Section style={{ padding: "40px", color: palette.heading }}>{children}</Section>
            {footer && (
              <Section
                style={{
                  padding: "24px 40px",
                  borderTop: `1px solid ${palette.border}`,
                  textAlign: "center",
                }}
              >
                {footer}
              </Section>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h2"
      style={{ margin: "0 0 16px", fontSize: "22px", fontWeight: 600, color: palette.heading }}
    >
      {children}
    </Heading>
  );
}

export function EmailText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <Text
      style={{
        margin: "0 0 24px",
        fontSize: muted ? "14px" : "16px",
        lineHeight: muted ? "22px" : "24px",
        color: muted ? palette.muted : palette.body,
      }}
    >
      {children}
    </Text>
  );
}

export function EmailButton({
  href,
  children,
  color = palette.accent,
  textColor = "#ffffff",
}: {
  href: string;
  children: ReactNode;
  color?: string;
  textColor?: string;
}) {
  return (
    <Section style={{ margin: "0 0 32px" }}>
      <Button
        href={href}
        style={{
          display: "inline-block",
          backgroundColor: color,
          borderRadius: "8px",
          padding: "12px 24px",
          color: textColor,
          fontSize: "16px",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  );
}

/** "If the button doesn't work…" fallback with the raw URL. */
export function LinkFallback({ label, url }: { label: string; url: string }) {
  return (
    <Text
      style={{ margin: "0 0 16px", fontSize: "14px", lineHeight: "22px", color: palette.muted }}
    >
      {label}
      <br />
      <Link href={url} style={{ color: palette.accent, wordBreak: "break-all" }}>
        {url}
      </Link>
    </Text>
  );
}

/** Large monospace one-time code in a bordered box. */
export function CodeBox({ code }: { code: string }) {
  return (
    <Section
      style={{
        margin: "0 0 32px",
        backgroundColor: palette.codeBg,
        borderRadius: "8px",
        border: `1px solid ${palette.border}`,
        padding: "24px",
        textAlign: "center",
      }}
    >
      <Text
        style={{
          margin: 0,
          fontFamily: "'Courier New',Courier,monospace",
          fontSize: "36px",
          fontWeight: 700,
          letterSpacing: "8px",
          color: palette.accent,
        }}
      >
        {code}
      </Text>
    </Section>
  );
}

/** Amber callout for security-sensitive notes. */
export function WarningNote({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: "0 0 24px",
        fontSize: "14px",
        lineHeight: "22px",
        color: palette.warnText,
        backgroundColor: palette.warnBg,
        border: `1px solid ${palette.warnBorder}`,
        borderRadius: "6px",
        padding: "12px 16px",
      }}
    >
      {children}
    </Text>
  );
}

export function FooterText({ children }: { children: ReactNode }) {
  return (
    <Text style={{ margin: "0 0 8px", fontSize: "13px", color: palette.faint }}>{children}</Text>
  );
}

/** Divider used above trailing fine print inside the card body. */
export function FinePrint({ children }: { children: ReactNode }) {
  return (
    <>
      <Hr style={{ borderColor: palette.border, margin: "0 0 16px" }} />
      <Text style={{ margin: 0, fontSize: "14px", lineHeight: "22px", color: palette.faint }}>
        {children}
      </Text>
    </>
  );
}

/** Render a template element to email-safe HTML. */
export function renderEmail(element: ReactElement): Promise<string> {
  return render(element);
}
