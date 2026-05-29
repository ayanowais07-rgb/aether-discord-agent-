// ============================================================
//  AETHER — Elite Autonomous AI Discord Bot
//  Engine: Groq (FREE) — llama-3.3-70b  |  Discord.js v14
// ============================================================

require('dotenv').config();
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// ── Conversation memory (per channel) ────────────────────────
const conversations = new Map();
const MAX_HISTORY = 20;

// ── Aether System Prompt ──────────────────────────────────────
const AETHER_SYSTEM_PROMPT = `You are Aether, an elite, fully autonomous Full-Stack AI Software Engineer and Digital Employee. Your absolute mandate is to architect, develop, debug, and manage end-to-end software applications, APIs, and databases entirely through natural language interaction ("vibe coding"). You are not a chatbot; you are a proactive execution engine. You do not wait for permission at every step—you analyze, decide, execute, check your work, and present working solutions.

### 1. IDENTITY & PROFESSIONAL STANCE
- **Name:** Aether
- **Role:** Principal Full-Stack Engineer, Technical Architect, and Project Manager.
- **Tone:** Technical, decisive, highly organized, and hyper-efficient.
- **Objective:** Turn high-level concepts into fully functional, production-ready code while keeping the codebase scalable, secure, and maintainable.

### 2. CORE ARCHITECTURAL STANDARDS
- **Frontend Strategy:** Build responsive, modular, component-driven user interfaces. Prioritize clean UI/UX, optimized state management, strict TypeScript usage, and accessible layouts.
- **Backend Strategy:** Develop highly performant, secure, and well-typed API architectures (RESTful or GraphQL). Ensure explicit route handling, data validation, and clean controller/service layer separation.
- **Database Operations:** Draft optimized schemas, migrations, and indexing strategies. Always handle database connections securely, utilizing connection pools and strict type-safety via modern ORMs or queries.

### 3. API KEY, CREDENTIAL, & SECURITY PROTOCOLS
- **Zero Hardcoding:** NEVER hardcode secrets, API keys, passwords, database URLs, or private tokens directly into source code.
- **Environment Isolation:** Automatically abstract all configuration into .env files with a .env.example template.
- **Security Guardrails:** Ensure .env is in .gitignore. If you notice exposed API keys in chat, alert the user immediately and guide them to rotate credentials.

### 4. THE AGENTIC EXECUTION WORKFLOW
- **Phase 1 — Discover & Research:** Read existing codebase and dependencies. Search for latest official docs when using unfamiliar APIs.
- **Phase 2 — Blueprinting:** Present a concise technical spec and file tree map. Confirm alignment before building.
- **Phase 3 — Autonomous Coding:** Write production-grade, fully implemented code. No placeholders. No TODOs. Complete logic only.
- **Phase 4 — Terminal Execution & Debugging:** Run compilers, build scripts, linters, and tests autonomously. Fix errors immediately.
- **Phase 5 — Delivery & Testing Guide:** Provide a summary and exact terminal commands to verify the working application.

### 5. GUARDRAILS
- Never invent API endpoints. If documentation is needed, say so.
- Always separate concerns — frontend components, backend services, database schemas.
- Own every build failure. Never shift debugging burden to the user.
- Think like a Staff Engineer at every step.

### DISCORD BEHAVIOR
- Format responses using Discord markdown.
- Use \`\`\`language code blocks\`\`\` for all code.
- Keep responses concise but complete.
- Commands: !aether <task>, !clear, !status, !help
- In servers: respond when @mentioned or !aether prefix used.
- In DMs: respond to everything.

System initialization complete. Aether is fully operational.`;

// ── Groq API call (OpenAI-compatible) ────────────────────────
async function askAether(conversationId, userMessage) {
  const history = conversations.get(conversationId) || [];
  history.push({ role: 'user', content: userMessage });

  // Trim to last MAX_HISTORY messages
  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(conversationId, history);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      max_tokens: 2048,
      temperature: 0.7,
      messages: [
        { role: 'system', content: AETHER_SYSTEM_PROMPT },
        ...history,
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw Object.assign(new Error(err?.error?.message || 'Groq API error'), { status: response.status });
  }

  const data = await response.json();
  const reply = data.choices[0].message.content;

  history.push({ role: 'assistant', content: reply });
  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(conversationId, history);

  return reply;
}

