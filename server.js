// ViBE V2/V3 — Minimal repo server
// - Serves static files
// - V2: /api tree, file, search (read-only)
// - V3: /api patch (atomic write with snapshots), run (limited commands)

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { exec } = require('child_process');
const https = require('https');

function resolveWorkspaceRoot() {
  const start = process.cwd();
  const override = process.env.VIBE_WORKSPACE && process.env.VIBE_WORKSPACE.trim();
  const fsx = fs;
  function isDir(p) { try { return fsx.statSync(p).isDirectory(); } catch { return false; } }
  if (override) {
    const abs = path.isAbsolute(override) ? override : path.join(start, override);
    if (isDir(abs)) return path.resolve(abs);
  }
  // Walk up for nearest .git
  let dir = start;
  while (true) {
    if (isDir(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const ROOT = resolveWorkspaceRoot();
// Load .env if present (minimal parser)
try {
  const dotenvPath = path.join(ROOT, '.env');
  const txt = fs.readFileSync(dotenvPath, 'utf8');
  txt.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) return;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith('\'') && val.endsWith('\''))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  });
} catch {}

const PORT = process.env.PORT ? Number(process.env.PORT) : 7080;
const IGNORE = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.cache']);
const VIBE_DIR = path.join(ROOT, '.vibe');
const LOGS_DIR = path.join(VIBE_DIR, 'logs');
// Serve UI assets from the installed package directory (not the workspace root)
const UI_DIR = __dirname;
const EVENTS_FILE = path.join(VIBE_DIR, 'events.json');
const CONFIG_FILE = path.join(VIBE_DIR, 'config.json');
// In-memory debug ring buffer (non-persistent)
const DEBUG_LOGS = [];
const DEBUG_LOG_LIMIT = Math.max(5, Number(process.env.VIBE_DEBUG_LOG_LIMIT || 50));
// Simple concurrency lock for /api/patch to serialize writes
let PATCH_BUSY = false;
let REVERT_BUSY = false;
const MAX_WRITE_BYTES = 500_000; // guard against oversized writes
const SEARCH_MAX_FILE_BYTES = 300_000; // max file size considered by /api/search

// Git integration (optional)
const GIT_ENABLED = String(process.env.VIBE_GIT_INTEGRATION || '').trim() === '1';
let GIT_BRANCH = null; // branch-per-run
function isGitRepo() { try { return fs.statSync(path.join(ROOT, '.git')).isDirectory(); } catch { return false; } }
function execGit(cmd, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: ROOT, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(new Error(stderr || err.message), { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}
async function gitEnsureRunBranch() {
  if (!GIT_ENABLED || !isGitRepo()) return false;
  if (GIT_BRANCH) return true;
  const name = `vibe-run-${Date.now()}`;
  try {
    await execGit(`git checkout -b ${name}`);
    GIT_BRANCH = name;
    pushDebug({ ts: Date.now(), kind: 'git', action: 'branch_create', branch: name });
    return true;
  } catch (e) {
    pushDebug({ ts: Date.now(), kind: 'git', action: 'branch_create_error', error: String(e && e.message || e) });
    return false;
  }
}
function pushDebug(entry) {
  try {
    DEBUG_LOGS.push(entry);
    if (DEBUG_LOGS.length > DEBUG_LOG_LIMIT) DEBUG_LOGS.shift();
  } catch {}
}
function sanitizeMessages(msgs, maxLen = 2000) {
  try {
    return (msgs || []).map(m => ({
      role: m.role || 'unknown',
      content: String(m.content || '').slice(0, maxLen),
    }));
  } catch { return []; }
}
function normalizeActions(actions) {
  try {
    const out = [];
    for (const a of (actions || [])) {
      if (!a) continue;
      if (typeof a === 'string') { out.push({ type: String(a).toUpperCase() }); continue; }
      if (typeof a === 'object') {
        const type = String(a.type || a.action || a.kind || a.tool || '').toUpperCase();
        const obj = { ...a, type };
        if (obj.params && typeof obj.params === 'object') {
          const p = obj.params;
          if (obj.path == null && typeof p.path === 'string') obj.path = p.path;
          if (obj.dir == null && typeof p.dir === 'string') obj.dir = p.dir;
          if (obj.depth == null && (p.depth !== undefined)) obj.depth = p.depth;
          if (obj.q == null && typeof p.q === 'string') obj.q = p.q;
        }
        // Flatten nested one-off operations like UPDATE_FILE/CREATE_FILE/EDIT_DIFF embedded as objects
        const nested = [];
        for (const k of Object.keys(a)) {
          const K = k.toUpperCase();
          const v = a[k];
          if (!v || typeof v !== 'object') continue;
          if (K === 'EDIT_DIFF' && typeof v.diff === 'string') nested.push({ type: 'EDIT_DIFF', diff: v.diff });
          if ((K === 'UPDATE_FILE' || K === 'CREATE_FILE') && typeof v.path === 'string' && typeof v.content === 'string') {
            nested.push({ type: K, path: v.path, content: v.content });
          }
        }
        out.push(obj);
        for (const n of nested) out.push(n);
      }
    }
    return out;
  } catch { return Array.isArray(actions) ? actions : []; }
}
function validateActionsStrict(actions) {
  const allowed = new Set(['READ_FILE','READ','VIEW_FILE','OPEN_FILE','READ_TREE','SEARCH','CREATE_FILE','CREATE_FILE_BINARY','UPDATE_FILE','CREATE_DIR','EDIT_DIFF','EMIT_PLAN','REPLAN','PROCEED_EXECUTION','HALT_EXECUTION','PLAN_ONLY','ASK_INPUT','TASK','UPDATE_MEMORY','LOAD_SKILL']);
  const errs = [];
  for (const a of (actions||[])) {
    if (!a) { errs.push('null action'); continue; }
    const typ = String(a.type || a.action || a.kind || '').toUpperCase();
    if (!typ) { errs.push('missing type'); continue; }
    if (!allowed.has(typ)) { errs.push(`unknown type ${typ}`); continue; }
    if ((typ === 'CREATE_FILE' || typ === 'UPDATE_FILE') && (typeof a.path !== 'string' || a.path.trim() === '' || typeof a.content !== 'string')) {
      errs.push(`${typ} requires path and content`);
    }
    if (typ === 'UPDATE_MEMORY') {
      if (!a.kind || typeof a.diff !== 'string' || !a.diff.trim()) errs.push('UPDATE_MEMORY requires kind and diff');
    }
    if (typ === 'TASK') {
      if (!a.kind) errs.push('TASK requires kind');
    }
    if (typ === 'CREATE_FILE_BINARY') {
      const hasB64 = (typeof a.base64 === 'string') || (typeof a.contentBase64 === 'string');
      if (typeof a.path !== 'string' || a.path.trim() === '' || !hasB64) {
        errs.push('CREATE_FILE_BINARY requires path and base64');
      }
    }
    if (typ === 'READ_FILE' && (typeof a.path !== 'string' || a.path.trim() === '')) {
      errs.push('READ_FILE requires path');
    }
    if ((typ === 'EMIT_PLAN' || typ === 'REPLAN')) {
      const p = a.plan;
      if (!p || !Array.isArray(p.tasks)) errs.push(`${typ} requires plan.tasks array`);
    }
  }
  return errs;
}

function summarizeEvents(events, maxFiles = 5) {
  try {
    const counts = { PATCH_APPLIED: 0, REVERT: 0, TEST_RESULT: 0 };
    const recentFiles = [];
    for (const e of events.slice(-50)) {
      if (!e || !e.type) continue;
      if (e.type in counts) counts[e.type]++;
      if (e.type === 'PATCH_APPLIED') {
        const ch = (e.data && e.data.changes) || [];
        for (const c of ch) {
          if (typeof c.path === 'string' && recentFiles.length < maxFiles) recentFiles.push(c.path);
        }
      }
      if (recentFiles.length >= maxFiles) break;
    }
    const parts = [];
    parts.push(`patches=${counts.PATCH_APPLIED}`);
    parts.push(`reverts=${counts.REVERT}`);
    parts.push(`tests=${counts.TEST_RESULT}`);
    if (recentFiles.length) parts.push(`recent=[${recentFiles.join(', ')}]`);
    return `Memory: ${parts.join(' ')}`;
  } catch { return 'Memory: none'; }
}

// Action helpers
const REQUIRED_CONTENT_TYPES = new Set(['CREATE_FILE', 'UPDATE_FILE']);
function toActionRecord(a) {
  if (!a) return null;
  const type = String(a.type || a.action || a.kind || a.tool || '').toUpperCase();
  if (!type) return null;
  const pathLike = a.path || a.file || a.name || null;
  const content = a.content !== undefined ? String(a.content) : undefined;
  const paths = Array.isArray(a.paths) ? a.paths.slice(0, 50).map(String) : undefined;
  const base64 = (typeof a.base64 === 'string') ? a.base64 : (typeof a.contentBase64 === 'string' ? a.contentBase64 : undefined);
  const diff = (typeof a.diff === 'string') ? a.diff : undefined;
  return { type, path: pathLike, content, paths, base64, diff };
}
function validateActionsBasic(actions) {
  const out = { actions: [], missingContent: [], proceedWithEmpty: false };
  for (const raw of (actions || [])) {
    const rec = toActionRecord(raw);
    if (!rec) continue;
    out.actions.push(rec);
    if (REQUIRED_CONTENT_TYPES.has(rec.type)) {
      if (!rec.path || rec.content === undefined) out.missingContent.push({ type: rec.type, path: rec.path || '' });
    }
  }
  return out;
}

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
]);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send(res, code, body, type) {
  cors(res);
  if (type) res.setHeader('Content-Type', type);
  res.statusCode = code;
  res.end(body);
}

function sendJSON(res, obj, code = 200) {
  send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8');
}

function safeJoin(p) {
  const full = path.normalize(path.join(ROOT, p));
  if (!full.startsWith(ROOT)) throw new Error('Path traversal');
  return full;
}

function withinRoot(p) {
  const full = path.normalize(p);
  return full.startsWith(ROOT);
}

async function exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function listTree(start, depth = 2) {
  const out = [];
  async function walk(dir, d) {
    const ents = await fsp.readdir(dir, { withFileTypes: true });
    for (const ent of ents) {
      if (IGNORE.has(ent.name)) continue;
      const fp = path.join(dir, ent.name);
      const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
      if (ent.isDirectory()) {
        out.push({ type: 'dir', path: rel });
        if (d > 0) await walk(fp, d - 1);
      } else if (ent.isFile()) {
        const stat = await fsp.stat(fp);
        out.push({ type: 'file', path: rel, size: stat.size });
      }
    }
  }
  await walk(start, depth);
  return out;
}

async function readTextFile(fp, maxBytes = 100_000) {
  const stat = await fsp.stat(fp);
  let size = stat.size;
  let content;
  if (size > maxBytes) {
    const fh = await fsp.open(fp, 'r');
    const buf = Buffer.alloc(maxBytes);
    await fh.read(buf, 0, maxBytes, 0);
    await fh.close();
    content = buf.toString('utf8') + `\n\n/* truncated ${size - maxBytes} bytes */`;
  } else {
    content = await fsp.readFile(fp, 'utf8');
  }
  return { size, content };
}

// Read a byte range [start, end) from a text file (UTF-8). Returns { size, content, range }.
async function readTextFileRange(fp, start, end) {
  const stat = await fsp.stat(fp);
  const size = stat.size;
  const s = Math.max(0, Math.min(size, Number(start || 0)));
  const e = Math.max(0, Math.min(size, Number(end != null ? end : size)));
  const len = Math.max(0, e - s);
  const buf = Buffer.alloc(len);
  if (len > 0) {
    const fh = await fsp.open(fp, 'r');
    try { await fh.read(buf, 0, len, s); } finally { await fh.close(); }
  }
  const content = buf.toString('utf8');
  return { size, content, range: { start: s, end: e } };
}

