// ============================================================
//  AETHER — Elite Autonomous AI Discord Bot
//  Engine: Google Gemini (FREE)  |  Discord.js v14
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

const conversations = new Map();
const MAX_HISTORY = 20;

const AETHER_SYSTEM_PROMPT = `You are Aether, an elite, fully autonomous Full-Stack AI Software Engineer and Digital Employee. Your absolute mandate is to architect, develop, debug, and manage end-to-end software applications, APIs, and databases entirely through natural language interaction ("vibe coding"). You are not a chatbot; you are a proactive execution engine.

### 1. IDENTITY
- Name: Aether
- Role: Principal Full-Stack Engineer, Technical Architect, Project Manager
- Tone: Technical, decisive, highly organized, hyper-efficient
- Objective: Turn concepts into production-ready code — scalable, secure, maintainable

### 2. ARCHITECTURAL STANDARDS
- Frontend: Responsive, modular, component-driven UIs. Clean UX, TypeScript, accessible layouts.
- Backend: Performant, secure APIs (REST or GraphQL). Route handling, validation, service separation.
- Database: Optimized schemas, migrations, indexing. Secure connections, connection pools, type-safe ORMs.

### 3. SECURITY
- NEVER hardcode secrets or API keys
- Always use .env files with .env.example templates
- Always add .env to .gitignore

### 4. WORKFLOW
- Phase 1: Research & analyze requirements
- Phase 2: Blueprint — file tree + tech spec first
- Phase 3: Write complete production code — no TODOs, no placeholders
- Phase 4: Debug autonomously — own every error
- Phase 5: Deliver with exact commands to run and test

### 5. RULES
- Never invent API endpoints
- Separate concerns always
- Think like a Staff Engineer

### DISCORD BEHAVIOR
- Use Discord markdown
- Use triple backtick code blocks with language labels
- In servers: respond when @mentioned or !aether used
- In DMs: respond to everything

System online. Aether fully operational.`;

async function askAether(conversationId, userMessage) {
  const history = conversations.get(conversationId) || [];
  history.push({ role: 'user', parts: [{ text: userMessage }] });
  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(conversationId, history);

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: AETHER_SYSTEM_PROMPT }] },
      contents: history,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || `Gemini API error (status ${response.status})`;
    throw Object.assign(new Error(msg), { status: response.status });
  }

  const data = await response.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error('No response from Gemini');

  history.push({ role: 'model', parts: [{ text: reply }] });
  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(conversationId, history);
  return reply;
}

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

discord.once(Events.ClientReady, (client) => {
  console.log(`\n✅ Aether is ONLINE as ${client.user.tag}`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);
  console.log(`🧠 Engine: Google Gemini — ${process.env.GEMINI_MODEL || 'gemini-1.5-flash'}\n`);
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

  if (lower === '!clear') {
    conversations.delete(message.channel.id);
    return message.reply('🗑️ **Conversation cleared.** Ready for your next task.');
  }

  if (lower === '!status') {
    const history = conversations.get(message.channel.id) || [];
    return message.reply(
      `⚡ **Aether Status**\n` +
      `> Engine: \`Gemini — ${process.env.GEMINI_MODEL || 'gemini-1.5-flash'}\`\n` +
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

  let task = content
    .replace(/^!aether\s*/i, '')
    .replace(/<@!?\d+>/g, '')
    .trim();

  if (!task) return message.reply('Give me a task! Try: `!aether build me a REST API`');

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
    if (err?.status === 400) return message.reply('❌ **Bad request.** Check your GEMINI_API_KEY in Railway Variables.');
    if (err?.status === 403) return message.reply('❌ **API key invalid.** Check your GEMINI_API_KEY in Railway Variables.');
    if (err?.status === 429) return message.reply('⚠️ **Rate limited.** Try again in a moment.');
    return message.reply(`❌ **Error:** \`${err?.message || 'Unknown error'}\``);
  }
});

async function shutdown(signal) {
  console.log(`\n⚠️ ${signal} received. Shutting down...`);
  discord.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught:', err.message));
process.on('unhandledRejection', (r) => console.error('⚠️ Rejection:', r));

discord.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('❌ Discord login failed:', err.message);
  process.exit(1);
});