// ── Split long messages for Discord 2000 char limit ──────────
function splitMessage(text, limit = 1900) {
  if (text.length <= limit) return [text];
  const parts = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > limit) {
      if (current) parts.push(current.trim());
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// ── Discord Events ────────────────────────────────────────────
discord.once(Events.ClientReady, (client) => {
  console.log(`\n✅ Aether is ONLINE as ${client.user.tag}`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);
  console.log(`🧠 Engine: Groq — ${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'}\n`);
  client.user.setActivity('your codebase 👁', { type: ActivityType.Watching });
});

discord.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === 1;
  const isMentioned = message.mentions.has(discord.user);
  const content = message.content.trim();
  const lower = content.toLowerCase();

  const shouldRespond =
    isDM || isMentioned ||
    lower.startsWith('!aether') ||
    lower.startsWith('!clear') ||
    lower.startsWith('!status') ||
    lower.startsWith('!help');

  if (!shouldRespond) return;

  // ── Built-in commands ───────────────────────────────────────
  if (lower === '!clear') {
    conversations.delete(message.channel.id);
    return message.reply('🗑️ **Conversation cleared.** Fresh start — ready for your next task.');
  }

  if (lower === '!status') {
    const history = conversations.get(message.channel.id) || [];
    return message.reply(
      `⚡ **Aether Status**\n` +
      `> Engine: \`Groq — ${process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'}\`\n` +
      `> Messages in context: \`${history.length}\`\n` +
      `> Servers: \`${discord.guilds.cache.size}\`\n` +
      `> Uptime: \`${Math.floor(process.uptime() / 60)}m ${Math.floor(process.uptime() % 60)}s\``
    );
  }

  if (lower === '!help') {
    return message.reply(
      `**⚡ Aether — Elite AI Engineer**\n\n` +
      `**How to use:**\n` +
      `> Mention me \`@Aether\` or use \`!aether\` followed by your task\n` +
      `> In DMs, just type naturally\n\n` +
      `**Commands:**\n` +
      `> \`!aether <task>\` — Give Aether a task\n` +
      `> \`!clear\` — Reset conversation memory\n` +
      `> \`!status\` — Show bot status\n` +
      `> \`!help\` — Show this message\n\n` +
      `**Example tasks:**\n` +
      `> \`!aether build me a REST API with auth and Postgres\`\n` +
      `> \`!aether create a PRD for a SaaS app\`\n` +
      `> \`!aether review my code for security issues\``
    );
  }

  // ── Extract task ────────────────────────────────────────────
  let task = content
    .replace(/^!aether\s*/i, '')
    .replace(/<@!?\d+>/g, '')
    .trim();

  if (!task) return message.reply('Give me a task! Try: `!aether build me a REST API`');

  // ── Typing indicator ────────────────────────────────────────
  await message.channel.sendTyping();
  const typingInterval = setInterval(() => message.channel.sendTyping(), 8000);

  try {
    const reply = await askAether(message.channel.id, task);
    clearInterval(typingInterval);

    const parts = splitMessage(reply);
    for (let i = 0; i < parts.length; i++) {
      i === 0 ? await message.reply(parts[i]) : await message.channel.send(parts[i]);
    }
  } catch (err) {
    clearInterval(typingInterval);
    console.error('Aether error:', err?.message || err);

    if (err?.status === 401) return message.reply('❌ **Invalid Groq API key.** Check your Railway Variables.');
    if (err?.status === 429) return message.reply('⚠️ **Rate limited.** Try again in a moment.');
    return message.reply(`❌ **Error:** \`${err?.message || 'Unknown error'}\``);
  }
});

// ── Graceful shutdown ─────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n⚠️ ${signal} received. Shutting down gracefully...`);
  discord.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught Exception:', err.message));
process.on('unhandledRejection', (r) => console.error('⚠️ Unhandled Rejection:', r));

// ── Launch ────────────────────────────────────────────────────
discord.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('❌ Discord login failed:', err.message);
  process.exit(1);
});
