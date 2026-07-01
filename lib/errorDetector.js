// lib/errorDetector.js
// Watches real deploy log output for genuine failure signals.

const ERROR_PATTERNS = [
  { pattern: /npm error/i, label: 'npm install failure' },
  { pattern: /MODULE_NOT_FOUND/i, label: 'missing module' },
  { pattern: /cannot find module/i, label: 'missing module' },
  { pattern: /SyntaxError/i, label: 'syntax error' },
  { pattern: /ReferenceError/i, label: 'reference error' },
  { pattern: /TypeError/i, label: 'type error' },
  { pattern: /EADDRINUSE/i, label: 'port already in use' },
  { pattern: /permission denied/i, label: 'permission error' },
  { pattern: /ENOENT/i, label: 'file not found' },
  { pattern: /fatal:/i, label: 'git failure' },
  { pattern: /pip.*error/i, label: 'pip install failure' },
  { pattern: /ModuleNotFoundError/i, label: 'missing python module' },
  { pattern: /ImportError/i, label: 'python import error' }
];

function detectError(logChunk) {
  const lines = logChunk.split('\n');
  for (const line of lines) {
    for (const { pattern, label } of ERROR_PATTERNS) {
      if (pattern.test(line)) {
        return { detected: true, label, matchedLine: line.trim() };
      }
    }
  }
  return null;
}

module.exports = { detectError, ERROR_PATTERNS };
