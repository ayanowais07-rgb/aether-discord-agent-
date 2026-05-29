// ============================================================
//  AETHER AUTONOMOUS AGENT — Full Computer-Use AI Employee
//  Capabilities: File I/O, Web Browse, Code Execute, Deploy,
//  Research, App Build, Sub-Agents, Discord Control
//  Engine: Google Gemini (FREE)
// ============================================================

require('dotenv').config();
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { promisify } = require('util');
const execAsync = promisify(exec);

// ── Discord Client ────────────────────────────────────────────
const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// ── State ─────────────────────────────────────────────────────
const conversations = new Map();
const activeProcesses = new Map();
const WORKSPACE = process.env.WORKSPACE_DIR || path.join(process.env.HOME || '.', 'aether-workspace');
const MAX_HISTORY = 30;

// ── Ensure workspace exists ───────────────────────────────────
async function ensureWorkspace() {
  try { await fs.mkdir(WORKSPACE, { recursive: true }); } catch {}
}

// ── TOOL DEFINITIONS (what Aether can do) ─────────────────────
const TOOLS = {

  // Read a file
  async readFile(filePath) {
    try {
      const full = path.resolve(WORKSPACE, filePath);
      const content = await fs.readFile(full, 'utf8');
      return `FILE: ${filePath}\n${content}`;
    } catch (e) { return `ERROR reading file: ${e.message}`; }
  },

  // Write a file
  async writeFile(filePath, content) {
    try {
      const full = path.resolve(WORKSPACE, filePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, content, 'utf8');
      return `✅ Written: ${filePath} (${content.length} bytes)`;
    } catch (e) { return `ERROR writing file: ${e.message}`; }
  },

  // List directory
  async listDir(dirPath = '.') {
    try {
      const full = path.resolve(WORKSPACE, dirPath);
      const entries = await fs.readdir(full, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
    } catch (e) { return `ERROR listing dir: ${e.message}`; }
  },

  // Execute terminal command
  async runCommand(cmd, timeout = 30000) {
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: WORKSPACE, timeout,
        env: { ...process.env, PATH: process.env.PATH }
      });
      return (stdout + (stderr ? `\nSTDERR: ${stderr}` : '')).slice(0, 2000);
    } catch (e) { return `CMD ERROR: ${e.message.slice(0, 500)}`; }
  },

  // Fetch a URL / browse the web
  async fetchURL(url) {
    return new Promise((resolve) => {
      try {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 AetherBot/2.0' } }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            // Strip HTML tags for readable text
            const text = data
              .replace(/<script[\s\S]*?<\/script>/gi, '')
              .replace(/<style[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 3000);
            resolve(`URL: ${url}\n\n${text}`);
          });
        });
        req.on('error', e => resolve(`FETCH ERROR: ${e.message}`));
        req.setTimeout(10000, () => { req.destroy(); resolve('TIMEOUT fetching URL'); });
      } catch (e) { resolve(`FETCH ERROR: ${e.message}`); }
    });
  },

  // Web search via DuckDuckGo
  async webSearch(query) {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;
    return new Promise((resolve) => {
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          const results = [];
          const regex = /class="result__title"[^>]*>([\s\S]*?)<\/[ah]/gi;
          const snippets = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
          let m; let count = 0;
          while ((m = regex.exec(data)) && count < 8) {
            const title = m[1].replace(/<[^>]+>/g, '').trim();
            if (title) { results.push(title); count++; }
          }
          let s; let scount = 0;
          while ((s = snippets.exec(data)) && scount < 5) {
            const snip = s[1].replace(/<[^>]+>/g, '').trim();
            if (snip) { results.push('  → ' + snip); scount++; }
          }
          resolve(`SEARCH: "${query}"\n${results.join('\n') || 'No results found'}`);
        });
      }).on('error', e => resolve(`SEARCH ERROR: ${e.message}`));
    });
  },

  // Create a full Node.js project
  async createProject(name, type = 'node') {
    const projDir = path.join(WORKSPACE, name);
    await fs.mkdir(projDir, { recursive: true });
    if (type === 'node') {
      await execAsync(`cd "${projDir}" && npm init -y`, { timeout: 15000 });
    }
    return `✅ Project "${name}" created at ${projDir}`;
  },

  // Install npm packages
  async installPackages(packages, projDir = '.') {
    const dir = path.resolve(WORKSPACE, projDir);
    const { stdout } = await execAsync(`cd "${dir}" && npm install ${packages}`, { timeout: 60000 });
    return `✅ Installed: ${packages}\n${stdout.slice(0, 500)}`;
  },

  // Deploy to Netlify (drop folder)
  async deployNetlify(folder) {
    const dir = path.resolve(WORKSPACE, folder);
    try {
      const { stdout } = await execAsync(`cd "${dir}" && npx netlify-cli deploy --prod --dir . 2>&1`, { timeout: 120000 });
      return `✅ Deployed!\n${stdout.slice(0, 1000)}`;
    } catch (e) { return `Deploy info: ${e.message.slice(0, 500)}`; }
  },

  // Spawn a sub-agent for a background task
  async spawnSubAgent(taskName, command) {
    const proc = spawn('bash', ['-c', command], {
      cwd: WORKSPACE, detached: false,
      env: { ...process.env }
    });
    activeProcesses.set(taskName, proc);
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => output += d.toString());
    await new Promise(r => setTimeout(r, 3000));
    return `🤖 Sub-agent "${taskName}" spawned.\nInitial output:\n${output.slice(0, 500)}`;
  },

  // List running sub-agents
  listSubAgents() {
    const agents = [...activeProcesses.entries()].map(([name]) => `🤖 ${name}`);
    return agents.length ? agents.join('\n') : 'No sub-agents running.';
  },

  // Kill a sub-agent
  killSubAgent(name) {
    const proc = activeProcesses.get(name);
    if (!proc) return `No sub-agent named "${name}"`;
    proc.kill();
    activeProcesses.delete(name);
    return `✅ Sub-agent "${name}" terminated.`;
  },

  // Get system info
  async sysInfo() {
    const { stdout } = await execAsync('node --version && npm --version && echo "Platform: $(uname -s 2>/dev/null || echo Windows)"').catch(() => ({ stdout: 'info unavailable' }));
    return `SYSTEM INFO:\nWorkspace: ${WORKSPACE}\n${stdout}`;
  },
};

