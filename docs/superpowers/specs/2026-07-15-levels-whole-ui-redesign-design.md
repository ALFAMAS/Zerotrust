# Levels whole-UI redesign specification

Date: 2026-07-15

Status: approved for implementation planning

Design source: `docs/levels ui/levels.md`

## Context and goals

Zerotrust currently has a dark-first shadcn-style interface across its public, authentication, member dashboard, and administration surfaces. The redesign must replace that presentation with one coherent, light-first system based on the repository-local Levels specification while preserving every route, feature, authorization rule, data flow, and information-architecture decision.

Levels is conversion-focused: it removes friction, builds trust, and makes the next safe action obvious through clarity, psychology, and speed. Zerotrust applies that intent to two different contexts:

- Public and authentication routes guide visitors toward understanding, registration, and successful account access.
- Authenticated routes guide members and operators toward task completion and stronger security posture without promotional clutter.

The redesign covers all 53 current page routes under `packages/ui/src/app`: the root marketing page plus six public/support pages; all seven authentication pages; all sixteen member-dashboard pages; and all twenty-three admin pages. Route additions discovered before implementation completes are included if they use the same application shells.

### Required outcomes

1. Levels light mode becomes the primary presentation; dark mode remains a complete, deliberately designed theme.
2. All routes use shared semantic foundations, primitives, states, page patterns, and shells.
3. Existing functionality, navigation, server-state behavior, and route structure remain unchanged.
4. Every screen exposes its state and most useful next action clearly.
5. WCAG 2.2 AA, keyboard-first behavior, responsive reflow, RTL, and localization resilience are verified in rendered output.
6. No legacy visual fragments remain unless documented as an intentional exception.

## Design tokens and foundations

### Token architecture

Components must consume semantic CSS variables through Tailwind utilities. Raw palette values may appear only in the central theme declaration or chart-token derivation. Components must not branch on theme in JSX.

The source order is:

1. Levels brand palette and approved foundations.
2. Semantic theme tokens for light and dark modes.
3. Component tokens derived from the semantic tokens.
4. Page composition using shared components and spacing tokens.

### Color

The Levels source colors are binding:

| Role | Source value | Semantic use |
| --- | --- | --- |
| Primary | `#27272A` | primary action, strong neutral emphasis |
| Secondary | `#8B5CF6` | accent, selected state, focus support |
| Success | `#16A34A` | successful or healthy state |
| Warning | `#D97706` | caution or attention state |
| Danger | `#DC2626` | destructive action or failed state |
| Surface | `#FFFFFF` | light-mode canvas and primary surface |
| Text | `#111827` | light-mode primary text |

Theme implementation begins with these concrete semantic values:

| Token | Light | Dark |
| --- | --- | --- |
| Background | `#F8FAFC` | `#09090B` |
| Surface | `#FFFFFF` | `#18181B` |
| Elevated surface | `#FFFFFF` | `#27272A` |
| Foreground | `#111827` | `#FAFAFA` |
| Muted surface | `#F4F4F5` | `#27272A` |
| Muted foreground | `#52525B` | `#A1A1AA` |
| Primary action | `#27272A` | `#FAFAFA` |
| Primary-action foreground | `#FFFFFF` | `#18181B` |
| Secondary accent | `#8B5CF6` | `#A78BFA` |
| Secondary filled action | `#7C3AED` | `#A78BFA` |
| Secondary-action foreground | `#FFFFFF` | `#18181B` |
| Decorative border | `#D4D4D8` | `#3F3F46` |
| Meaningful control border | `#71717A` | `#71717A` |
| Focus ring | `#7C3AED` | `#C4B5FD` |

The light filled-action shade is derived from the Levels secondary because white text on the source `#8B5CF6` measures only 4.23:1. White on `#7C3AED` measures 5.70:1. The source violet remains the accent token where it is not used behind normal white text.

Status badges use explicit accessible pairs:

| Status | Light foreground/background | Dark foreground/background |
| --- | --- | --- |
| Success | `#166534` / `#DCFCE7` | `#86EFAC` / `#14532D` |
| Warning | `#92400E` / `#FEF3C7` | `#FDE68A` / `#78350F` |
| Danger | `#991B1B` / `#FEE2E2` | `#FCA5A5` / `#7F1D1D` |

These pairs measure from 5.28:1 to 7.28:1. The source success, warning, and danger values remain available for icons, borders, charts, and solid treatments only when the effective foreground pairing passes the applicable threshold.

Implementation must re-measure all effective pairings, including opacity and state overlays, and confirm:

- normal text: at least 4.5:1;
- large text: at least 3:1;
- controls, focus indicators, icons, and meaningful graphical boundaries: at least 3:1;
- primary-button label against its background: at least 4.5:1.

Status is never color-only. Every success, warning, danger, selected, and current state must also use a label, icon, shape, position, or other persistent cue.

### Typography

- Primary and display family: Inter through `next/font`.
- Monospace family: JetBrains Mono through `next/font`.
- Type sizes: 12, 14, 16, 20, 24, and 32px only, except browser/native control requirements.
- Supported weights: use 400 for body, 500 for labels and controls, 600 for headings and high emphasis, and 700 only for exceptional display emphasis. Other Levels-supported weights remain available but should not create local hierarchy variants.
- Body copy uses at least 16px on public/auth content and at least 14px on dense application data.
- Body line-height is 1.5 to 1.65; headings use 1.15 to 1.3.
- Long-form text measure remains between 45 and 75 characters.
- Heading levels follow document structure and do not skip for visual styling.

Inter replaces Bricolage Grotesque and Hanken Grotesk. JetBrains Mono remains for code, API keys, hashes, identifiers, and numeric tabular values where alignment helps comprehension.

### Spacing, layout, and geometry

- Spacing scale: 4, 8, 12, 16, 24, and 32px.
- Layout gaps and padding must use the scale; arbitrary values require a documented rendering constraint.
- Controls use an 8px radius and panels use a 12px radius.
- Nested radii are concentric and derived: child radius equals parent radius minus the inset between the two edges, clamped to zero.
- Default control height is 44px. Compact data controls may be 36px only where the same page provides adequate separation and a 44px hit area.
- Application content uses a responsive maximum width appropriate to the task: reading/form content is narrower; data tables and dashboards may use the full shell width.
- Shadows are reserved for elevation changes such as menus, dialogs, and sticky surfaces. Static cards use borders rather than decorative shadow stacks.

### Motion

Motion communicates entry, confirmation, hierarchy, or spatial change. It must not decorate every interaction.

- Standard feedback transition: 120-180ms.
- Drawer/dialog transition: 180-240ms.
- Use opacity and transform where possible.
- `prefers-reduced-motion: reduce` removes nonessential motion and preserves immediate state feedback.
- Loading indicators must not shift surrounding layout.

## Component-level rules

### Buttons

Anatomy: label, optional leading or trailing icon, loading indicator, and hit target.

Variants:

- Primary: zinc-black in light mode, high-contrast primary in dark mode; one primary action per local task region.
- Secondary: violet-supported emphasis for an alternate important action.
- Outline: neutral border for ordinary secondary actions.
- Ghost: navigation and low-emphasis utilities.
- Destructive: danger token and explicit destructive label.

Buttons must provide default, hover, active, focus-visible, disabled, and loading states. They do not wrap or shrink, and icon-only buttons require an accessible name and tooltip where the icon is not universally understood. Loading preserves width and exposes busy state without removing the action label from assistive technology.

Do not use multiple equally prominent buttons in one action group or vague labels such as “Continue” when the outcome can be named.

### Form controls

Every input, select, textarea, checkbox, switch, and password control has a persistent label. Optional description appears between label and control or directly below the control. Error text is adjacent, specific, connected with `aria-describedby`, and announced when it appears.

Controls provide default, hover, focus-visible, filled, disabled, read-only, loading where applicable, success where useful, and error states. Entered values survive recoverable errors. Placeholder text never substitutes for a label.

Form actions remain visible after validation errors. On submit failure, focus moves only when necessary: to the first invalid field for validation failures, or to a form-level alert for non-field errors.

### Cards and panels

Cards group one subject or task and are not the default wrapper for every piece of content. Anatomy may include header, description, content, metadata, and action footer. Padding uses 16px for compact data cards and 24px for ordinary cards; 32px is reserved for focal public/auth panels.

Nested cards are prohibited. Use separators, section headings, or a subtle inset surface inside an existing panel.

### Navigation and shells

Public shell:

- concise navigation, clear active/focus states, one prominent registration action, and a restrained footer;
- mobile navigation uses an accessible disclosure or dialog pattern;
- public pages render indexable content server-side.

Authentication shell:

- compact centered or asymmetric layout with one form focus;
- brand trust and security context support the form without competing with it;
- recovery, alternate method, and legal links remain easy to discover;
- no promotional dashboard navigation.

Member dashboard shell:

- responsive sidebar, action-focused top bar, and consistent page frame;
- active route uses position, weight, and shape in addition to color;
- mobile navigation traps and restores focus when presented as a drawer;
- collapse behavior preserves labels through accessible names and tooltips.

Admin shell:

