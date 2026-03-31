# 🍌 BananaSplit

**Pickleball expense splitter for your crew.**  
Log court fees, split by equal share or minutes played, track who owes what, and generate settle-up reports.

---

## Features

- **Groups** — Create separate groups for different pickleball crews
- **Members** — Add players with color-coded avatars
- **Sessions** — Log each court session with date, court fee, and participants
- **Split modes** — Equal split OR proportional by minutes played (playtime split)
- **Expenses** — Add extra costs per session (drinks, balls, etc.) paid by any player
- **Balances** — Automatic settle-up calculation with simplified payment suggestions
- **Payments** — Record when someone pays and watch balances update instantly
- **Reports** — Full settle-up report with export to `.txt`
- **Dark mode** — Full light/dark theme support

---

## Local Development (Run on Your Computer)

### Prerequisites

- [Node.js 20+](https://nodejs.org/) — check with `node -v`
- npm (comes with Node.js)

### Setup

```bash
# 1. Unzip and enter the project folder
cd bananasplit

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open **http://localhost:5000** in your browser.

That's it. The app uses a local SQLite database (`bananasplit.db`) — your data persists between restarts automatically. No external database needed.

### Dev server features
- Hot reload on frontend changes (Vite HMR)
- Auto-restart on backend changes (tsx watch)
- All data stored in `bananasplit.db` in the project root

---

## Deploy to Railway (Always-On)

Railway gives you a persistent server so the app is accessible from any device, 24/7.

### Step 1 — Push to GitHub

```bash
# Inside the bananasplit folder
git init
git add .
git commit -m "Initial BananaSplit commit"

# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/bananasplit.git
git push -u origin main
```

### Step 2 — Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in (free tier works)
2. Click **New Project → Deploy from GitHub repo**
3. Select your `bananasplit` repository
4. Railway auto-detects Node.js and uses `railway.toml` for build/start commands

### Step 3 — Add a persistent volume (keeps your database)

1. In your Railway project, click your service
2. Go to **Settings → Volumes**
3. Click **Add Volume**, mount path: `/app/data`
4. Set the env var `DATABASE_PATH=/app/data/bananasplit.db`

> Without a volume, your data resets on every deploy. With the volume it persists forever.

### Step 4 — Set environment variables

In Railway → your service → **Variables**, add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_PATH` | `/app/data/bananasplit.db` |

Railway automatically sets `PORT` — no need to set it manually.

### Step 5 — Deploy

Railway auto-deploys when you push to GitHub. Your app will be live at a URL like:  
`https://bananasplit-production.up.railway.app`

---

## Project Structure

```
bananasplit/
├── client/              # React frontend (Vite + Tailwind + shadcn/ui)
│   ├── src/
│   │   ├── pages/       # GroupsPage, GroupDetailPage, BalancesPage, ReportPage
│   │   ├── components/  # AppShell, ThemeProvider
│   │   └── index.css    # Banana/court color palette
├── server/
│   ├── index.ts         # Express server entry
│   ├── routes.ts        # All API endpoints + balance calculation logic
│   └── storage.ts       # SQLite database layer (Drizzle ORM)
├── shared/
│   └── schema.ts        # Data models (groups, members, sessions, expenses, payments)
├── railway.toml         # Railway deployment config
└── README.md
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start local dev server at http://localhost:5000 |
| `npm run build` | Build for production |
| `npm run start` | Start production server |

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS v3, shadcn/ui, TanStack Query, Wouter
- **Backend**: Express.js (Node.js)
- **Database**: SQLite via better-sqlite3 + Drizzle ORM
- **Deploy**: Railway (any Node.js host works)