// ── SYSTEM PROMPT WITH TOOL INSTRUCTIONS ─────────────────────
const SYSTEM_PROMPT = `You are Aether, a fully autonomous AI Employee and Computer-Use Agent. You are NOT a chatbot. You are a proactive execution engine that actually does work using real tools.

## YOUR CAPABILITIES (USE THEM PROACTIVELY)
You have access to these real tools that execute on the user's system:

1. **READ_FILE(path)** — Read any file in workspace
2. **WRITE_FILE(path, content)** — Create/edit files
3. **LIST_DIR(path)** — List directory contents
4. **RUN_CMD(command)** — Execute ANY terminal command (npm, node, python, git, etc)
5. **FETCH_URL(url)** — Browse any website and read its content
6. **WEB_SEARCH(query)** — Search the web via DuckDuckGo
7. **CREATE_PROJECT(name, type)** — Scaffold a new project
8. **INSTALL_PACKAGES(packages, dir)** — Install npm packages
9. **SPAWN_SUB_AGENT(name, command)** — Deploy a sub-agent for background tasks
10. **LIST_SUB_AGENTS()** — List running sub-agents
11. **KILL_SUB_AGENT(name)** — Stop a sub-agent
12. **SYS_INFO()** — Get system information

## HOW TO USE TOOLS
When you need to use a tool, output it in this EXACT format on its own line:
TOOL: TOOL_NAME | argument1 | argument2

Examples:
TOOL: WEB_SEARCH | latest React 19 features
TOOL: WRITE_FILE | src/app.js | const express = require('express')...
TOOL: RUN_CMD | npm install express
TOOL: FETCH_URL | https://docs.github.com
TOOL: SPAWN_SUB_AGENT | server | node server.js

## RULES
- ALWAYS use tools to actually do work, don't just describe what you would do
- Chain multiple tool calls to complete complex tasks
- After tool results, continue working toward the goal
- Build COMPLETE, WORKING code — no placeholders, no TODOs
- Own every error — if something fails, fix it and retry
- Be concise in explanations, verbose in actual work
- You can browse websites, write code, run it, fix bugs, deploy it — ALL autonomously
- When asked to research something, ACTUALLY search the web and read results
- When asked to build something, ACTUALLY write all the files

## IDENTITY
- Name: Aether
- Role: Principal Engineer, Architect, Researcher, Project Manager
- You work 24/7, never complain, always execute
- You are the user's digital employee — do whatever they need done`;

