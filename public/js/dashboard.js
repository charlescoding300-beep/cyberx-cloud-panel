const S = window.CYBERX_SOUNDS;

const bootMsgs = ['BOOTING CYBER X CLOUD...', 'MOUNTING WORKSPACE...', 'ESTABLISHING SOCKET LINK...', 'LOADING SHIVAN AI...', 'ACCESS GRANTED'];
let bi = 0;
const bootEl = document.getElementById('boot-line');
const bootIv = setInterval(() => { bi++; if (bi < bootMsgs.length) bootEl.textContent = bootMsgs[bi]; }, 320);
S.sndBoot();
setTimeout(() => {
  clearInterval(bootIv);
  const l = document.getElementById('loader');
  l.style.opacity = '0';
  setTimeout(() => l.remove(), 500);
  S.sndBell();
}, 1700);

(function () {
  const msg = window.CYBERX_CONFIG.welcomeMessage;
  const el = document.getElementById('welcome-text');
  let i = 0, dir = 1;
  function tick() {
    el.textContent = msg.slice(0, i);
    if (dir === 1) { i++; if (i > msg.length) { dir = -1; setTimeout(tick, 1500); return; } }
    else { i = 0; dir = 1; setTimeout(tick, 200); return; }
    setTimeout(tick, 20);
  }
  tick();
})();

function navTo(s) {
  document.querySelectorAll('.section').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.nav[data-s]').forEach(x => x.classList.remove('active'));
  document.getElementById('s-' + s)?.classList.add('active');
  const nav = document.querySelector(`.nav[data-s="${s}"]`);
  if (nav) { nav.classList.add('active'); document.getElementById('page-title').textContent = nav.textContent.trim().toUpperCase(); }
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('backdrop').classList.remove('show');
  S.sndClick();
  if (s === 'filemanager') fmRefresh();
  if (s === 'apps') loadApps();
  if (s === 'env') loadEnv();
  if (s === 'sessions') loadSessions();
  if (s === 'logs') loadAppsForLogSelect();
  if (s === 'dashboard') loadDashApps();
  if (s === 'editor') initEditor();
  if (s === 'shivan') loadShivanWelcome();
}
document.querySelectorAll('.nav[data-s]').forEach(n => n.addEventListener('click', () => navTo(n.dataset.s)));
document.getElementById('mob-btn').addEventListener('click', () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('backdrop').classList.add('show'); });
document.getElementById('backdrop').addEventListener('click', () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('backdrop').classList.remove('show'); });
document.getElementById('logout-btn').addEventListener('click', async () => { S.sndClick(); await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; });

const socket = io();
socket.on('connect', () => { document.getElementById('socket-pill').innerHTML = '<span class="dot green"></span> LIVE'; });
socket.on('disconnect', () => { document.getElementById('socket-pill').innerHTML = '<span class="dot red"></span> OFFLINE'; S.sndError(); });

socket.on('stats:update', (data) => {
  document.getElementById('cpu-val').textContent = data.cpu.percent + '%';
  document.getElementById('cpu-fill').style.width = data.cpu.percent + '%';
  document.getElementById('ram-val').textContent = data.memory.percent + '%';
  document.getElementById('ram-fill').style.width = data.memory.percent + '%';
  document.getElementById('uptime-val').textContent = data.uptime.formatted;
  const tc = document.getElementById('term-cpu'); if (tc) tc.textContent = data.cpu.percent;
  const tm = document.getElementById('term-mem'); if (tm) tm.textContent = data.memory.percent;
});

function loadBotCount() {
  fetch('/api/pairing/count').then(r => r.json()).then(d => { if (d.ok) document.getElementById('bot-count').textContent = d.count; });
}
loadBotCount();
socket.on('pairing:update', (d) => { document.getElementById('bot-count').textContent = d.count; S.sndBell(); });

const termOutput = document.getElementById('term-output');
const termInput = document.getElementById('term-input');
const termPrompt = document.getElementById('term-prompt');
let currentLine = null;
const cmdHistory = []; let histIdx = -1;

