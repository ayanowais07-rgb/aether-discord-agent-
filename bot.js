// ============================================================
//  AETHER v4.0 — Autonomous AI Agent + Browser Control
//  Engine: OpenRouter FREE | Discord.js v14 | Puppeteer
// ============================================================

require('dotenv').config();
const { Client, GatewayIntentBits, Events, ActivityType } = require('discord.js');
const https = require('https');
const http = require('http');
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
let browser = null;
let browserPage = null;

async function ensureWorkspace() {
  try { await fs.mkdir(WORKSPACE, { recursive: true }); } catch {}
}

// ── Browser Management ────────────────────────────────────────
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  try {
    let launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
      ]
    };
    // Try chrome-aws-lambda (Railway/serverless environment)
    try {
      const chromium = require('chrome-aws-lambda');
      launchOptions.executablePath = await chromium.executablePath;
      launchOptions.args = [...(chromium.args || []), ...launchOptions.args];
      browser = await chromium.puppeteer.launch(launchOptions);
    } catch {
      // Fallback: puppeteer-core with system Chrome
      const puppeteer = require('puppeteer-core');
      launchOptions.executablePath =
        process.env.CHROME_PATH ||
        '/usr/bin/google-chrome-stable' ||
        '/usr/bin/chromium-browser' ||
        '/usr/bin/chromium';
      browser = await puppeteer.launch(launchOptions);
    }
    console.log('🖥️ Browser launched successfully');
    return browser;
  } catch (e) {
    console.warn('⚠️ Browser launch failed:', e.message);
    throw new Error('Browser unavailable on this server. Using fetch fallback.');
  }
}

async function getPage() {
  const b = await getBrowser();
  if (!browserPage || browserPage.isClosed()) {
    browserPage = await b.newPage();
    await browserPage.setViewport({ width: 1280, height: 800 });
    await browserPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
  }
  return browserPage;
}

// ── TOOLS ─────────────────────────────────────────────────────

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
        while ((m = titleRe.exec(data)) && count < 8) {
          const t = m[1].replace(/<[^>]+>/g, '').trim();
          if (t) { results.push(`• ${t}`); count++; }
        }
        let s, sc = 0;
        while ((s = snippetRe.exec(data)) && sc < 5) {
          const sn = s[1].replace(/<[^>]+>/g, '').trim();
          if (sn) { results.push(`  → ${sn}`); sc++; }
        }
        resolve(`🔍 Search: "${query}"\n\n${results.join('\n') || 'No results found'}`);
      });
    }).on('error', e => resolve(`Search error: ${e.message}`));
  });
}

async function fetchURL(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const text = data
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ').trim().slice(0, 3000);
        resolve(`🌐 ${url}\n\n${text}`);
      });
    });
    req.on('error', e => resolve(`Fetch error: ${e.message}`));
    req.setTimeout(12000, () => { req.destroy(); resolve('Timeout'); });
  });
}

async function browserOpen(url) {
  try {
    const page = await getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2000));
    const title = await page.title();
    const text = await page.evaluate(() => {
      document.querySelectorAll('script,style,nav,footer,header').forEach(el => el.remove());
      return (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
    });
    return `🖥️ Opened: ${url}\nTitle: ${title}\n\n${text}`;
  } catch (e) {
    console.warn('Browser open failed, using fetch:', e.message);
    return fetchURL(url);
  }
}

async function browserClick(selector) {
  try {
    const page = await getPage();
    await page.waitForSelector(selector, { timeout: 8000 });
    await page.click(selector);
    await new Promise(r => setTimeout(r, 1500));
    return `✅ Clicked: "${selector}" | Now at: ${page.url()}`;
  } catch (e) { return `Click error: ${e.message}`; }
}

async function browserType(selector, text) {
  try {
    const page = await getPage();
    await page.waitForSelector(selector, { timeout: 8000 });
    await page.click(selector);
    await page.type(selector, text, { delay: 50 });
    return `✅ Typed "${text}" into "${selector}"`;
  } catch (e) { return `Type error: ${e.message}`; }
}

