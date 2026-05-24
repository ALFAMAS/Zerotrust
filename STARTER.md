# SaaS Starter — ZeroAuth

A production-ready SaaS boilerplate with authentication, user management, and an admin dashboard. Built on ZeroAuth's zero-trust auth backend.

## What's included

| | Feature | Notes |
|---|---|---|
| ✅ | Email + password auth | Register, login, forgot password |
| ✅ | Google & GitHub OAuth | Toggle on/off in admin |
| ✅ | Magic links | Passwordless email login |
| ✅ | Passkeys / WebAuthn | Biometric / hardware key |
| ✅ | TOTP (authenticator app) | Google Authenticator, 1Password |
| ✅ | Email OTP | One-time codes via email |
| ✅ | Session management | List, revoke, max concurrent devices |
| ✅ | Account lockout | Configurable threshold + duration |
| ✅ | Rate limiting | Per-IP, Redis-backed |
| ✅ | User dashboard | Profile, security, sessions |
| ✅ | Admin dashboard | Users, sessions, audit, settings |
| ✅ | Feature flag toggles | Every auth method on/off from admin UI |
| ✅ | Dark landing page | Hero, features, pricing — ready to customize |
| ✅ | Docker Compose | One command: all services up |

## Ports

| Service | Port |
|---------|------|
| API (Express) | 3000 |
| Admin UI (Next.js) | 3001 |
| User UI (Next.js) | 3002 |
| MongoDB | 27017 |
| Redis | 6379 |
| Elasticsearch | 9200 |
| Kibana | 5601 |

## Quick start

```bash
git clone https://github.com/ALFAMAS/zeroauth -b saas-starter my-saas
cd my-saas

# Generate secret keys
openssl rand -hex 32   # → TOKEN_SECRET_HEX
openssl rand -hex 32   # → CSFLE_MASTER_KEY_HEX

cp .env.example .env
# Edit .env with your keys and any OAuth credentials

docker compose up -d
```

Then open:
- **Your app** → http://localhost:3002
- **Admin panel** → http://localhost:3001
- **API docs** → http://localhost:3000/docs

## Local development (without Docker)

```bash
bun install   # or npm install

# API
bun run dev

# User UI (separate terminal)
cd packages/ui && bun run dev

# Admin UI (separate terminal)
cd packages/admin-ui && bun run dev
```

## Environment variables

```bash
# Required
TOKEN_SECRET_HEX=           # openssl rand -hex 32
CSFLE_MASTER_KEY_HEX=       # openssl rand -hex 32
MONGO_URI=mongodb://admin:password@localhost:27017/zeroauth?authSource=admin

# Optional — OAuth (leave blank to disable)
OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
OAUTH_GOOGLE_REDIRECT_URI=http://localhost:3000/auth/oauth/google/callback

OAUTH_GITHUB_CLIENT_ID=
OAUTH_GITHUB_CLIENT_SECRET=
OAUTH_GITHUB_REDIRECT_URI=http://localhost:3000/auth/oauth/github/callback

# Optional — Email (magic links + OTP)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=
MAIL_FROM=noreply@example.com

# Optional — SMS OTP
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Optional — Redis (distributed rate limiting)
REDIS_URI=redis://localhost:6379

# App
APP_NAME=My SaaS
APP_URL=http://localhost:3002
PORT=3000
NODE_ENV=development
```

## Enabling OAuth

1. Go to **Admin UI → Auth Settings**
2. Toggle on "Google OAuth" or "GitHub OAuth"
3. Add credentials to `.env` and restart the API

Or set the flags directly in MongoDB:
```js
db.saassettings.updateOne({}, { $set: { googleOAuthEnabled: true } })
```

## Customizing the landing page

Edit `packages/ui/src/app/page.tsx`. The page is plain Tailwind — no component library dependencies. Change:
- `Acme` → your company name
- Hero headline and subheadline
- Feature cards
- Pricing tiers and prices

## Customizing the brand color

Edit `packages/ui/tailwind.config.js` and `packages/admin-ui/tailwind.config.js`:
```js
extend: {
  colors: {
    brand: "#your-color",   // replaces indigo-600
  }
}
```

Then replace `indigo-` classes with `brand-` in the UI components.

## Adding your own routes

The Express API is at `src/api/server.ts`. Add your SaaS-specific routes:

```typescript
import myRoutes from "./routes/my.routes";
app.use("/api/my-feature", authMiddleware, myRoutes);
```

## Admin first-time setup

On first run, create your admin user via the API:
```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"YourPassword123!","displayName":"Admin"}'
```

Then in MongoDB, grant the admin role:
```js
db.users.updateOne(
  { email: "admin@example.com" },
  { $addToSet: { roles: "admin" } }
)
```

## Project structure

```
.
├── src/                        # ZeroAuth API backend
│   ├── api/
│   │   ├── server.ts           # Express app
│   │   └── routes/
│   │       ├── auth.routes.ts      # Register, login, OAuth
│   │       ├── magic-link.routes.ts
│   │       ├── mfa.routes.ts       # TOTP, email/SMS OTP
│   │       ├── passkey.routes.ts   # WebAuthn
│   │       ├── session.routes.ts
│   │       └── admin.routes.ts     # Users, settings, stats
│   ├── models/
│   │   ├── settings.model.ts   # Feature flags (SaaSSettings)
│   │   └── ...                 # User, Session, Role, OTP, ...
│   ├── services/
│   │   └── magicLink.service.ts
│   └── middleware/
│       ├── auth.ts
│       ├── accountLockout.ts
│       └── rateLimiting.ts
├── packages/
│   ├── ui/                     # User-facing Next.js app (port 3002)
│   │   └── src/app/
│   │       ├── page.tsx            # Landing page
│   │       ├── (auth)/             # login, register, magic-link, callback
│   │       └── dashboard/          # profile, security, sessions
│   └── admin-ui/               # Admin Next.js app (port 3001)
│       └── src/app/
│           ├── page.tsx            # Dashboard with stats
│           ├── users/              # User management
│           ├── sessions/           # Session management
│           ├── audit/              # Audit log viewer
│           └── settings/
│               ├── auth/page.tsx   # ⭐ Auth method toggles
│               └── general/        # Branding settings
├── docker-compose.yml
└── .env.example
```

## Key API endpoints

```
POST   /auth/register
POST   /auth/login
POST   /auth/token/refresh
POST   /auth/logout

GET    /auth/oauth/google          → redirect to Google
GET    /auth/oauth/google/callback → exchange code, issue tokens
GET    /auth/oauth/github          → redirect to GitHub
GET    /auth/oauth/github/callback

POST   /auth/magic-link/send
GET    /auth/magic-link/verify?email=&token=

POST   /auth/passkey/authenticate/options
POST   /auth/passkey/authenticate/verify

POST   /auth/mfa/totp/setup        (auth required)
POST   /auth/mfa/totp/verify       (auth required)
POST   /auth/mfa/otp/send          (auth required)
POST   /auth/mfa/otp/verify        (auth required)

GET    /sessions                   (auth required)
DELETE /sessions/:id               (auth required)

GET    /admin/stats                (admin only)
GET    /admin/users                (admin only)
GET    /admin/settings             (admin only)
PUT    /admin/settings             (admin only)

GET    /healthz
GET    /docs                       (Swagger UI, dev only)
```
