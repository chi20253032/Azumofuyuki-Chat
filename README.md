# Azumofuyuki Chat

Azumofuyuki Minecraft community chat. Node.js + Express + Socket.IO + SQLite.

## Implemented

- Minecraft Java username applications with one-time in-game verification codes and administrator approval
- Fixed administrator identity: `AzumoAurora3032`; no self-assigned admin role
- Unique usernames (case-insensitive), bcrypt password hashes, session authentication and login rate limits
- Realtime public channels and persistent messages
- Live online member count and presence broadcasts
- Direct messages between approved members
- Replies, message editing/deletion, emoji reactions and channel pins
- Message search across channels
- @username mention notifications and DM notifications
- Authenticated file attachments (up to five files, 15 MB each; PNG/JPEG/GIF/WebP/PDF/TXT/ZIP)
- Admin channel creation, private admin-only channels, channel archiving
- Admin member suspension/restoration and member/moderator role management
- Per-channel member send/attachment permissions
- Responsive Japanese interface for desktop and mobile
- Health endpoint and GitHub Actions syntax checks

## Requirements

- Node.js 20+
- Persistent writable disk (SQLite database, sessions and uploaded files)
- HTTPS in production

## Local setup

1. Copy `.env.example` to `.env`.
2. Set a unique `ADMIN_PASSWORD` and a random `SESSION_SECRET` of at least 32 characters.
3. Run:

```bash
npm install
npm start
```

4. Open http://localhost:3000 and sign in as `AzumoAurora3032` using the configured admin password.

The administrator account is created on first startup. If it already exists in the database, its role and approved status are restored, but its password is not silently replaced. Keep the database and its backups secure.

## In-game identity verification

1. A player applies with their exact Minecraft Java username and a password for this chat.
2. The site generates a one-time code.
3. The player joins the Azumofuyuki Minecraft server and says the code in public chat.
4. The administrator checks the live player and code, then approves the application in the admin panel.

This is manual administrator verification. The web app does not independently read Minecraft server chat or verify Microsoft ownership. Do not approve based only on a username or an applicant's claim.

## Deploy on Render

A `render.yaml` blueprint is included. It configures a Node web service and persistent disk. The persistent disk requires a paid Render service plan. During deployment, enter `ADMIN_PASSWORD` as a secret environment variable. Render generates `SESSION_SECRET`.

Required environment:
- `NODE_ENV=production`
- `DATABASE_FILE=/var/data/azumofuyuki.sqlite`
- `SESSION_SECRET` (random, 32+ chars)
- `ADMIN_PASSWORD` (strong and unique)
- `PUBLIC_URL=https://your-domain.example` (set to the exact public origin)

Do not deploy this app on GitHub Pages or another static-only host. The backend, Socket.IO, sessions, uploads and SQLite database require a running Node.js process and persistent disk.

## Storage and limits

SQLite data, session storage and uploaded files live beside the configured database path. Back up the database and uploads directory together. Each upload is limited to 15 MB and each message accepts up to five attachments. File access requires an approved logged-in account; unattached uploads are visible only to their uploader.

## Security notes

- Passwords use bcrypt.
- Session cookies are HttpOnly and SameSite=Strict; Secure is enabled in production.
- Mutating API requests validate the request origin when supplied.
- Privileged routes are checked server-side.
- Socket.IO connections require an approved account.
- File names are replaced with random storage identifiers; user-provided text is rendered as text.
- Never commit `.env`, database files, session files or uploaded user content.
- Run dependency updates and security audits before a public launch.

## Not included yet

Voice/video calls, end-to-end encryption, automatic Minecraft server chat integration, OAuth/Microsoft account verification, and multi-server federation are not implemented.
