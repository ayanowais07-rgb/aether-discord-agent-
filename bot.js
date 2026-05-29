// ============================================================
//  AETHER — Elite Autonomous AI Discord Bot
//  Engine: xAI Grok  |  Discord.js v14
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

### 3. SECURITY PROTOCOLS
- NEVER hardcode secrets, API keys, or tokens into source code.
- Always use .env files. Always add .env to .gitignore.
- Alert the user immediately if exposed credentials are detected.

### 4. AGENTIC WORKFLOW
- Phase 1: Discover & Research existing codebase and docs.
- Phase 2: Blueprint — present file tree and tech spec before coding.
- Phase 3: Write complete, production-grade code. No TODOs or placeholders.
- Phase 4: Debug autonomously. Own every error.
- Phase 5: Deliver with exact terminal commands to test and run.

### 5. GUARDRAILS
- Never invent API endpoints.
- Separate concerns always — frontend, backend, database.
- Think like a Staff Engineer at every step.

### DISCORD BEHAVIOR
- Use Discord markdown formatting.
- Use triple backtick code blocks with language labels for all code.
- In servers: respond when @mentioned or !aether prefix used.
- In DMs: respond to everything.

System initialization complete. Aether is fully operational.`;

async function askAether(conversationId, userMessage) {
  const history = conversations.get(conversationId) || [];
  history.push({ role: 'user', content: userMessage });
  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(conversationId, history);

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || 'grok-3-mini',
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
    const msg = err?.error?.message || `xAI API error (status ${response.status})`;
    throw Object.assign(new Error(msg), { status: response.status });
  }

  const data = await response.json();
  const reply = data.choices[0].message.content;
  history.push({ role: 'assistant', content: reply });
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
  console.log(`🧠 Engine: xAI — ${process.env.XAI_MODEL || 'grok-3-mini'}\n`);
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
    return message.reply('🗑️ **Conversation cleared.** Fresh start — ready for your next task.');
  }

  if (lower === '!status') {
    const history = conversations.get(message.channel.id) || [];
    return message.reply(
      `⚡ **Aether Status**\n` +
      `> Engine: \`xAI — ${process.env.XAI_MODEL || 'grok-3-mini'}\`\n` +
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
    if (err?.status === 401) return message.reply('❌ **Invalid xAI API key.** Go to Railway → Variables → check XAI_API_KEY.');
    if (err?.status === 429) return message.reply('⚠️ **Rate limited by xAI.** Try again in a moment.');
    return message.reply(`❌ **Error:** \`${err?.message || 'Unknown error'}\``);
  }
});

async function shutdown(signal) {
  console.log(`\n⚠️ ${signal} received. Shutting down gracefully...`);
  discord.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught Exception:', err.message));
process.on('unhandledRejection', (r) => console.error('⚠️ Unhandled Rejection:', r));

discord.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('❌ Discord login failed:', err.message);
  process.exit(1);
});
