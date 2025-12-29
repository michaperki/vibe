#!/usr/bin/env node
// ViBE CLI — start/init/perms/doctor
// Examples:
//   vibe start . --open --port 7080
//   vibe init .
//   vibe perms --read on --write off --test on
//   vibe doctor

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (v !== undefined) out[key] = v; else out[key] = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function resolveDir(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    console.error(`Path not found or not a directory: ${abs}`);
    process.exit(1);
  }
  return abs;
}

function openBrowser(url) {
  const platform = process.platform;
  let cmd, args;
  if (platform === 'win32') { cmd = 'cmd'; args = ['/c', 'start', '', url]; }
  else if (platform === 'darwin') { cmd = 'open'; args = [url]; }
  else { cmd = 'xdg-open'; args = [url]; }
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.unref();
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function cmdStart(args) {
  const target = args._[1] || '.';
  const root = resolveDir(target);
  process.env.VIBE_WORKSPACE = root;
  if (args.port) process.env.PORT = String(args.port);
  const port = Number(process.env.PORT || 7080);
  console.log(`Starting ViBE at ${root} on port ${port}...`);
  // Start server in this process
  require('./server');
  // Optional open
  const wantOpen = args.open === true || String(args.open || '').toLowerCase() === 'true';
  if (wantOpen) setTimeout(() => openBrowser(`http://localhost:${port}/`), 600);
}

function cmdInit(args) {
  const target = args._[1] || '.';
  const root = resolveDir(target);
  // .vibe/
  ensureDir(path.join(root, '.vibe'));
  ensureDir(path.join(root, '.vibe', 'snapshots'));
  try { fs.writeFileSync(path.join(root, '.vibe', '.gitkeep'), ''); } catch {}
  // .gitignore
  const gi = path.join(root, '.gitignore');
  try {
    let txt = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
    if (!/^[\s\S]*^\.vibe\/$/m.test(txt)) { txt += (txt && !txt.endsWith('\n') ? '\n' : '') + '.vibe/\n'; fs.writeFileSync(gi, txt, 'utf8'); }
  } catch {}
  // .env template
  const envp = path.join(root, '.env');
  if (!fs.existsSync(envp)) {
    const tmpl = [
      'OPENAI_API_KEY=\n# OPENAI_MODEL=gpt-4o-mini',
      '# PORT=7080',
      '# VIBE_REQUIRE_TEST_CONFIRM=1'
    ].join('\n');
    fs.writeFileSync(envp, tmpl, 'utf8');
  }
  console.log(`Initialized ViBE files in ${root}`);
}

function cmdPerms(args) {
  const root = resolveDir(args._[1] || '.');
  const cfgPath = path.join(root, '.vibe', 'config.json');
  ensureDir(path.dirname(cfgPath));
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
  cfg.perms = cfg.perms || {};
  function toBool(val) { const s = String(val||'').toLowerCase(); return s === 'on' || s === 'true' || s === '1'; }
  if (args.read !== undefined) cfg.perms.read = toBool(args.read);
  if (args.write !== undefined) cfg.perms.write = toBool(args.write);
  if (args.test !== undefined) cfg.perms.test = toBool(args.test);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
  console.log(`Saved permissions in ${cfgPath}: ${JSON.stringify(cfg.perms)}`);
}

function cmdDoctor(args) {
  const root = resolveDir(args._[1] || '.');
  const nodeVer = process.versions.node;
  const okNode = (() => { try { const [maj] = nodeVer.split('.').map(Number); return maj >= 18; } catch { return false; } })();
  const envp = path.join(root, '.env');
  let hasKey = false;
  try { const txt = fs.readFileSync(envp, 'utf8'); hasKey = /OPENAI_API_KEY\s*=\s*\S+/.test(txt); } catch {}
  console.log(`Node: ${nodeVer} (${okNode ? 'ok' : 'need >=18'})`);
  console.log(`Workspace: ${root}`);
  console.log(`.env: ${fs.existsSync(envp) ? 'present' : 'missing'}${hasKey ? ' (OPENAI_API_KEY set)' : ''}`);
  console.log('Try: vibe start . --open');
}

function main() {
  const args = parseArgs(process.argv);
  const cmd = (args._[0] || 'start').toLowerCase();
  if (cmd === 'start') return cmdStart(args);
  if (cmd === 'init') return cmdInit(args);
  if (cmd === 'perms') return cmdPerms(args);
  if (cmd === 'doctor') return cmdDoctor(args);
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main();