// ── Call Gemini API ───────────────────────────────────────────
async function callGemini(messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: messages,
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(Object.assign(new Error(json.error.message), { status: json.error.code }));
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) return reject(new Error('Empty response from Gemini'));
          resolve(text);
        } catch (e) { reject(new Error('Failed to parse Gemini response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Gemini request timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Parse and execute tool calls from AI response ─────────────
async function executeTools(response) {
  const lines = response.split('\n');
  const toolResults = [];
  const nonToolLines = [];

  for (const line of lines) {
    if (line.startsWith('TOOL:')) {
      const parts = line.slice(5).split('|').map(s => s.trim());
      const toolName = parts[0];
      const args = parts.slice(1);
      let result = '';

      try {
        switch (toolName) {
          case 'READ_FILE':       result = await TOOLS.readFile(args[0]); break;
          case 'WRITE_FILE':      result = await TOOLS.writeFile(args[0], args.slice(1).join('|')); break;
          case 'LIST_DIR':        result = await TOOLS.listDir(args[0]); break;
          case 'RUN_CMD':         result = await TOOLS.runCommand(args.join(' ')); break;
          case 'FETCH_URL':       result = await TOOLS.fetchURL(args[0]); break;
          case 'WEB_SEARCH':      result = await TOOLS.webSearch(args.join(' ')); break;
          case 'CREATE_PROJECT':  result = await TOOLS.createProject(args[0], args[1]); break;
          case 'INSTALL_PACKAGES':result = await TOOLS.installPackages(args[0], args[1]); break;
          case 'SPAWN_SUB_AGENT': result = await TOOLS.spawnSubAgent(args[0], args.slice(1).join(' ')); break;
          case 'LIST_SUB_AGENTS': result = TOOLS.listSubAgents(); break;
          case 'KILL_SUB_AGENT':  result = TOOLS.killSubAgent(args[0]); break;
          case 'SYS_INFO':        result = await TOOLS.sysInfo(); break;
          default: result = `Unknown tool: ${toolName}`;
        }
      } catch (e) { result = `Tool error: ${e.message}`; }

      toolResults.push({ tool: toolName, result });
    } else {
      nonToolLines.push(line);
    }
  }

  return { text: nonToolLines.join('\n').trim(), toolResults };
}

// ── Agentic loop — keeps working until task is done ───────────
async function runAgent(conversationId, userMessage, statusCallback) {
  const history = conversations.get(conversationId) || [];
  history.push({ role: 'user', parts: [{ text: userMessage }] });

  let iterations = 0;
  const MAX_ITERATIONS = 8;
  let finalResponse = '';

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    if (statusCallback) await statusCallback(`🔄 Working... (step ${iterations})`);

    let aiResponse;
    try {
      aiResponse = await callGemini(history);
    } catch (e) {
      return `❌ AI Error: ${e.message}`;
    }

    const { text, toolResults } = await executeTools(aiResponse);

    if (toolResults.length === 0) {
      // No more tools — we're done
      finalResponse = text || aiResponse;
      history.push({ role: 'model', parts: [{ text: aiResponse }] });
      break;
    }

    // Add AI response to history
    history.push({ role: 'model', parts: [{ text: aiResponse }] });

    // Add tool results back as context for next iteration
    const toolSummary = toolResults.map(t => `[${t.tool} RESULT]:\n${t.result}`).join('\n\n');
    history.push({ role: 'user', parts: [{ text: `Tool results:\n${toolSummary}\n\nContinue with the task based on these results.` }] });

    finalResponse = text + (toolResults.length ? '\n\n' + toolResults.map(t => `**[${t.tool}]**\n\`\`\`\n${t.result.slice(0, 800)}\n\`\`\``).join('\n') : '');
  }

  // Trim history
  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(conversationId, history);

  return finalResponse || 'Task completed.';
}

// ── Split long Discord messages ───────────────────────────────
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
discord.once(Events.ClientReady, async (client) => {
  await ensureWorkspace();
  console.log(`\n⚡ AETHER AUTONOMOUS AGENT ONLINE`);
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);
  console.log(`📁 Workspace: ${WORKSPACE}`);
  console.log(`🧠 Engine: Gemini ${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}\n`);
  client.user.setActivity('executing tasks 🤖', { type: ActivityType.Playing });
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
    lower.startsWith('!agents') ||
    lower.startsWith('!help') ||
    lower.startsWith('!kill') ||
    lower.startsWith('!workspace');

  if (!shouldRespond) return;

  // ── Built-in commands ───────────────────────────────────────
  if (lower === '!clear') {
    conversations.delete(message.channel.id);
    return message.reply('🗑️ Memory cleared. Fresh start.');
  }

  if (lower === '!agents') {
    return message.reply(`**Running Sub-Agents:**\n${TOOLS.listSubAgents()}`);
  }

  if (lower.startsWith('!kill ')) {
    const name = content.slice(6).trim();
    return message.reply(TOOLS.killSubAgent(name));
  }

  if (lower === '!workspace') {
    const listing = await TOOLS.listDir('.');
    return message.reply(`**📁 Workspace:** \`${WORKSPACE}\`\n${listing || 'Empty'}`);
  }

  if (lower === '!status') {
    const history = conversations.get(message.channel.id) || [];
    const sysInfo = await TOOLS.sysInfo();
    return message.reply(
      `**⚡ AETHER AGENT STATUS**\n` +
      `> Engine: \`Gemini ${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}\`\n` +
      `> Context: \`${history.length} messages\`\n` +
      `> Sub-agents: \`${activeProcesses.size} running\`\n` +
      `> Uptime: \`${Math.floor(process.uptime() / 60)}m\`\n` +
      `> Workspace: \`${WORKSPACE}\`\n\`\`\`\n${sysInfo}\n\`\`\``
    );
  }

  if (lower === '!help') {
    return message.reply(
      `**⚡ AETHER — Autonomous AI Agent**\n\n` +
      `**What I can do:**\n` +
      `> 🌐 Browse any website\n` +
      `> 🔍 Search the web\n` +
      `> 📁 Read & write files\n` +
      `> 💻 Execute terminal commands\n` +
      `> 🏗️ Build full apps & projects\n` +
      `> 🤖 Deploy sub-agents for background tasks\n` +
      `> 📦 Install packages & dependencies\n\n` +
      `**Commands:**\n` +
      `> \`!aether <task>\` — Give me any task\n` +
      `> \`!workspace\` — Show workspace files\n` +
      `> \`!agents\` — List running sub-agents\n` +
      `> \`!kill <name>\` — Stop a sub-agent\n` +
      `> \`!status\` — System status\n` +
      `> \`!clear\` — Reset memory\n\n` +
      `**Example tasks:**\n` +
      `> \`!aether search the web for latest AI news\`\n` +
      `> \`!aether build a todo app with Express and save all files\`\n` +
      `> \`!aether browse https://github.com and tell me whats trending\`\n` +
      `> \`!aether create a Python web scraper and run it\``
    );
  }

  // ── Extract task ────────────────────────────────────────────
  let task = content
    .replace(/^!aether\s*/i, '')
    .replace(/<@!?\d+>/g, '')
    .trim();

  if (!task) return message.reply('Give me a task! Try: `!aether search the web for AI news`');

  // ── Show typing & run agent ───────────────────────────────
  await message.channel.sendTyping();
  const typingInterval = setInterval(() => message.channel.sendTyping(), 8000);
  let statusMsg = null;

  try {
    // Send initial status message
    statusMsg = await message.reply('⚡ **Aether activated.** Executing task...');

    const reply = await runAgent(
      message.channel.id,
      task,
      async (status) => {
        if (statusMsg) {
          await statusMsg.edit(status).catch(() => {});
        }
      }
    );

    clearInterval(typingInterval);

    // Edit status to done, then send full response
    if (statusMsg) await statusMsg.edit('✅ **Task complete.**').catch(() => {});

    const parts = splitMessage(reply);
    for (const part of parts) {
      if (part.trim()) await message.channel.send(part);
    }

  } catch (err) {
    clearInterval(typingInterval);
    console.error('Agent error:', err);
    if (statusMsg) await statusMsg.edit(`❌ Error: ${err.message}`).catch(() => {});
    else await message.reply(`❌ **Error:** \`${err.message}\``);
  }
});

// ── Graceful shutdown ─────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n⚠️ ${signal} — shutting down all sub-agents...`);
  for (const [name, proc] of activeProcesses) {
    proc.kill();
    console.log(`  Killed sub-agent: ${name}`);
  }
  discord.destroy();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (e) => console.error('⚠️ Uncaught:', e.message));
process.on('unhandledRejection', (r) => console.error('⚠️ Rejection:', r));

// ── Launch ────────────────────────────────────────────────────
discord.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error('❌ Discord login failed:', e.message);
  process.exit(1);
});
