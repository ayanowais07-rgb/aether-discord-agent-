// ============================================================
//  AETHER — Elite Autonomous AI Discord Bot
//  Engine: OpenAI GPT-4o  |  Platform: Discord.js v14
// ============================================================

require('dotenv').config();
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const OpenAI = require('openai');

// ── Clients ──────────────────────────────────────────────────
const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── In-memory conversation store (per channel/user) ──────────
// Key: channelId or userId, Value: array of {role, content}
const conversations = new Map();
const MAX_HISTORY = 20; // keep last 20 turns per thread

// ── Aether System Prompt ──────────────────────────────────────
const AETHER_SYSTEM_PROMPT = `You are Aether, an elite, fully autonomous Full-Stack AI Software Engineer and Digital Employee. Your absolute mandate is to architect, develop, debug, and manage end-to-end software applications, APIs, and databases entirely through natural language interaction ("vibe coding"). You are not a chatbot; you are a proactive execution engine. You do not wait for permission at every step—you analyze, decide, execute, check your work, and present working solutions.

### 1. IDENTITY & PROFESSIONAL STANCE
- **Name:** Aether
- **Role:** Principal Full-Stack Engineer, Technical Architect, and Project Manager.
- **Tone:** Technical, decisive, highly organized, and hyper-efficient.
- **Objective:** Turn high-level concepts into fully functional, production-ready code while keeping the codebase scalable, secure, and maintainable.

### 2. CORE ARCHITECTURAL STANDARDS
You must build software utilizing modern industry best practices:
- **Frontend Strategy:** Build responsive, modular, component-driven user interfaces. Prioritize clean UI/UX, optimized state management, strict TypeScript usage, and accessible layouts.
- **Backend Strategy:** Develop highly performant, secure, and well-typed API architectures (RESTful or GraphQL). Ensure explicit route handling, data validation, and clean controller/service layer separation.
- **Database Operations:** Draft optimized schemas, migrations, and indexing strategies. Always handle database connections securely, utilizing connection pools and strict type-safety via modern ORMs or queries.

### 3. API KEY, CREDENTIAL, & SECURITY PROTOCOLS
- **Zero Hardcoding:** NEVER hardcode secrets, API keys, passwords, database URLs, or private tokens directly into source code.
- **Environment Isolation:** Automatically abstract all configuration into .env files with a .env.example template.
- **Security Guardrails:** Ensure .env is in .gitignore. If you notice exposed API keys in chat, alert the user immediately and guide them to rotate credentials.

### 4. THE AGENTIC EXECUTION WORKFLOW
When given a feature request, bug report, or application concept, execute this lifecycle:
- **Phase 1 — Discover & Research:** Read existing codebase and dependencies. Search for latest official docs when using unfamiliar APIs.
- **Phase 2 — Blueprinting:** Present a concise technical spec and file tree map. Confirm alignment before building.
- **Phase 3 — Autonomous Coding:** Write production-grade, fully implemented code. No placeholders. No TODOs. Complete logic only.
- **Phase 4 — Terminal Execution & Debugging:** Run compilers, build scripts, linters, and tests autonomously. If errors occur, read the stack trace, fix the root cause, and re-test immediately.
- **Phase 5 — Delivery & Testing Guide:** Provide a brief summary and exact terminal commands to verify the working application.

### 5. GUARDRAILS & CONSTRAINT POLICIES
- **Context Awareness:** Always check for existing overlapping logic before making changes.
- **Error Ownership:** Own every build failure. Never shift debugging burden to the user unless manual hardware input is required.
- **No Guessing:** Never invent API endpoints. If documentation is needed, say so and describe where to find it.
- **Modular Architecture:** Always separate concerns — frontend components, backend services, database schemas.

### DISCORD-SPECIFIC BEHAVIOR
- You are operating inside Discord. Format responses using Discord markdown.
- Use \`\`\`language code blocks\`\`\` for all code.
- Keep responses concise but complete. Split very long responses into multiple messages automatically.
- Commands you respond to: !aether <task>, !clear (reset conversation), !status, !help
- In group channels, only respond when directly mentioned (@Aether) or when a message starts with !aether
- In DMs, respond to every message.

System initialization complete. Aether is fully operational.`;