function appendTermLine(text, cls) {
  const d = document.createElement('div');
  d.className = 'term-line ' + (cls || 'out');
  d.textContent = text;
  termOutput.appendChild(d);
  termOutput.scrollTop = termOutput.scrollHeight;
}

function appendOrAppendToLast(text, cls) {
  if (!currentLine || currentLine.dataset.cls !== cls) {
    currentLine = document.createElement('div');
    currentLine.className = 'term-line ' + cls;
    currentLine.dataset.cls = cls;
    termOutput.appendChild(currentLine);
  }
  currentLine.textContent += text;
  termOutput.scrollTop = termOutput.scrollHeight;
}

termInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = termInput.value;
    if (!cmd.trim()) return;
    cmdHistory.unshift(cmd); histIdx = -1;
    appendTermLine(termPrompt.textContent + ' ' + cmd, 'cmd');
    currentLine = null;
    termInput.value = '';
    S.sndClick();
    socket.emit('terminal:run', cmd);
  } else if (e.key === 'ArrowUp') {
    histIdx = Math.min(histIdx + 1, cmdHistory.length - 1);
    if (cmdHistory[histIdx]) termInput.value = cmdHistory[histIdx];
  } else if (e.key === 'ArrowDown') {
    histIdx = Math.max(histIdx - 1, -1);
    termInput.value = histIdx >= 0 ? cmdHistory[histIdx] : '';
  } else {
    S.sndKey();
  }
});

socket.on('terminal:output', (data) => {
  appendOrAppendToLast(data.chunk, data.type === 'err' ? 'err' : 'out');
});

socket.on('terminal:done', (data) => {
  currentLine = null;
  if (data.clear) { termOutput.innerHTML = ''; }
  if (data.cwd) termPrompt.textContent = data.cwd + ' $';
  if (data.exitCode === 0) S.sndTick(); else S.sndError();
});

function startDeploy() {
  S.sndClick();
  const repoUrl = document.getElementById('deploy-repo').value.trim();
  const appName = document.getElementById('deploy-name').value.trim();
  const branch = document.getElementById('deploy-branch').value.trim() || 'main';
  if (!repoUrl || !appName) { alert('Repo URL and app name required'); return; }
  const logEl = document.getElementById('deploy-log');
  logEl.innerHTML = '';
  fetch('/api/deploy/github', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoUrl, appName, branch })
  });
}

socket.on('deploy:log', (data) => {
  const logEl = document.getElementById('deploy-log');
  const d = document.createElement('div');
  d.className = 'term-line ' + (data.type === 'err' ? 'err' : data.type === 'sys' ? 'sys' : data.type === 'cmd' ? 'cmd' : 'out');
  d.textContent = data.text;
  logEl.appendChild(d);
  logEl.scrollTop = logEl.scrollHeight;
  S.sndTick();
});

socket.on('deploy:complete', (result) => {
  const logEl = document.getElementById('deploy-log');
  const d = document.createElement('div');
  d.className = 'term-line ' + (result.ok ? 'sys' : 'err');
  d.textContent = result.ok ? '>>> DEPLOY COMPLETE <<<' : '>>> DEPLOY FAILED: ' + result.error;
  logEl.appendChild(d);
  if (result.ok) S.sndSuccess(); else S.sndError();
});