function summarizeTree(entries, max = 50) {
  const files = entries.filter(e => e.type === 'file').slice(0, max);
  const dirs = entries.filter(e => e.type === 'dir').slice(0, max);
  return {
    files: files.map(f => f.path),
    dirs: dirs.map(d => d.path),
  };
}

async function searchRepo(start, q, maxMatches = 50, maxFileSize = 1_000_000, extFilter = null, opts = {}) {
  const matches = [];
  const regex = !!opts.regex;
  const caseSensitive = !!opts.caseSensitive;
  const context = Math.max(0, Math.min(10, Number(opts.context || 0)));
  let re = null;
  let qLower = null;
  if (regex) {
    try { re = new RegExp(q, caseSensitive ? '' : 'i'); } catch { re = null; }
  } else {
    qLower = caseSensitive ? q : q.toLowerCase();
  }
  async function walk(dir) {
    const ents = await fsp.readdir(dir, { withFileTypes: true });
    for (const ent of ents) {
      if (IGNORE.has(ent.name)) continue;
      const fp = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(fp);
      } else if (ent.isFile()) {
        try {
          const stat = await fsp.stat(fp);
          if (stat.size > Math.min(maxFileSize, SEARCH_MAX_FILE_BYTES)) continue;
          if (extFilter) {
            const ext = path.extname(fp).toLowerCase().replace(/^\./, '');
            const want = String(extFilter).toLowerCase().replace(/^\./,'');
            if (ext !== want) continue;
          }
          const text = await fsp.readFile(fp, 'utf8');
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const L = lines[i];
            let hit = false;
            if (re) {
              hit = re.test(L);
            } else {
              hit = caseSensitive ? L.includes(qLower) : L.toLowerCase().includes(qLower);
            }
            if (hit) {
              const startIdx = Math.max(0, i - context);
              const endIdx = Math.min(lines.length - 1, i + context);
              const before = [];
              for (let j = startIdx; j < i; j++) before.push(lines[j].slice(0, 300));
              const after = [];
              for (let j = i + 1; j <= endIdx; j++) after.push(lines[j].slice(0, 300));
              matches.push({ path: path.relative(ROOT, fp).replace(/\\/g, '/'), line: i + 1, text: L.slice(0, 300), before, after });
              if (matches.length >= maxMatches) return matches;
            }
          }
        } catch {}
      }
    }
    return matches;
  }
  await walk(start);
  return matches;
}

