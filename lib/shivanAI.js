// lib/shivanAI.js
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const pm2Manager = require('./pm2Manager');
const shellEngine = require('./shellEngine');

function getClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set in .env');
  }
  return new Groq({ apiKey });
}

const SYSTEM_PROMPT = `You are Shivan, the AI agent inside CYBER X CLOUD — a hosting panel for WhatsApp bots and Node.js/Python apps. You read real code and real logs from the user's deployed app and help debug it. Be direct and specific. When you spot a bug, say exactly what line/file it's in and what the fix is. If asked to fix code, output the corrected code in a fenced code block with the filename as a comment on the first line. Keep explanations short.`;

async function chat(userId, message, context = {}) {
  const client = getClient();
  let contextBlock = '';
  if (context.includeLogs && context.appName) {
    const logsResult = await pm2Manager.getLogs(userId, context.appName, 80);
    if (logsResult.ok) {
      contextBlock += `\n\n--- Recent logs for ${context.appName} ---\n${logsResult.output}`;
    }
  }
  if (context.filePath) {
    try {
      const root = shellEngine.getRoot(userId);
      const fullPath = path.resolve(root, context.filePath);
      if (fullPath.startsWith(root) && fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        contextBlock += `\n\n--- File: ${context.filePath} ---\n${content.slice(0, 8000)}`;
      }
    } catch (e) {}
  }

  const completion = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message + contextBlock }
    ],
    temperature: 0.4,
    max_tokens: 2000
  });

  return completion.choices[0]?.message?.content || '(no response)';
}

function applyFix(userId, filePath, newContent) {
  const root = shellEngine.getRoot(userId);
  const fullPath = path.resolve(root, filePath);
  if (!fullPath.startsWith(root)) {
    return { ok: false, error: 'path escapes workspace' };
  }
  fs.writeFileSync(fullPath, newContent, 'utf8');
  return { ok: true };
}

module.exports = { chat, applyFix };