function loadApps() {
  fetch('/api/deploy/apps').then(r => r.json()).then(data => {
    const el = document.getElementById('apps-list');
    if (!data.ok || !data.apps.length) { el.innerHTML = '<p class="muted">No apps deployed yet.</p>'; return; }
    el.innerHTML = data.apps.map(a => `
      <div class="dcard glass">
        <div>
          <div class="dcard-name">${a.name}</div>
          <div class="dcard-meta">PID ${a.pid || '--'} · ${a.cpu}% CPU · ${(a.memory/1024/1024).toFixed(1)}MB · ${a.restarts} restarts</div>
        </div>
        <div class="flex">
          <span class="badge ${a.status === 'online' ? 'on' : 'off'}">${a.status}</span>
          <button class="btn inline" onclick="appAction('${a.name}','restart')">Restart</button>
          <button class="btn inline red" onclick="appAction('${a.name}','stop')">Stop</button>
        </div>
      </div>`).join('');
  });
}
function appAction(name, action) {
  S.sndClick();
  fetch(`/api/deploy/apps/${encodeURIComponent(name)}/${action}`, { method: 'POST' })
    .then(r => r.json()).then(d => { if (d.ok) S.sndSuccess(); else S.sndError(); loadApps(); loadDashApps(); });
}
function loadDashApps() {
  fetch('/api/deploy/apps').then(r => r.json()).then(data => {
    const tbody = document.getElementById('dash-apps-tbody');
    if (!data.ok || !data.apps.length) { tbody.innerHTML = '<tr><td colspan="6" class="muted">No apps deployed yet.</td></tr>'; return; }
    tbody.innerHTML = data.apps.map(a => `
      <tr><td>${a.name}</td><td><span class="badge ${a.status === 'online' ? 'on' : 'off'}">${a.status}</span></td>
      <td>${a.cpu}%</td><td>${(a.memory/1024/1024).toFixed(1)}MB</td><td>${a.restarts}</td>
      <td><button class="btn inline" style="padding:4px 10px;font-size:10px" onclick="appAction('${a.name}','restart')">Restart</button></td></tr>`).join('');
  });
}
loadDashApps();
setInterval(loadDashApps, 10000);

function uploadBot() {
  const fileInput = document.getElementById('upload-file');
  const statusEl = document.getElementById('upload-status');
  if (!fileInput.files.length) { statusEl.textContent = 'Select a .zip file first.'; return; }
  S.sndClick();
  statusEl.textContent = 'Uploading...';
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  formData.append('path', 'apps');
  fetch('/api/files/upload-and-extract', { method: 'POST', body: formData })
    .then(r => r.json()).then(d => {
      if (d.ok) { statusEl.textContent = '✓ Uploaded and extracted to ~/apps'; S.sndSuccess(); }
      else { statusEl.textContent = '✗ ' + d.error; S.sndError(); }
    });
}

let fmPath = '';
function fmRefresh() {
  fetch('/api/files/list?path=' + encodeURIComponent(fmPath)).then(r => r.json()).then(data => {
    document.getElementById('fm-path').textContent = '/' + fmPath;
    const grid = document.getElementById('fm-grid');
    if (!data.ok) { grid.innerHTML = `<p class="muted">${data.error}</p>`; return; }
    grid.innerHTML = data.entries.map(e => `
      <div class="fm-item" onclick="fmOpen('${e.relativePath.replace(/'/g,"\\'")}', ${e.isDirectory})">
        <div class="fm-icon">${e.isDirectory ? '📁' : '📄'}</div>
        <div class="fm-name">${e.name}</div>
      </div>`).join('') || '<p class="muted">Empty.</p>';
  });
}
function fmOpen(p, isDir) {
  S.sndClick();
  if (isDir) { fmPath = p; fmRefresh(); }
  else { alert('File: ' + p); }
}
function fmUp() {
  S.sndClick();
  if (!fmPath) return;
  const parts = fmPath.split('/').filter(Boolean); parts.pop();
  fmPath = parts.join('/'); fmRefresh();
}

