// routes/files.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const extractZip = require('extract-zip');
const { requireAuth } = require('../lib/auth');
const shellEngine = require('../lib/shellEngine');

function resolveSafe(userId, relPath) {
  const root = shellEngine.getRoot(userId);
  const target = path.resolve(root, '.' + path.sep + (relPath || ''));
  if (!target.startsWith(root)) throw new Error('Path escapes workspace');
  return target;
}

const upload = multer({ dest: path.resolve('./data/tmp-uploads'), limits: { fileSize: 200 * 1024 * 1024 } });

router.get('/list', requireAuth, (req, res) => {
  try {
    const dirPath = resolveSafe(req.user.userId, req.query.path || '');
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map((e) => {
      const stat = fs.statSync(path.join(dirPath, e.name));
      return {
        name: e.name,
        isDirectory: e.isDirectory(),
        size: stat.size,
        modified: stat.mtime,
        relativePath: path.join(req.query.path || '', e.name)
      };
    });
    res.json({ ok: true, entries });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get('/read', requireAuth, (req, res) => {
  try {
    const filePath = resolveSafe(req.user.userId, req.query.path);
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ ok: true, content });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/write', requireAuth, (req, res) => {
  try {
    const filePath = resolveSafe(req.user.userId, req.body.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, req.body.content, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.delete('/delete', requireAuth, (req, res) => {
  try {
    const target = resolveSafe(req.user.userId, req.body.path);
    fs.rmSync(target, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  try {
    const destDir = resolveSafe(req.user.userId, req.body.path || '');
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, req.file.originalname);
    fs.renameSync(req.file.path, destPath);
    res.json({ ok: true, fileName: req.file.originalname });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/upload-and-extract', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const destDir = resolveSafe(req.user.userId, req.body.path || '');
    fs.mkdirSync(destDir, { recursive: true });
    await extractZip(req.file.path, { dir: destDir });
    fs.unlinkSync(req.file.path);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get('/env', requireAuth, (req, res) => {
  try {
    const root = shellEngine.getRoot(req.user.userId);
    const envPath = path.join(root, '.env');
    const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    res.json({ ok: true, content });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.post('/env', requireAuth, (req, res) => {
  try {
    const root = shellEngine.getRoot(req.user.userId);
    const envPath = path.join(root, '.env');
    fs.writeFileSync(envPath, req.body.content || '', 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