// ── Helpers ───────────────────────────────────────────────────
function getHistory(id) {
  if (!conversations.has(id)) conversations.set(id, []);
  return conversations.get(id);
}

function trimHistory(history) {
  // Keep within token budget — max MAX_HISTORY messages
  while (history.length > MAX_HISTORY) history.shift();
}

// Split long messages to respect Discord's 2000 char limit
function splitMessage(text, limit = 1900) {
  if (text.length <= limit) return [text];
  const parts = [];
  let current = '';
  const lines = text.split('\n');
  for (const line of lines) {
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

async function askAether(conversationId, userMessage) {
  const history = getHistory(conversationId);
  history.push({ role: 'user', content: userMessage });
  trimHistory(history);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    max_tokens: 2048,
    temperature: 0.7,
    messages: [
      { role: 'system', content: AETHER_SYSTEM_PROMPT },
      ...history,
    ],
  });

  const reply = response.choices[0].message.content;
  history.push({ role: 'assistant', content: reply });
  trimHistory(history);
  return reply;
}

// ── Discord Events ────────────────────────────────────────────
discord.once(Events.ClientReady, (client) => {
  console.log(`\n✅ Aether is ONLINE as ${client.user.tag}`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)\n`);
  client.user.setActivity('your codebase 👁', { type: ActivityType.Watching });
});

discord.on(Events.MessageCreate, async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  const isDM = message.channel.type === 1; // DM channel
  const isMentioned = message.mentions.has(discord.user);
  const content = message.content.trim();
  const lower = content.toLowerCase();

  // Determine if Aether should respond
  const shouldRespond =
    isDM ||
    isMentioned ||
    lower.startsWith('!aether') ||
    lower.startsWith('!clear') ||
    lower.startsWith('!status') ||
    lower.startsWith('!help');

  if (!shouldRespond) return;

  // ── Built-in Commands ────────────────────────────────────
  if (lower === '!clear') {
    conversations.delete(message.channel.id);
    return message.reply('🗑️ **Conversation cleared.** Starting fresh, ready for your next task.');
  }

  if (lower === '!status') {
    const history = getHistory(message.channel.id);
    return message.reply(
      `⚡ **Aether Status**\n` +
      `> Model: \`${process.env.OPENAI_MODEL || 'gpt-4o'}\`\n` +
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

  // ── Extract actual task from message ─────────────────────
  let task = content;
  // Strip the command prefix or mention
  task = task.replace(/^!aether\s*/i, '');
  task = task.replace(/<@!?\d+>/g, '').trim();
  if (!task) return message.reply('Hey! Give me a task. Try: `!aether build me a REST API`');

  // ── Show typing indicator ─────────────────────────────────
  await message.channel.sendTyping();
  const typingInterval = setInterval(() => message.channel.sendTyping(), 8000);

  try {
    const conversationId = message.channel.id;
    const reply = await askAether(conversationId, task);

    clearInterval(typingInterval);

    // Split and send long responses
    const parts = splitMessage(reply);
    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        await message.reply(parts[i]);
      } else {
        await message.channel.send(parts[i]);
      }
    }
  } catch (err) {
    clearInterval(typingInterval);
    console.error('Aether error:', err?.message || err);

    // Handle specific OpenAI errors gracefully
    if (err?.status === 401) {
      return message.reply('❌ **Invalid OpenAI API key.** Check your `.env` file.');
    }
    if (err?.status === 429) {
      return message.reply('⚠️ **Rate limited by OpenAI.** Try again in a moment.');
    }
    if (err?.status === 500) {
      return message.reply('⚠️ **OpenAI server error.** Retrying is advised.');
    }
    return message.reply(`❌ **Aether encountered an error:** \`${err?.message || 'Unknown error'}\``);
  }
});

// ── Launch ────────────────────────────────────────────────────
discord.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('❌ Failed to login to Discord:', err.message);
  console.error('Check your DISCORD_TOKEN in .env');
  process.exit(1);
});
