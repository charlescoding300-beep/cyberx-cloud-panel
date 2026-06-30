// lib/deployEngine.js
const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const pm2Manager = require('./pm2Manager');
const users = require('./users');

function runStep(cmd, cwd, onLog) {
  return new Promise((resolve) => {
    onLog(`$ ${cmd}\n`, 'cmd');
    const child = spawn(cmd, { shell: true, cwd, timeout: 10 * 60 * 1000 });
    child.stdout.on('data', (d) => onLog(d.toString(), 'out'));
    child.stderr.on('data', (d) => onLog(d.toString(), 'err'));
    child.on('close', (code) => resolve(code === 0));
    child.on('error', (err) => {
      onLog(`error: ${err.message}\n`, 'err');
      resolve(false);
    });
  });
}

async function deployFromGitHub(userId, { repoUrl, appName, branch = 'main' }, onLog) {
  const workspace = users.getUserWorkspace(userId);
  const safeName = String(appName).replace(/[^a-zA-Z0-9_-]/g, '') || 'app';
  const targetDir = path.join(workspace, 'apps', safeName);

  onLog(`>>> CYBER X DEPLOY: ${appName}\n`, 'sys');
  onLog(`>>> Source: ${repoUrl}\n`, 'sys');

  try {
    if (fs.existsSync(targetDir)) {
      onLog('>>> Existing deployment found, pulling latest changes...\n', 'sys');
      const git = simpleGit(targetDir);
      await git.fetch();
      await git.checkout(branch).catch(() => {});
      await git.pull();
      onLog('>>> Pull complete.\n', 'sys');
    } else {
      fs.mkdirSync(path.dirname(targetDir), { recursive: true });
      onLog('>>> Cloning repository...\n', 'sys');
      const git = simpleGit(workspace);
      await git.clone(repoUrl, targetDir, ['--branch', branch, '--single-branch']);
      onLog('>>> Clone complete.\n', 'sys');
    }
  } catch (e) {
    onLog(`>>> GIT ERROR: ${e.message}\n`, 'err');
    return { ok: false, error: e.message };
  }

  if (fs.existsSync(path.join(targetDir, 'package.json'))) {
    onLog('>>> Detected Node.js project. Installing dependencies...\n', 'sys');
    const installOk = await runStep('npm install --omit=dev', targetDir, onLog);
    if (!installOk) {
      onLog('>>> BUILD FAILED at npm install\n', 'err');
      return { ok: false, error: 'npm install failed' };
    }
  } else if (fs.existsSync(path.join(targetDir, 'requirements.txt'))) {
    onLog('>>> Detected Python project. Installing dependencies...\n', 'sys');
    const installOk = await runStep('pip install -r requirements.txt --break-system-packages', targetDir, onLog);
    if (!installOk) {
      onLog('>>> BUILD FAILED at pip install\n', 'err');
      return { ok: false, error: 'pip install failed' };
    }
  } else {
    onLog('>>> No package.json or requirements.txt found — skipping install step.\n', 'sys');
  }

  onLog('>>> Starting application via PM2...\n', 'sys');

  let scriptEntry = 'index.js';
  try {
    if (fs.existsSync(path.join(targetDir, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
      if (pkg.main) scriptEntry = pkg.main;
    }
  } catch (e) {}

  const startResult = await pm2Manager.startApp(userId, {
    name: safeName,
    script: scriptEntry,
    cwd: targetDir,
    maxMemoryMb: 256
  });

  if (!startResult.ok) {
    onLog(`>>> START FAILED: ${startResult.error}\n`, 'err');
    return { ok: false, error: startResult.error };
  }

  onLog(`>>> DEPLOY SUCCESSFUL — ${safeName} is now running\n`, 'sys');
  return { ok: true, appName: safeName, dir: targetDir };
}

module.exports = { deployFromGitHub };
