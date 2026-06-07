export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  // Account
  {
    id: "reset-password",
    category: "Account",
    question: "How do I reset my password?",
    answer:
      "Go to the login page and click 'Forgot password'. Enter your email address and we'll send you a reset link. The link expires after 1 hour.",
  },
  {
    id: "change-email",
    category: "Account",
    question: "Can I change my email address?",
    answer:
      "Yes. Go to Profile → Account details. Enter your new email address and click Save. We'll send a verification email to the new address before making the change.",
  },
  {
    id: "delete-account",
    category: "Account",
    question: "How do I delete my account?",
    answer:
      "Go to Settings → Danger zone → Delete account. This is permanent and cannot be undone. All your data will be deleted within 30 days per our data retention policy.",
  },
  // Security
  {
    id: "enable-mfa",
    category: "Security",
    question: "How do I enable two-factor authentication?",
    answer:
      "Go to Security → Two-factor authentication → Set up authenticator app. Scan the QR code with an app like Google Authenticator or Authy, then enter the 6-digit code to confirm.",
  },
  {
    id: "passkeys",
    category: "Security",
    question: "What are passkeys and how do I add one?",
    answer:
      "Passkeys are a phishing-resistant, passwordless login method backed by biometrics or a hardware key. Go to Security → Passkeys → Add passkey. Follow your browser's prompts.",
  },
  {
    id: "active-sessions",
    category: "Security",
    question: "How do I sign out of all devices?",
    answer:
      "Go to Sessions and click 'Revoke all'. This immediately invalidates every active session including the current one, and you'll be redirected to the login page.",
  },
  // API Keys
  {
    id: "create-api-key",
    category: "API Keys",
    question: "How do I create an API key?",
    answer:
      "Go to API Keys → Create new key. Give it a name and optionally set an expiry. Copy the key immediately — for security reasons, it's only shown once.",
  },
  {
    id: "api-key-scopes",
    category: "API Keys",
    question: "What are scopes for API keys?",
    answer:
      "Scopes limit what an API key can do. Leaving scopes empty grants full access. Restrict scopes to least privilege — for example, a read-only key for CI should only have read scopes.",
  },
  // Organizations
  {
    id: "invite-member",
    category: "Organizations",
    question: "How do I invite someone to my organization?",
    answer:
      "Go to Organizations → select your org → Members → Invite member. Enter their email address and choose a role. They'll receive an invitation email.",
  },
  {
    id: "custom-roles",
    category: "Organizations",
    question: "Can I create custom roles?",
    answer:
      "Yes, on the Pro plan and above. Go to Organizations → Roles → Create role. Assign specific permissions to fine-tune access for your team.",
  },
  // Billing
  {
    id: "upgrade-plan",
    category: "Billing",
    question: "How do I upgrade my plan?",
    answer:
      "Go to Billing and click 'Upgrade to Pro'. You'll be taken to a Stripe checkout page. Your new plan activates immediately after payment.",
  },
  {
    id: "cancel-subscription",
    category: "Billing",
    question: "How do I cancel my subscription?",
    answer:
      "Go to Billing → Manage billing → Cancel plan. Your access continues until the end of the current billing period. You can resubscribe at any time.",
  },
  {
    id: "invoices",
    category: "Billing",
    question: "Where can I find my invoices?",
    answer:
      "Go to Billing → Manage billing. This opens the Stripe customer portal where you can view and download all past invoices.",
  },
];