- uses the same primitives and tokens at a denser information setting;
- separates monitoring, identity, governance, and platform configuration through clear navigation grouping;
- dangerous system actions are visually and spatially isolated.

### Page headers and action hierarchy

Every application page begins with one page header containing a single `h1`, concise supporting text when needed, and the page-level action group. Breadcrumbs appear only on nested resource/detail routes. A page may have one visually primary page action; local components may have their own primary action only when the scope is unambiguous.

### Tables, lists, and filters

- Tables use semantic table markup when rows and columns represent relationships.
- Column headers remain concise and describe the value, not the storage field.
- Row actions live in a consistent final column or disclosed menu.
- Sort, selection, and status always have non-color cues.
- Pagination remains server-backed through the existing server-state and API behavior.
- At narrow widths, deliberately remove secondary columns, expose a labelled details view, or transform records into a shared data-card pattern. Uncontrolled page-level horizontal scrolling is not accepted.
- Filter bars wrap predictably and keep the submit/reset behavior explicit.

### Dialogs, menus, tooltips, and toasts

Dialogs have a labelled title, optional description, clear action hierarchy, focus trap, Escape behavior, and focus restoration. Destructive confirmations name the resource and consequence. Menus support arrow-key navigation and close consistently. Tooltips supplement rather than replace labels. Toasts report transient outcomes; persistent or actionable errors remain in page context.

### States

Shared loading, empty, error, offline, unauthorized, and not-found states use the canonical `States.tsx` primitives or their redesigned successors.

- Loading: stable skeleton matching the final layout.
- Empty: state reason, relevant context, and one useful next action.
- Error: specific recoverable summary, retry when safe, and no raw technical detail.
- Success: confirmation plus the resulting state or next step.

### Charts and metrics

Charts derive colors from semantic chart tokens for each theme. A legend, direct label, pattern, or shape distinguishes series without color dependence. Tooltips are keyboard-accessible where interaction is essential, and an equivalent textual summary is available. Metrics use tabular numerals and state the time range or comparison basis.

## Data flow and behavioral preservation

This project is a presentation and interaction migration, not a backend or information-architecture rewrite.

- Existing TanStack Query domain hooks remain the page data boundary.
- Existing API clients, mutations, cache invalidation, auth guards, and redirects remain unchanged unless a UI defect proves a narrowly scoped correction is necessary.
- Server Components remain the default. Client components are limited to interactive leaves.
- Existing route names, parameters, navigation destinations, and permission-dependent visibility remain stable.
- Existing successful and failing states must remain test-covered during component replacement.

## Error handling and recovery

- Field validation errors appear inline and retain valid data.
- Mutation failures use the existing canonical error model and provide an in-context retry or corrective action where safe.
- Query failures render shared error states without exposing internal messages.
- Network/offline states distinguish unavailable connectivity from authorization or validation errors.
- Destructive operations do not optimistically disappear unless recovery and rollback are already reliable.
- Authentication failures preserve safe redirect behavior and never expose secrets in UI copy, logs, or URLs.

## Accessibility requirements and acceptance criteria

The implementation must satisfy WCAG 2.2 AA and the repository quality rules.

- All normal text pairings measure at least 4.5:1; large text at least 3:1.
- Meaningful component boundaries, icons, focus indicators, and graphics measure at least 3:1.
- Every interactive element is reachable and operable by keyboard in logical order.
- Focus-visible is clearly distinct in both themes and not hidden by sticky content.
- Drawers and dialogs trap focus and restore it to the opener.
- Inputs have programmatic labels; errors are described and announced.
- Touch targets are 44 by 44px except justified compact data controls with an equivalent hit area.
- Content reflows without loss at 320 CSS px width and at 200% text zoom.
- RTL changes logical direction without reversing semantic icon meaning.
- Animations respect reduced-motion preferences.
- Images use `next/image` and meaningful alt text, or empty alt text when decorative.
- Status, validation, selection, and chart meaning do not rely on color alone.

These criteria must be checked in rendered pages, not inferred from source alone.

## Content and tone standards

Levels tone is concise, confident, and helpful.

- Begin buttons with a specific verb: “Create organization”, “Revoke session”, “Save authentication settings”.
- Name the affected object in dangerous confirmations.
- Prefer direct explanations: “This key can access billing data” over “Please be advised that this key may have access to billing information”.
- State errors with cause and recovery when known: “The invite expired. Ask an administrator for a new invite.”
- Avoid blame, jokes in security-critical states, unexplained acronyms, and generic labels such as “OK”, “Submit”, or “Click here”.
- Public copy emphasizes trust, ownership, and speed without unverifiable security claims.

