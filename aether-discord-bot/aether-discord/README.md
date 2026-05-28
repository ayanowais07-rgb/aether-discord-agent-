# ⚡ Aether — Elite AI Engineer Discord Bot

Aether is a fully autonomous AI Software Engineer living inside your Discord server. Give it tasks in plain English — it architects, codes, reviews, and ships production-grade software.

---

## 🚀 Deploy Free in 10 Minutes (Railway)

### Step 1 — Create Your Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **"New Application"** → name it **Aether**
3. Go to **Bot** tab → Click **"Add Bot"**
4. Under **Privileged Gateway Intents**, enable:
   - ✅ MESSAGE CONTENT INTENT
   - ✅ SERVER MEMBERS INTENT
   - ✅ PRESENCE INTENT
5. Click **"Reset Token"** → copy your **Bot Token** (save it!)
6. Go to **OAuth2 → URL Generator**:
   - Scopes: ✅ `bot`
   - Bot Permissions: ✅ `Send Messages`, `Read Messages/View Channels`, `Read Message History`
7. Copy the generated URL → open it → invite Aether to your server

### Step 2 — Deploy to Railway (Free)

1. Go to https://railway.app → sign up free with GitHub
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Upload or connect this folder
4. Go to your project → **Variables** tab → add:
   ```
   DISCORD_TOKEN = your_bot_token
   OPENAI_API_KEY = your_openai_key
   OPENAI_MODEL = gpt-4o
   ```
5. Railway auto-deploys. Aether is live 24/7.

### Step 3 — Alternative: Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env and fill in your tokens

# 3. Start Aether
npm start
```

---

## 💬 How to Use Aether in Discord

| Command | What it does |
|---|---|
| `@Aether build me a REST API` | Mention Aether with any task |
| `!aether create a SaaS PRD` | Use prefix command |
| `!clear` | Reset conversation memory |
| `!status` | Show bot uptime and context size |
| `!help` | Show all commands |
| DM the bot | Chat privately, Aether responds to everything |

### Example Tasks
```
!aether build a full-stack todo app with Next.js and Postgres

!aether review my authentication code for security vulnerabilities

!aether design a database schema for a multi-tenant SaaS platform

!aether create a CI/CD pipeline with GitHub Actions and Docker

!aether what's the best tech stack for a fintech mobile app?
```

---

## 🏗 Project Structure

```
aether-discord/
├── bot.js          ← Main bot (all logic lives here)
├── package.json    ← Dependencies
├── .env.example    ← Environment variable template
├── .env            ← YOUR secrets (never commit this)
├── .gitignore      ← Protects .env from git
└── README.md       ← This file
```

---

## ⚙️ Configuration

Edit these in your `.env` file:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your Discord bot token |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | Model: `gpt-4o`, `gpt-4o-mini`, `o3-mini` |

---

## 🆓 Free Hosting Options

| Platform | Free Tier | Notes |
|---|---|---|
| **Railway** ⭐ | $5 credit/month | Best option, always on |
| **Render** | 750 hrs/month | Sleeps after 15min inactivity |
| **Fly.io** | 3 shared VMs free | Needs Docker knowledge |
| **Your PC** | Always free | Must keep PC on |

---

Built with ❤️ — Aether v2.0