function loadEnv() {
  fetch('/api/files/env').then(r => r.json()).then(d => { if (d.ok) document.getElementById('env-editor').value = d.content; });
}
function saveEnv() {
  S.sndClick();
  const content = document.getElementById('env-editor').value;
  fetch('/api/files/env', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
    .then(r => r.json()).then(d => { if (d.ok) S.sndSuccess(); else S.sndError(); });
}

function loadAppsForLogSelect() {
  fetch('/api/deploy/apps').then(r => r.json()).then(data => {
    const sel = document.getElementById('logs-app-select');
    if (!data.ok || !data.apps.length) { sel.innerHTML = '<option>No apps</option>'; return; }
    sel.innerHTML = data.apps.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
    loadAppLogs();
  });
}
function loadAppLogs() {
  const name = document.getElementById('logs-app-select').value;
  if (!name) return;
  fetch(`/api/deploy/apps/${encodeURIComponent(name)}/logs?lines=100`).then(r => r.json()).then(d => {
    document.getElementById('logs-output').textContent = d.output || d.error || 'No output.';
  });
}

function loadSessions() {
  fetch('/api/pairing/activity').then(r => r.json()).then(data => {
    const tbody = document.getElementById('sessions-tbody');
    if (!data.ok || !data.activity.length) { tbody.innerHTML = '<tr><td colspan="3" class="muted">No sessions yet.</td></tr>'; return; }
    tbody.innerHTML = data.activity.map((a, i) => `<tr><td>${i+1}</td><td>${a.phone_masked}</td><td>${new Date(a.linked_at).toLocaleString()}</td></tr>`).join('');
  });
}

function shivanSend() {
  const input = document.getElementById('shivan-input');
  const msg = input.value.trim();
  if (!msg) return;
  S.sndClick();
  const chat = document.getElementById('shivan-chat');
  const userLine = document.createElement('div');
  userLine.className = 'term-line cmd';
  userLine.textContent = 'You: ' + msg;
  chat.appendChild(userLine);
  input.value = '';
  chat.scrollTop = chat.scrollHeight;
  const thinking = document.createElement('div');
  thinking.className = 'term-line sys';
  thinking.textContent = 'Shivan: thinking...';
  chat.appendChild(thinking);
  chat.scrollTop = chat.scrollHeight;
  fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) })
    .then(r => r.json()).then(d => {
      thinking.textContent = 'Shivan: ' + (d.ok ? d.reply : 'Error — ' + d.error);
      chat.scrollTop = chat.scrollHeight;
      if (d.ok) S.sndSuccess(); else S.sndError();
    });
}
document.getElementById('shivan-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') shivanSend(); });

// ===== Shivan auto-welcome =====
let shivanWelcomed = false;
function loadShivanWelcome() {
  if (shivanWelcomed) return;
  shivanWelcomed = true;
  const chat = document.getElementById('shivan-chat');
  fetch('/api/ai/welcome').then(r => r.json()).then(d => {
    if (d.ok) {
      const line = document.createElement('div');
      line.className = 'term-line sys';
      line.textContent = 'Shivan: ' + d.message;
      chat.appendChild(line);
      chat.scrollTop = chat.scrollHeight;
      S.sndBell();
    }
  }).catch(() => {});
}

// ===== Monaco Code Editor (real VS Code engine, loaded from CDN) =====
let monacoEditorInstance = null;
let monacoLoaded = false;
let monacoLoading = false;
let currentEditorFile = null;

function initEditor() {
  editorRefreshFileList();

  if (monacoEditorInstance) {
    setTimeout(() => monacoEditorInstance.layout(), 50);
    return;
  }

  if (monacoLoading) return;
  monacoLoading = true;

  const container = document.getElementById('monaco-editor-container');
  container.innerHTML = '<div style="color:#4a8a64;padding:16px;font-size:12px">Loading editor engine...</div>';

  if (typeof require === 'undefined' || !require.config) {
    container.innerHTML = '<div style="color:#ff3b4e;padding:16px;font-size:12px">Editor engine failed to load from CDN. Check your internet connection and reload the page.</div>';
    monacoLoading = false;
    return;
  }

  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    container.innerHTML = '';
    monacoEditorInstance = monaco.editor.create(container, {
      value: '// Select a file above to start editing\n// Real save writes directly to your workspace on the server',
      language: 'javascript',
      theme: 'vs-dark',
      fontSize: 13,
      minimap: { enabled: false },
      automaticLayout: true
    });
    monacoLoaded = true;
    monacoLoading = false;
    setTimeout(() => monacoEditorInstance.layout(), 100);
  }, function (err) {
    container.innerHTML = '<div style="color:#ff3b4e;padding:16px;font-size:12px">Editor engine failed to load: ' + (err && err.message ? err.message : 'unknown error') + '</div>';
    monacoLoading = false;
  });
}

function guessLanguage(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const map = { js: 'javascript', json: 'json', py: 'python', html: 'html', css: 'css', md: 'markdown', env: 'ini', sh: 'shell', ts: 'typescript' };
  return map[ext] || 'plaintext';
}