async function browserScroll() {
  try {
    const page = await getPage();
    await page.evaluate(() => window.scrollBy(0, 800));
    await new Promise(r => setTimeout(r, 1000));
    const text = await page.evaluate(() =>
      (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
    );
    return `✅ Scrolled\n\n${text}`;
  } catch (e) { return `Scroll error: ${e.message}`; }
}

async function browserRead() {
  try {
    const page = await getPage();
    const title = await page.title();
    const url = page.url();
    const text = await page.evaluate(() =>
      (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
    );
    return `📸 Page: ${title}\nURL: ${url}\n\n${text}`;
  } catch (e) { return `Read error: ${e.message}`; }
}

async function writeFile(filename, content) {
  try {
    const full = path.join(WORKSPACE, filename);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf8');
    return `✅ Written: ${filename} (${content.length} chars)`;
  } catch (e) { return `Write error: ${e.message}`; }
}

async function readFile(filename) {
  try {
    const content = await fs.readFile(path.join(WORKSPACE, filename), 'utf8');
    return `📄 ${filename}:\n${content.slice(0, 2000)}`;
  } catch (e) { return `Read error: ${e.message}`; }
}

async function runCmd(cmd) {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: WORKSPACE, timeout: 30000 });
    return (stdout + (stderr ? `\nSTDERR: ${stderr}` : '')).slice(0, 2000) || '(no output)';
  } catch (e) { return `CMD error: ${e.message.slice(0, 500)}`; }
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
  console.log(`🔧 ${tool} | ${args[0]?.slice(0, 60) || ''}`);
  switch (tool) {
    case 'WEB_SEARCH':     return await webSearch(args.join(' '));
    case 'FETCH_URL':      return await fetchURL(args[0]);
    case 'BROWSER_OPEN':   return await browserOpen(args[0]);
    case 'BROWSER_CLICK':  return await browserClick(args[0]);
    case 'BROWSER_TYPE':   return await browserType(args[0], args[1]);
    case 'BROWSER_SCROLL': return await browserScroll();
    case 'BROWSER_READ':   return await browserRead();
    case 'WRITE_FILE':     return await writeFile(args[0], args.slice(1).join('|'));
    case 'READ_FILE':      return await readFile(args[0]);
    case 'RUN_CMD':        return await runCmd(args.join(' '));
    case 'LIST_FILES':     return await listFiles();
    default: return `Unknown tool: ${tool}`;
  }
}

// ── System Prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Aether, an elite fully autonomous AI Employee, Browser Agent, and Full-Stack Engineer. You ACTUALLY execute tasks — you are not a chatbot.

## TOOLS (use EXACTLY this format, one per line)

TOOL: WEB_SEARCH | search query here
TOOL: FETCH_URL | https://example.com
TOOL: BROWSER_OPEN | https://example.com
TOOL: BROWSER_CLICK | css-selector
TOOL: BROWSER_TYPE | css-selector | text
TOOL: BROWSER_SCROLL
TOOL: BROWSER_READ
TOOL: WRITE_FILE | filename.js | full file content
TOOL: READ_FILE | filename.js
TOOL: RUN_CMD | npm install express
TOOL: LIST_FILES

## RULES
- ALWAYS use tools to actually do work
- Chain tools to complete complex tasks step by step
- Write COMPLETE code — no TODOs, no placeholders
- When browser fails, automatically fall back to FETCH_URL
- Own every error, fix it, retry

## IDENTITY
- Name: Aether | Role: AI Employee — Engineer, Researcher, Browser Agent
- 24/7 autonomous execution engine
- Discord markdown + code blocks in all responses

