export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  tags: string[];
  content: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "introducing-zerotrust",
    title: "Introducing zerotrust: Zero-Trust Auth for Modern Apps",
    excerpt:
      "Today we're open-sourcing zerotrust — a complete, self-hosted authentication platform with passkeys, MFA, RBAC, and real-time anomaly detection.",
    author: "zerotrust Team",
    date: "2026-01-15",
    tags: ["announcement", "open-source"],
    content: `
We built zerotrust because every new project deserves production-grade authentication without the enterprise price tag.

## What's included

- **PASETO v4 tokens** — symmetrically encrypted, tamper-proof access and refresh tokens
- **WebAuthn passkeys** — passwordless login with biometrics or hardware keys
- **Multi-factor authentication** — TOTP, SMS, and email OTP
- **RBAC + ABAC** — roles, attributes, just-in-time access, and fine-grained permissions
- **Real-time anomaly detection** — impossible travel, new device, brute-force signals
- **Organizations & teams** — multi-tenant workspaces with invite flows

## Self-hosted first

Your user data stays on your infrastructure. No third-party auth vendor, no per-MAU pricing, no lock-in.

## Get started

Clone the repo, copy \`.env.example\`, run \`docker compose up\`, and you have a fully working auth platform in minutes. Check out the [quick-start guide](#).
    `.trim(),
  },
  {
    slug: "passkeys-deep-dive",
    title: "Passkeys: The End of Password Fatigue",
    excerpt:
      "Passkeys use public-key cryptography to eliminate passwords entirely. Here's how they work and why you should migrate today.",
    author: "zerotrust Team",
    date: "2026-02-03",
    tags: ["security", "webauthn", "passkeys"],
    content: `
Passwords are a problem we've been trying to solve for decades. Passkeys finally crack it.

## How passkeys work

1. Registration: your device generates a public/private key pair. The public key is stored on the server; the private key never leaves your device.
2. Authentication: the server sends a challenge. Your device signs it with the private key (protected by biometrics or PIN). The server verifies the signature with the stored public key.

No password is ever transmitted, stored, or phished.

## Browser support

Passkeys work in Chrome 108+, Safari 16+, and Firefox 122+. On mobile, Face ID, Touch ID, and Android fingerprint sensors all work out of the box.

## Enabling passkeys in zerotrust

Passkey registration and authentication are built in. Users can add a passkey from **Settings → Security → Passkeys** and use it immediately on any supported device.
    `.trim(),
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}