function safeJoinUI(p) {
  const full = path.normalize(path.join(UI_DIR, p));
  if (!full.startsWith(UI_DIR)) throw new Error('Path traversal (ui)');
  return full;
}
function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/') p = '/index.html';
  const full = safeJoinUI(p.replace(/^\//, ''));
  fs.readFile(full, (err, data) => {
    if (err) {
      send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    send(res, 200, data, MIME.get(ext) || 'application/octet-stream');
  });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }

async function writeFileRecursive(fp, content) {
  await ensureDir(path.dirname(fp));
  await fsp.writeFile(fp, content, 'utf8');
}

async function writeLogFile(basename, content) {
  try {
    await ensureDir(LOGS_DIR);
    const fp = path.join(LOGS_DIR, basename);
    await fsp.writeFile(fp, String(content || ''), 'utf8');
    return fp;
  } catch { return null; }
}

async function removeFile(fp) {
  try { await fsp.unlink(fp); } catch {}
  // attempt to remove empty parent dirs up to ROOT
  let d = path.dirname(fp);
  while (withinRoot(d) && d !== ROOT) {
    try {
      const ent = await fsp.readdir(d);
      if (ent.length === 0) await fsp.rmdir(d); else break;
    } catch { break; }
    d = path.dirname(d);
  }
}

function simpleUnifiedDiff(relPath, before, after) {
  const hasBefore = before !== undefined && before !== null;
  const hasAfter = after !== undefined && after !== null;
  const a = hasBefore ? String(before).split(/\r?\n/) : [];
  const b = hasAfter ? String(after).split(/\r?\n/) : [];

  // Added file
  if (!hasBefore && hasAfter) {
    const out = [`--- /dev/null`, `+++ b/${relPath}`, `@@`];
    for (const line of b) out.push(`+ ${line}`);
    return out.join('\n');
  }
  // Deleted file
  if (hasBefore && !hasAfter) {
    const out = [`--- a/${relPath}`, `+++ /dev/null`, `@@`];
    for (const line of a) out.push(`- ${line}`);
    return out.join('\n');
  }
  // Unchanged
  if (String(before) === String(after)) {
    return `--- a/${relPath}\n+++ b/${relPath}\n@@\n (no changes)\n`;
  }
  // Modified file: minimal per-line diff (no full context)
  const out = [`--- a/${relPath}`, `+++ b/${relPath}`, `@@`];
  const max = Math.max(a.length, b.length);
  let aLine = 1, bLine = 1;
  for (let i = 0; i < max; i++) {
    const la = a[i];
    const lb = b[i];
    const same = la === lb;
    if (!same) {
      if (la !== undefined) out.push(`- ${aLine}: ${la}`);
      if (lb !== undefined) out.push(`+ ${bLine}: ${lb}`);
      if (out.length > 5000) { out.push('... (truncated)'); break; }
    }
    if (la !== undefined) aLine++;
    if (lb !== undefined) bLine++;
  }
  return out.join('\n');
}

// Generate a basic, valid unified diff that replaces the entire file content.
// This is conservative (no context hunks), but applies reliably when based on current content.
function fullReplaceUnifiedDiff(relPath, before, after) {
  const a = (before != null ? String(before) : '').split(/\r?\n/);
  const b = (after != null ? String(after) : '').split(/\r?\n/);
  const aCount = a.length && !(a.length === 1 && a[0] === '') ? a.length : 0;
  const bCount = b.length && !(b.length === 1 && b[0] === '') ? b.length : 0;
  // Added file
  if (aCount === 0 && bCount > 0) {
    const out = [`--- /dev/null`, `+++ b/${relPath}`, `@@ -0,0 +1,${bCount} @@`];
    for (const line of b) { if (line !== '' || bCount > 0) out.push(`+${line}`); }
    return out.join('\n');
  }
  // Deleted file
  if (aCount > 0 && bCount === 0) {
    const out = [`--- a/${relPath}`, `+++ /dev/null`, `@@ -1,${aCount} +0,0 @@`];
    for (const line of a) { if (line !== '' || aCount > 0) out.push(`-${line}`); }
    return out.join('\n');
  }
  // Modified or empty-to-empty
  const out = [`--- a/${relPath}`, `+++ b/${relPath}`, `@@ -1,${aCount} +1,${bCount} @@`];
  for (const line of a) { if (aCount > 0) out.push(`-${line}`); }
  for (const line of b) { if (bCount > 0) out.push(`+${line}`); }
  return out.join('\n');
}

async function snapshotChanges(snapshotId, changes) {
  const base = path.join(ROOT, '.vibe', 'snapshots', snapshotId);
  const beforeDir = path.join(base, 'before');
  const afterDir = path.join(base, 'after');
  await ensureDir(beforeDir); await ensureDir(afterDir);
  for (const ch of changes) {
    const rel = ch.path;
    const before = ch.before;
    const after = ch.after;
    if (before !== undefined) {
      const fp = path.join(beforeDir, rel);
      await writeFileRecursive(fp, String(before));
    }
    if (after !== undefined) {
      const fp = path.join(afterDir, rel);
      await writeFileRecursive(fp, String(after));
    }
  }
}

let EVENTS_WRITE_PROMISE = Promise.resolve();
async function appendEvent(evt) {
  await ensureDir(VIBE_DIR);
  const doWrite = async () => {
    let list = [];
    try {
      list = await readEvents();
      if (!Array.isArray(list)) list = [];
    } catch { list = []; }
    list.push(evt);
    const txt = JSON.stringify(list, null, 2);
    const tmp = EVENTS_FILE + '.tmp';
    try { await fsp.writeFile(tmp, txt, 'utf8'); await fsp.rename(tmp, EVENTS_FILE); } finally {
      try { await fsp.unlink(tmp); } catch {}
    }
    try { await fsp.writeFile(EVENTS_FILE + '.bak', txt, 'utf8'); } catch {}
  };
  EVENTS_WRITE_PROMISE = EVENTS_WRITE_PROMISE.then(doWrite, doWrite);
  return EVENTS_WRITE_PROMISE;
}

async function readEvents() {
  // Try normal parse
  try {
    const raw = await fsp.readFile(EVENTS_FILE, 'utf8');
    return JSON.parse(raw) || [];
  } catch (e) {
    // Attempt salvage by trimming to last closing bracket
    try {
      const raw = await fsp.readFile(EVENTS_FILE, 'utf8');
      const idx = raw.lastIndexOf(']');
      if (idx >= 0) {
        const cut = raw.slice(0, idx + 1);
        try { return JSON.parse(cut) || []; } catch {}
      }
    } catch {}
    // Fallback to backup file
    try {
      const bak = await fsp.readFile(EVENTS_FILE + '.bak', 'utf8');
      return JSON.parse(bak) || [];
    } catch {}
    return [];
  }
}

async function readConfig() {
  try { const raw = await fsp.readFile(CONFIG_FILE, 'utf8'); return JSON.parse(raw) || {}; } catch { return {}; }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let { pathname, searchParams } = url;
    // Normalize: strip trailing slashes for routing
    const pathClean = pathname.replace(/\/+$/,'') || '/';
  if (req.method === 'OPTIONS') {
      cors(res); res.statusCode = 204; return res.end();
    }
    if (pathClean.startsWith('/api/')) {
      cors(res);
      if (pathClean === '/api/ping') {
      let gitEnabled = false, gitBranch = null;
      try {
        gitEnabled = isGitRepo();
        if (gitEnabled) {
          const out = await execGit('git rev-parse --abbrev-ref HEAD');
          gitBranch = (out.stdout || '').trim();
        }
      } catch {}
      return sendJSON(res, { ok: true, workspaceRoot: ROOT, gitEnabled, gitIntegrationOn: GIT_ENABLED, gitBranch });
    }
    if ((pathClean === '/api/revert/check' || pathClean === '/api/revert-check') && req.method === 'POST') {
      const body = await readBody(req);
      const snapshotId = String(body.snapshotId || '').trim();
      if (!snapshotId) return sendJSON(res, { error: 'snapshotId required' }, 400);
      const direction = (String(body.direction || 'before').toLowerCase() === 'after') ? 'after' : 'before';
      const onlyPaths = Array.isArray(body.paths) ? body.paths.map(p => String(p).replace(/^\/+/, '')).filter(Boolean) : null;
      const base = path.join(ROOT, '.vibe', 'snapshots', snapshotId);
      const beforeDir = path.join(base, 'before');
      const afterDir = path.join(base, 'after');
      const hasBefore = await exists(beforeDir);
      const hasAfter = await exists(afterDir);
      if (!hasBefore && !hasAfter) return sendJSON(res, { error: 'snapshot not found' }, 404);
      async function listFiles(dir) {
        const out = [];
        async function walk(d) {
          const ents = await fsp.readdir(d, { withFileTypes: true });
          for (const ent of ents) {
            const fp = path.join(d, ent.name);
            if (ent.isDirectory()) await walk(fp);
            else if (ent.isFile()) out.push(path.relative(dir, fp).replace(/\\/g, '/'));
          }
        }
        if (await exists(dir)) await walk(dir);
        return out;
      }
      let beforeFiles = await listFiles(beforeDir);
      let afterFiles = await listFiles(afterDir);
      let allFiles = Array.from(new Set([...beforeFiles, ...afterFiles]));
      if (onlyPaths && onlyPaths.length) {
        const sel = new Set(onlyPaths);
        allFiles = allFiles.filter(p => sel.has(p));
      }
      const warnings = [];
      for (const rel of allFiles) {
        const beforePath = path.join(beforeDir, rel);
        const afterPath = path.join(afterDir, rel);
        const workspacePath = safeJoin(rel);
        const hadBefore = await exists(beforePath);
        const hadAfter = await exists(afterPath);
        const before = hadBefore ? await fsp.readFile(beforePath, 'utf8').catch(() => undefined) : undefined;
        const after = hadAfter ? await fsp.readFile(afterPath, 'utf8').catch(() => undefined) : undefined;
        try {
          const cur = await fsp.readFile(workspacePath, 'utf8');
          if (direction === 'before' && typeof after === 'string' && cur !== after) {
            warnings.push({ path: rel, kind: 'diverged', note: 'Current file differs from snapshot-after; revert may overwrite subsequent edits.' });
          }
          if (direction === 'after' && typeof before === 'string' && cur !== before) {
            warnings.push({ path: rel, kind: 'diverged', note: 'Current file differs from snapshot-before; reapply may overwrite prior state.' });
          }
        } catch {}
      }
      return sendJSON(res, { ok: true, snapshotId, warnings });
    }
      if (pathClean === '/api/debug' && req.method === 'GET') {
        const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') || '20')));
        const logs = DEBUG_LOGS.slice(-limit);
        return sendJSON(res, { logs, count: logs.length });
      }
      if (pathClean === '/api/agent/chat' && req.method === 'POST') {
        let body;
        try { body = await readBody(req); } catch (e) { console.error('chat body parse error:', e && e.stack || e); return sendJSON(res, { error: 'invalid JSON body' }, 400); }
        const text = String(body.text || '').trim();
        if (!text) return sendJSON(res, { error: 'text required' }, 400);
        const tree = await listTree(ROOT, 1);
        const summary = summarizeTree(tree, 200);
        // Build extra system guidance from client-observed state (no keyword heuristics)
        const client = body.client || {};
        const pendingCount = Number.isFinite(Number(client.pendingCount)) ? Number(client.pendingCount) : null;
        const activeDirFromClient = typeof client.activeDir === 'string' && client.activeDir.trim() ? client.activeDir.trim() : null;
        const overlayRelFromClient = typeof client.overlay === 'string' && client.overlay.trim() ? client.overlay.trim() : null;
        const autopilotOn = !!client.autopilot;
        const clientSkills = Array.isArray(client.skills) ? client.skills.map(s => String(s).trim()).filter(Boolean) : [];
        const handoff = !!body.handoff;
        const clientPerms = client.perms || {};
        const ALLOW_READ = !!clientPerms.read;
        const ALLOW_WRITE = !!clientPerms.write;
        const ALLOW_TEST = !!clientPerms.test;
        let extraSystem = '';
        let lastDir = activeDirFromClient || null;
        let candidates = [];
        try {
          if (!lastDir) {
            const events = await readEvents();
            // Infer last touched subfolder from recent patches
            for (let i = events.length - 1; i >= 0; i--) {
              const e = events[i];
              if (!e || e.type !== 'PATCH_APPLIED') continue;
              const ch = (e.data && e.data.changes) || [];
              for (const c of ch) {
                const p = String(c && c.path || '');
                if (/^[^/]+\//.test(p) && (p.endsWith('index.html') || p.endsWith('styles.css'))) {
                  lastDir = p.split('/')[0];
                  break;
                }
              }
              if (lastDir) break;
            }
          }
          if (lastDir) {
            const idx = path.join(ROOT, lastDir, 'index.html');
            const css = path.join(ROOT, lastDir, 'styles.css');
            if (await exists(idx)) { const r = await readTextFile(idx, 50_000); candidates.push({ rel: `${lastDir}/index.html`, content: r.content }); }
            if (await exists(css)) { const r = await readTextFile(css, 50_000); candidates.push({ rel: `${lastDir}/styles.css`, content: r.content }); }
          }
        } catch {}
        // Build extra system guidance
        const guidance = [];
        if (pendingCount !== null) guidance.push(`Observation: pending_task_count=${pendingCount}`);
        guidance.push(`Observation: autopilot=${autopilotOn ? 'on' : 'off'}`);
        if (lastDir) guidance.push(`Observation: active_dir=${lastDir}`);
        guidance.push('Policy: Always return at least one action; message-only replies are invalid.');
        guidance.push('Policy: If pending_task_count==0, do NOT return PROCEED_EXECUTION; choose REPLAN or UPDATE_FILE/CREATE_FILE/ASK_INPUT to create new work.');
        guidance.push('Policy: If write or test permissions are OFF, do NOT return PROCEED_EXECUTION. Ask the user to enable the needed permission and/or return EMIT_PLAN only.');
        guidance.push('Policy: When updating files, use UPDATE_FILE with { path, content } and include the entire revised file content (no diffs). When creating files, use CREATE_FILE with { path, content } and include full content.');
        guidance.push(`Permission: read=${ALLOW_READ?'on':'off'}, write=${ALLOW_WRITE?'on':'off'}, test=${ALLOW_TEST?'on':'off'}`);
        if (candidates.length) {
          guidance.push('Context: Current files for active_dir (for reference):');
          for (const f of candidates) { guidance.push(`FILE: ${f.rel}`); guidance.push(f.content); guidance.push('---'); }
        }
        extraSystem = guidance.join('\n');
        try {
          const history = Array.isArray(body.history) ? body.history : [];
          // Debug: inbound chat request snapshot
          try {
            pushDebug({
              ts: Date.now(), kind: 'chat_in',
              text,
              client: { pendingCount, activeDir: lastDir || null, autopilot: autopilotOn },
              historyCount: history.length,
              extraSystemLen: (extraSystem && extraSystem.length) || 0,
            });
          } catch {}
          // Include a concise memory summary for context discipline
          let memoryLine = '';
          try { const ev = await readEvents(); memoryLine = summarizeEvents(ev); } catch {}
          // Provide file excerpts instead of full contents when injecting context
          function headTail(s, head=120, tail=60) {
            const lines = String(s||'').split(/\r?\n/);
            if (lines.length <= head + tail + 1) return lines.join('\n');
            const a = lines.slice(0, head);
            const b = lines.slice(-tail);
            return a.join('\n') + `\n... (snipped ${lines.length - head - tail} lines) ...\n` + b.join('\n');
          }
          // If a README exists at root, include a short excerpt in guidance to bias the model to read it
          try {
            const readmeCandidates = ['README.md','Readme.md','readme.md'];
            for (const rname of readmeCandidates) {
              const rfull = path.join(ROOT, rname);
              if (await exists(rfull)) {
                const r = await readTextFile(rfull, 40_000);
                guidance.push('Context: README.md (excerpt):');
                guidance.push(headTail(r.content, 80, 40));
                break;
              }
            }
          } catch {}
          // Skills: inject selected skills (client-provided) as context headers (excerpt)
          try {
            if (clientSkills.length) {
              const dir = path.join(ROOT, 'skills');
              for (const name of clientSkills.slice(0, 6)) {
                const fp = path.join(dir, `${name.replace(/[^a-z0-9_\-]/gi,'')}.md`);
                if (await exists(fp)) {
                  const r = await readTextFile(fp, 40_000);
                  guidance.push(`Skill: ${name}`);
                  guidance.push(headTail(r.content, 80, 40));
                }
              }
            }
          } catch {}
          // Handoff: prefer session summary at start of fresh session
          try {
            if (handoff) {
              const sess = path.join(ROOT, 'SESSION_SUMMARY.md');
              if (await exists(sess)) {
                const r = await readTextFile(sess, 60_000);
                guidance.push('Handoff: SESSION_SUMMARY.md (excerpt):');
                guidance.push(headTail(r.content, 120, 60));
              }
            }
          } catch {}
          // Files-as-memory: inject excerpts from repo memory docs if present
          try {
            const memNames = ['PLAN.md','DECISIONS.md','CURRENT_TASK.md','TODO.md','NOTES.md','ARCHITECTURE.md'];
            for (const m of memNames) {
              const fp = path.join(ROOT, m);
              if (await exists(fp)) {
                const r = await readTextFile(fp, 40_000);
                guidance.push(`Context: ${m} (excerpt):`);
                guidance.push(headTail(r.content, 60, 30));
              }
            }
          } catch {}
          if (overlayRelFromClient) {
            try {
              const fp = safeJoin(overlayRelFromClient);
              if (await exists(fp)) {
                const r = await readTextFile(fp, 40_000);
                guidance.push(`Context: ${overlayRelFromClient} (excerpt):`);
                guidance.push(headTail(r.content, 80, 40));
              }
            } catch {}
          }
          if (candidates.length) {
            const slim = [];
            for (const f of candidates) { slim.push(`FILE: ${f.rel}`); slim.push(headTail(f.content)); slim.push('---'); }
            extraSystem = guidance.join('\n');
            extraSystem += '\n' + slim.join('\n');
          }
          let out = await openaiChat(text, summary, history, { extraSystem: (extraSystem + (memoryLine ? ('\n' + memoryLine) : '')) });
          let message = String(out.message || '').trim() || '...';
          let actions = normalizeActions(Array.isArray(out.actions) ? out.actions : []);
          // Validate structure and required fields; short bounded tool loop with one retry for missing content
          let basic = validateActionsBasic(actions);
          if (basic.missingContent.length) {
            const want = basic.missingContent.map(m => `${m.type}(${m.path||'path'})`).join(', ');
            const extraForce = [
              'Some actions are missing required fields. For CREATE_FILE/UPDATE_FILE you must include { path, content } with the entire file content (no diffs).',
              `Missing: ${want}`,
            ].join(' ');
            const forced = await openaiChat(text, summary, history, { forceActions: true, extraSystem: extraSystem + '\n' + extraForce });
            message = String(forced.message || '').trim() || message;
            actions = Array.isArray(forced.actions) ? forced.actions : [];
            basic = validateActionsBasic(actions);
          }
          // Strict contract validation; re-ask once with precise errors
          const strictErrs = validateActionsStrict(actions);
          if (strictErrs.length) {
            const extraForce = [
              'Your previous actions failed validation. Fix these issues and return valid actions only.',
              `Errors: ${strictErrs.join('; ')}`,
            ].join(' ');
            const forced = await openaiChat(text, summary, history, { forceActions: true, extraSystem: extraForce + (memoryLine ? ('\n' + memoryLine) : '') });
            message = String(forced.message || '').trim() || message;
            actions = normalizeActions(Array.isArray(forced.actions) ? forced.actions : []);
          }

          // Lightweight tool loop: honor READ_FILE / READ_TREE / SEARCH before proceeding (plus TASK sub-agents and UPDATE_MEMORY mapping)
          const readAliases = new Set(['READ_FILE', 'READ', 'VIEW_FILE', 'OPEN_FILE']);
          let safetyCounter = 0;
          let obsExtra = '';
          let performedReadTree = false;
          let performedReadReadme = false;
          while (safetyCounter < 2) {
            const reads = [];
            const trees = [];
            const searches = [];
            const tasksList = [];
            for (const a of actions) {
              if (!a) continue;
              const typ = String(a.type || a.action || a.kind || '').toUpperCase();
              if (readAliases.has(typ)) {
                const p = a.path || a.file || a.name;
                if (typeof p === 'string' && p.trim()) reads.push(p.trim());
              }
              if (typ === 'READ_TREE') {
                const dir = (a.path || a.dir || a.root || '.');
                const depth = Math.max(0, Math.min(5, Number(a.depth || 2)));
                trees.push({ dir, depth });
              }
              if (typ === 'SEARCH') {
                const q = (a.q || a.query || a.text || '').trim();
                const dir = (a.dir || '.');
                const max = Math.max(1, Math.min(200, Number(a.max || 50)));
                const context = Math.max(0, Math.min(10, Number(a.context || 1)));
                const caseSensitive = !!a.caseSensitive;
                const regex = !!a.regex;
                if (q) searches.push({ q, dir, max, context, caseSensitive, regex, ext: a.ext || null });
              }
              if (typ === 'TASK') {
                const kind = String(a.kind || '').toUpperCase();
                tasksList.push({ kind, a });
              }
              if (typ === 'LOAD_SKILL') {
                const name = (a.name || a.skill || '').trim();
                if (name) tasksList.push({ kind: 'LOAD_SKILL', a: { name } });
              }
              // Support batch reads if model provides a.paths
              if (Array.isArray(a.paths)) {
                for (const p of a.paths) { if (typeof p === 'string' && p.trim()) reads.push(p.trim()); }
              }
              
            }
            if (!reads.length && !trees.length && !searches.length) {
              // Nudge: if no read actions yet, encourage model to READ_TREE and READ_FILE README.md first
              if (safetyCounter === 0) {
                obsExtra += '\nPolicy: Before creating scaffolds or directories, call READ_TREE { dir: ".", depth: 2 } and READ_FILE { path: "README.md" } if present, then propose a plan.';
                const re2 = await openaiChat(text, summary, history, { extraSystem: (extraSystem + obsExtra + (memoryLine ? ('\n' + memoryLine) : '')), forceActions: true });
                message = String(re2.message || '').trim() || message;
                actions = normalizeActions(Array.isArray(re2.actions) ? re2.actions : []);
                safetyCounter++;
                continue;
              }
              break;
            }
            const seen = new Set();
            for (const rel of reads) {
              try {
                const norm = rel.replace(/^\/+/, '');
                if (seen.has(norm)) continue; seen.add(norm);
                if (!ALLOW_READ) { obsExtra += `\nObservation: PERMISSION_DENIED READ_FILE ${norm}`; continue; }
                const full = safeJoin(norm);
                const ok = await exists(full);
                if (!ok) { obsExtra += `\nObservation: READ_FILE ${norm} → not found`; continue; }
                const { size, content } = await readTextFile(full, 60_000);
                obsExtra += `\nObservation: FILE ${norm} (size=${size})\n${content}\n---`;
                if (/^readme\.md$/i.test(path.basename(norm))) performedReadReadme = true;
              } catch (e) {
                obsExtra += `\nObservation: READ_FILE error for ${rel}: ${String(e && e.message || e)}`;
              }
            }
            for (const t of trees) {
              try {
                if (!ALLOW_READ) { obsExtra += `\nObservation: PERMISSION_DENIED READ_TREE ${String(t.dir||'.')}`; continue; }
                const root = safeJoin(String(t.dir || '.'));
                const ent = await listTree(root, Number(t.depth || 2));
                const lines = ent.slice(0, 200).map(e => `${e.type}:${e.path}${e.type==='file'?` (${e.size}b)`:''}`);
                obsExtra += `\nObservation: TREE dir=${t.dir} depth=${t.depth}\n${lines.join('\n')}\n---`;
                performedReadTree = true;
              } catch (e) {
                obsExtra += `\nObservation: READ_TREE error for ${String(t.dir)}: ${String(e && e.message || e)}`;
              }
            }
            for (const s of searches) {
              try {
                if (!ALLOW_READ) { obsExtra += `\nObservation: PERMISSION_DENIED SEARCH ${String(s.q)}`; continue; }
                const root = safeJoin(String(s.dir || '.'));
                const found = await searchRepo(root, s.q, s.max, 1_000_000, s.ext || null, { regex: s.regex, caseSensitive: s.caseSensitive, context: s.context });
                const lines = found.slice(0, 200).map(m => `${m.path}:${m.line}: ${m.text}`);
                obsExtra += `\nObservation: SEARCH q=${s.q} dir=${s.dir} matches=${found.length}\n${lines.join('\n')}\n---`;
              } catch (e) {
                obsExtra += `\nObservation: SEARCH error for ${String(s.q)}: ${String(e && e.message || e)}`;
              }
            }
            // TASK sub-agents (SCOUT / TEST) and LOAD_SKILL injection
            for (const t of tasksList) {
              const kind = t.kind;
              if (kind === 'SCOUT') {
                try {
                  const q = (t.a.q || t.a.query || '').trim();
                  const dir = (t.a.dir || '.');
                  const root = safeJoin(dir);
                  const found = q ? (await searchRepo(root, q, 200, 1_000_000, t.a.ext || null, { regex: !!t.a.regex, caseSensitive: !!t.a.caseSensitive, context: 1 })) : [];
                  const lines = found.slice(0, 100).map(m => `${m.path}:${m.line}: ${m.text}`);
                  const logName = `scout-${Date.now()}.txt`;
                  const fp = await writeLogFile(logName, lines.join('\n'));
                  const rel = fp ? path.relative(ROOT, fp).replace(/\\/g, '/') : null;
                  obsExtra += `\nObservation: TASK SCOUT q=${q||'(none)'} matches=${found.length}${rel?` log=${rel}`:''}`;
                } catch (e) {
                  obsExtra += `\nObservation: TASK SCOUT error: ${String(e && e.message || e)}`;
                }
              } else if (kind === 'TEST') {
                try {
                  const requireConfirm = String(process.env.VIBE_REQUIRE_TEST_CONFIRM || '').trim() === '1';
                  if (!ALLOW_TEST || requireConfirm) { obsExtra += `\nObservation: TASK TEST denied: permission/confirm required`; continue; }
                  const timeoutMs = Math.max(1000, Math.min(60_000, Number(t.a.timeoutMs || 10_000)));
                  const isWin = process.platform === 'win32';
                  const cmd = isWin ? 'npm.cmd test --silent' : 'npm test --silent';
                  const { exec } = require('child_process');
                  const out = await new Promise((resolve) => {
                    exec(cmd, { cwd: ROOT, timeout: timeoutMs }, (err, stdout, stderr) => {
                      resolve({ err, stdout, stderr });
                    });
                  });
                  const combined = String(out.stdout||'') + (out.stderr?`\n[stderr]\n${out.stderr}`:'');
                  const name = `task-test-${Date.now()}.txt`;
                  const fp = await writeLogFile(name, combined);
                  const rel = fp ? path.relative(ROOT, fp).replace(/\\/g, '/') : null;
                  const lines = combined.split(/\r?\n/).slice(-50).join('\n');
                  const ok = !out.err;
                  obsExtra += `\nObservation: TASK TEST ok=${ok}${rel?` log=${rel}`:''}\n${lines}`;
                } catch (e) {
                  obsExtra += `\nObservation: TASK TEST error: ${String(e && e.message || e)}`;
                }
              } else if (kind === 'LOAD_SKILL') {
                try {
                  const dir = path.join(ROOT, 'skills');
                  const fp = path.join(dir, `${String(t.a.name||'').replace(/[^a-z0-9_\-]/gi,'')}.md`);
                  if (await exists(fp)) {
                    const r = await readTextFile(fp, 40_000);
                    obsExtra += `\nObservation: LOAD_SKILL ${t.a.name}\n${headTail(r.content, 80, 40)}`;
                  } else {
                    obsExtra += `\nObservation: LOAD_SKILL ${t.a.name} not found`;
                  }
                } catch (e) {
                  obsExtra += `\nObservation: LOAD_SKILL error: ${String(e && e.message || e)}`;
                }
              }
            }

            // Ask the model again with observations appended; expect concrete actions (e.g., UPDATE_FILE)
            const re = await openaiChat(text, summary, history, { extraSystem: (extraSystem + obsExtra + (memoryLine ? ('\n' + memoryLine) : '')), forceActions: true });
            message = String(re.message || '').trim() || message;
            actions = normalizeActions(Array.isArray(re.actions) ? re.actions : []);
            safetyCounter++;
          }

          // Enforce that agent returns at least one valid action; if no pending tasks, PROCEED_EXECUTION alone is invalid
          if (!actions.length || (pendingCount === 0 && actions.every(a => a && a.type === 'PROCEED_EXECUTION'))) {
            const extraForce = [
              'Your previous reply contained no valid actions for the current state.',
              'Always return at least one action. If there are no pending tasks, do NOT return PROCEED_EXECUTION; choose REPLAN or UPDATE_FILE/CREATE_FILE/ASK_INPUT.',
            ].join(' ');
            const forced = await openaiChat(text, summary, history, { forceActions: true, extraSystem: extraSystem + obsExtra + '\n' + extraForce });
            message = String(forced.message || '').trim() || message;
            actions = Array.isArray(forced.actions) ? forced.actions : [];
          }
          // Normalize tool-like actions to a single EMIT_PLAN (group writes) so the UI can render Kanban
          const toolActs = actions
            .map(toActionRecord)
            .filter(Boolean);
          const isToolPlan = toolActs.some(r => /^(CREATE_|UPDATE_|MODIFY_|WRITE_|APPEND_|EDIT_|REPLACE_|CREATE_DIR|CREATE_FILE|UPDATE_FILE|EDIT_DIFF)$/.test(r.type));
          // Enforce read-before-write: require at least READ_TREE or READ_FILE README.md before writes
          if (isToolPlan && !(performedReadTree || performedReadReadme)) {
            const guardMsg = 'Policy: Read-first guard — before proposing writes, call READ_TREE { dir: ".", depth: 2 } and READ_FILE { path: "README.md" } if present, then propose actions.';
            try {
              const forced = await openaiChat(text, summary, Array.isArray(body.history)?body.history:[], { forceActions: true, extraSystem: (extraSystem + obsExtra + '\\n' + guardMsg + (memoryLine ? ('\\n' + memoryLine) : '')) });
              message = String(forced.message || '').trim() || message;
              actions = Array.isArray(forced.actions) ? forced.actions : [];
            } catch {}
          }
          // Map UPDATE_MEMORY to EDIT_DIFF for specific memory files
          try {
            const map = { PLAN: 'PLAN.md', DECISIONS: 'DECISIONS.md', CURRENT_TASK: 'CURRENT_TASK.md', TODO: 'TODO.md', NOTES: 'NOTES.md', ARCHITECTURE: 'ARCHITECTURE.md' };
            const mapped = [];
            for (const a of actions) {
              if (!a) continue;
              const typ = String(a.type || a.action || '').toUpperCase();
              if (typ === 'UPDATE_MEMORY' && typeof a.diff === 'string') {
                const k = String(a.kind || '').toUpperCase();
                const rel = map[k];
                if (rel) {
                  let diffText = String(a.diff || '');
                  const hasHdr = /^(---|\+\+\+)\s/m.test(diffText);
                  const hasHunk = /^@@/m.test(diffText);
                  if (!hasHdr && hasHunk) {
                    diffText = `--- a/${rel}\n+++ b/${rel}\n` + diffText.replace(/^[\r\n]+/,'');
                  }
                  mapped.push({ type: 'EDIT_DIFF', diff: diffText });
                  continue;
                }
              }
              mapped.push(a);
            }
            actions = mapped;
          } catch {}
          // Recompute toolActs after guard and mapping
          const toolActs2 = actions.map(toActionRecord).filter(Boolean);
          const planWritesActs = toolActs2;
          if (isToolPlan) {
            const lastUser = history.slice().reverse().find(m => m && m.role === 'user' && (m.content||'').trim().length > 4);
            const goal = (lastUser && lastUser.content) ? String(lastUser.content).trim() : text;
            const planTasks = [];
            // Group directories and file writes
            const dirPaths = [];
            const fileWrites = [];
            let combinedDiff = '';
            for (const r of planWritesActs) {
              if (r.type === 'CREATE_DIR' || r.type === 'CREATE_DIRECTORY') {
                if (r.path) dirPaths.push(r.path);
              } else if (r.type === 'CREATE_FILE_BINARY') {
                if (r.path && r.base64 !== undefined) fileWrites.push({ path: r.path, base64: r.base64 });
              } else if (r.type === 'CREATE_FILE' || r.type === 'CREATE' || r.type === 'UPDATE_FILE' || r.type === 'MODIFY_FILE' || r.type === 'WRITE_FILE' || r.type === 'EDIT_FILE' || r.type === 'APPEND_FILE' || r.type === 'REPLACE_IN_FILE') {
                if (r.path && r.content !== undefined) fileWrites.push({ path: r.path, content: r.content });
              } else if (r.type === 'EDIT_DIFF' && r.diff) {
                combinedDiff += (combinedDiff ? '\n' : '') + String(r.diff);
              }
            }
            // One task per directory (mkdir step)
            for (const p of dirPaths) {
              planTasks.push({ taskId: `t_${Date.now()}_${planTasks.length+1}`, title: `Create directory ${p}`, status: 'PLANNED', steps: [`mkdir ${p}`], notes: '' });
            }
            // Single grouped task for all file writes
            if (fileWrites.length) {
              const title = fileWrites.length === 1 ? `Write ${fileWrites[0].path}` : `Write ${fileWrites.length} file(s)`;
              const steps = fileWrites.map(w => `write ${w.path}`);
              planTasks.push({ taskId: `t_${Date.now()}_${planTasks.length+1}`, title, status: 'PLANNED', steps, notes: '', writes: fileWrites });
            }
            // One grouped task for EDIT_DIFF if provided
            if (combinedDiff.trim()) {
              // Try to extract file paths from diff headers for steps
              const paths = [];
              for (const line of combinedDiff.split(/\r?\n/)) {
                if (line.startsWith('+++ ')) {
                  const m = line.match(/^\+\+\+\s+(?:b\/)?(.+)$/);
                  if (m && m[1]) paths.push(m[1]);
                }
              }
              const steps = paths.map(p => `diff ${p}`);
              planTasks.push({ taskId: `t_${Date.now()}_${planTasks.length+1}`, title: `Apply diff (${paths.length||1} files)`, status: 'PLANNED', steps, notes: '', diff: combinedDiff });
            }
            if (planTasks.length) {
              const plan = { planId: `tool_plan_${Date.now()}`, goal, tasks: planTasks };
              // If write/test permissions are disabled, do not proceed automatically.
              const writesPresent = fileWrites.length > 0 || combinedDiff.trim().length > 0 || dirPaths.length > 0;
              const canProceed = (!writesPresent || ALLOW_WRITE) && ALLOW_TEST;
              actions = [{ type: 'EMIT_PLAN', plan }];
              if (canProceed) {
                actions.push({ type: 'PROCEED_EXECUTION' });
              } else {
                const missing = [];
                if (writesPresent && !ALLOW_WRITE) missing.push('write');
                if (!ALLOW_TEST) missing.push('test');
                actions.push({ type: 'HALT_EXECUTION', reason: 'PERMISSION_REQUIRED', missing });
              }
            }
          }
          await appendEvent({ ts: Date.now(), type: 'CHAT', data: { text, actions: actions.map(a=>a.type) } });
          try {
            let planSummary = null;
            const emit = actions.find(a => a && a.type === 'EMIT_PLAN' && a.plan);
            if (emit && emit.plan && Array.isArray(emit.plan.tasks)) {
              const titles = emit.plan.tasks.slice(0, 5).map(t => t.title || t.description || 'Task');
              planSummary = { tasks: emit.plan.tasks.length, titles };
            }
            pushDebug({
              ts: Date.now(), kind: 'chat_out',
              message,
              normalized: actions.map(a => ({ type: (a && a.type) || '', hasPlan: !!(a && a.plan) })),
              planSummary,
              readFirstSatisfied: (performedReadTree || performedReadReadme)
            });
          } catch {}
          if (!actions.length) {
            // Do not synthesize actions; surface that no actions were returned
            return sendJSON(res, { provider: 'openai', message, actions: [] });
          }
          return sendJSON(res, { provider: 'openai', message, actions: normalizeActions(actions) });
        } catch (e) {
          try { console.error('POST /api/agent/chat failed:', e && e.stack || e); } catch {}
          // Fallback: short/ambiguous → clarify; else small mock plan
          const msgLower = text.toLowerCase();
          const ambiguousTerm = ['go','start','run','proceed'].includes(msgLower);
          const hist = Array.isArray(body.history) ? body.history : [];
          const lastUser = hist.slice().reverse().find(m => m && m.role === 'user' && (m.content||'').trim().length > 4);
          const combined = lastUser ? String(lastUser.content).trim() : '';
          const ambiguous = (text.length < 4 && !combined) || ambiguousTerm;
          if (ambiguous) {
            const message = 'What would you like to build or change in this repo?';
            return sendJSON(res, { provider: 'fallback', message, actions: [] });
          }
          const goal = combined || text;
          const plan = {
            planId: `mock_${Date.now()}`,
            goal,
            tasks: [
              { taskId: `t_${Date.now()}_1`, title: 'Analyze repository', status: 'PLANNED', steps: ['tree','search'], notes: '' },
              { taskId: `t_${Date.now()}_2`, title: 'Implement change', status: 'PLANNED', steps: ['edit files','tests'], notes: '' },
            ],
          };
          const message = 'Here is a proposed plan. Shall I proceed?';
          return sendJSON(res, { provider: 'fallback', message, actions: [{ type: 'EMIT_PLAN', plan }] });
        }
      }
      if (pathClean === '/api/agent/plan' && req.method === 'POST') {
        const body = await readBody(req);
        const goal = String(body.goal || '').trim();
        if (!goal) return sendJSON(res, { error: 'goal required' }, 400);
        try {
          const plan = await openaiPlan(goal);
          // Optional Git branch-per-run
          try { await gitEnsureRunBranch(); } catch {}
          await appendEvent({ ts: Date.now(), type: 'AGENT_PLAN', data: { provider: 'openai', goal } });
          return sendJSON(res, { plan, provider: 'openai' });
        } catch (e) {
          // Fallback deterministic plan
          const plan = {
            planId: `mock_${Date.now()}`,
            goal,
            tasks: [
              { taskId: `t_${Date.now()}_1`, title: 'Analyze repository', status: 'PLANNED', steps: ['tree', 'search'], notes: '' },
              { taskId: `t_${Date.now()}_2`, title: 'Propose tasks', status: 'PLANNED', steps: ['group work'], notes: '' },
            ],
          };
          await appendEvent({ ts: Date.now(), type: 'AGENT_PLAN', data: { provider: 'mock', goal } });
          return sendJSON(res, { plan, provider: 'mock', error: String(e && e.message || e) });
        }
      }
      if (pathClean === '/api/wrapup' && req.method === 'POST') {
        const body = await readBody(req);
        const summary = body && body.summary;
        if (!summary || typeof summary !== 'object') return sendJSON(res, { error: 'summary required' }, 400);
        try {
          let message;
          try { message = await openaiWrapUp(summary); }
          catch (e) {
            // Fallback deterministic
            const files = Array.isArray(summary.changes) ? summary.changes.map(c=>c.path).slice(0,3) : [];
            const tests = summary.tests && summary.tests.ok ? 'pass' : 'fail';
            message = `Done — ${String(summary.goal||summary.task||'task')} • ${files.length?`Files: ${files.join(', ')}`:'No file changes'} • Tests: ${tests}`;
            if (!summary.tests || !summary.tests.ok) message += '. I can show failing output or revert to the last snapshot.';
          }
          // Persist/update SESSION_SUMMARY.md for future handoffs
          try {
            const parts = [];
            parts.push(`# Session Summary`);
            parts.push(`Goal: ${String(summary.goal||'')}`);
            parts.push(`Task: ${String(summary.task||'')}`);
            const ch = Array.isArray(summary.changes) ? summary.changes.map(c=>c.path).join(', ') : '';
            if (ch) parts.push(`Changes: ${ch}`);
            const tests = summary.tests && summary.tests.ok ? 'pass' : 'fail';
            parts.push(`Tests: ${tests}`);
            if (summary.snapshotId) parts.push(`Snapshot: ${summary.snapshotId}`);
            const txt = parts.join('\n');
            await writeFileRecursive(safeJoin('SESSION_SUMMARY.md'), txt);
          } catch {}
          return sendJSON(res, { message });
        } catch (e) { return sendJSON(res, { error: String(e&&e.message||e) }, 500); }
      }
      if (pathClean === '/api/revert' && req.method === 'POST') {
        if (REVERT_BUSY) {
          return sendJSON(res, { error: 'revert in progress, try again' }, 423);
        }
        REVERT_BUSY = true;
        try {
        const body = await readBody(req);
        const snapshotId = String(body.snapshotId || '').trim();
        if (!snapshotId) return sendJSON(res, { error: 'snapshotId required' }, 400);
        const direction = (String(body.direction || 'before').toLowerCase() === 'after') ? 'after' : 'before';
        const onlyPaths = Array.isArray(body.paths) ? body.paths.map(p => String(p).replace(/^\/+/, '')).filter(Boolean) : null;
        const base = path.join(ROOT, '.vibe', 'snapshots', snapshotId);
        const beforeDir = path.join(base, 'before');
        const afterDir = path.join(base, 'after');
        const hasBefore = await exists(beforeDir);
        const hasAfter = await exists(afterDir);
        if (!hasBefore && !hasAfter) return sendJSON(res, { error: 'snapshot not found' }, 404);

        async function listFiles(dir) {
          const out = [];
          async function walk(d) {
            const ents = await fsp.readdir(d, { withFileTypes: true });
            for (const ent of ents) {
              const fp = path.join(d, ent.name);
              if (ent.isDirectory()) await walk(fp);
              else if (ent.isFile()) out.push(path.relative(dir, fp).replace(/\\/g, '/'));
            }
          }
          if (await exists(dir)) await walk(dir);
          return out;
        }

        let beforeFiles = await listFiles(beforeDir);
        let afterFiles = await listFiles(afterDir);
        let allFiles = Array.from(new Set([...beforeFiles, ...afterFiles]));
        if (onlyPaths && onlyPaths.length) {
          const sel = new Set(onlyPaths);
          allFiles = allFiles.filter(p => sel.has(p));
        }

        // For full-card revert to 'before', prefer git revert if applicable
        if (!onlyPaths && direction === 'before') {
          try {
            if (GIT_ENABLED && isGitRepo()) {
              const events = await readEvents();
              const evt = events.find(e => e && e.type === 'PATCH_APPLIED' && e.data && e.data.snapshotId === snapshotId);
              const hash = evt && evt.data && evt.data.commitHash;
              if (hash) {
                await execGit(`git revert --no-edit ${hash}`);
                await appendEvent({ ts: Date.now(), type: 'GIT_REVERT', data: { snapshotId, hash } });
                const restoredWithAbs = allFiles.map(rel => ({ path: rel, absPath: path.join(ROOT, rel) }));
                return sendJSON(res, { ok: true, snapshotId, workspaceRoot: ROOT, restored: restoredWithAbs, diff: `(git revert ${hash})` });
              }
            }
          } catch (e) {
            pushDebug({ ts: Date.now(), kind: 'git', action: 'revert_error', error: String(e && e.message || e) });
          }
        }

        // Snapshot-based restore (full or partial; before or after)
        const changes = [];
        let combinedDiff = '';
        const warnings = [];
        for (const rel of allFiles) {
          const beforePath = path.join(beforeDir, rel);
          const afterPath = path.join(afterDir, rel);
          const workspacePath = safeJoin(rel);
          const hadBefore = await exists(beforePath);
          const hadAfter = await exists(afterPath);
          const before = hadBefore ? await fsp.readFile(beforePath, 'utf8').catch(() => undefined) : undefined;
          const after = hadAfter ? await fsp.readFile(afterPath, 'utf8').catch(() => undefined) : undefined;
          try {
            const cur = await fsp.readFile(workspacePath, 'utf8');
            if (direction === 'before' && typeof after === 'string' && cur !== after) {
              warnings.push({ path: rel, kind: 'diverged', note: 'Current file differs from snapshot-after; revert may overwrite subsequent edits.' });
            }
          } catch {}
          let writeContent;
          if (direction === 'before') writeContent = before !== undefined ? before : '';
          else writeContent = after !== undefined ? after : '';
          if (writeContent !== undefined) {
            await writeFileRecursive(workspacePath, writeContent);
          } else {
            await removeFile(workspacePath);
          }
          changes.push({ path: rel });
          const diff = direction === 'before' ? simpleUnifiedDiff(rel, after, before) : simpleUnifiedDiff(rel, before, after);
          combinedDiff += diff + '\n';
        }
        await appendEvent({ ts: Date.now(), type: direction === 'before' ? 'REVERT' : 'REAPPLY', data: { snapshotId, restored: changes, partial: !!(onlyPaths && onlyPaths.length) } });
        const restoredWithAbs = changes.map(c => ({ ...c, absPath: path.join(ROOT, c.path) }));
        return sendJSON(res, { ok: true, snapshotId, workspaceRoot: ROOT, restored: restoredWithAbs, diff: combinedDiff, warnings });
        } finally { REVERT_BUSY = false; }
      }
      if (pathClean === '/api/patch' && req.method === 'POST') {
        if (PATCH_BUSY) {
          return sendJSON(res, { error: 'patch in progress, try again' }, 423);
        }
        PATCH_BUSY = true;
        const body = await readBody(req);
        const ops = Array.isArray(body.ops) ? body.ops.slice(0, 50) : [];
        if (!ops.length) return sendJSON(res, { error: 'ops required' }, 400);
        const snapshotId = String(body.snapshotId || `${Date.now()}_${Math.random().toString(16).slice(2)}`);
        const meta = body.meta || {}; // optional metadata: { taskId, title }
        const ENFORCE_DIFF = String(process.env.VIBE_ENFORCE_DIFF || '1').trim() === '1';
        const allowWrite = (p) => {
          const rel = String(p);
          const base = path.basename(rel);
          // Disallow writing into the .git directory, but allow .gitkeep files
          if (base === '.git') return false;
          if (rel.includes('/.git/') || rel.includes('\\.git\\')) return false;
          if (rel.split(/[\\/]/).includes('.git')) return false;
          // Disallow node_modules
          if (rel.includes('node_modules')) return false;
          return true;
        };
        const changes = [];
        const errors = [];
        const warnings = [];
        try {
          for (const op of ops) {
            try {
              if (!op || !op.op || !op.path) throw new Error('invalid op');
              const rel = op.path.replace(/^\/+/, '');
              if (!allowWrite(rel)) throw new Error('path not allowed');
              const full = safeJoin(rel);
              const existed = await exists(full);
              let before, after;
              if (existed) { before = await fsp.readFile(full, 'utf8'); }
              if (op.op === 'delete') {
                if (existed) await removeFile(full);
                after = undefined;
              } else if (op.op === 'add' || op.op === 'write') {
                const content = String(op.content ?? '');
                if (content.length > MAX_WRITE_BYTES) throw new Error(`content too large (${content.length} > ${MAX_WRITE_BYTES})`);
                if (content.includes('\u0000')) throw new Error('binary content not supported');
                if (op.op === 'write' && existed) {
                  if (ENFORCE_DIFF) {
                    errors.push({ op, error: 'EDIT_DIFF required for existing files (VIBE_ENFORCE_DIFF=1). Use /api/patch/diff.' });
                    continue;
                  } else {
                    warnings.push({ path: rel, kind: 'prefer_diff', note: 'Editing existing files should use EDIT_DIFF via /api/patch/diff' });
                  }
                }
                await writeFileRecursive(full, content);
                after = content;
              } else if (op.op === 'add_binary' || op.base64 || op.contentBase64) {
                const b64 = String(op.base64 || op.contentBase64 || '');
                const buf = Buffer.from(b64, 'base64');
                if (buf.length > MAX_WRITE_BYTES) throw new Error(`binary too large (${buf.length} > ${MAX_WRITE_BYTES})`);
                await ensureDir(path.dirname(full));
                await fsp.writeFile(full, buf);
                after = null; // treat as binary
              } else {
                throw new Error('unknown op');
              }
              const type = !existed && after !== undefined ? 'added'
                : existed && after === undefined ? 'deleted'
                : existed && after !== undefined && before !== after ? 'modified'
                : 'unchanged';
              const diff = (after === null) ? (`--- a/${rel}\n+++ b/${rel}\n@@\n (binary file)`) : simpleUnifiedDiff(rel, before, after);
              changes.push({ path: rel, type, diff, before, after });
            } catch (e) {
              errors.push({ op, error: String(e && e.message || e) });
            }
          }
          await snapshotChanges(snapshotId, changes);
          const diffAll = changes.map(c => c.diff).join('\n');
          // Log event
          let commitHash = null;
          try {
            if (GIT_ENABLED && isGitRepo()) {
              await gitEnsureRunBranch();
              // Stage files and commit
              const filesToAdd = changes.map(c => c.path).map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ');
              if (filesToAdd) {
                await execGit(`git add -- ${filesToAdd}`);
                const msg = `[ViBE] ${meta.title || 'Patch'} (snapshot ${snapshotId})`;
                await execGit(`git commit -m ${JSON.stringify(msg)}`);
                const out = await execGit('git rev-parse HEAD');
                commitHash = (out.stdout || '').trim();
              }
            }
          } catch (e) {
            pushDebug({ ts: Date.now(), kind: 'git', action: 'commit_error', error: String(e && e.message || e) });
          }
          await appendEvent({ ts: Date.now(), type: 'PATCH_APPLIED', data: { snapshotId, changes: changes.map(c => ({ path: c.path, type: c.type })), commitHash, title: meta.title || '' } });
          const responseChanges = changes.map(({ path: rel, type, diff }) => ({ path: rel, absPath: path.join(ROOT, rel), type, diff }));
          if (!changes.length && errors.length) {
            return sendJSON(res, { ok: false, errors }, 400);
          }
          return sendJSON(res, { ok: true, snapshotId, workspaceRoot: ROOT, changes: responseChanges, diff: diffAll, errors, warnings, commitHash, gitBranch: GIT_BRANCH });
        } finally {
          PATCH_BUSY = false;
        }
      }
      if (pathClean === '/api/run' && req.method === 'POST') {
        const body = await readBody(req);
        const kind = body.kind;
        const timeoutMs = Math.max(1000, Math.min(60_000, Number(body.timeoutMs || 10_000)));

        async function hasNpmTest() {
          try {
            const pkgPath = path.join(ROOT, 'package.json');
            const raw = await fsp.readFile(pkgPath, 'utf8');
            const pkg = JSON.parse(raw);
            return Boolean(pkg.scripts && pkg.scripts.test);
          } catch { return false; }
        }

        let cmd = null;
        if (kind === 'test') {
          const requireConfirm = String(process.env.VIBE_REQUIRE_TEST_CONFIRM || '').trim() === '1';
          if (requireConfirm && !body.confirm) {
            return sendJSON(res, { ok: false, error: 'test execution requires confirmation', hint: 'set VIBE_REQUIRE_TEST_CONFIRM=0 or pass { confirm: true }' }, 403);
          }
          if (await hasNpmTest()) {
            cmd = process.platform === 'win32' ? 'npm.cmd test --silent' : 'npm test --silent';
          } else {
            return sendJSON(res, { ok: true, code: 0, stdout: 'Tests: n/a', stderr: '' });
          }
        } else if (body.cmd === 'node -v') {
          cmd = 'node -v';
        } else {
          return sendJSON(res, { error: 'command not allowed' }, 400);
        }

        exec(cmd, { cwd: ROOT, timeout: timeoutMs }, async (err, stdout, stderr) => {
          const ts = Date.now();
          const combined = String(stdout || '') + (stderr ? (`\n[stderr]\n` + String(stderr)) : '');
          let logRel = null;
          try {
            const fp = await writeLogFile(`test-${ts}.txt`, combined);
            if (fp) logRel = path.relative(ROOT, fp).replace(/\\/g, '/');
          } catch {}
          function lastLines(s, n=50){ const lines=String(s||'').split(/\r?\n/); return lines.slice(-n).join('\n'); }
          if (err) {
            const code = typeof err.code === 'number' ? err.code : 1;
            await appendEvent({ ts: Date.now(), type: 'TEST_RESULT', data: { ok: false, code, stdout: String(stdout||''), stderr: String(stderr||''), logPath: logRel } });
            return sendJSON(res, { ok: false, code, stdout, stderr: String(stderr || err.message || ''), logPath: logRel, last: lastLines(combined) });
          }
          await appendEvent({ ts: Date.now(), type: 'TEST_RESULT', data: { ok: true, code: 0, stdout, stderr, logPath: logRel } });
          return sendJSON(res, { ok: true, code: 0, stdout, stderr, logPath: logRel, last: lastLines(combined) });
        });
        return; // response handled in callback
      }
      if (pathClean === '/api/event' && req.method === 'POST') {
        const body = await readBody(req);
        const type = String(body.type || '').trim();
        const data = body.data || {};
        if (!type) return sendJSON(res, { error: 'type required' }, 400);
        const evt = { ts: Date.now(), type, data };
        await appendEvent(evt);
        return sendJSON(res, { ok: true });
      }
      if (pathClean === '/api/events' && req.method === 'GET') {
        const list = await readEvents();
        return sendJSON(res, { events: list });
      }
      if (pathClean === '/api/config' && req.method === 'GET') {
        const cfg = await readConfig();
        return sendJSON(res, { ok: true, config: cfg });
      }
      if (pathClean === '/api/skills/list' && req.method === 'GET') {
        try {
          const dir = path.join(ROOT, 'skills');
          const ents = await fsp.readdir(dir, { withFileTypes: true }).catch(()=>[]);
          const out = [];
          for (const e of ents) {
            if (!e.isFile()) continue;
            if (!/\.md$/i.test(e.name)) continue;
            const fp = path.join(dir, e.name);
            let title = e.name.replace(/\.md$/i,'');
            try {
              const { content } = await readTextFile(fp, 4000);
              const first = String(content||'').split(/\r?\n/)[0].replace(/^#\s*/,'').trim();
              if (first) title = first;
            } catch {}
            out.push({ name: e.name.replace(/\.md$/i,''), file: path.relative(ROOT, fp).replace(/\\/g,'/'), title });
          }
          return sendJSON(res, { ok: true, skills: out });
        } catch (e) { return sendJSON(res, { ok: true, skills: [] }); }
      }
      if (pathClean === '/api/stats' && req.method === 'GET') {
        const events = await readEvents();
        const counts = Object.create(null);
        let testsOk = 0, testsFail = 0;
        let patchCount = 0, patchFilesTotal = 0;
        let lastPatch = null;
        for (const e of events) {
          if (!e || !e.type) continue;
          counts[e.type] = (counts[e.type] || 0) + 1;
          if (e.type === 'TEST_RESULT') {
            if (e.data && e.data.ok) testsOk++; else testsFail++;
          }
          if (e.type === 'PATCH_APPLIED') {
            patchCount++;
            const ch = (e.data && e.data.changes) || [];
            patchFilesTotal += ch.length;
            lastPatch = e;
          }
        }
        // recent changed files (dedup, last 20)
        const recentFiles = [];
        const seen = new Set();
        for (let i = events.length - 1; i >= 0 && recentFiles.length < 20; i--) {
          const e = events[i];
          if (e && e.type === 'PATCH_APPLIED') {
            const ch = (e.data && e.data.changes) || [];
            for (const c of ch) {
              const p = c && c.path; if (!p) continue;
              if (!seen.has(p)) { recentFiles.push(p); seen.add(p); if (recentFiles.length >= 20) break; }
            }
          }
        }
        // snapshot count
        let snapshots = 0;
        try {
          const base = path.join(ROOT, '.vibe', 'snapshots');
          const ents = await fsp.readdir(base, { withFileTypes: true });
          snapshots = ents.filter(e => e.isDirectory()).length;
        } catch {}
        // logs count
        let logsCount = 0;
        try {
          await ensureDir(LOGS_DIR);
          const ents = await fsp.readdir(LOGS_DIR, { withFileTypes: true });
          logsCount = ents.filter(e => e.isFile()).length;
        } catch {}
        const lastPatchSummary = lastPatch ? {
          ts: lastPatch.ts || Date.now(),
          snapshotId: (lastPatch.data && lastPatch.data.snapshotId) || null,
          changes: (lastPatch.data && Array.isArray(lastPatch.data.changes)) ? lastPatch.data.changes.length : 0,
          commitHash: (lastPatch.data && lastPatch.data.commitHash) || null,
          title: (lastPatch.data && lastPatch.data.title) || ''
        } : null;
        return sendJSON(res, {
          ok: true,
          workspaceRoot: ROOT,
          gitBranch: GIT_BRANCH,
          totalEvents: events.length,
          counts,
          tests: { ok: testsOk, fail: testsFail },
          patches: { count: patchCount, files: patchFilesTotal, last: lastPatchSummary },
          recentFiles,
          snapshots,
          logs: { count: logsCount }
        });
      }
      if (pathClean === '/api/snapshots/list' && req.method === 'GET') {
        const base = path.join(ROOT, '.vibe', 'snapshots');
        const out = [];
        try {
          const ents = await fsp.readdir(base, { withFileTypes: true });
          for (const ent of ents) {
            if (!ent.isDirectory()) continue;
            const id = ent.name;
            const fp = path.join(base, id);
            const st = await fsp.stat(fp).catch(() => null);
            out.push({ id, mtimeMs: st ? st.mtimeMs : 0 });
          }
          out.sort((a,b) => b.mtimeMs - a.mtimeMs);
        } catch {}
        return sendJSON(res, { snapshots: out });
      }
      if (pathClean === '/api/snapshots/prune' && (req.method === 'POST' || req.method === 'GET')) {
        const keepQ = searchParams.get('keep');
        const body = req.method === 'POST' ? await readBody(req) : {};
        const keep = Math.max(0, Number((body.keep !== undefined ? body.keep : (keepQ || 0))));
        const base = path.join(ROOT, '.vibe', 'snapshots');
        let removed = [];
        try {
          const ents = await fsp.readdir(base, { withFileTypes: true });
          const dirs = [];
          for (const ent of ents) { if (ent.isDirectory()) { const fp = path.join(base, ent.name); const st = await fsp.stat(fp).catch(()=>null); dirs.push({ id: ent.name, m: st?st.mtimeMs:0 }); } }
          dirs.sort((a,b)=>b.m - a.m);
          const toDelete = dirs.slice(keep);
          for (const d of toDelete) { await fsp.rm(path.join(base, d.id), { recursive: true, force: true }); removed.push(d.id); }
        } catch {}
        return sendJSON(res, { ok: true, removed });
      }
      if (pathClean === '/api/tree') {
        const userPath = searchParams.get('path') || '.';
        const depth = Math.max(0, Math.min(5, Number(searchParams.get('depth') || '2')));
        const full = safeJoin(userPath);
        const ok = await exists(full);
        if (!ok) return sendJSON(res, { error: 'Not found' }, 404);
        const out = await listTree(full, depth);
        return sendJSON(res, { root: path.relative(ROOT, full).replace(/\\/g, '/') || '.', depth, entries: out });
      }
      if (pathClean === '/api/file') {
        const userPath = searchParams.get('path');
        if (!userPath) return sendJSON(res, { error: 'path required' }, 400);
        const full = safeJoin(userPath);
        const ok = await exists(full);
        if (!ok) return sendJSON(res, { error: 'Not found' }, 404);
        // Optional range params (bytes)
        const startQ = searchParams.get('start');
        const endQ = searchParams.get('end');
        const headQ = searchParams.get('head');
        const tailQ = searchParams.get('tail');
        const maxBytesQ = searchParams.get('maxBytes');
        const hasRange = (startQ !== null && startQ !== undefined) || (endQ !== null && endQ !== undefined) || (headQ !== null && headQ !== undefined) || (tailQ !== null && tailQ !== undefined);
        // Validate mutual exclusivity
        if (((startQ != null) || (endQ != null)) && ((headQ != null) || (tailQ != null))) {
          return sendJSON(res, { error: 'Specify either start/end or head/tail, not both' }, 400);
        }
        if ((headQ != null) && (tailQ != null)) {
          return sendJSON(res, { error: 'Specify either head or tail, not both' }, 400);
        }
        if (hasRange) {
          const st = await fsp.stat(full);
          const size = st.size;
          const CAP = 500_000; // maximum bytes to read in one request
          if (headQ != null) {
            const n = Math.max(0, Math.min(CAP, Number(headQ || 0)));
            const end = Math.min(size, n);
            const out = await readTextFileRange(full, 0, end);
            return sendJSON(res, { path: userPath, size: out.size, content: out.content, range: out.range });
          }
          if (tailQ != null) {
            const n = Math.max(0, Math.min(CAP, Number(tailQ || 0)));
            const start = Math.max(0, size - n);
            const out = await readTextFileRange(full, start, size);
            return sendJSON(res, { path: userPath, size: out.size, content: out.content, range: out.range });
          }
          // start/end path
          let start = Number(startQ != null ? startQ : 0);
          let end = Number(endQ != null ? endQ : (start + CAP));
          if (!Number.isFinite(start) || !Number.isFinite(end)) return sendJSON(res, { error: 'Invalid start/end' }, 400);
          if (end - start > CAP) end = start + CAP;
          const out = await readTextFileRange(full, start, end);
          return sendJSON(res, { path: userPath, size: out.size, content: out.content, range: out.range });
        }
        // Fallback to default capped read, allowing optional maxBytes override (guarded)
        let maxBytes = Number(maxBytesQ || 0);
        if (!Number.isFinite(maxBytes) || maxBytes <= 0) maxBytes = 100_000;
        maxBytes = Math.min(500_000, Math.max(1_000, maxBytes));
        const { size, content } = await readTextFile(full, maxBytes);
        return sendJSON(res, { path: userPath, size, content });
      }
      if (pathClean === '/api/diff/generate' && req.method === 'POST') {
        const body = await readBody(req);
        const rel = String(body.path || '').replace(/^\/+/, '');
        if (!rel) return sendJSON(res, { error: 'path required' }, 400);
        const newContent = (body.newContent !== undefined) ? String(body.newContent) : null;
        const oldContentOverride = (body.oldContent !== undefined) ? String(body.oldContent) : null;
        if (newContent === null) return sendJSON(res, { error: 'newContent required' }, 400);
        const full = safeJoin(rel);
        let existed = await exists(full);
        let oldContent = oldContentOverride;
        if (oldContent === null) {
          if (existed) { try { const r = await readTextFile(full, 1_000_000); oldContent = r.content; } catch { oldContent = ''; } }
          else { oldContent = ''; }
        }
        const diff = fullReplaceUnifiedDiff(rel, oldContent, newContent);
        return sendJSON(res, { ok: true, path: rel, diff });
      }
      if (pathClean === '/api/patch/diff' && req.method === 'POST') {
        const body = await readBody(req);
        const diffText = String(body.diff || '').replace(/\r\n/g, '\n');
        const keepRegions = body.keepRegions !== false; // default true
        const preview = !!body.preview;
        if (!diffText.trim()) return sendJSON(res, { error: 'diff required' }, 400);

        function allowWrite(rel) {
          const base = path.basename(rel);
          if (base === '.git') return false;
          if (rel.includes('/.git/') || rel.includes('\\.git\\')) return false;
          if (rel.split(/[\\/]/).includes('.git')) return false;
          if (rel.includes('node_modules')) return false;
          return true;
        }
        function parseUnifiedDiff(text) {
          const files = [];
          const lines = text.split(/\n/);
          let i = 0; let cur = null;
          while (i < lines.length) {
            const line = lines[i];
            if (line.startsWith('--- ')) {
              const next = lines[i+1] || '';
              const mOld = line.match(/^---\s+(?:a\/)?(.+)$/);
              const mNew = next.match(/^\+\+\+\s+(?:b\/)?(.+)$/);
              if (mOld && mNew) {
                if (cur) files.push(cur);
                cur = { oldPath: mOld[1], newPath: mNew[1], hunks: [] };
                i += 2; continue;
              }
            }
            if (line.startsWith('@@ ')) {
              const m = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
              if (m && cur) {
                const hunk = { aStart: Number(m[1]||'0'), aCount: Number(m[2]||'0'), bStart: Number(m[3]||'0'), bCount: Number(m[4]||'0'), lines: [] };
                i++;
                while (i < lines.length) {
                  const hl = lines[i];
                  if (/^[@][@]/.test(hl) || /^---\s/.test(hl)) break;
                  if (hl.startsWith(' ') || hl.startsWith('+') || hl.startsWith('-')) hunk.lines.push(hl);
                  else if (hl.trim() === '') hunk.lines.push(' ');
                  else break;
                  i++;
                }
                cur.hunks.push(hunk);
                continue;
              }
            }
            i++;
          }
          if (cur) files.push(cur);
          return files;
        }
        function findKeepRegions(text) {
          const regs = [];
          const ls = text.split(/\n/);
          let start = null;
          for (let idx = 0; idx < ls.length; idx++) {
            const l = ls[idx];
            if (l.includes('VIBE-KEEP START')) start = idx + 1;
            if (l.includes('VIBE-KEEP END') && start !== null) { regs.push([start, idx + 1]); start = null; }
          }
          return regs;
        }
        function withinKeep(regs, lineNo) {
          for (const [a,b] of regs) { if (lineNo >= a && lineNo <= b) return true; }
          return false;
        }
        function applyHunks(orig, hunks, regs, warnings) {
          const inLines = orig.split(/\n/);
          let out = [];
          let ptr = 1; // 1-based current read pointer in inLines
          let applied = 0, skipped = 0;
          const FUZZ = 3;
          for (const h of hunks) {
            // Fuzzy align start using first context line within +/- FUZZ of h.aStart
            let firstCtx = null;
            for (const line of h.lines) { if (line[0] === ' ') { firstCtx = line.slice(1); break; } }
            let targetStart = h.aStart;
            if (firstCtx) {
              const searchStart = Math.max(ptr, h.aStart - FUZZ);
              const searchEnd = Math.min(inLines.length, h.aStart + FUZZ);
              for (let pos = searchStart; pos <= searchEnd; pos++) {
                if (inLines[pos - 1] === firstCtx) { targetStart = pos; break; }
              }
              if (targetStart !== h.aStart) warnings.push({ kind: 'fuzzy_offset', note: `Applied with offset near ${h.aStart}` });
            }
            if (targetStart < ptr) { warnings.push({ kind: 'out_of_order', note: 'Hunk before current pointer; skipping' }); skipped++; continue; }
            // Copy up to targetStart - 1
            while (ptr < targetStart && ptr <= inLines.length) { out.push(inLines[ptr - 1]); ptr++; }

            // Attempt to apply hunk lines; rollback if any mismatch
            const saveOutLen = out.length;
            const savePtr = ptr;
            let hunkOk = true;
            for (const hl of h.lines) {
              const sign = hl[0];
              const txt = hl.slice(1);
              if (sign === ' ') {
                if (inLines[ptr - 1] !== txt) { warnings.push({ kind: 'context_mismatch', note: 'Context mismatch; skipping hunk' }); hunkOk = false; break; }
                out.push(txt); ptr++;
              } else if (sign === '-') {
                if (keepRegions && withinKeep(regs, ptr)) { warnings.push({ kind: 'keep_region', note: 'Attempted delete within keep region' }); hunkOk = false; break; }
                if (inLines[ptr - 1] !== txt) { warnings.push({ kind: 'delete_mismatch', note: 'Delete line mismatch; skipping hunk' }); hunkOk = false; break; }
                // delete: advance ptr without adding line
                ptr++;
              } else if (sign === '+') {
                if (keepRegions && withinKeep(regs, ptr)) { warnings.push({ kind: 'keep_region', note: 'Attempted insert within keep region' }); hunkOk = false; break; }
                out.push(txt);
              }
            }
            if (hunkOk) {
              applied++;
            } else {
              // rollback
              out.length = saveOutLen;
              ptr = savePtr;
              skipped++;
              // leave original content unchanged for this hunk; continue to next hunk
            }
          }
          // copy remainder
          while (ptr <= inLines.length) { out.push(inLines[ptr - 1]); ptr++; }
          return { text: out.join('\n'), applied, skipped };
        }

        const patches = parseUnifiedDiff(diffText);
        if (!patches.length) return sendJSON(res, { error: 'no file hunks found in diff' }, 400);
        const changes = [];
        const warnings = [];
        for (const p of patches) {
          const rel = (p.newPath || p.oldPath || '').replace(/^\/+/, '');
          if (!rel) { warnings.push({ path: rel, kind: 'invalid_path' }); continue; }
          if (!allowWrite(rel)) { warnings.push({ path: rel, kind: 'path_blocked' }); continue; }
          const full = safeJoin(rel);
          let existed = await exists(full);
          let before = existed ? (await fsp.readFile(full, 'utf8')) : '';
          const regs = keepRegions ? findKeepRegions(before) : [];
          const { text: afterText, applied, skipped } = applyHunks(before, p.hunks, regs, warnings);
          const type = !existed && afterText !== undefined ? 'added'
            : existed && afterText === undefined ? 'deleted'
            : existed && before !== afterText ? 'modified'
            : 'unchanged';
          if (!preview && afterText !== undefined && type !== 'unchanged') {
            await writeFileRecursive(full, afterText);
          }
          const fileDiff = simpleUnifiedDiff(rel, before, afterText);
          changes.push({ path: rel, type, diff: fileDiff, before, after: afterText, appliedHunks: applied, skippedHunks: skipped });
        }
        let snapshotId = null;
        let commitHash = null;
        if (!preview) {
          snapshotId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
          await snapshotChanges(snapshotId, changes);
          try {
            if (GIT_ENABLED && isGitRepo()) {
              await gitEnsureRunBranch();
              const filesToAdd = changes.map(c => c.path).map(p => `"${p.replace(/"/g, '\\"')}"`).join(' ');
              if (filesToAdd) {
                await execGit(`git add -- ${filesToAdd}`);
                const msg = `[ViBE] Apply diff (snapshot ${snapshotId})`;
                await execGit(`git commit -m ${JSON.stringify(msg)}`);
                const out = await execGit('git rev-parse HEAD');
                commitHash = (out.stdout || '').trim();
              }
            }
          } catch (e) { pushDebug({ ts: Date.now(), kind: 'git', action: 'commit_error', error: String(e && e.message || e) }); }
          await appendEvent({ ts: Date.now(), type: 'PATCH_APPLIED', data: { snapshotId, changes: changes.map(c => ({ path: c.path, type: c.type })), commitHash, title: 'Apply diff' } });
        }
        const diffAll = changes.map(c => c.diff).join('\n');
        // Persist combined diff to logs for auditing
        let diffRel = null;
        try {
          if (!preview) {
            const name = `diff-${snapshotId || Date.now()}.diff`;
            const fp = await writeLogFile(name, diffAll);
            if (fp) diffRel = path.relative(ROOT, fp).replace(/\\/g, '/');
          }
        } catch {}
        const responseChanges = changes.map(({ path: rel, type, diff }) => ({ path: rel, absPath: path.join(ROOT, rel), type, diff }));
        return sendJSON(res, { ok: true, preview, snapshotId, workspaceRoot: ROOT, changes: responseChanges, diff: diffAll, warnings, commitHash, gitBranch: GIT_BRANCH, diffPath: diffRel });
      }
      if (pathClean === '/api/search') {
        const q = (searchParams.get('q') || '').trim();
        if (!q) return sendJSON(res, { error: 'q required' }, 400);
        const max = Math.max(1, Math.min(200, Number(searchParams.get('max') || '50')));
        const dir = (searchParams.get('dir') || '.').trim();
        const ext = (searchParams.get('ext') || '').trim();
        const regexQ = (searchParams.get('regex') || '').trim();
        const caseQ = (searchParams.get('case') || '').trim();
        const contextQ = (searchParams.get('context') || '').trim();
        const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v || ''));
        const regex = truthy(regexQ);
        const caseSensitive = truthy(caseQ) || /^(sensitive|cs|case)$/i.test(caseQ);
        let context = Number(contextQ || 0);
        if (!Number.isFinite(context) || context < 0) context = 0;
        context = Math.min(10, context);
        const root = safeJoin(dir);
        const out = await searchRepo(root, q, max, 1_000_000, ext || null, { regex, caseSensitive, context });
        return sendJSON(res, { q, dir, ext: ext || null, regex, case: caseSensitive ? 'sensitive' : 'insensitive', context, matches: out });
      }
      return sendJSON(res, { error: 'Unknown endpoint' }, 404);
    }
    // Static
    return serveStatic(req, res, pathname);
  } catch (e) {
    try { console.error('HTTP handler error:', e && e.stack || e); } catch {}
    sendJSON(res, { error: String(e && e.message || e) }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`ViBE server listening on http://localhost:${PORT}`);
  console.log(`Workspace root: ${ROOT}`);
  try { console.log(`UI base: ${UI_DIR}`); } catch {}
});