System online. Aether fully operational.`;

// ── OpenRouter API ────────────────────────────────────────────
async function callOpenRouter(messages) {
  const body = JSON.stringify({
    model: process.env.OPENROUTER_MODEL || 'openrouter/free',
    max_tokens: 2048,
    temperature: 0.7,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages]
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

// ── Agentic Loop ──────────────────────────────────────────────
async function runAgent(channelId, userMessage, onStatus) {
  const history = conversations.get(channelId) || [];
  history.push({ role: 'user', content: userMessage });
  let finalText = '';

  for (let step = 1; step <= 8; step++) {
    if (onStatus) await onStatus(`🔄 Step ${step}/8...`);
    const aiReply = await callOpenRouter(history);
    const lines = aiReply.split('\n');
    const toolLines = lines.filter(l => l.trim().startsWith('TOOL:'));
    const textLines = lines.filter(l => !l.trim().startsWith('TOOL:')).join('\n').trim();

    if (toolLines.length === 0) {
      history.push({ role: 'assistant', content: aiReply });
      finalText = textLines || aiReply;
      break;
    }

    history.push({ role: 'assistant', content: aiReply });
    const results = [];
    for (const tl of toolLines) {
      const toolName = tl.slice(5).split('|')[0].trim();
      if (onStatus) await onStatus(`🔧 Running ${toolName}...`);
      const result = await executeTool(tl.trim());
      results.push({ tool: toolName, result });
    }

    const feedback = results.map(r => `[${r.tool}]:\n${r.result}`).join('\n\n');
    history.push({ role: 'user', content: `Tool results:\n${feedback}\n\nContinue.` });
    finalText = (textLines ? textLines + '\n\n' : '') +
      results.map(r => `**[${r.tool}]**\n\`\`\`\n${r.result.slice(0, 700)}\n\`\`\``).join('\n');
  }

  while (history.length > MAX_HISTORY) history.shift();
  conversations.set(channelId, history);
  return finalText || '✅ Done.';
}

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
  console.log(`\n⚡ AETHER v4.0 ONLINE as ${client.user.tag}`);
  console.log(`🧠 Model: ${process.env.OPENROUTER_MODEL || 'openrouter/free'}`);
  console.log(`📡 Servers: ${client.guilds.cache.size}\n`);
  client.user.setActivity('browsing & building 🤖', { type: ActivityType.Playing });
});

discord.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  const isDM = message.channel.type === 1;
  const isMentioned = message.mentions.has(discord.user);
  const content = message.content.trim();
  const lower = content.toLowerCase();

  const shouldRespond = isDM || isMentioned ||
    ['!aether', '!clear', '!status', '!help', '!workspace', '!browser'].some(p => lower.startsWith(p));
  if (!shouldRespond) return;

  if (lower === '!clear') {
    conversations.delete(message.channel.id);
    return message.reply('🗑️ Memory cleared.');
  }
  if (lower === '!workspace') {
    return message.reply(`**📁 Workspace:**\n${await listFiles()}`);
  }
  if (lower === '!browser') {
    return message.reply(await browserRead().catch(e => '⚪ No browser session: ' + e.message));
  }
  if (lower === '!status') {
    const h = conversations.get(message.channel.id) || [];
    return message.reply(
      `**⚡ Aether v4.0**\n` +
      `> Model: \`${process.env.OPENROUTER_MODEL || 'openrouter/free'}\`\n` +
      `> Browser: \`${browser?.isConnected() ? '🟢 Active' : '⚪ Standby'}\`\n` +
      `> Context: \`${h.length} msgs\`\n` +
      `> Uptime: \`${Math.floor(process.uptime() / 60)}m\``
    );
  }
  if (lower === '!help') {
    return message.reply(
      `**⚡ AETHER v4.0 — Autonomous Browser Agent**\n\n` +
      `🌐 Browse & click real websites\n` +
      `🔍 Search the web\n` +
      `🏗️ Build complete apps\n` +
      `📁 Read & write files\n` +
      `💻 Run terminal commands\n\n` +
      `**Commands:**\n` +
      `\`!aether <task>\` \`!browser\` \`!workspace\` \`!clear\` \`!status\`\n\n` +
      `**Try:**\n` +
      `\`!aether open github.com/trending and list top repos\`\n` +
      `\`!aether search latest AI news and summarize\`\n` +
      `\`!aether build a full Express REST API\``
    );
  }

  let task = content.replace(/^!aether\s*/i, '').replace(/<@!?\d+>/g, '').trim();
  if (!task) return message.reply('Give me a task! Try: `!aether open github.com and find trending repos`');

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
    for (const part of parts) if (part.trim()) await message.channel.send(part);
  } catch (err) {
    clearInterval(typingInterval);
    console.error('Error:', err.message);
    const msg = `❌ **Error:** \`${err.message}\``;
    if (statusMsg) await statusMsg.edit(msg).catch(() => {});
    else await message.reply(msg);
  }
});

process.on('SIGTERM', async () => { if (browser) await browser.close().catch(() => {}); discord.destroy(); process.exit(0); });
process.on('SIGINT', async () => { if (browser) await browser.close().catch(() => {}); discord.destroy(); process.exit(0); });
process.on('uncaughtException', (e) => console.error('⚠️', e.message));
process.on('unhandledRejection', (r) => console.error('⚠️', r));

discord.login(process.env.DISCORD_TOKEN).catch((e) => { console.error('❌', e.message); process.exit(1); });
