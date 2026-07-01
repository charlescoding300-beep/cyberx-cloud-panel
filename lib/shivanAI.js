// lib/shivanAI.js
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const pm2Manager = require('./pm2Manager');
const shellEngine = require('./shellEngine');

function getClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set in .env');
  return new Groq({ apiKey });
}

const SYSTEM_PROMPT = `You are Shivan, the AI agent inside CYBER X CLOUD — a hosting panel for WhatsApp bots and Node.js/Python apps. You read real code and real logs from the user's deployed app and help debug it. Be direct and specific. When you spot a bug, say exactly what line/file it's in and what the fix is. If asked to fix code, output the corrected code in a fenced code block with the filename as a comment on the first line. Keep explanations short. You have already been shown a scan of the user's actual workspace — use it to speak specifically about their real project instead of asking generic questions.`;

function scanWorkspace(userId) {
  const root = shellEngine.getRoot(userId);
  const summary = { files: [], packageInfo: null, mainFileContent: null, mainFileName: null };
  try {
    const walk = (dir, depth, prefix) => {
      if (depth > 2) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        summary.files.push(relPath + (entry.isDirectory() ? '/' : ''));
        if (entry.isDirectory() && summary.files.length < 60) {
          walk(path.join(dir, entry.name), depth + 1, relPath);
        }
      }
    };
    walk(root, 0, '');
  } catch (e) {}
  try {
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      summary.packageInfo = { name: pkg.name, main: pkg.main, dependencies: Object.keys(pkg.dependencies || {}), scripts: pkg.scripts };
      const mainFile = pkg.main || 'index.js';
      const mainPath = path.join(root, mainFile);
      if (fs.existsSync(mainPath)) {
        summary.mainFileName = mainFile;
        summary.mainFileContent = fs.readFileSync(mainPath, 'utf8').slice(0, 4000);
      }
    }
  } catch (e) {}
  return summary;
}

function buildWorkspaceContextBlock(userId) {
  const scan = scanWorkspace(userId);
  let block = '\n\n--- User\'s actual workspace scan ---\n';
  if (!scan.files.length) {
    block += 'Workspace is currently empty — no files uploaded or deployed yet.\n';
    return block;
  }
  block += `Files/folders (top levels):\n${scan.files.slice(0, 40).join('\n')}\n`;
  if (scan.packageInfo) {
    block += `\npackage.json: name="${scan.packageInfo.name}", main="${scan.packageInfo.main}"\n`;
    block += `Dependencies: ${scan.packageInfo.dependencies.join(', ') || 'none'}\n`;
  }
  if (scan.mainFileContent) {
    block += `\n--- Main entry file (${scan.mainFileName}) ---\n${scan.mainFileContent}\n`;
  }
  return block;
}

async function chat(userId, message, context = {}) {
  const client = getClient();
  let contextBlock = buildWorkspaceContextBlock(userId);
  if (context.includeLogs && context.appName) {
    const logsResult = await pm2Manager.getLogs(userId, context.appName, 80);
    if (logsResult.ok) contextBlock += `\n\n--- Recent logs for ${context.appName} ---\n${logsResult.output}`;
  }
  if (context.filePath) {
    try {
      const root = shellEngine.getRoot(userId);
      const fullPath = path.resolve(root, context.filePath);
      if (fullPath.startsWith(root) && fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        contextBlock += `\n\n--- Requested file: ${context.filePath} ---\n${content.slice(0, 8000)}`;
      }
    } catch (e) {}
  }
  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: message + contextBlock }],
    temperature: 0.4,
    max_tokens: 2000
  });
  return completion.choices[0]?.message?.content || '(no response)';
}

async function getWelcomeMessage(userId) {
  const scan = scanWorkspace(userId);
  if (!scan.files.length) {
    return "I'm Shivan, your AI agent. Your workspace is empty right now — deploy a bot from GitHub or upload your files, and I'll read through your actual code to help you debug and build.";
  }
  try {
    const client = getClient();
    const contextBlock = buildWorkspaceContextBlock(userId);
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Based on the workspace scan below, greet the user with 2-3 sentences that show you've actually looked at their project — mention what kind of project it looks like and one specific thing you noticed. Keep it short and direct, no fluff.${contextBlock}` }
      ],
      temperature: 0.5,
      max_tokens: 200
    });
    return completion.choices[0]?.message?.content || "I've scanned your workspace and I'm ready to help.";
  } catch (e) {
    return "I'm Shivan. I can see your workspace has files, but I couldn't reach the AI model just now — try asking me something and I'll retry.";
  }
}

function applyFix(userId, filePath, newContent) {
  const root = shellEngine.getRoot(userId);
  const fullPath = path.resolve(root, filePath);
  if (!fullPath.startsWith(root)) return { ok: false, error: 'path escapes workspace' };
  fs.writeFileSync(fullPath, newContent, 'utf8');
  return { ok: true };
}

module.exports = { chat, applyFix, getWelcomeMessage, scanWorkspace };
