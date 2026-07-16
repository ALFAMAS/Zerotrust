# Shared form validation design

## Goal

Make the highest-traffic account forms feel consistent and accessible by using React Hook Form for field state and shared Zod schemas for browser/API validation.

## Scope

- Preserve the existing React Hook Form migrations for login and registration.
- Migrate organization general settings and security policy forms.
- Migrate support ticket creation and ticket replies.
- Keep ownership transfer and organization deletion as explicit confirmation controls; they are destructive workflows, not routine data-entry forms.

## Shared contracts

`@zerotrust/shared-types` owns client-safe request schemas for organization updates, organization security policy updates, support ticket creation, and support replies. API routes consume the same schemas. UI-only preprocessing converts comma-separated policy fields into the arrays expected by the API.

Schemas normalize whitespace and provide user-facing messages. Optional organization URL/email fields accept an empty UI value and convert it to `null` at submission. Server-only authorization and plan checks remain in the API.

## Form behavior

- Validate on blur and again on submit.
- Focus the first invalid field on submit.
- Render each error beside its field with `aria-describedby` and an `aria-live` message.
- Use `isDirty`, `isSubmitting`, and mutation state to prevent duplicate or no-op submissions.
- Reset forms from successful server responses and when a modal/thread closes.
- Preserve all existing query invalidation, toasts, confirmations, loading states, and visual styling.

## Verification

Schema tests prove the browser/API contracts. Component tests cover invalid focus, accessible error association, normalized payloads, successful reset, and existing mutation behavior. UI and root type-checks must pass.