// Optional: OpenAI client (simple) for V7 planning
async function openaiPlan(goal) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const body = {
    model,
    messages: [
      { role: 'system', content: 'You are a strict planner. Output only a JSON object with planId, goal, tasks array. Each task has taskId, title, status (PLANNED), steps (array), notes (string). No commentary.' },
      { role: 'user', content: `Goal: ${goal}. Produce a Plan JSON.` }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '{}';
  let plan;
  try { plan = JSON.parse(text); } catch { throw new Error('Invalid JSON from model'); }
  if (!plan || !Array.isArray(plan.tasks)) throw new Error('Plan missing tasks');
  try { pushDebug({ ts: Date.now(), kind: 'plan', model, goal, response: { raw: String(text).slice(0, 5000), parsed: true, tasks: Array.isArray(plan.tasks) ? plan.tasks.length : 0 } }); } catch {}
  return plan;
}

// Lightweight global fetch polyfill via https for older Node (if needed)
async function fetch(url, opts = {}) {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch(url, opts);
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ method: opts.method || 'GET', hostname: u.hostname, path: u.pathname + u.search, headers: opts.headers || {} }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: async () => JSON.parse(data) }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function openaiChat(text, context, history = [], options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const system = [
    'You are a coding agent operating on the current repository.',
    'Your job is to understand the user request and keep a structured plan (as JSON) for changes IN THIS REPO.',
    'Policy:',
    '1) Clarify once when ambiguous. If the user answers your clarification, PRODUCE A PLAN (do not keep re-clarifying).',
    '2) Prefer in-repo solutions. Before proposing work, LIST FILES and READ README.md if present; extract instructions from README first. Do NOT scaffold a generic app (e.g., todo app) unless the user explicitly asks. If the user explicitly says "from scratch", ask for an app name/directory and prefer ./app unless a name is provided.',
    '3) When ready to propose work, emit actions from this set as needed: EMIT_PLAN (with plan), REPLAN (with plan), PROCEED_EXECUTION, HALT_EXECUTION, ASK_INPUT (with question/options), PLAN_ONLY (no execution).',
    '4) Tasks must be relevant to THIS repo, start with status PLANNED, and be realistic next steps.',
    '5) Output must be exactly one JSON object: { "message": string, "actions": Action[] }. No additional prose.',
    '6) Available tools: READ_TREE { dir?, depth? }, READ_FILE { path }, SEARCH { q, dir?, max?, context?, caseSensitive?, regex?, ext? }, CREATE_DIR { path }, CREATE_FILE { path, content }, CREATE_FILE_BINARY { path, base64 }, UPDATE_FILE { path, content }, EDIT_DIFF { diff }, UPDATE_MEMORY { kind, diff }, TASK { kind, ... }, EMIT_PLAN/REPLAN { plan }, PROCEED_EXECUTION, HALT_EXECUTION, PLAN_ONLY, ASK_INPUT.',
    'Tool usage examples:',
    '  - READ_TREE { dir: ".", depth: 2 }',
    '  - READ_FILE { path: "README.md" }',
    '  - SEARCH { q: "dark mode", dir: ".", context: 1 }',
    '  - CREATE_DIR { path: "demo-app" }',
    '  - CREATE_FILE { path: "demo-app/index.html", content: "<!doctype html>..." }',
    '  - EDIT_DIFF { diff: "--- a/app.js\n+++ b/app.js\n@@ ..." }',
    '7) Preferred write method is EDIT_DIFF with unified diffs. Use minimal context and accurate hunks. Avoid full-file rewrites unless absolutely necessary. For memory files use UPDATE_MEMORY.',
    '8) When creating files, use CREATE_FILE with fields { path, content } and include the full file contents needed (HTML/CSS/JS).',
    '9) When modifying existing files without diffs, you may use UPDATE_FILE with { path, content } including the entire revised file content (avoid if large).',
    '10) When creating directories, use CREATE_DIR with { path }.',
    '11) Your message should briefly state assumptions and next step. Do not ask meta-clarifications like "what does from scratch mean" when the domain is obvious (e.g., a to-do app).',
    '12) If the user requests to start/stop/continue execution, emit PROCEED_EXECUTION or HALT_EXECUTION accordingly (do not rely on client shortcuts).',
    '13) If you return PROCEED_EXECUTION with no pending tasks, it is invalid; choose REPLAN or UPDATE_FILE/CREATE_FILE/ASK_INPUT/EDIT_DIFF to create new work.',
    '14) Example unified diff:',
    '--- a/src/main.js',
    '+++ b/src/main.js',
    '@@ -1,3 +1,4 @@',
    " console.log('start')",
    "+console.log('hello from ViBE')",
    ' function run() {',
    '   return true;',
    'MESSAGE STYLE: Write concise, action-focused messages. Include 1) Summary: <what you did/plan>, 2) Files: <paths>, 3) Next: <short suggestion>. Avoid generic statements like \"No pending tasks\" or UI states. Keep to 1–2 lines.',
    'Context will be provided with a small repo summary and recent chat history. Environment constraints: write access only within this workspace; cannot create external repos here.',
  ].join('\n');
  const messages = [
    { role: 'system', content: system },
    { role: 'system', content: `Repo summary: ${JSON.stringify(context)}` },
  ];
  // include recent chat history (role: user|assistant)
  if (Array.isArray(history)) {
    const trimmed = history.slice(-10);
    for (const m of trimmed) {
      if (!m || !m.role || !m.content) continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      messages.push({ role, content: String(m.content) });
    }
  }
  messages.push({ role: 'user', content: text });
  if (options && options.forceActions) {
    messages.push({ role: 'system', content: 'Your previous reply contained no actions. Now return at least one appropriate action (EMIT_PLAN, REPLAN, PROCEED_EXECUTION, HALT_EXECUTION, PLAN_ONLY, ASK_INPUT). Do not return empty actions.' });
  }

  // Allow callers to inject extra system guidance (e.g., revision context)
  if (options && typeof options.extraSystem === 'string' && options.extraSystem.trim()) {
    messages.push({ role: 'system', content: options.extraSystem.trim() });
  }

  const body = {
    model,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.2,
  };
  const debugBase = {
    ts: Date.now(),
    kind: 'chat',
    model,
    forceActions: !!(options && options.forceActions),
    extraSystemLen: (options && typeof options.extraSystem === 'string') ? options.extraSystem.length : 0,
    request: { messages: sanitizeMessages(messages) },
  };
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const textOut = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '{}';
  let obj;
  try { obj = JSON.parse(textOut); } catch { throw new Error('Invalid JSON from model'); }
  try { pushDebug({ ...debugBase, response: { raw: String(textOut).slice(0, 5000), parsedKeys: Object.keys(obj || {}) } }); } catch {}
  return obj;
}

async function openaiWrapUp(summary) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const system = [
    'You are a succinct assistant writing a final wrap-up for a completed coding task.',
    'Write 1–2 lines, high signal. Use ONLY provided facts.',
    'Mention at most 1–2 meaningful files (ignore .gitkeep and trivial scaffolds).',
    'State outcome and suggest a concrete next step.',
    'If tests failed, say so first and offer to show errors or revert.',
  ].join('\n');
  const facts = JSON.stringify(summary);
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `Facts: ${facts}` },
      { role: 'user', content: 'Now produce the final wrap-up (1–2 lines). No boilerplate. No assumptions beyond facts.' }
    ],
    temperature: 0.2
  };
  const res = await fetch(`${base}/chat/completions`, { method:'POST', headers:{ 'Authorization':`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
  return text.trim();
}