function editorRefreshFileList(dirPath) {
  fetch('/api/files/list?path=' + encodeURIComponent(dirPath || '')).then(r => r.json()).then(data => {
    const sel = document.getElementById('editor-file-select');
    if (!data.ok) return;
    const files = data.entries.filter(e => !e.isDirectory);
    sel.innerHTML = '<option value="">— select a file —</option>' + files.map(f => `<option value="${f.relativePath}">${f.relativePath}</option>`).join('');
  });
}

function editorOpenSelected() {
  const filePath = document.getElementById('editor-file-select').value;
  if (!filePath) return;
  S.sndClick();
  fetch('/api/files/read?path=' + encodeURIComponent(filePath)).then(r => r.json()).then(d => {
    if (!d.ok) { document.getElementById('editor-status').textContent = '✗ ' + d.error; S.sndError(); return; }
    currentEditorFile = filePath;
    document.getElementById('editor-current-file').textContent = filePath;
    if (monacoEditorInstance) {
      monaco.editor.setModelLanguage(monacoEditorInstance.getModel(), guessLanguage(filePath));
      monacoEditorInstance.setValue(d.content);
      setTimeout(() => monacoEditorInstance.layout(), 50);
    }
    document.getElementById('editor-status').textContent = 'Loaded ' + filePath;
  });
}

function editorSave() {
  if (!currentEditorFile || !monacoEditorInstance) {
    document.getElementById('editor-status').textContent = 'No file open to save.';
    return;
  }
  S.sndClick();
  const content = monacoEditorInstance.getValue();
  fetch('/api/files/write', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: currentEditorFile, content })
  }).then(r => r.json()).then(d => {
    if (d.ok) { document.getElementById('editor-status').textContent = '✓ Saved ' + currentEditorFile; S.sndSuccess(); }
    else { document.getElementById('editor-status').textContent = '✗ ' + d.error; S.sndError(); }
  });
}

// ===== Hidden easter egg: hacker typing speed test =====
const TYPING_PHRASES = [
  'sudo access granted root shell',
  'npm install express socket.io',
  'git clone origin main branch',
  'pm2 restart cyberx bot process',
  'grep error logs tail follow',
  'chmod 755 deploy script sh',
  'curl https api endpoint json',
  'ssh keygen ed25519 add agent',
  'docker build tag cyberx latest',
  'kill process port 3000 force'
];

let typingState = { text: '', startTime: null, active: false };

function typingGameStart() {
  const phrase = TYPING_PHRASES[Math.floor(Math.random() * TYPING_PHRASES.length)];
  typingState = { text: phrase, startTime: null, active: true };
  document.getElementById('typing-target').textContent = phrase;
  document.getElementById('typing-input').value = '';
  document.getElementById('typing-input').disabled = false;
  document.getElementById('typing-input').focus();
  document.getElementById('typing-result').textContent = '';
  document.getElementById('typing-target').classList.remove('typing-done');
}

function typingGameInput(e) {
  if (!typingState.active) return;
  const input = e.target.value;
  if (typingState.startTime === null && input.length > 0) {
    typingState.startTime = Date.now();
  }
  const target = typingState.text;
  const targetEl = document.getElementById('typing-target');
  let html = '';
  for (let i = 0; i < target.length; i++) {
    if (i < input.length) {
      html += input[i] === target[i]
        ? `<span style="color:#00ff66">${target[i]}</span>`
        : `<span style="color:#ff3b4e;text-decoration:underline">${target[i]}</span>`;
    } else {
      html += `<span style="color:#4a8a64">${target[i]}</span>`;
    }
  }
  targetEl.innerHTML = html;
  if (input === target) {
    typingState.active = false;
    const elapsedMs = Date.now() - typingState.startTime;
    const elapsedMin = elapsedMs / 60000;
    const words = target.split(' ').length;
    const wpm = Math.round(words / elapsedMin);
    document.getElementById('typing-input').disabled = true;
    document.getElementById('typing-result').innerHTML =
      `<span class="glow-text">✓ ${wpm} WPM</span> — ${(elapsedMs / 1000).toFixed(2)}s`;
    targetEl.classList.add('typing-done');
    if (window.CYBERX_SOUNDS) window.CYBERX_SOUNDS.sndSuccess();
  }
}
