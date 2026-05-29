// ============================================================
//  AETHER — Autonomous AI Agent
//  Engine: OpenRouter (FREE) | Discord.js v14
// ============================================================

require('dotenv').config();
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const execAsync = promisify(exec);

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
const WORKSPACE = '/tmp/aether-workspace';

async function ensureWorkspace() {
  try { await fs.mkdir(WORKSPACE, { recursive: true }); } catch {}
}

const SYSTEM_PROMPT = `You are Aether, an elite autonomous AI Employee and Full-Stack Engineer. You are NOT a chatbot. You are a proactive execution engine.

### IDENTITY
- Name: Aether
- Role: Principal Engineer, Architect, Researcher, Project Manager
- You work 24/7 and always execute tasks completely

### CAPABILITIES
You can browse websites, search the web, write and execute code, build full apps, research topics, create files, and deploy projects.

When using tools, use this EXACT format:
TOOL: TOOL_NAME | argument

Available tools:
TOOL: WEB_SEARCH | query
TOOL: FETCH_URL | https://...
TOOL: WRITE_FILE | filename | content
TOOL: READ_FILE | filename
TOOL: RUN_CMD | command
TOOL: LIST_FILES

### RULES
- Always actually DO the task using tools
- Write COMPLETE code, no placeholders or TODOs
- Chain multiple tools to finish complex tasks
- Think like a Staff Engineer
- Use Discord markdown and code blocks
- Be concise in text, thorough in execution

System online. Aether fully operational.`;

// ── Tools ─────────────────────────────────────────────────────
async function webSearch(query) {
  return new Promise((resolve) => {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const results = [];
        const titleRe = /class="result__title"[^>]*>([\s\S]*?)<\/[ah]/gi;
        const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        let m, count = 0;
        while ((m = titleRe.exec(data)) && count < 6) {
          const t = m[1].replace(/<[^>]+>/g, '').trim();
          if (t) { results.push(`• ${t}`); count++; }
        }
        let s, sc = 0;
        while ((s = snippetRe.exec(data)) && sc < 4) {
          const sn = s[1].replace(/<[^>]+>/g, '').trim();
          if (sn) { results.push(`  ${sn}`); sc++; }
        }
        resolve(`Search: "${query}"\n${results.join('\n') || 'No results'}`);
      });
    }).on('error', e => resolve(`Search error: ${e.message}`));
  });
}

async function fetchURL(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : require('http');
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const text = data
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ').trim().slice(0, 2000);
        resolve(`URL: ${url}\n\n${text}`);
      });
    });
    req.on('error', e => resolve(`Fetch error: ${e.message}`));
    req.setTimeout(10000, () => { req.destroy(); resolve('Timeout'); });
  });
}

async function writeFile(filename, content) {
  try {
    const full = path.join(WORKSPACE, filename);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
    return `✅ File written: ${filename}`;
  } catch (e) { return `Error: ${e.message}`; }
}

async function readFile(filename) {
  try {
    const content = await fs.readFile(path.join(WORKSPACE, filename), 'utf8');
    return `File: ${filename}\n${content.slice(0, 1500)}`;
  } catch (e) { return `Error: ${e.message}`; }
}

async function runCmd(cmd) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: WORKSPACE, timeout: 30000 });
    return (stdout + (stderr ? `\nSTDERR: ${stderr}` : '')).slice(0, 1500);
  } catch (e) { return `CMD Error: ${e.message.slice(0, 500)}`; }
}

async function listFiles() {
  try {
    const entries = await fs.readdir(WORKSPACE, { withFileTypes: true });
    return entries.length
      ? entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n')
      : 'Workspace is empty';
  } catch { return 'No workspace yet'; }
}

async function executeTool(line) {
  const parts = line.slice(5).split('|').map(s => s.trim());
  const tool = parts[0];
  const args = parts.slice(1);
  switch (tool) {
    case 'WEB_SEARCH':  return await webSearch(args.join(' '));
    case 'FETCH_URL':   return await fetchURL(args[0]);
    case 'WRITE_FILE':  return await writeFile(args[0], args.slice(1).join('|'));
    case 'READ_FILE':   return await readFile(args[0]);
    case 'RUN_CMD':     return await runCmd(args.join(' '));
    case 'LIST_FILES':  return await listFiles();
    default: return `Unknown tool: ${tool}`;
  }
}

