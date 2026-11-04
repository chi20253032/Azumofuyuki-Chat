# Azumofuyuki Chat

Azumofuyuki Minecraft community members-only chat. The application uses Minecraft Java usernames, administrator-reviewed in-game verification, and approval before access.

## Features

- Application with a unique Minecraft username and password
- One-time verification code for each application; applicant must say it in the Minecraft server
- Administrator manually confirms the in-game message and approves/rejects the application
- Only approved accounts can log in, access channels, or connect to realtime chat
- Case-insensitive unique usernames enforced by SQLite constraints
- Realtime channels and persistent messages
- Admin channel creation, member list, and member suspension
- Responsive Japanese UI

## Requirements

- Node.js 20+
- Persistent writable disk for SQLite (do not use ephemeral serverless storage)
- HTTPS in production

## Run locally

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env`.
3. Set a unique `ADMIN_PASSWORD` and a random `SESSION_SECRET` (32+ characters).
4. Run:

```bash
npm install
npm start
```

5. Open http://localhost:3000.
6. Sign in as `AzumoAurora3032` using the password configured in `ADMIN_PASSWORD`.

The administrator account is provisioned on first start. If the account already exists, its role and approved status are restored; its password is not silently overwritten.

## In-game verification workflow

1. A player submits an application using their exact Minecraft Java username.
2. The server displays a random one-time code.
3. The player joins the Azumofuyuki Minecraft server and says that code in public chat.
4. The administrator checks the in-game player and the code, then opens the admin panel.
5. Click **確認済み・承認** only after checking the player in game.

The website cannot independently observe Minecraft server chat. Verification is therefore an explicit administrator action, not an automatic Minecraft integration. Never approve based only on a username or an applicant's claim.

## Deployment

Deploy on a Node.js host with a persistent disk. Configure these environment variables in the host dashboard:

- `NODE_ENV=production`
- `PORT` (provided by most hosts)
- `SESSION_SECRET` (long random secret)
- `ADMIN_PASSWORD` (strong unique password; never commit it)
- `DATABASE_FILE` (path on persistent disk)
- `PUBLIC_URL=https://your-domain.example` (exact public origin)

Put the app behind HTTPS. Back up the SQLite database and its WAL safely. Do not deploy this on static-only GitHub Pages: realtime sockets, sessions, and the database require a running Node.js server and persistent storage.

## Security notes

- Passwords are bcrypt-hashed.
- Session cookies are HttpOnly and SameSite=Strict; Secure is enabled in production.
- Login and application endpoints are rate-limited.
- All privileged actions are checked server-side.
- Socket connections require an approved account; banned users are disconnected.
- User content is rendered as text, never HTML.
- Do not commit `.env`, database files, or credentials.

## Current scope

This is the first deployable foundation. It intentionally does not claim Microsoft/Mojang identity verification, automatic server-chat integration, DMs, file uploads, voice/video, or end-to-end encryption. The manual in-game check is the selected identity-verification method.