## Responsive behavior and edge cases

- Mobile, tablet, laptop, and wide desktop layouts use content-driven breakpoints rather than device names alone.
- Long names, email addresses, identifiers, URLs, translated labels, and empty values must wrap, truncate with an accessible full-value affordance, or use controlled overflow.
- Fixed action regions must not cover focused controls or error text when the virtual keyboard is present.
- Tables and charts must provide useful narrow-screen alternatives.
- Both LTR and RTL layouts preserve navigation order and action priority.
- Theme changes do not cause layout shift.

## Migration strategy

Implementation proceeds system-first:

1. Replace theme, typography, spacing, radius, elevation, motion, and chart foundations.
2. Redesign shared primitives and shared state components with complete interaction contracts.
3. Redesign public, auth, dashboard, and admin shells.
4. Migrate root/public/legal/status/help/invite routes.
5. Migrate authentication routes.
6. Migrate member-dashboard routes.
7. Migrate admin routes.
8. Remove obsolete classes, components, fonts, and tokens after all consumers move.
9. Verify every route family in rendered light and dark modes.

Temporary compatibility aliases are allowed only during migration. They must be centrally defined and removed before completion unless an explicit documented exception remains.

## Anti-patterns and prohibited implementations

- Do not use raw colors or arbitrary spacing in page components.
- Do not retain dark-first assumptions in component markup.
- Do not introduce theme checks in JSX for ordinary styling.
- Do not use placeholder text as a label.
- Do not encode state with color alone.
- Do not make clickable `div` or `span` elements.
- Do not nest cards to manufacture hierarchy.
- Do not put several equally prominent primary actions in one task region.
- Do not add decorative gradients, glow effects, glass panels, or motion that conflicts with Levels clarity.
- Do not create one-off page versions of an existing primitive or state.
- Do not force all content into cards.
- Do not ship uncontrolled horizontal page scrolling.
- Do not change API behavior, auth decisions, or route structure as part of visual migration.
- Do not add client boundaries at route or layout roots when a smaller interactive leaf suffices.

## Testing strategy

### Automated checks

- Run UI unit tests and update only assertions invalidated by intentional semantic or interaction improvements.
- Run TypeScript and the Next.js production build.
- Run existing Playwright public, auth, dashboard, admin, accessibility, notification, wallet, webhook, invite, and security flows.
- Add focused component tests for any new shared behavior not covered by existing tests.
- Use automated accessibility checks as a baseline, not as the only evidence.

### Rendered verification matrix

At minimum, verify representative pages from each family in both themes:

- Public: landing, help or security, status, legal, invite.
- Auth: login, register, password recovery, magic-link verification.
- Dashboard: overview, organization detail/settings, security, billing, a table-heavy page, and a form-heavy page.
- Admin: overview/analytics, users/detail, audit, access review/detail, settings, and a table-heavy operational page.

For each representative page verify desktop, 320px narrow layout, 200% zoom, keyboard flow, focus visibility, reduced motion, loading/empty/error where reachable, long content, and RTL where localization applies.

### Completion audit

The goal is complete only after a route inventory proves that every page consumes the redesigned shells and primitives, and a source scan finds no unexplained legacy colors, spacing, radii, fonts, or duplicate visual primitives.

## QA checklist

- [ ] All current page routes are assigned to and rendered within the redesigned route families.
- [ ] Light mode is the primary default and dark mode is fully supported.
- [ ] Inter and JetBrains Mono are loaded with `next/font`; obsolete font dependencies are removed.
- [ ] Type sizes use the Levels scale.
- [ ] Gaps and padding use the Levels spacing scale or a documented exception.
- [ ] Components consume semantic tokens rather than raw values.
- [ ] Nested radii are derived concentrically.
- [ ] Buttons and controls expose every applicable state.
- [ ] Each page has one `h1` and a clear page-level primary action where appropriate.
- [ ] Form labels, descriptions, errors, focus behavior, and data retention are correct.
- [ ] Status and charts include non-color cues.
- [ ] Dialogs and drawers trap and restore focus.
- [ ] Mobile data layouts are deliberate and do not cause page-level horizontal scroll.
- [ ] Measured contrast passes in both themes.
- [ ] Keyboard, touch, 320px reflow, 200% zoom, reduced motion, RTL, and long-label checks pass.
- [ ] Unit tests, type checks, production build, and existing Playwright flows pass.
- [ ] Representative pages from every route family receive rendered visual and accessibility review.
- [ ] No route, feature, authorization behavior, or server-state flow changes unintentionally.
- [ ] Legacy tokens, classes, fonts, and duplicate primitives are removed or explicitly documented.