// ── OpenRouter API call ───────────────────────────────────────
async function callOpenRouter(messages) {
  const body = JSON.stringify({
    model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    max_tokens: 2048,
    temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://aether-agent.app',
        'X-Title': 'Aether Agent',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(Object.assign(new Error(json.error.message || 'OpenRouter error'), { status: json.error.code }));
          const text = json.choices?.[0]?.message?.content;
          if (!text) return reject(new Error('Empty response'));
          resolve(text);
        } catch (e) { reject(new Error('Parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Agentic loop ──────────────────────────────────────────────
async function runAgent(channelId, userMessage, onStatus) {
  const history = conversations.get(channelId) || [];
  history.push({ role: 'user', content: userMessage });

  let finalText = '';
  const MAX_STEPS = 6;

  for (let step = 1; step <= MAX_STEPS; step++) {
    if (onStatus) await onStatus(`🔄 Step ${step}...`);

    const aiReply = await callOpenRouter(history);
    const lines = aiReply.split('\n');
    const toolLines = lines.filter(l => l.startsWith('TOOL:'));
    const textLines = lines.filter(l => !l.startsWith('TOOL:')).join('\n').trim();

    if (toolLines.length === 0) {
      history.push({ role: 'assistant', content: aiReply });
      finalText = textLines || aiReply;
      break;
    }

    history.push({ role: 'assistant', content: aiReply });

    const results = [];
    for (const tl of toolLines) {
      const result = await executeTool(tl);
      results.push(`[${tl.slice(5).split('|')[0].trim()}]:\n${result}`);
    }

    const toolFeedback = results.join('\n\n');
    history.push({ role: 'user', content: `Tool results:\n${toolFeedback}\n\nContinue.` });

    finalText = (textLines ? textLines + '\n\n' : '') +
      results.map(r => `\`\`\`\n${r.slice(0, 600)}\n\`\`\``).join('\n');
  }

  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(channelId, history);
  return finalText || 'Done.';
}

// ── Split messages ────────────────────────────────────────────
function splitMessage(text, limit = 1900) {
  if (text.length <= limit) return [text];
  const parts = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > limit) {
      if (cur) parts.push(cur.trim());
      cur = line;
    } else cur += (cur ? '\n' : '') + line;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// ── Discord ───────────────────────────────────────────────────
discord.once(Events.ClientReady, async (client) => {
  await ensureWorkspace();
  console.log(`\n⚡ AETHER ONLINE as ${client.user.tag}`);
  console.log(`🧠 Engine: OpenRouter — ${process.env.OPENROUTER_MODEL || 'llama-3.3-70b:free'}`);
  console.log(`📡 Servers: ${client.guilds.cache.size}\n`);
  client.user.setActivity('executing tasks 🤖', { type: ActivityType.Playing });
});

discord.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === 1;
  const isMentioned = message.mentions.has(discord.user);
  const content = message.content.trim();
  const lower = content.toLowerCase();

  const shouldRespond = isDM || isMentioned ||
    ['!aether', '!clear', '!status', '!help', '!workspace'].some(p => lower.startsWith(p));

  if (!shouldRespond) return;

  if (lower === '!clear') {
    conversations.delete(message.channel.id);
    return message.reply('🗑️ Memory cleared.');
  }

  if (lower === '!workspace') {
    const files = await listFiles();
    return message.reply(`**📁 Workspace:**\n${files}`);
  }

  if (lower === '!status') {
    const h = conversations.get(message.channel.id) || [];
    return message.reply(
      `**⚡ Aether Status**\n` +
      `> Engine: \`OpenRouter\`\n` +
      `> Model: \`${process.env.OPENROUTER_MODEL || 'llama-3.3-70b:free'}\`\n` +
      `> Context: \`${h.length} messages\`\n` +
      `> Uptime: \`${Math.floor(process.uptime() / 60)}m\``
    );
  }

  if (lower === '!help') {
    return message.reply(
      `**⚡ AETHER — Autonomous AI Agent**\n\n` +
      `**What I can do:**\n` +
      `> 🌐 Browse any website\n` +
      `> 🔍 Search the web\n` +
      `> 📁 Read & write files\n` +
      `> 💻 Run terminal commands\n` +
      `> 🏗️ Build complete apps\n` +
      `> 🔬 Research any topic\n\n` +
      `**Commands:**\n` +
      `> \`!aether <task>\` — Give me any task\n` +
      `> \`!workspace\` — Show created files\n` +
      `> \`!clear\` — Reset memory\n` +
      `> \`!status\` — System info\n\n` +
      `**Examples:**\n` +
      `> \`!aether search for latest AI news\`\n` +
      `> \`!aether browse https://github.com/trending\`\n` +
      `> \`!aether build a complete Express API with auth\`\n` +
      `> \`!aether research best free hosting platforms 2026\``
    );
  }

  let task = content.replace(/^!aether\s*/i, '').replace(/<@!?\d+>/g, '').trim();
  if (!task) return message.reply('Give me a task! Try: `!aether search for AI news`');

  await message.channel.sendTyping();
  const typingInterval = setInterval(() => message.channel.sendTyping(), 8000);
  let statusMsg = null;

  try {
    statusMsg = await message.reply('⚡ **Aether on it...**');

    const reply = await runAgent(message.channel.id, task, async (s) => {
      if (statusMsg) await statusMsg.edit(s).catch(() => {});
    });

    clearInterval(typingInterval);
    if (statusMsg) await statusMsg.edit('✅ **Done.**').catch(() => {});

    const parts = splitMessage(reply);
    for (const part of parts) {
      if (part.trim()) await message.channel.send(part);
    }
  } catch (err) {
    clearInterval(typingInterval);
    console.error('Error:', err.message);
    const errMsg = `❌ **Error:** \`${err.message}\``;
    if (statusMsg) await statusMsg.edit(errMsg).catch(() => {});
    else await message.reply(errMsg);
  }
});

process.on('SIGTERM', () => { discord.destroy(); process.exit(0); });
process.on('SIGINT', () => { discord.destroy(); process.exit(0); });
process.on('uncaughtException', (e) => console.error('⚠️', e.message));
process.on('unhandledRejection', (r) => console.error('⚠️', r));

discord.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error('❌ Login failed:', e.message);
  process.exit(1);
});
