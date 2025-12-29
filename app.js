/*
  ViBE V0/V1 — Single-page demo
  - V0: Scripted UX proof (fake plan + timers)
  - V1: Structured agent state + fake tools + persistence
*/

const qs = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const chatMessagesEl = qs('#chatMessages');
const chatForm = qs('#chatForm');
const chatText = qs('#chatText');
const subtitleEl = qs('#subtitle');
const btnModeV0 = qs('#btnModeV0');
const btnModeV1 = qs('#btnModeV1');
const btnReset = qs('#btnReset');
const btnModeV2 = qs('#btnModeV2');
const btnModeV3 = qs('#btnModeV3');
const btnModeV4 = qs('#btnModeV4');
const btnModeV5 = qs('#btnModeV5');
const btnModeV6 = qs('#btnModeV6');
const btnModeV7 = qs('#btnModeV7');
const btnAutopilot = qs('#btnAutopilot');
const btnTerminal = qs('#btnTerminal');
const workspaceInfoEl = qs('#workspaceInfo');
const btnChangeWorkspace = qs('#btnChangeWorkspace');
const btnHelp = qs('#btnHelp');
const btnSkills = qs('#btnSkills');
const btnNewSession = qs('#btnNewSession');
const permBanner = qs('#permBanner');
const wsModal = qs('#wsModal');
const wsClose = qs('#wsClose');
const wsCopy = qs('#wsCopy');
const wsCommand = qs('#wsCommand');
const wsCurrent = qs('#wsCurrent');
const helpModal = qs('#helpModal');
const helpClose = qs('#helpClose');
const helpBody = qs('#helpBody');
const skillsModal = qs('#skillsModal');
const skillsClose = qs('#skillsClose');
const skillsSave = qs('#skillsSave');
const skillsList = qs('#skillsList');
const btnPerms = qs('#btnPerms');
const permModal = qs('#permModal');
const permClose = qs('#permClose');
const permRead = qs('#permRead');
const permWrite = qs('#permWrite');
const permTest = qs('#permTest');
const permSave = qs('#permSave');
const permGrantAll = qs('#permGrantAll');
const permDenyAll = qs('#permDenyAll');
const gitTagEl = qs('#gitTag');
const btnCopyBranch = qs('#btnCopyBranch');
// Dev Tools
const btnDevTools = qs('#btnDevTools');
const devModal = qs('#devModal');
const devBody = qs('#devBody');
const devClose = qs('#devClose');
const devCopy = qs('#devCopy');
const devRefresh = qs('#devRefresh');
const devTailToggle = qs('#devTailToggle');
const devKeepStrictToggle = qs('#devKeepStrictToggle');
const devExecInChatToggle = qs('#devExecInChatToggle');
const devSnapKeep = qs('#devSnapKeep');
const devSnapPrune = qs('#devSnapPrune');
const devSnapList = qs('#devSnapList');
const devStats = qs('#devStats');
let devTailTimer = null;
let selectedSkills = [];
let handoffNext = false;

const colPlanned = qs('#col-planned');
const colExecuting = qs('#col-executing');
const colVerifying = qs('#col-verifying');
const colDone = qs('#col-done');
const colNeeds = qs('#col-needs');

const tabButtons = qsa('.tab');
const tabDiff = qs('#tab-diff');
const tabLogs = qs('#tab-logs');
const tabTests = qs('#tab-tests');
const tabPlan = qs('#tab-plan');
const planBody = qs('#planBody');
const btnPlanToggle = qs('#btnPlanToggle');
let showPlanRaw = false;
const tabMemory = qs('#tab-memory');
const btnEditDecisions = qs('#btnEditDecisions');
const btnEditCurrent = qs('#btnEditCurrent');
const btnPreviewDiff = qs('#btnPreviewDiff');
const btnQuote = qs('#btnQuote');
const gutterLeft = qs('.gutter-left');
const gutterRight = qs('.gutter-right');
const diffModal = qs('#diffModal');
const modalBody = qs('#modalBody');
const modalClose = qs('#modalClose');
const modalCopy = qs('#modalCopy');
const modalFileSelect = qs('#modalFileSelect');
const modalFilter = qs('#modalFilter');
const kanbanStatusEl = qs('#kanbanStatus');
const btnReapplyCard = qs('#btnReapplyCard');
const modalRevertFile = qs('#modalRevertFile');
const modalReapplyFile = qs('#modalReapplyFile');
let statusTimer = null;
let statusStart = 0;
let modalLastSelectedPath = '__all__';
let modalRawAll = '';
let modalRawFiles = [];
let keepRegionsStrict = true;
let noPendingNoticeShown = false;
let execInChat = false;
let perms = { read: false, write: false, test: false };
let terminalMode = false;
let chatWidth = 340;
let evidWidth = 420;

try {
  const pref = localStorage.getItem('vibe.keepStrict');
  if (pref === '0') keepRegionsStrict = false;
  const eic = localStorage.getItem('vibe.execInChat');
  execInChat = eic === '1';
  const tmode = localStorage.getItem('vibe.terminal');
  terminalMode = tmode === '1';
  const cw = parseInt(localStorage.getItem('vibe.chatWidth') || '0', 10);
  const ew = parseInt(localStorage.getItem('vibe.evidWidth') || '0', 10);
  if (cw > 200) chatWidth = cw;
  if (ew > 200) evidWidth = ew;
} catch {}
// Skills init
try {
  const raw = localStorage.getItem('vibe.skills');
  if (raw) selectedSkills = JSON.parse(raw);
} catch {}
// Permissions init
try {
  const rawPerms = localStorage.getItem('vibe.perms');
  if (rawPerms) perms = { ...perms, ...JSON.parse(rawPerms) };
} catch {}
// Hydrate from server config if no local perms
(async function hydratePermsFromServer() {
  try {
    const local = localStorage.getItem('vibe.perms');
    if (local) return;
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const data = await res.json();
    const cfg = data && data.config || {};
    if (cfg.perms && typeof cfg.perms === 'object') {
      perms = { ...perms, ...cfg.perms };
      try { localStorage.setItem('vibe.perms', JSON.stringify(perms)); } catch {}
    }
  } catch {}
})();
function savePerms() { try { localStorage.setItem('vibe.perms', JSON.stringify(perms)); } catch {} }
function openPermsModal() {
  try {
    if (permRead) permRead.checked = !!perms.read;
    if (permWrite) permWrite.checked = !!perms.write;
    if (permTest) permTest.checked = !!perms.test;
  } catch {}
  permModal.classList.remove('hidden');
  permModal.setAttribute('aria-hidden', 'false');
}
function closePermsModal() { permModal.classList.add('hidden'); permModal.setAttribute('aria-hidden', 'true'); }
btnPerms?.addEventListener('click', openPermsModal);
permClose?.addEventListener('click', closePermsModal);
permSave?.addEventListener('click', () => {
  perms.read = !!permRead.checked; perms.write = !!permWrite.checked; perms.test = !!permTest.checked; savePerms(); closePermsModal(); addMessage({ who:'system', text: 'Permissions updated.' });
});
permGrantAll?.addEventListener('click', () => { if (permRead) permRead.checked = true; if (permWrite) permWrite.checked = true; if (permTest) permTest.checked = true; });
permDenyAll?.addEventListener('click', () => { if (permRead) permRead.checked = false; if (permWrite) permWrite.checked = false; if (permTest) permTest.checked = false; });
function startStatus(text) {
  if (!kanbanStatusEl) return;
  statusStart = Date.now();
  kanbanStatusEl.textContent = text;
  kanbanStatusEl.classList.add('loading');
  stopStatus();
  statusTimer = setInterval(() => {
    const s = Math.round((Date.now() - statusStart) / 1000);
    kanbanStatusEl.textContent = `${text} (${s}s)`;
  }, 500);
}
function stopStatus() {
  if (statusTimer) clearInterval(statusTimer);
  statusTimer = null;
  if (kanbanStatusEl) kanbanStatusEl.classList.remove('loading');
}
// Apply initial UI state (terminal + widths)
try {
  if (terminalMode) {
    document.body.classList.add('terminal-mode');
    if (btnTerminal) btnTerminal.textContent = 'Terminal: On';
  }
  document.documentElement.style.setProperty('--chat', chatWidth + 'px');
  document.documentElement.style.setProperty('--evid', evidWidth + 'px');
} catch {}
function refreshIdleStatus() {
  try {
    const total = (plan?.tasks || []).length;
    const done = (plan?.tasks || []).filter(t => t.status === STATUS.DONE || t.status === STATUS.REVERTED).length;
    const pending = (plan?.tasks || []).filter(t => t.status !== STATUS.DONE && t.status !== STATUS.REVERTED).length;
    if (!kanbanStatusEl) return;
    if (pending === 0 && done > 0) {
      kanbanStatusEl.textContent = 'All tasks complete ✓';
    } else if (pending === 0 && done === 0) {
      kanbanStatusEl.textContent = 'Idle — ready for next instruction';
    }
  } catch {}
}
// Chat history for agent context
let chatHistory = [];
let clarifyCount = 0;
let messageOnlyTurns = 0;
let lastPlanSig = null;

let mode = 'V1'; // 'V0' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7'
const LATEST_MODE = 'V7';
let v0RunStarted = false;
let tasks = []; // UI view of tasks: {id, title, status}
let timeouts = [];
let selectedTaskId = null;

// V1 state
let plan = null; // { planId, goal, tasks: [Task] }
let v1Paused = false;
let v1QueueIndex = 0; // index of the task currently being processed or next to process
let v1BlockedTaskId = null; // which task will BLOCK (deterministic demo)
// V2 ephemeral evidence store
const v2Evidence = Object.create(null); // taskId -> {diff, logs, tests}
const v3Evidence = Object.create(null); // taskId -> {diff, logs, tests}
const v3Snapshots = Object.create(null); // taskId -> [snapshotId]
const apiBase = ''; // same-origin; server at /api
let awaitingConfirm = false; // legacy; agent now controls proceed/halt via actions

const STATUS = {
  PLANNED: 'PLANNED',
  EXECUTING: 'EXECUTING',
  VERIFYING: 'VERIFYING',
  DONE: 'DONE',
  BLOCKED: 'BLOCKED',
  NEEDS_INPUT: 'NEEDS_INPUT',
  REVERTED: 'REVERTED',
};

function normalizePlanInPlace(p) {
  if (!p || !Array.isArray(p.tasks)) return p;
  for (const t of p.tasks) {
    if (!t.taskId) t.taskId = uuid();
    // Prefer title, fall back to common synonyms
    if (!t.title) t.title = t.name || t.summary || t.description || 'Task';
    if (!t.status || !(t.status in STATUS)) t.status = STATUS.PLANNED;
    if (!Array.isArray(t.steps)) t.steps = [];
    if (typeof t.notes !== 'string') t.notes = '';
  }
  return p;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeUrl(href) {
  try {
    const trimmed = (href || '').trim();
    if (/^(https?:|mailto:|#)/i.test(trimmed)) return trimmed;
  } catch {}
  return '';
}

function renderMarkdownSafe(input) {
  if (!input) return '';
  let text = String(input);
  // Extract fenced code blocks first
  const blocks = [];
  text = text.replace(/```([a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```/g, (m, lang, code) => {
    const idx = blocks.length;
    blocks.push(`<pre><code class="lang-${(lang||'').toLowerCase()}">${escapeHtml(code)}</code></pre>`);
    return `@@BLOCK_${idx}@@`;
  });
  // Escape remaining HTML
  text = escapeHtml(text);
  // Inline code
  text = text.replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`);
  // Headings
  text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
             .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
             .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  // Blockquotes
  text = text.replace(/^>\s?(.+)$/gm, '<blockquote>$1</blockquote>');
  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => {
    const u = safeUrl(href);
    if (!u) return label;
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  // Bold / italics (basic)
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
             .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Lists (very small parser)
  const lines = text.split(/\n/);
  const out = [];
  let inUl = false, inOl = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inUl) { if (inOl) { out.push('</ol>'); inOl = false; } out.push('<ul>'); inUl = true; }
      out.push(`<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      if (!inOl) { if (inUl) { out.push('</ul>'); inUl = false; } out.push('<ol>'); inOl = true; }
      out.push(`<li>${line.replace(/^\s*\d+\.\s+/, '')}</li>`);
      continue;
    }
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
    if (line.trim().length === 0) { out.push(''); continue; }
    out.push(`<p>${line}</p>`);
  }
  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');
  let html = out.join('\n');
  html = html.replace(/@@BLOCK_(\d+)@@/g, (m, i) => blocks[Number(i)] || '');
  return html;
}

function addMessage({ who, text }) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${who}`;
  const whoEl = document.createElement('div');
  whoEl.className = 'who';
  whoEl.textContent = who === 'user' ? 'You' : (who === 'system' ? 'Execution' : 'Agent');
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  try { bubble.innerHTML = renderMarkdownSafe(text); } catch { bubble.textContent = String(text || ''); }
  wrap.appendChild(whoEl);
  wrap.appendChild(bubble);
  chatMessagesEl.appendChild(wrap);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  // record in history
  if (who === 'user') chatHistory.push({ role: 'user', content: text });
  else if (who === 'agent') chatHistory.push({ role: 'assistant', content: text });
}

function badgeClassForStatus(status) {
  switch (status) {
    case STATUS.PLANNED: return 'planned';
    case STATUS.EXECUTING: return 'executing';
    case STATUS.VERIFYING: return 'verifying';
    case STATUS.DONE: return 'done';
    case STATUS.BLOCKED: return 'blocked';
    case STATUS.NEEDS_INPUT: return 'needs';
    case STATUS.REVERTED: return 'blocked';
    default: return 'planned';
  }
}

function cardEl(task) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.taskId = task.id;
  const pill = task.status === STATUS.REVERTED ? '<span class="pill pill-reverted">Reverted</span>' : '';
  el.innerHTML = `
    <div class="title">${task.title} ${pill}</div>
    <div class="status"><span class="badge ${badgeClassForStatus(task.status)}">${task.status}</span></div>
  `;
  el.addEventListener('click', () => {
    selectedTaskId = task.id;
    updateEvidence(task.id, task.status);
    persistV1();
    renderKanban();
  });
  // Double-click to open diff preview
  el.addEventListener('dblclick', () => {
    selectedTaskId = task.id;
    updateEvidence(task.id, task.status);
    renderKanban();
    openDiffModal();
  });
  return el;
}

function renderKanban() {
  colPlanned.innerHTML = '';
  colExecuting.innerHTML = '';
  colVerifying.innerHTML = '';
  colDone.innerHTML = '';
  if (colNeeds) colNeeds.innerHTML = '';

  for (const t of tasks) {
    const el = cardEl(t);
    if (selectedTaskId && t.id === selectedTaskId) el.classList.add('selected');
    if (t.status === STATUS.PLANNED) colPlanned.appendChild(el);
    else if (t.status === STATUS.EXECUTING) colExecuting.appendChild(el);
    else if (t.status === STATUS.VERIFYING) colVerifying.appendChild(el);
    else if (t.status === STATUS.BLOCKED) colVerifying.appendChild(el);
    else if (t.status === STATUS.NEEDS_INPUT && colNeeds) colNeeds.appendChild(el);
    else if (t.status === STATUS.DONE || t.status === STATUS.REVERTED) colDone.appendChild(el);
  }
}

function setTaskStatus(taskId, status) {
  const t = tasks.find(x => x.id === taskId);
  if (!t) return;
  t.status = status;
  renderKanban();
  updateEvidence(taskId, status);
  if (mode === 'V1') {
    // Reflect into plan as source of truth
    const pt = plan?.tasks?.find(x => x.taskId === taskId);
    if (pt) pt.status = status;
    persistV1();
  }
}

function fakePlanSummary() {
  return [
    'Plan:',
    '• Scaffold app',
    '• Build UI',
    '• Add state',
    '• Add styling',
  ].join('\n');
}

function fakeTasks() {
  return [
    { id: 't1', title: 'Scaffold app', status: STATUS.PLANNED },
    { id: 't2', title: 'Build UI', status: STATUS.PLANNED },
    { id: 't3', title: 'Add state', status: STATUS.PLANNED },
    { id: 't4', title: 'Add styling', status: STATUS.PLANNED },
  ];
}

function startScriptedRun(userGoal) {
  // Chat: echo user
  addMessage({ who: 'user', text: userGoal });
  // Agent: brief plan summary
  addMessage({ who: 'agent', text: fakePlanSummary() });

  // Kanban: populate tasks
  tasks = fakeTasks();
  renderKanban();

  // Evidence: initialize with prompt
  setEvidence({
    taskId: null,
    diff: `# Ready\n\nUser intent: ${userGoal}\n\nWaiting for first task to start…`,
    logs: `> agent: planning...\n> board: created 4 tasks`,
    tests: `No tests executed yet.`,
  });

  // Timed progression: move each task across statuses with staggered offsets
  const perHop = 1700; // ms between status hops
  const perTaskOffset = 1100; // stagger between tasks

  tasks.forEach((task, idx) => {
    const base = (idx + 1) * perTaskOffset;
    schedule(base + perHop * 0, () => setTaskStatus(task.id, STATUS.EXECUTING));
    schedule(base + perHop * 1.6, () => setTaskStatus(task.id, STATUS.VERIFYING));
    schedule(base + perHop * 3.2, () => setTaskStatus(task.id, STATUS.DONE));
  });
}

function schedule(ms, fn) {
  const t = setTimeout(fn, ms);
  timeouts.push(t);
}

function selectTab(name) {
  tabButtons.forEach(btn => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  qsa('.tab-panel').forEach(p => p.classList.remove('active'));
  qs(`#tab-${name}`).classList.add('active');
  lastSelectedTab = name;
}

function setEvidence({ taskId, diff, logs, tests }) {
  if (typeof diff === 'string') tabDiff.textContent = diff;
  if (typeof logs === 'string') tabLogs.textContent = logs;
  if (typeof tests === 'string') tabTests.textContent = tests;
  selectedTaskId = taskId;
  renderPlanJson();
  if (typeof updateRevertButton === 'function') updateRevertButton();
}

function updateEvidence(taskId, status) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const ev = getEvidenceFor(task, status);
  setEvidence({ taskId, ...ev });
}

function fakeEvidenceV0(task, status) {
  const title = task.title;
  if (status === STATUS.EXECUTING) {
    return {
      diff: `*** Applying patch for: ${title}\n--- a/src/index.html\n+++ b/src/index.html\n@@\n- <div id=\"app\"></div>\n+ <div id=\"app\">Hello, world</div>\n` ,
      logs: `> executing: ${title}\n> run: apply_patch\n✓ patch applied\n`,
      tests: `Tests queued after execution.`,
    };
  }
  if (status === STATUS.VERIFYING) {
    return {
      diff: `No new changes for: ${title}`,
      logs: `> verifying: ${title}\n> run: npm test (fake)\n✓ 12 passed, 0 failed`,
      tests: `PASS ui/App.test.tsx\nPASS core/state.test.ts\n\nTest Suites: 2 passed, 2 total\nTests:       12 passed, 12 total\nSnapshots:   0 total\nTime:        0.9 s`,
    };
  }
  if (status === STATUS.DONE) {
    return {
      diff: `Merged changes for: ${title}`,
      logs: `> done: ${title}\nArtifacts updated.`,
      tests: `All green. Ready for next task.`,
    };
  }
  // planned
  return {
    diff: `# Planned\n${title}\n\nNotes: queued for execution.`,
    logs: `> waiting: ${title}`,
    tests: `N/A`,
  };
}

function fakeEvidenceV1(task, status) {
  const title = task.title;
  if (status === STATUS.EXECUTING) {
    return {
      diff: fakeTools.apply_patch(title),
      logs: [
        `action: UPDATE_TASK → EXECUTING (${title})`,
        fakeTools.analyze_repo(plan?.goal || ''),
        'tool: apply_patch ✓',
      ].join('\n'),
      tests: 'Queued test suite…',
    };
  }
  if (status === STATUS.VERIFYING) {
    return {
      diff: `No changes pending for: ${title}`,
      logs: [
        `action: UPDATE_TASK → VERIFYING (${title})`,
        'tool: run_tests',
      ].join('\n'),
      tests: fakeTools.run_tests(true),
    };
  }
  if (status === STATUS.DONE) {
    return {
      diff: `Finalized changes for: ${title}`,
      logs: `action: UPDATE_TASK → DONE (${title})`,
      tests: 'All checks complete.',
    };
  }
  if (status === STATUS.BLOCKED) {
    return {
      diff: `! Blocked: ${title}\nReason: Test failures (simulated)`,
      logs: `action: UPDATE_TASK → BLOCKED (${title})\nHint: Say "continue" to retry tests.`,
      tests: fakeTools.run_tests(false),
    };
  }
  return {
    diff: `# Planned\n${title}\n\nSteps: ${(plan?.tasks?.find(t => t.taskId === task.id)?.steps || []).join(' → ')}`,
    logs: `action: CREATE_TASKS (planned ${title})`,
    tests: 'N/A',
  };
}

function getEvidenceFor(task, status) {
  if (mode === 'V1') return fakeEvidenceV1(task, status);
  if (mode === 'V2') return v2Evidence[task.id] || { diff: `Status: ${status}`, logs: '', tests: '' };
  if (mode === 'V3' || mode === 'V4' || mode === 'V5' || mode === 'V6' || mode === 'V7') return v3Evidence[task.id] || { diff: `Status: ${status}`, logs: '', tests: '' };
  return fakeEvidenceV0(task, status);
}

// Utilities
function uuid() {
  return 'id-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function clearTimers() { timeouts.forEach(t => clearTimeout(t)); timeouts = []; }

function clearBoard() {
  clearTimers();
  tasks = [];
  renderKanban();
  setEvidence({ taskId: null, diff: '', logs: '', tests: '' });
  if (kanbanStatusEl) kanbanStatusEl.textContent = '';
}

// V1 Agent scaffolding
function v1CreatePlan(goal) {
  return {
    planId: uuid(),
    goal,
    tasks: [
      { taskId: uuid(), title: 'Scaffold app', status: STATUS.PLANNED, steps: ['init project', 'deps'], notes: '' },
      { taskId: uuid(), title: 'Build UI', status: STATUS.PLANNED, steps: ['layout', 'components'], notes: '' },
      { taskId: uuid(), title: 'Add state', status: STATUS.PLANNED, steps: ['store', 'wiring'], notes: '' },
      { taskId: uuid(), title: 'Add styling', status: STATUS.PLANNED, steps: ['theme', 'polish'], notes: '' },
    ],
  };
}

function v1NormalizeTasksFromPlan() {
  tasks = (plan?.tasks || []).map(t => ({ id: t.taskId, title: (t.title || t.description || 'Task'), status: t.status }));
  renderKanban();
}

function v1Dispatch(action) {
  if (!action || !action.action) return;
  if (action.action === 'CREATE_TASKS') {
    plan.tasks = action.tasks;
    v1NormalizeTasksFromPlan();
    addMessage({ who: 'agent', text: `Created ${action.tasks.length} tasks for goal: ${plan.goal}` });
  } else if (action.action === 'UPDATE_TASK') {
    const t = plan.tasks.find(x => x.taskId === action.taskId);
    if (!t) return;
    t.status = action.status;
    if (action.notes) t.notes = action.notes;
    v1NormalizeTasksFromPlan();
    updateEvidence(t.taskId, t.status);
  }
  persistV1();
}

function renderPlanJson() {
  try {
    if (!planBody) return;
    if (!plan || !Array.isArray(plan.tasks)) { planBody.textContent = 'No plan.'; return; }
    if (showPlanRaw) {
      planBody.textContent = JSON.stringify(plan, null, 2);
      if (btnPlanToggle) btnPlanToggle.textContent = 'View summary';
    } else {
      planBody.textContent = buildPlanSummary(plan);
      if (btnPlanToggle) btnPlanToggle.textContent = 'View raw JSON';
    }
  } catch { if (planBody) planBody.textContent = 'No plan.'; }
}
function buildPlanSummary(p) {
  try {
    const tasks = Array.isArray(p.tasks) ? p.tasks : [];
    const parts = [];
    parts.push(`Plan Summary`);
    parts.push(`${tasks.length} task(s)`);
    const maxShow = 6;
    for (let i=0;i<Math.min(tasks.length,maxShow);i++) {
      const t = tasks[i];
      const status = String(t.status || '').toLowerCase();
      const mark = status==='done' ? '✓' : status==='blocked' ? '⚠' : status==='executing' ? '…' : '•';
      parts.push(`${mark} ${t.title || t.description || 'Task'}`);
    }
    if (tasks.length > maxShow) parts.push(`(+${tasks.length - maxShow} more…)`);
    return parts.join('\n');
  } catch { return 'Plan Summary'; }
}
btnPlanToggle?.addEventListener('click', () => { showPlanRaw = !showPlanRaw; renderPlanJson(); });

// Terminal mode toggle
btnTerminal?.addEventListener('click', () => {
  terminalMode = !terminalMode;
  document.body.classList.toggle('terminal-mode', terminalMode);
  try { localStorage.setItem('vibe.terminal', terminalMode ? '1' : '0'); } catch {}
  if (btnTerminal) btnTerminal.textContent = `Terminal: ${terminalMode ? 'On' : 'Off'}`;
});

// Quote selection into chat input
btnQuote?.addEventListener('click', () => {
  try {
    const sel = window.getSelection();
    const s = (sel && sel.toString()) ? sel.toString().trim() : '';
    if (!s) return;
    const quoted = s.split(/\n/).map(l => `> ${l}`).join('\n');
    const curr = chatText.value;
    chatText.value = (quoted + (curr ? '\n\n' + curr : ''));
    chatText.focus();
  } catch {}
});

// Resizable gutters
function getVarPx(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch { return fallback; }
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function startDrag(e, kind) {
  e.preventDefault();
  const startX = e.clientX;
  const startChat = getVarPx('--chat', chatWidth);
  const startEvid = getVarPx('--evid', evidWidth);
  function onMove(ev) {
    const dx = ev.clientX - startX;
    if (kind === 'left') {
      const next = clamp(startChat + dx, 220, 800);
      chatWidth = next;
      document.documentElement.style.setProperty('--chat', next + 'px');
      try { localStorage.setItem('vibe.chatWidth', String(next)); } catch {}
    } else if (kind === 'right') {
      const next = clamp(startEvid - dx, 260, 900);
      evidWidth = next;
      document.documentElement.style.setProperty('--evid', next + 'px');
      try { localStorage.setItem('vibe.evidWidth', String(next)); } catch {}
    }
  }
  function onUp() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

gutterLeft?.addEventListener('mousedown', (e) => startDrag(e, 'left'));
gutterRight?.addEventListener('mousedown', (e) => startDrag(e, 'right'));

// Fake tools
const fakeTools = {
  analyze_repo(goal) {
    return [`tool: analyze_repo`, `repo: / (fake)`, `goal: ${goal}`].join('\n');
  },
  apply_patch(title) {
    return [
      `*** apply_patch (${title})`,
      '--- a/src/app.tsx',
      '+++ b/src/app.tsx',
      '@@',
      '- export function App() { return null }',
      '+ export function App() { return <div>Hello</div> }',
    ].join('\n');
  },
  run_tests(ok = true) {
    return ok
      ? 'PASS 3 suites, 18 tests — 0 failed'
      : 'FAIL 1 suite, 3 tests — see logs';
  },
};

function v1Start(goal) {
  // Create plan and tasks
  plan = v1CreatePlan(goal);
  v1QueueIndex = 0;
  v1BlockedTaskId = plan.tasks[1] ? plan.tasks[1].taskId : null; // deterministically block the 2nd task
  const createAction = { action: 'CREATE_TASKS', tasks: plan.tasks };
  addMessage({ who: 'user', text: goal });
  addMessage({ who: 'agent', text: 'Parsing intent and emitting a structured plan…' });
  v1Dispatch(createAction);
  renderPlanJson();

  // Evidence initial
  setEvidence({
    taskId: null,
    diff: `# Plan Created\nPlanId: ${plan.planId}\nGoal: ${plan.goal}`,
    logs: `actions: CREATE_TASKS x${plan.tasks.length}\n${fakeTools.analyze_repo(goal)}`,
    tests: 'No tests executed yet.',
  });

  v1Paused = false;
  v1RunNextFromQueue();
}

function v1RunNextFromQueue() {
  if (v1Paused) return;
  if (!plan) return;
  if (v1QueueIndex >= plan.tasks.length) return;
  const task = plan.tasks[v1QueueIndex];
  v1RunTask(task);
}

function v1RunTask(task) {
  const id = task.taskId;
  const toExec = 450;
  const toVerify = 1400;
  const toDone = 2400;
  schedule(toExec, () => v1Dispatch({ action: 'UPDATE_TASK', taskId: id, status: STATUS.EXECUTING, notes: 'Starting execution' }));
  schedule(toVerify, () => {
    v1Dispatch({ action: 'UPDATE_TASK', taskId: id, status: STATUS.VERIFYING, notes: 'Running tests' });
    if (id === v1BlockedTaskId) {
      // Simulate failure shortly after verifying begins
      schedule(350, () => {
        v1Dispatch({ action: 'UPDATE_TASK', taskId: id, status: STATUS.BLOCKED, notes: 'Tests failed. Needs input or retry.' });
        addMessage({ who: 'agent', text: `Task "${task.title}" is BLOCKED (tests failed). Say "continue" to retry.` });
        // Do not proceed to next task until unblocked
      });
    } else {
      // Normal flow: DONE
      schedule(toDone - toVerify, () => {
        v1Dispatch({ action: 'UPDATE_TASK', taskId: id, status: STATUS.DONE, notes: 'Completed' });
        v1QueueIndex += 1;
        v1RunNextFromQueue();
      });
    }
  });
}

function persistV1() {
  if (mode !== 'V1') return;
  const data = { plan, selectedTaskId };
  try { localStorage.setItem('vibe.v1', JSON.stringify(data)); } catch {}
}

function restoreV1() {
  try {
    const raw = localStorage.getItem('vibe.v1');
    if (!raw) return false;
    const data = JSON.parse(raw);
    plan = data.plan || null;
    selectedTaskId = data.selectedTaskId || null;
    if (plan) {
      v1NormalizeTasksFromPlan();
      const sel = tasks.find(t => t.id === selectedTaskId) || tasks[0];
      if (sel) updateEvidence(sel.id, sel.status);
      addMessage({ who: 'agent', text: 'Restored prior V1 plan from localStorage.' });
      // derive runner state
      v1QueueIndex = (plan.tasks || []).findIndex(t => t.status !== STATUS.DONE);
      if (v1QueueIndex < 0) v1QueueIndex = plan.tasks.length;
      const blocked = (plan.tasks || []).find(t => t.status === STATUS.BLOCKED);
      v1BlockedTaskId = blocked ? blocked.taskId : null;
      renderPlanJson();
      return true;
    }
    return false;
  } catch { return false; }
}

function v1HandleCommand(text) {
  const t = text.toLowerCase();
  if (t === 'stop') {
    addMessage({ who: 'user', text });
    clearTimers(); v1Paused = true;
    addMessage({ who: 'agent', text: 'Paused. Say “continue” to resume.' });
    return true;
  }
  if (t === 'continue') {
    addMessage({ who: 'user', text });
    if (!plan) { addMessage({ who: 'agent', text: 'No plan to continue.' }); return true; }
    v1Paused = false;
    const blocked = plan.tasks.find(x => x.status === STATUS.BLOCKED);
    if (blocked) {
      // Retry tests then complete and move on
      addMessage({ who: 'agent', text: `Retrying tests for "${blocked.title}"…` });
      schedule(500, () => v1Dispatch({ action: 'UPDATE_TASK', taskId: blocked.taskId, status: STATUS.VERIFYING, notes: 'Re-running tests' }));
      schedule(1200, () => {
        v1Dispatch({ action: 'UPDATE_TASK', taskId: blocked.taskId, status: STATUS.DONE, notes: 'Completed after retry' });
        v1BlockedTaskId = null;
        v1QueueIndex = plan.tasks.findIndex(t => t.taskId === blocked.taskId) + 1;
        v1RunNextFromQueue();
      });
    } else {
      addMessage({ who: 'agent', text: 'Resuming execution…' });
      v1RunNextFromQueue();
    }
    return true;
  }
  if (t === 'try again') {
    addMessage({ who: 'user', text });
    clearTimers();
    if (plan) {
      const goal = plan.goal;
      plan = null; tasks = []; renderKanban();
      localStorage.removeItem('vibe.v1');
      addMessage({ who: 'agent', text: 'Resetting plan and trying again…' });
      v1Start(goal);
      return true;
    }
    addMessage({ who: 'agent', text: 'Nothing to reset.' });
    return true;
  }
  return false; // not a command
}

// Mode + Controls
function setMode(next) {
  if (mode === next) return;
  mode = next;
  if (btnModeV0) btnModeV0.classList.toggle('active', mode === 'V0');
  if (btnModeV1) btnModeV1.classList.toggle('active', mode === 'V1');
  if (btnModeV2) btnModeV2.classList.toggle('active', mode === 'V2');
  if (btnModeV3) btnModeV3.classList.toggle('active', mode === 'V3');
  if (btnModeV4) btnModeV4.classList.toggle('active', mode === 'V4');
  if (btnModeV5) btnModeV5.classList.toggle('active', mode === 'V5');
  if (btnModeV6) btnModeV6.classList.toggle('active', mode === 'V6');
  if (btnModeV7) btnModeV7.classList.toggle('active', mode === 'V7');
  subtitleEl.textContent = mode === 'V1' ? 'V1 — Structured Agent (fake tools)' : 'V0 — Concept Lock (scripted demo)';
  if (mode === 'V2') subtitleEl.textContent = 'V2 — Read-Only Repo Awareness';
  if (mode === 'V3') subtitleEl.textContent = 'V3 — Single-Card Write + Verify';
  if (mode === 'V4') subtitleEl.textContent = 'V4 — Card-Level Revert';
  if (mode === 'V5') subtitleEl.textContent = 'V5 — Autonomous + Needs Input';
  if (mode === 'V6') subtitleEl.textContent = 'V6 — Memory + Reversion Awareness';
  if (mode === 'V7') subtitleEl.textContent = 'V7 — Real LLM Planning';
  clearBoard();
  chatMessagesEl.innerHTML = '';
  // Do not inject canned greeting; wait for user chat and LLM reply
  if (mode === 'V6') v6FetchAndRender();
  if (typeof updateRevertButton === 'function') updateRevertButton();
  if (btnAutopilot) {
    const enable = mode === 'V5' || mode === 'V6' || mode === 'V7';
    btnAutopilot.disabled = !enable;
    btnAutopilot.classList.toggle('on', v5Autopilot && enable);
    btnAutopilot.textContent = `Autopilot: ${v5Autopilot && enable ? 'On' : 'Off'}`;
  }
}

if (btnModeV0) btnModeV0.addEventListener('click', () => setMode('V0'));
if (btnModeV1) btnModeV1.addEventListener('click', () => setMode('V1'));
if (btnModeV2) btnModeV2.addEventListener('click', () => setMode('V2'));
if (btnModeV3) btnModeV3.addEventListener('click', () => setMode('V3'));
if (btnModeV4) btnModeV4.addEventListener('click', () => setMode('V4'));
if (btnModeV5) btnModeV5.addEventListener('click', () => setMode('V5'));
if (btnModeV6) btnModeV6.addEventListener('click', () => setMode('V6'));
if (btnModeV7) btnModeV7.addEventListener('click', () => setMode('V7'));
btnReset.addEventListener('click', () => {
  clearTimers();
  localStorage.removeItem('vibe.v1');
  plan = null; tasks = []; renderKanban();
  setEvidence({ taskId: null, diff: '', logs: '', tests: '' });
  chatMessagesEl.innerHTML = '';
  if (kanbanStatusEl) kanbanStatusEl.textContent = '';
  // Do not inject canned chat on reset; wait for user input and LLM reply
});

// Tabs UI
tabButtons.forEach(btn => btn.addEventListener('click', () => { lastTabClickTs = Date.now(); lastSelectedTab = btn.dataset.tab; selectTab(btn.dataset.tab); }));

// Diff Preview Modal
function openDiffModal() {
  // Build per-file selector if available
  const t = tasks.find(x => x.id === selectedTaskId);
  const ev = t ? (v3Evidence[t.taskId] || v3Evidence[t.id]) : null;
  const files = (ev && Array.isArray(ev.files)) ? ev.files : [];
  const combined = (ev && typeof ev.diff === 'string') ? ev.diff : (tabDiff.textContent || 'No diff content.');
  try {
    if (modalFileSelect) {
      modalFileSelect.innerHTML = '';
      const optAll = document.createElement('option');
      optAll.value = '__all__'; optAll.textContent = `All changes (${files.length || 0} files)`;
      modalFileSelect.appendChild(optAll);
      for (const f of files) {
        const opt = document.createElement('option');
        opt.value = f.path; opt.textContent = f.path;
        modalFileSelect.appendChild(opt);
      }
      modalFileSelect.onchange = () => {
        const sel = modalFileSelect.value;
        modalLastSelectedPath = sel;
        applyModalFilter(sel);
      };
      modalFileSelect.value = files.some(f => f.path === modalLastSelectedPath) ? modalLastSelectedPath : '__all__';
    }
  } catch {}
  modalRawAll = combined;
  modalRawFiles = files;
  applyModalFilter(modalFileSelect ? modalFileSelect.value : '__all__');
  diffModal.classList.remove('hidden');
  diffModal.setAttribute('aria-hidden', 'false');
  // focus content for keyboard scroll
  modalBody.focus();
  // restore last scroll position
  requestAnimationFrame(() => { modalBody.scrollTop = modalScrollTop; });
}
function closeDiffModal() {
  // save scroll position
  try { modalScrollTop = modalBody.scrollTop || 0; } catch {}
  diffModal.classList.add('hidden');
  diffModal.setAttribute('aria-hidden', 'true');
}
btnPreviewDiff.addEventListener('click', openDiffModal);
modalClose.addEventListener('click', closeDiffModal);
diffModal.addEventListener('click', (e) => {
  if (e.target && e.target.getAttribute('data-close')) closeDiffModal();
});
modalCopy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(modalBody.textContent || ''); } catch {}
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !diffModal.classList.contains('hidden')) closeDiffModal();
  // Diff modal keyboard navigation
  if (!diffModal.classList.contains('hidden') && modalFileSelect) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      const i = modalFileSelect.selectedIndex;
      if (i < modalFileSelect.options.length - 1) { modalFileSelect.selectedIndex = i + 1; modalFileSelect.dispatchEvent(new Event('change')); }
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      const i = modalFileSelect.selectedIndex;
      if (i > 0) { modalFileSelect.selectedIndex = i - 1; modalFileSelect.dispatchEvent(new Event('change')); }
    }
  }
});

function applyModalFilter(sel) {
  const q = (modalFilter && modalFilter.value) ? String(modalFilter.value) : '';
  const src = sel === '__all__' ? modalRawAll : ((modalRawFiles.find(x => x.path === sel) || {}).diff || modalRawAll);
  if (!q) { modalBody.textContent = src; return; }
  const lines = String(src).split(/\r?\n/);
  const low = q.toLowerCase();
  const out = lines.filter(l => l.toLowerCase().includes(low));
  modalBody.textContent = out.join('\n') || '(no matches)';
}

modalFilter?.addEventListener('input', () => {
  const sel = modalFileSelect ? modalFileSelect.value : '__all__';
  applyModalFilter(sel);
});

// Modal file-level revert/reapply handlers
modalRevertFile?.addEventListener('click', async () => {
  const t = tasks.find(x => x.id === selectedTaskId);
  if (!t) return;
  const snaps = v3Snapshots[selectedTaskId];
  const snap = Array.isArray(snaps) ? snaps[snaps.length - 1] : snaps;
  if (!snap) return;
  const sel = modalFileSelect?.value || '__all__';
  if (!sel || sel === '__all__') return; // file-level only
  try {
    const res = await apiPost('/api/revert', { snapshotId: snap, direction: 'before', paths: [sel] });
    const warn = Array.isArray(res.warnings) && res.warnings.length ? (`\nwarnings:\n` + res.warnings.map(w => ` - ${w.path}: ${w.note || w.kind}`).join('\n')) : '';
    v3Evidence[selectedTaskId] = { diff: res.diff || '(no diff)', logs: `revert-file: ${sel}${warn}`, tests: 'N/A', files: v3Evidence[selectedTaskId]?.files || [] };
    updateEvidence(selectedTaskId, tasks.find(x => x.id === selectedTaskId)?.status || STATUS.DONE);
    addMessage({ who: 'system', text: `♻️ Reverted file ${sel} (snapshot ${snap}).` });
  } catch (e) { addMessage({ who: 'system', text: `❌ Revert file failed: ${String(e)}` }); }
});
modalReapplyFile?.addEventListener('click', async () => {
  const t = tasks.find(x => x.id === selectedTaskId);
  if (!t) return;
  const snaps = v3Snapshots[selectedTaskId];
  const snap = Array.isArray(snaps) ? snaps[snaps.length - 1] : snaps;
  if (!snap) return;
  const sel = modalFileSelect?.value || '__all__';
  if (!sel || sel === '__all__') return; // file-level only
  try {
    const res = await apiPost('/api/revert', { snapshotId: snap, direction: 'after', paths: [sel] });
    const warn = Array.isArray(res.warnings) && res.warnings.length ? (`\nwarnings:\n` + res.warnings.map(w => ` - ${w.path}: ${w.note || w.kind}`).join('\n')) : '';
    v3Evidence[selectedTaskId] = { diff: res.diff || '(no diff)', logs: `reapply-file: ${sel}${warn}`, tests: 'N/A', files: v3Evidence[selectedTaskId]?.files || [] };
    updateEvidence(selectedTaskId, tasks.find(x => x.id === selectedTaskId)?.status || STATUS.DONE);
    addMessage({ who: 'system', text: `♻️ Reapplied file ${sel} (snapshot ${snap}).` });
  } catch (e) { addMessage({ who: 'system', text: `❌ Reapply file failed: ${String(e)}` }); }
});

// Autopilot toggle
let v5Autopilot = false;
btnAutopilot?.addEventListener('click', () => {
  v5Autopilot = !v5Autopilot;
  btnAutopilot.classList.toggle('on', v5Autopilot);
  btnAutopilot.textContent = `Autopilot: ${v5Autopilot ? 'On' : 'Off'}`;
  if (v5Autopilot) {
    if (mode === 'V5') v5RunQueue();
    if (mode === 'V7') latestRunQueue();
  }
});

// Revert button
const btnRevertCard = qs('#btnRevertCard');
function updateRevertButton() {
  const t = tasks.find(x => x.id === selectedTaskId);
  const snapsCheck = v3Snapshots[selectedTaskId];
  const hasSnap = Array.isArray(snapsCheck) ? snapsCheck.length > 0 : Boolean(snapsCheck);
  const isReverted = !!(t && t.status === STATUS.REVERTED);
  // Default hide both when no selection or no snapshot
  if (!t || !hasSnap) {
    if (btnRevertCard) { btnRevertCard.classList.add('hide'); btnRevertCard.disabled = true; }
    if (btnReapplyCard) { btnReapplyCard.classList.add('hide'); btnReapplyCard.disabled = true; }
    return;
  }
  // Show Revert when selected and not REVERTED; Show Reapply only when REVERTED
  if (btnRevertCard) {
    btnRevertCard.classList.toggle('hide', isReverted);
    btnRevertCard.disabled = false;
  }
  if (btnReapplyCard) {
    btnReapplyCard.classList.toggle('hide', !isReverted);
    btnReapplyCard.disabled = !isReverted;
  }
}
btnRevertCard?.addEventListener('click', async () => {
  const t = tasks.find(x => x.id === selectedTaskId);
  if (!t) return;
  const snaps2 = v3Snapshots[selectedTaskId];
  const snap = Array.isArray(snaps2) ? snaps2[snaps2.length - 1] : snaps2;
  if (!snap) return;
  const ok = confirm(`Revert changes for card: ${t.title}?`);
  if (!ok) return;
  try {
    // Pre-check for divergence
    try {
      const chk = await apiPost('/api/revert/check', { snapshotId: snap, direction: 'before' });
      const warns = Array.isArray(chk.warnings) ? chk.warnings : [];
      try { await v6Log('REVERT_CHECK', { snapshotId: snap, direction: 'before', warnings: warns }); } catch {}
      if (warns.length) {
        const msg = 'The following files have diverged since this card was applied and may be overwritten:\n' + warns.map(w => ` - ${w.path}`).join('\n') + '\n\nProceed with revert?';
        const go = confirm(msg);
        if (!go) return;
      }
    } catch {}
    const res = await apiPost('/api/revert', { snapshotId: snap, direction: 'before' });
    const warn = Array.isArray(res.warnings) && res.warnings.length ? (`\nwarnings:\n` + res.warnings.map(w => ` - ${w.path}: ${w.note || w.kind}`).join('\n')) : '';
    v3Evidence[selectedTaskId] = { diff: res.diff || '(no diff)', logs: `revert: ${res.snapshotId}${warn}`, tests: 'N/A' };
    updateEvidence(selectedTaskId, t.status);
    addMessage({ who: 'system', text: `♻️ Reverted card "${t.title}" (snapshot ${snap}).` });
    try { v3Dispatch({ action: 'UPDATE_TASK', taskId: t.id, status: STATUS.REVERTED, notes: 'Reverted' }); } catch {}
    try { const pt = (plan?.tasks || []).find(x => x.taskId === t.id); if (pt) pt.status = STATUS.REVERTED; } catch {}
    try { const lt = tasks.find(x => x.id === t.id); if (lt) lt.status = STATUS.REVERTED; } catch {}
    renderKanban();
    updateEvidence(selectedTaskId, STATUS.REVERTED);
    if (typeof updateRevertButton === 'function') updateRevertButton();
    try { await apiPost('/api/event', { type: 'REVERT', data: { snapshotId: snap, taskId: selectedTaskId, title: t.title } }); } catch {}
    try { await v6FetchAndRender(); } catch {}
  } catch (e) {
    addMessage({ who: 'system', text: `❌ Revert failed: ${String(e)}` });
  }
});

btnReapplyCard?.addEventListener('click', async () => {
  const t = tasks.find(x => x.id === selectedTaskId);
  if (!t) return;
  const snaps3 = v3Snapshots[selectedTaskId];
  const snap = Array.isArray(snaps3) ? snaps3[snaps3.length - 1] : snaps3;
  if (!snap) return;
  const ok = confirm(`Reapply changes for card: ${t.title}?`);
  if (!ok) return;
  try {
    // Pre-check for divergence
    try {
      const chk = await apiPost('/api/revert/check', { snapshotId: snap, direction: 'after' });
      const warns = Array.isArray(chk.warnings) ? chk.warnings : [];
      try { await v6Log('REVERT_CHECK', { snapshotId: snap, direction: 'after', warnings: warns }); } catch {}
      if (warns.length) {
        const msg = 'The following files differ from the snapshot-before and may be overwritten by reapply:\n' + warns.map(w => ` - ${w.path}`).join('\n') + '\n\nProceed with reapply?';
        const go = confirm(msg);
        if (!go) return;
      }
    } catch {}
    const res = await apiPost('/api/revert', { snapshotId: snap, direction: 'after' });
    const warn = Array.isArray(res.warnings) && res.warnings.length ? (`\nwarnings:\n` + res.warnings.map(w => ` - ${w.path}: ${w.note || w.kind}`).join('\n')) : '';
    v3Evidence[selectedTaskId] = { diff: res.diff || '(no diff)', logs: `reapply: ${res.snapshotId}${warn}`, tests: 'N/A' };
    updateEvidence(selectedTaskId, t.status);
    addMessage({ who: 'system', text: `♻️ Reapplied card "${t.title}" (snapshot ${snap}).` });
    try { v3Dispatch({ action: 'UPDATE_TASK', taskId: t.id, status: STATUS.DONE, notes: 'Reapplied' }); } catch {}
    try { await apiPost('/api/event', { type: 'REAPPLY', data: { snapshotId: snap, taskId: t.id, title: t.title } }); } catch {}
  } catch (e) {
    addMessage({ who: 'system', text: `❌ Reapply failed: ${String(e)}` });
  }
});

// Chat submit
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatText.value.trim();
  if (!text) return;
  chatText.value = '';
  // Slash commands become model hints (no direct tool execution) and quick utilities
  if (text.startsWith('/')) {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();
    let hint = '';
    if (cmd === '/help') { openHelpModal(); return; }
    if (cmd === '/perms') { openPermsModal(); return; }
    if (cmd === '/stats') { openDevModal(); return; }
    if (cmd === '/tree') hint = `List files via READ_TREE { dir: "${arg||'.'}", depth: 2 }`;
    if (cmd === '/file') hint = `Open file via READ_FILE { path: "${arg||'README.md'}" }`;
    if (cmd === '/search') hint = `Search via SEARCH { q: "${arg||'TODO'}", dir: ".", context: 1 }`;
    if (cmd === '/skills') {
      (async () => {
        try { const res = await fetch('/api/skills/list'); const data = await res.json(); const have=(selectedSkills||[]).join(', ')||'(none)'; const avail=(Array.isArray(data.skills)?data.skills.map(s=>s.name).join(', '):'(none)'); addMessage({ who:'agent', text:`Skills — selected: ${have}\nAvailable: ${avail}` }); }
        catch { addMessage({ who:'agent', text:'No skills found.' }); }
      })();
      return;
    }
    if (cmd === '/skill') {
      if (!arg) { addMessage({ who:'agent', text: 'Usage: /skill <name>' }); return; }
      const name = arg.trim();
      const on = selectedSkills.includes(name);
      if (on) selectedSkills = selectedSkills.filter(x => x !== name); else selectedSkills.push(name);
      try { localStorage.setItem('vibe.skills', JSON.stringify(selectedSkills)); } catch {}
      addMessage({ who:'system', text: `${on ? 'Removed' : 'Added'} skill: ${name}` });
      return;
    }
    addMessage({ who: 'user', text });
    v7Chat(hint || text);
    return;
  }
  // No natural-language routing; delegate intent to the model
  // Global slash commands (quick tools)
  if (text.startsWith('/')) {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ').trim();
    if (cmd === '/help') { openHelpModal(); return; }
    if (cmd === '/perms') { openPermsModal(); return; }
    if (cmd === '/stats') { openDevModal(); return; }
    if (cmd === '/tree') {
      if (!perms.read) { addMessage({ who:'agent', text:'Read permission is disabled. Click Permissions to enable.' }); return; }
      (async () => { const depth = 2; const root = arg || '.'; try { const data = await apiJson(`/api/tree?path=${encodeURIComponent(root)}&depth=${depth}`); const lines = data.entries.map(e => `${e.type==='dir'?'📁':'📄'} ${e.path}${e.type==='file'?` (${e.size}b)`:''}`); addMessage({ who:'agent', text: [`# Repo Tree (${data.root}, depth=${data.depth})`, ...lines.slice(0,200)].join('\n') }); } catch (err) { addMessage({ who:'agent', text:`Unable to read tree: ${String(err)}` }); }})();
      return;
    }
    if (cmd === '/file') {
      if (!perms.read) { addMessage({ who:'agent', text:'Read permission is disabled. Click Permissions to enable.' }); return; }
      const p = arg || 'README.md';
      (async () => { try { const data = await apiJson(`/api/file?path=${encodeURIComponent(p)}&head=5000`); addMessage({ who:'agent', text:`# File: ${data.path} (${data.size} bytes)\n\n${data.content}` }); } catch (err) { addMessage({ who:'agent', text:`Unable to read file: ${String(err)}` }); }})();
      return;
    }
    if (cmd === '/search') {
      if (!perms.read) { addMessage({ who:'agent', text:'Read permission is disabled. Click Permissions to enable.' }); return; }
      const q = arg || 'TODO';
      (async () => { try { const data = await apiJson(`/api/search?q=${encodeURIComponent(q)}&max=50&context=1`); const lines = data.matches.map(m => `${m.path}:${m.line}: ${m.text}`); addMessage({ who:'agent', text:[`# Search: ${data.q}`, ...lines.slice(0,200)].join('\n') }); } catch (err) { addMessage({ who:'agent', text:`Unable to search: ${String(err)}` }); }})();
      return;
    }
    // Unknown slash command
    addMessage({ who:'agent', text:'Unknown command. Try /help, /perms, /tree, /file, /search, /stats' });
    return;
  }
  if (mode === 'V0') {
    if (v0RunStarted) {
      addMessage({ who: 'user', text });
      addMessage({ who: 'agent', text: 'V0 is scripted. Use Reset to restart.' });
    } else {
      v0RunStarted = true;
      startScriptedRun(text);
    }
  } else {
    if (mode === 'V1') {
      if (v1HandleCommand(text)) return;
      if (plan) {
        addMessage({ who: 'user', text });
        addMessage({ who: 'agent', text: 'Plan already active. Say “try again” to replan or “stop/continue”.' });
      } else {
        v1Start(text);
      }
    } else if (mode === 'V2') {
      if (v2HandleCommand(text)) return;
      if (plan) {
        addMessage({ who: 'user', text });
        addMessage({ who: 'agent', text: 'Analysis already in progress. Say “try again” to replan or “stop/continue”.' });
      } else {
        v2Start(text);
      }
  } else if (mode === 'V3') {
      if (v3HandleCommand(text)) return;
      if (plan) {
        addMessage({ who: 'user', text });
        addMessage({ who: 'agent', text: 'Execution already in progress. Say “try again” to re-run or “stop/continue”.' });
      } else {
        v3Start(text);
      }
  } else if (mode === 'V4') {
      if (v3HandleCommand(text)) return;
      if (plan) {
        addMessage({ who: 'user', text });
        addMessage({ who: 'agent', text: 'Execution already in progress. Say “try again” to re-run or “stop/continue”.' });
      } else {
        v3Start(text);
      }
  } else if (mode === 'V5') {
      if (v5HandleCommand(text)) return;
      if (plan) {
        addMessage({ who: 'user', text });
        addMessage({ who: 'agent', text: 'Autopilot is running. Say “stop/continue/try again”, or answer the current question.' });
      } else {
        v5Start(text);
      }
  } else if (mode === 'V6') {
      if (v5HandleCommand(text)) return;
      if (plan) {
        addMessage({ who: 'user', text });
        addMessage({ who: 'agent', text: 'Autopilot + memory is running. Say “stop/continue/try again”, or answer the current question.' });
      } else {
        // Ensure memory is loaded before starting
        v6FetchAndRender().then(() => v5Start(text)).catch(() => v5Start(text));
      }
  } else if (mode === 'V7') {
      addMessage({ who: 'user', text });
      // If a Needs Input card exists, treat this message as the answer; mark Done and log event
      try {
        const need = (plan?.tasks || []).find(t => t.status === STATUS.NEEDS_INPUT);
        if (need) {
          try { v6Log('ANSWER', { taskId: need.taskId, answer: text, question: need.title }); } catch {}
          need.status = STATUS.DONE;
          v1NormalizeTasksFromPlan();
          renderPlanJson();
        }
      } catch {}
      // Orchestrator: delegate to agent to decide plan/replan/proceed/halt
      v7Chat(text);
  }
  }
});

// Initial boot: default to latest version
setMode(LATEST_MODE);
// Show permissions prompt on first load if not set
(function initPermsOnce(){ try { const raw = localStorage.getItem('vibe.perms'); if (!raw) { setTimeout(openPermsModal, 300); } } catch {} })();
try { subtitleEl.textContent = 'Latest — Real Planning + Controlled Execution'; } catch {}
// Fetch and display workspace root
;(async () => {
  try {
    const res = await fetch('/api/ping');
    const data = await res.json();
    if (workspaceInfoEl && data && data.workspaceRoot) {
      workspaceInfoEl.textContent = `Workspace: ${data.workspaceRoot}`;
      if (wsCurrent) wsCurrent.textContent = data.workspaceRoot;
      if (wsCommand) wsCommand.textContent = `node vibe.js "${data.workspaceRoot}"\n# Or to switch:\nnode vibe.js /path/to/your/repo`;
    }
    if (gitTagEl && data) {
      const on = !!data.gitIntegrationOn;
      const repo = !!data.gitEnabled;
      const branch = data.gitBranch || '';
      gitTagEl.textContent = repo ? (on ? `Git: On (${branch||'branch'})` : `Git: Repo (${branch||'branch'})`) : 'Git: Off';
      gitTagEl.title = on ? 'Git integration active' : (repo ? 'Git repository detected; integration off' : 'No git repository detected');
    }
  } catch {}
})();

btnCopyBranch?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/ping');
    const data = await res.json();
    const branch = data.gitBranch || '';
    if (!branch) { addMessage({ who: 'agent', text: 'No Git branch detected.' }); return; }
    try { await navigator.clipboard.writeText(branch); addMessage({ who: 'agent', text: `Copied branch: ${branch}` }); } catch { addMessage({ who: 'agent', text: `Branch: ${branch}` }); }
  } catch (e) { addMessage({ who: 'agent', text: 'Unable to read Git branch.' }); }
});

// Change workspace modal controls
function openWsModal() {
  wsModal.classList.remove('hidden');
  wsModal.setAttribute('aria-hidden', 'false');
}
function closeWsModal() {
  wsModal.classList.add('hidden');
  wsModal.setAttribute('aria-hidden', 'true');
}
btnChangeWorkspace?.addEventListener('click', openWsModal);
wsClose?.addEventListener('click', closeWsModal);
wsModal?.addEventListener('click', (e) => { if (e.target && e.target.getAttribute('data-close')) closeWsModal(); });
wsCopy?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(wsCommand.textContent || ''); } catch {} });

// Help modal controls
function openHelpModal() {
  try { helpBody.textContent = buildHelpText(); } catch { helpBody.textContent = 'Help unavailable.'; }
  helpModal.classList.remove('hidden');
  helpModal.setAttribute('aria-hidden', 'false');
}
function closeHelpModal() {
  helpModal.classList.add('hidden');
  helpModal.setAttribute('aria-hidden', 'true');
}
btnHelp?.addEventListener('click', openHelpModal);
helpClose?.addEventListener('click', closeHelpModal);
helpModal?.addEventListener('click', (e) => { if (e.target && e.target.getAttribute('data-close')) closeHelpModal(); });

function buildHelpText() {
  const parts = [];
  parts.push('# ViBE Help & Endpoint Cheatsheet');
  parts.push('');
  parts.push('Endpoints:');
  parts.push('- GET /api/file?path=...&head=2000 — read first N bytes');
  parts.push('- GET /api/file?path=...&tail=2000 — read last N bytes');
  parts.push('- GET /api/file?path=...&start=0&end=5000 — byte range');
  parts.push('- GET /api/search?q=term&context=2 — search with ±N lines');
  parts.push('- GET /api/search?q=^POST%20/api/patch&regex=1&case=sensitive — regex search');
  parts.push('- POST /api/patch/diff { diff, keepRegions?, preview? } — apply unified diffs');
  parts.push('- POST /api/revert { snapshotId, direction } — revert/reapply');
  parts.push('- GET /api/snapshots/list — list snapshots');
  parts.push('- POST /api/snapshots/prune { keep } — prune old snapshots');
  parts.push('- GET /api/stats — tool-call counters');
  parts.push('');
  parts.push('PowerShell examples:');
  parts.push('- curl "http://localhost:7080/api/file?path=server.js&head=2000"');
  parts.push('- curl "http://localhost:7080/api/search?q=wrapup&context=2"');
  parts.push('- curl "http://localhost:7080/api/search?q=^POST%20/api/patch&regex=1&case=sensitive&context=1"');
  parts.push('');
  parts.push('WSL/Linux examples:');
  parts.push("- curl 'http://localhost:7080/api/file?path=README.md&tail=1500'");
  parts.push("- curl 'http://localhost:7080/api/search?q=revert&context=2'");
  return parts.join('\n');
}

// Dev Tools modal controls
function openDevModal() {
  devModal.classList.remove('hidden');
  devModal.setAttribute('aria-hidden', 'false');
  fetchDebugLogs();
  fetchStats();
  fetchSnapshots();
  if (devTailToggle?.checked) startDevTail();
  if (devKeepStrictToggle) devKeepStrictToggle.checked = !!keepRegionsStrict;
  if (devExecInChatToggle) devExecInChatToggle.checked = !!execInChat;
}
function closeDevModal() {
  devModal.classList.add('hidden');
  devModal.setAttribute('aria-hidden', 'true');
  stopDevTail();
}
async function fetchDebugLogs() {
  try {
    const res = await fetch('/api/debug?limit=30');
    const data = await res.json();
    devBody.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    devBody.textContent = `Error loading debug logs: ${String(e)}`;
  }
}
btnDevTools?.addEventListener('click', openDevModal);
devClose?.addEventListener('click', closeDevModal);
devModal?.addEventListener('click', (e) => { if (e.target && e.target.getAttribute('data-close')) closeDevModal(); });
devRefresh?.addEventListener('click', fetchDebugLogs);
devRefresh?.addEventListener('click', fetchSnapshots);
devRefresh?.addEventListener('click', fetchStats);
devCopy?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(devBody.textContent || ''); } catch {} });
devTailToggle?.addEventListener('change', () => { if (devTailToggle.checked) startDevTail(); else stopDevTail(); });
devKeepStrictToggle?.addEventListener('change', () => {
  keepRegionsStrict = !!devKeepStrictToggle.checked;
  try { localStorage.setItem('vibe.keepStrict', keepRegionsStrict ? '1' : '0'); } catch {}
});
devExecInChatToggle?.addEventListener('change', () => {
  execInChat = !!devExecInChatToggle.checked;
  try { localStorage.setItem('vibe.execInChat', execInChat ? '1' : '0'); } catch {}
});

async function fetchSnapshots() {
  if (!devSnapList) return;
  try {
    const data = await apiJson('/api/snapshots/list');
    const snaps = Array.isArray(data.snapshots) ? data.snapshots : [];
    const lines = snaps.map(s => `${s.id}  \t${new Date(s.mtimeMs || 0).toISOString()}`);
    devSnapList.textContent = lines.length ? lines.join('\n') : '(none)';
  } catch (e) {
    devSnapList.textContent = `Error loading snapshots: ${String(e)}`;
  }
}
devSnapPrune?.addEventListener('click', async () => {
  const keep = Math.max(0, Number(devSnapKeep?.value || 0));
  try {
    await apiPost('/api/snapshots/prune', { keep });
    await fetchSnapshots();
  } catch (e) {
    addMessage({ who: 'system', text: `Snapshot prune error: ${String(e)}` });
  }
});

// Skills modal controls
async function openSkillsModal() {
  try {
    const res = await fetch('/api/skills/list');
    const data = await res.json();
    const list = Array.isArray(data.skills) ? data.skills : [];
    skillsList.innerHTML = '';
    for (const s of list) {
      const row = document.createElement('label');
      row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selectedSkills.includes(s.name);
      cb.addEventListener('change', () => {
        if (cb.checked) { if (!selectedSkills.includes(s.name)) selectedSkills.push(s.name); }
        else { selectedSkills = selectedSkills.filter(x => x !== s.name); }
      });
      const name = document.createElement('span'); name.textContent = s.title || s.name;
      const file = document.createElement('code'); file.textContent = s.file || '';
      row.appendChild(cb); row.appendChild(name); row.appendChild(file);
      skillsList.appendChild(row);
    }
  } catch {
    skillsList.textContent = 'No skills found.';
  }
  skillsModal.classList.remove('hidden');
  skillsModal.setAttribute('aria-hidden', 'false');
}
function closeSkillsModal(){ skillsModal.classList.add('hidden'); skillsModal.setAttribute('aria-hidden','true'); }
btnSkills?.addEventListener('click', openSkillsModal);
skillsClose?.addEventListener('click', closeSkillsModal);
skillsModal?.addEventListener('click', (e) => { if (e.target && e.target.getAttribute('data-close')) closeSkillsModal(); });
skillsSave?.addEventListener('click', () => { try { localStorage.setItem('vibe.skills', JSON.stringify(selectedSkills)); } catch {} closeSkillsModal(); addMessage({ who:'system', text:`Skills saved: ${(selectedSkills||[]).join(', ')||'(none)'}` }); });

// New Session button
btnNewSession?.addEventListener('click', async () => {
  try {
    chatHistory = [];
    chatMessagesEl.innerHTML = '';
    addMessage({ who:'system', text: 'Starting a new session from state…' });
    handoffNext = true;
    await v7Chat('New session');
  } catch {}
});

// Memory editing via prompt and diff
async function editMemoryFile(rel, title) {
  try {
    let current = '';
    try { const r = await apiJson(`/api/file?path=${encodeURIComponent(rel)}&maxBytes=200000`); current = String(r.content || ''); } catch {}
    const next = prompt(`${title}`, current);
    if (next == null || next === current) return;
    const gen = await apiPost('/api/diff/generate', { path: rel, newContent: String(next) });
    if (gen && gen.diff) { await postPatchDiff({ diff: gen.diff, keepRegions: !!keepRegionsStrict }); await v6FetchAndRender(); addMessage({ who:'system', text:`Updated ${rel}` }); }
  } catch (e) { addMessage({ who:'system', text:`Edit failed for ${rel}: ${String(e)}` }); }
}
btnEditDecisions?.addEventListener('click', () => editMemoryFile('DECISIONS.md', 'Edit DECISIONS.md'));
btnEditCurrent?.addEventListener('click', () => editMemoryFile('CURRENT_TASK.md', 'Edit CURRENT_TASK.md'));

function startDevTail() {
  stopDevTail();
  devTailTimer = setInterval(fetchDebugLogs, 1500);
}
function stopDevTail() {
  if (devTailTimer) { clearInterval(devTailTimer); devTailTimer = null; }
}

async function fetchStats() {
  if (!devStats) return;
  try {
    const s = await apiJson('/api/stats');
    const t = s.tests || { ok: 0, fail: 0 };
    const p = s.patches || { count: 0, files: 0 };
    const bits = [];
    bits.push(`Events: ${s.totalEvents || 0}`);
    bits.push(`Patches: ${p.count || 0}`);
    bits.push(`Files: ${p.files || 0}`);
    bits.push(`Tests: ok=${t.ok||0} fail=${t.fail||0}`);
    if (Array.isArray(s.recentFiles) && s.recentFiles.length) bits.push(`Recent: ${s.recentFiles.slice(0,3).join(', ')}`);
    devStats.textContent = bits.join('  |  ');
  } catch (e) {
    devStats.textContent = `Stats unavailable: ${String(e)}`;
  }
}

// ========== V2 Agent (read-only tools) ==========

// ========== V7 Agent (real LLM planning) ==========
async function v7Chat(text) {
  try {
    startStatus(deriveThinkingLabel());
    const clientState = buildClientState();
    const out = await apiPost('/api/agent/chat', { text, history: chatHistory.slice(-10), client: clientState, handoff: !!handoffNext });
    handoffNext = false;
    const message = out.message || '...';
    const actions = Array.isArray(out.actions) ? out.actions : [];
    const types = new Set(actions.map(a => a && a.type).filter(Boolean));
    const isAsk = types.has('ASK_INPUT');
    const isPlanOrProceed = types.has('EMIT_PLAN') || types.has('REPLAN') || types.has('PROCEED_EXECUTION');
    const hasToolWrites = actions.some(a => a && (a.type==='CREATE_FILE' || a.type==='UPDATE_FILE' || a.type==='EDIT_DIFF'));
    const isQuestion = (message || '').trim().endsWith('?');
    const shouldSpeak = isAsk || (!isPlanOrProceed && !hasToolWrites) || isQuestion;
    if (shouldSpeak) addMessage({ who: 'agent', text: message });
    if (!actions.length) {
      // Explicit Needs Input state without auto-creating a card
      stopStatus();
      if (kanbanStatusEl) kanbanStatusEl.textContent = 'Waiting for your instruction…';
      try {
        // If there is an active task, mark it as NEEDS_INPUT
        const active = (plan?.tasks || []).find(t => t.status === STATUS.EXECUTING || t.status === STATUS.VERIFYING);
        if (active) { active.status = STATUS.NEEDS_INPUT; v1NormalizeTasksFromPlan(); renderPlanJson(); updateEvidence(active.taskId, STATUS.NEEDS_INPUT); }
      } catch {}
    } else {
      messageOnlyTurns = 0;
      if (kanbanStatusEl) { kanbanStatusEl.textContent = ''; stopStatus(); }
      // Show permission banner if server gated execution
      try {
        const halt = actions.find(a => a && a.type === 'HALT_EXECUTION' && (a.reason === 'PERMISSION_REQUIRED'));
        if (halt && permBanner) {
          const missing = Array.isArray(halt.missing) ? halt.missing : [];
          const need = missing.length ? missing.join(' & ') : 'permissions';
          permBanner.textContent = `Execution paused — enable ${need}`;
          permBanner.style.display = 'inline-block';
          // Auto-hide after next permission change
          const hide = () => { permBanner.style.display = 'none'; };
          devKeepStrictToggle?.addEventListener('change', hide, { once: true });
        } else if (permBanner) {
          permBanner.style.display = 'none';
        }
      } catch {}
    }
    for (const a of actions) {
      if (!a || !a.type) continue;
      if ((a.type === 'EMIT_PLAN' || a.type === 'REPLAN') && a.plan) {
        clarifyCount = 0;
        await v7SetPlan(a.plan, out.provider || 'unknown');
      } else if (a.type === 'PROCEED_EXECUTION') {
        v5Autopilot = true;
        btnAutopilot?.classList.add('on');
        if (btnAutopilot) btnAutopilot.textContent = 'Autopilot: On';
        latestRunQueue();
      } else if (a.type === 'HALT_EXECUTION') {
        v5Autopilot = false;
        btnAutopilot?.classList.remove('on');
        if (btnAutopilot) btnAutopilot.textContent = 'Autopilot: Off';
      } else if (a.type === 'PLAN_ONLY') {
        v5Autopilot = false;
        btnAutopilot?.classList.remove('on');
        if (btnAutopilot) btnAutopilot.textContent = 'Autopilot: Off';
      } else if (a.type === 'ASK_INPUT') {
        // Create a Needs Input task in Kanban and pause execution on it (executor skips NEEDS_INPUT)
        const question = String(a.question || message || 'Answer required');
        const t = { taskId: uuid(), title: `Answer: ${question}`, status: STATUS.NEEDS_INPUT, steps: [], notes: '' };
        if (!plan) plan = { planId: uuid(), goal: '', tasks: [] };
        plan.tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
        plan.tasks.push(t);
        v1NormalizeTasksFromPlan();
        renderPlanJson();
        try { await v6Log('ASK_INPUT', { question }); } catch {}
      }
    }
    // Post-processor: add a concise action summary to make chat useful
    if (actions.length) {
      const kinds = new Set(actions.map(a => a && a.type).filter(Boolean));
      if (kinds.has('ASK_INPUT')) {
        const summary = summarizeActionsForChat(actions);
        if (summary) addMessage({ who: 'system', text: summary });
      }
    }
    // No actions → likely a clarification question
    if (message.trim().endsWith('?')) clarifyCount += 1; else clarifyCount = 0;
    if (clarifyCount >= 2) {
      // Build a consolidated goal from recent user messages (last 3 non-trivial)
      const recentUsers = chatHistory.filter(m => m.role === 'user' && (m.content || '').trim().length > 4).slice(-3);
      const goal = recentUsers.map(m => m.content.trim()).join(' ').slice(-300) || text;
      // Do not inject canned chat; request a starter plan silently
      await v7Start(goal);
      clarifyCount = 0;
    }
  } catch (e) {
    // Avoid adding non-LLM chat on errors
    stopStatus();
  }
}

function summarizeActionsForChat(actions) {
  try {
    // Extract plan tasks (titles, writes, diff files)
    const emit = actions.find(a => a && (a.type === 'EMIT_PLAN' || a.type === 'REPLAN') && a.plan);
    const titles = emit && Array.isArray(emit.plan?.tasks) ? emit.plan.tasks.slice(0, 5).map(t => String(t.title||'Task')) : [];
    const fileSet = new Set();
    if (emit && Array.isArray(emit.plan?.tasks)) {
      for (const t of emit.plan.tasks) {
        if (Array.isArray(t.writes)) for (const w of t.writes) if (w?.path) fileSet.add(String(w.path));
        if (typeof t.diff === 'string') {
          const lines = t.diff.split(/\r?\n/);
          for (const ln of lines) {
            if (ln.startsWith('+++ ')) { const m = ln.match(/^\+\+\+\s+(?:b\/)?(.+)$/); if (m && m[1]) fileSet.add(m[1]); }
          }
        }
      }
    }
    // Direct file actions
    for (const a of actions) {
      if (!a) continue;
      if ((a.type === 'CREATE_FILE' || a.type === 'UPDATE_FILE') && a.path) fileSet.add(String(a.path));
    }
    // Build message
    const files = Array.from(fileSet).slice(0, 5);
    const hasProceed = actions.some(a => a && a.type === 'PROCEED_EXECUTION');
    const hasHalt = actions.some(a => a && a.type === 'HALT_EXECUTION');
    const planPart = titles.length ? `Planned ${emit.plan.tasks.length} task(s): ${titles.join('; ')}` : null;
    const filePart = files.length ? `Files: ${files.join(', ')}` : null;
    const nextPart = hasProceed ? 'Next: executing tasks.' : (hasHalt ? 'Next: paused.' : null);
    const parts = [];
    if (planPart) parts.push(`Summary: ${planPart}`);
    if (filePart) parts.push(filePart);
    if (nextPart) parts.push(nextPart);
    const msg = parts.join('\n');
    if (msg.trim()) return msg;
    // Fallback: list action types
    const kinds = actions.map(a => a && a.type).filter(Boolean);
    if (kinds.length) return `Summary: ${kinds.join(', ')}`;
    return '';
  } catch { return ''; }
}

function deriveThinkingLabel() {
  try {
    const hasPlan = !!(plan && Array.isArray(plan.tasks) && plan.tasks.length);
    const pending = (plan?.tasks || []).filter(t => t.status !== STATUS.DONE && t.status !== STATUS.REVERTED).length;
    const needs = (plan?.tasks || []).some(t => t.status === STATUS.NEEDS_INPUT);
    if (!hasPlan) return 'Thinking: creating plan…';
    if (needs) return 'Thinking: awaiting input…';
    if (pending > 0) return 'Thinking: proposing next change…';
    return 'Thinking…';
  } catch { return 'Thinking…'; }
}

function buildRunSummaryHTML(patchRes, runRes, task) {
  try {
    const files = Array.isArray(patchRes?.changes) ? patchRes.changes.map(c => c.path) : [];
    const snap = patchRes?.snapshotId || 'n/a';
    const ok = !!runRes?.ok;
    const testSummary = ok ? 'pass' : 'fail';
    const name = String(task?.title || 'Task');
    const head = `Execution — ${name} • Changed: ${files.length} • Snapshot: ${snap} • Tests: ${testSummary}`;
    const fileList = files.slice(0, 6).map(p => `<code>${escapeHtml(p)}</code>`).join(', ');
    const extraFiles = files.length > 6 ? ` (+${files.length - 6} more)` : '';
    const stdout = String(runRes?.stdout || '').split(/\r?\n/).slice(0, 8).join('\n');
    const details = `\n<details><summary>Execution log</summary>\n<div style="margin-top:6px">\n  <div>Files: ${fileList}${extraFiles}</div>\n  <div>Snapshot: <code>${escapeHtml(snap)}</code></div>\n  <div>Tests:</div>\n  <pre class="code" style="white-space:pre-wrap">${escapeHtml(stdout)}</pre>\n</div>\n</details>`;
    return `${escapeHtml(head)}${details}`;
  } catch {
    return `Execution — ${escapeHtml(String(task?.title || 'Task'))}`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Render an Execution summary bubble (safe DOM building; no raw HTML)
function addExecutionSummary(patchRes, runRes, task) {
  try {
    const wrap = document.createElement('div');
    wrap.className = 'msg system';
    const whoEl = document.createElement('div');
    whoEl.className = 'who';
    whoEl.textContent = 'Execution';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    // Header
    const header = document.createElement('div');
    const title = String(task?.title || 'Task');
    const changes = Array.isArray(patchRes?.changes) ? patchRes.changes : [];
    const created = changes.filter(c => c.type === 'added').map(c => c.path);
    const edited = changes.filter(c => c.type === 'modified').map(c => c.path);
    const deleted = changes.filter(c => c.type === 'deleted').map(c => c.path);
    const headParts = [`Execution — ${title}`];
    if (created.length) headParts.push(`Created: ${created.slice(0,2).join(', ')}${created.length>2?` (+${created.length-2})`:''}`);
    if (edited.length) headParts.push(`Edited: ${edited.slice(0,2).join(', ')}${edited.length>2?` (+${edited.length-2})`:''}`);
    if (deleted.length) headParts.push(`Deleted: ${deleted.slice(0,2).join(', ')}${deleted.length>2?` (+${deleted.length-2})`:''}`);
    headParts.push(`Tests: ${runRes?.ok ? 'pass' : 'fail'}`);
    header.textContent = headParts.join(' • ');

    // Inline (log) expander
    const details = document.createElement('details');
    details.style.display = 'inline';
  const summary = document.createElement('summary');
  summary.textContent = ' (details)';
    summary.style.display = 'inline';
    summary.style.marginLeft = '6px';
    details.appendChild(summary);

    const body = document.createElement('div');
    body.style.marginTop = '6px';

    // Files list (limit)
    const filesLine = document.createElement('div');
  const allFiles = changes.map(c => c.path);
  // Filter out .gitkeep noise
  const filterFiles = allFiles.filter(p => !/\.gitkeep$/i.test(p));
  const filesToShow = filterFiles.length ? filterFiles : allFiles;
  const maxShow = 6;
  filesLine.appendChild(document.createTextNode('Files: '));
  for (let i=0;i<Math.min(filesToShow.length,maxShow);i++) {
    const code = document.createElement('code'); code.textContent = filesToShow[i];
    filesLine.appendChild(code);
    if (i<Math.min(filesToShow.length,maxShow)-1) filesLine.appendChild(document.createTextNode(', '));
  }
  if (filesToShow.length>maxShow) filesLine.appendChild(document.createTextNode(` (+${filesToShow.length-maxShow} more)`));

    // Snapshot with Copy
    const snapLine = document.createElement('div');
    const snapLbl = document.createElement('span'); snapLbl.textContent = 'Snapshot: ';
    const snap = patchRes?.snapshotId || 'n/a';
    const snapCode = document.createElement('code'); snapCode.textContent = String(snap);
  const copyBtn = document.createElement('button'); copyBtn.textContent='Copy id'; copyBtn.className='mini-copy'; copyBtn.title='Copy snapshot id';
    copyBtn.addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(String(snap)); }catch{} });
    snapLine.appendChild(snapLbl); snapLine.appendChild(snapCode); snapLine.appendChild(document.createTextNode(' ')); snapLine.appendChild(copyBtn);

    // Tests output (first 8 lines)
    const testsHdr = document.createElement('div'); testsHdr.textContent = 'Tests:';
    const pre = document.createElement('pre'); pre.className = 'code'; pre.style.whiteSpace='pre-wrap';
    const tail = String((runRes && (runRes.last || runRes.stdout)) || '').split(/\r?\n/).slice(0,8).join('\n');
    pre.textContent = tail;
    if (runRes && runRes.logPath) {
      const logLine = document.createElement('div');
      logLine.textContent = 'Log: ';
      const code = document.createElement('code'); code.textContent = runRes.logPath;
      logLine.appendChild(code);
      body.appendChild(logLine);
    }
body.appendChild(filesLine);
    body.appendChild(snapLine);
    body.appendChild(testsHdr);
    body.appendChild(pre);
    details.appendChild(body);

    bubble.appendChild(header);
    bubble.appendChild(details);
    wrap.appendChild(whoEl);
    wrap.appendChild(bubble);
    chatMessagesEl.appendChild(wrap);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  } catch {}
}

function buildClientState() {
  const pendingCount = (plan?.tasks || []).filter(t => t.status !== STATUS.DONE).length;
  const activeDir = guessActiveDirFromPlan(plan) || null;
  let overlay = null;
  try {
    const t = (plan?.tasks || []).find(x => x.taskId === selectedTaskId) || (plan?.tasks || []).find(x => x.status === STATUS.EXECUTING) || null;
    if (t) overlay = taskOverlayPath(t);
  } catch {}
  return { pendingCount, activeDir, overlay, skills: selectedSkills, autopilot: v5Autopilot, perms: { read: !!perms.read, write: !!perms.write, test: !!perms.test } };
}

function guessActiveDirFromPlan(p) {
  try {
    const tasksArr = Array.isArray(p?.tasks) ? p.tasks.slice() : [];
    // Prefer explicit "Create directory <path>" most recent
    for (let i = tasksArr.length - 1; i >= 0; i--) {
      const t = tasksArr[i];
      const m = String(t.title || '').match(/Create directory\s+([^\s]+)/i);
      if (m && m[1]) return m[1].replace(/\/$/, '');
    }
    // Otherwise infer from last write step path
    for (let i = tasksArr.length - 1; i >= 0; i--) {
      const t = tasksArr[i];
      const steps = Array.isArray(t.steps) ? t.steps : [];
      for (let j = steps.length - 1; j >= 0; j--) {
        const st = String(steps[j] || '');
        const m = st.match(/write\s+([^\s]+)/i);
        if (m && m[1] && m[1].includes('/')) {
          return m[1].split('/')[0];
        }
      }
    }
  } catch {}
  return null;
}

async function v7SetPlan(newPlan, provider) {
  const prevPlan = plan;
  normalizePlanInPlace(newPlan);
  try { if (!newPlan || !Array.isArray(newPlan.tasks)) throw new Error('Invalid plan'); } catch (e) {
    addMessage({ who: 'agent', text: 'Received invalid plan from agent.' });
    return;
  }
  noPendingNoticeShown = false;
  try { currentRunId = newPlan.planId || uuid(); wrapUpSentRunId = null; } catch {}
  // Merge behavior: prefer identity by taskId; do not merge by title
  if (prevPlan && Array.isArray(prevPlan.tasks) && prevPlan.tasks.length) {
    const merged = { planId: prevPlan.planId || newPlan.planId || uuid(), goal: newPlan.goal || prevPlan.goal || '', tasks: [] };
    const byId = new Map();
    for (const t of prevPlan.tasks) { merged.tasks.push({ ...t }); byId.set(t.taskId, true); }
    for (const t of newPlan.tasks) {
      if (t.taskId && byId.has(t.taskId)) {
        const idx = merged.tasks.findIndex(x => x.taskId === t.taskId);
        if (idx >= 0) {
          const cur = merged.tasks[idx];
          const upd = { ...cur };
          if (t.status) upd.status = t.status;
          if (Array.isArray(t.steps) && t.steps.length) upd.steps = t.steps;
          if (typeof t.notes === 'string') upd.notes = t.notes;
          if (Array.isArray(t.writes)) upd.writes = t.writes;
          merged.tasks[idx] = upd;
        }
      } else {
        const nt = { ...t };
        if (!nt.taskId) nt.taskId = uuid();
        merged.tasks.push(nt);
        byId.set(nt.taskId, true);
      }
    }
    plan = merged;
  } else {
    plan = newPlan;
  }
  plan.tasks.forEach(t => { if (!t.status) t.status = STATUS.PLANNED; });
  v1NormalizeTasksFromPlan();
  renderPlanJson();
  const sig = JSON.stringify((plan.tasks || []).map(t => t.title || t.description || 'Task'));
  const sameAsBefore = prevPlan && lastPlanSig && sig === lastPlanSig;
  lastPlanSig = sig;
  // Evidence only; keep chat LLM-only
  setEvidence({ taskId: null, diff: `# Plan Updated (provider=${provider})\n${JSON.stringify(plan, null, 2)}`, logs: sameAsBefore ? 'Proceeding with execution (repeated plan).' : 'Plan ready.', tests: 'N/A' });
  // If autopilot is on, kick the executor to process the new/updated plan
  if (v5Autopilot) {
    btnAutopilot?.classList.add('on');
    if (btnAutopilot) btnAutopilot.textContent = 'Autopilot: On';
    latestRunQueue();
  }
  refreshIdleStatus();
}
async function v7Start(goal) {
  try {
    const res = await apiPost('/api/agent/plan', { goal });
    const provider = res.provider || 'unknown';
    plan = res.plan;
    if (!plan || !Array.isArray(plan.tasks)) throw new Error('Invalid plan');
    // Normalize statuses
    plan.tasks.forEach(t => { if (!t.status) t.status = STATUS.PLANNED; });
    // Render
    v1NormalizeTasksFromPlan();
    renderPlanJson();
    addMessage({ who: 'agent', text: `Plan created via ${provider}. ${plan.tasks.length} tasks added.` });
    setEvidence({ taskId: null, diff: `# LLM Plan (provider=${provider})\n${JSON.stringify(plan, null, 2)}`, logs: 'Real LLM planning complete. Awaiting confirmation to proceed.', tests: 'N/A' });
    awaitingConfirm = true;
    addMessage({ who: 'agent', text: 'Shall I proceed with execution? (yes/no)' });
  } catch (e) {
    addMessage({ who: 'agent', text: `LLM planning failed: ${String(e)}` });
  }
}

async function latestApplyPatchForTask(task) {
  const rawTitle = String(task.title || task.description || '');
  function norm(p){ return p.replace(/\\/g,'/').replace(/^\.\//,''); }
  function parseQuoted(s){ const m=s.match(/["']([^"']+)["']/); return m?m[1]:null; }

  // If the plan includes a unified diff, apply it via diff endpoint
  if (typeof task.diff === 'string' && task.diff.trim()) {
    return postPatchDiff({ diff: String(task.diff), keepRegions: !!keepRegionsStrict });
  }

  // Collect target files from steps/title to scaffold via diffs when applicable
  const scaffoldTargets = new Set();
  if (Array.isArray(task.steps)) {
    for (const st of task.steps) {
      const m1 = String(st).match(/\bwrite\s+['"]?([^'"\n]+)['"]?/i);
      if (m1) scaffoldTargets.add(norm(m1[1]));
    }
  }
  const q = parseQuoted(rawTitle);
  if (/create\s+.*?file/i.test(rawTitle)) {
    const f = norm(q || rawTitle.split(/file/i).pop().trim());
    if (f) scaffoldTargets.add(f);
  }

  const diffs = [];
  const changedPaths = new Set();

  // If explicit writes are present, convert all to unified diffs (server-side generate)
  if (Array.isArray(task.writes)) {
    for (const w of task.writes) {
      if (!w || !w.path) continue;
      const p = norm(String(w.path));
      if (w.base64) {
        // binary not supported via diff; fall back to add_binary through /api/patch
        // minimal support: skip here; let next block scaffold if possible
        continue;
      }
      const content = (w.content !== undefined) ? String(w.content) : '';
      try {
        const gen = await apiPost('/api/diff/generate', { path: p, newContent: content });
        if (gen && gen.diff && gen.diff.trim()) { diffs.push(String(gen.diff)); changedPaths.add(p); }
      } catch {}
    }
  }

  // Add scaffolds (diffs) for any paths implied by steps/title that weren't covered by writes
  for (const p of scaffoldTargets) {
    try {
      if (changedPaths.has(p)) continue; // a write already covers this path — do not scaffold over it
      // Skip scaffolding if file already exists to avoid overwriting existing app content
      try {
        const r = await fetch(`/api/file?path=${encodeURIComponent(p)}&head=1`);
        if (r && r.ok) continue;
      } catch {}
      const gen = await apiPost('/api/diff/generate', { path: p, newContent: scaffoldFor(p) });
      if (gen && gen.diff && gen.diff.trim()) { diffs.push(String(gen.diff)); changedPaths.add(p); }
    } catch {}
  }

  // Fallback: if nothing to change, append a README note via diff
  if (diffs.length === 0) {
    try {
      let cur = '';
      try { const rf = await apiJson('/api/file?path=README.md'); cur = String(rf.content || ''); } catch {}
      const note = `\n\nLatest task: ${(task.title||task.description||'Task')} — ${new Date().toISOString()}`;
      const gen = await apiPost('/api/diff/generate', { path: 'README.md', newContent: cur + note });
      if (gen && gen.diff && gen.diff.trim()) diffs.push(String(gen.diff));
    } catch {}
  }

  const combined = diffs.join('\n');
  return postPatchDiff({ diff: combined, keepRegions: !!keepRegionsStrict });

  function scaffoldFor(p){
    const pn = String(p).toLowerCase();
    if (pn.endsWith('/index.html') || pn === 'index.html') {
      const appName = deriveNameFromPath(p);
      return `<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\"/>\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>\n  <title>${appName}</title>\n  <link rel=\"stylesheet\" href=\"styles.css\"/>\n</head>\n<body>\n  <main class=\"app\">\n    <h1>${appName}</h1>\n    <p>Hello, world!</p>\n  </main>\n  <script src=\"app.js\"></script>\n</body>\n</html>\n`;
    }
    if (pn.endsWith('/styles.css') || pn === 'styles.css') {
      return `:root{color-scheme:light dark}body{font-family:system-ui,Arial,sans-serif;margin:2rem} .app{max-width:560px;margin:auto} h1{margin:0 0 1rem} p{opacity:.85}`;
    }
    if (pn.endsWith('/app.js') || pn === 'app.js') {
      return `document.addEventListener('DOMContentLoaded',()=>{console.log('Hello from ${deriveNameFromPath(p)}')});`;
    }
    return `/* Created by ViBE at ${new Date().toISOString()} */`;
  }
  function deriveNameFromPath(p){
    const parts = p.split('/');
    const dir = parts.length>1 ? parts[parts.length-2] : 'App';
    return dir.replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }
}

async function postPatch(body, tries = 6, delayMs = 250) {
  for (let i = 0; i < tries; i++) {
    try { return await apiPost('/api/patch', body); }
    catch (e) {
      const msg = String(e || '');
      if (msg.includes('HTTP 423')) { await new Promise(r => setTimeout(r, delayMs)); continue; }
      throw e;
    }
  }
  return await apiPost('/api/patch', body);
}

async function postPatchDiff(body, tries = 6, delayMs = 250) {
  for (let i = 0; i < tries; i++) {
    try { return await apiPost('/api/patch/diff', body); }
    catch (e) {
      const msg = String(e || '');
      if (msg.includes('HTTP 423')) { await new Promise(r => setTimeout(r, delayMs)); continue; }
      throw e;
    }
  }
  return await apiPost('/api/patch/diff', body);
}

function taskSlugFromTitle(title, id) {
  const base = String(title || 'task').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48) || 'task';
  const short = String(id || '').replace(/^id-/, '').slice(-6) || Math.random().toString(16).slice(2,8);
  return `${base}-${short}`;
}
function taskOverlayPath(task) {
  const slug = taskSlugFromTitle(task.title || task.description || 'task', task.taskId || task.id);
  return `tasks/${slug}.md`;
}

async function ensureTaskOverlay(task) {
  const rel = taskOverlayPath(task);
  // Check existence
  let exists = false;
  try {
    const r = await fetch(`/api/file?path=${encodeURIComponent(rel)}&head=1`);
    exists = r.ok;
  } catch {}
  if (exists) return;
  // Build overlay content
  const filesFromTask = [];
  try {
    if (Array.isArray(task.writes)) { for (const w of task.writes) if (w?.path) filesFromTask.push(String(w.path)); }
    if (typeof task.diff === 'string') {
      const lines = String(task.diff).split(/\r?\n/);
      for (const ln of lines) { if (ln.startsWith('+++ ')) { const m = ln.match(/^\+\+\+\s+(?:b\/)?(.+)$/); if (m && m[1]) filesFromTask.push(m[1]); } }
    }
  } catch {}
  const uniqFiles = Array.from(new Set(filesFromTask)).slice(0, 10);
  const content = [
    `# Task Overlay — ${task.title || task.description || 'Task'}`,
    `TaskId: ${task.taskId || task.id}`,
    '',
    `Goal: ${plan?.goal || ''}`,
    '',
    'Acceptance Criteria:',
    ...(Array.isArray(task.steps) && task.steps.length ? task.steps.map(s => `- ${s}`) : ['- Criteria defined during execution']),
    '',
    'Target Files:',
    ...(uniqFiles.length ? uniqFiles.map(p=>`- ${p}`) : ['- (TBD)']),
    '',
    'Verify:',
    '- npm test',
  ].join('\n');
  try {
    const gen = await apiPost('/api/diff/generate', { path: rel, newContent: content });
    if (gen && gen.diff) await postPatchDiff({ diff: gen.diff, keepRegions: !!keepRegionsStrict });
    try { await v6Log('TASK_OVERLAY_CREATED', { path: rel, taskId: task.taskId || task.id }); } catch {}
  } catch {}
}

async function latestRunQueue() {
  if (!v5Autopilot) return;
  clearTimers();
  const all = (plan?.tasks || []);
  const waitingInput = all.filter(t => t.status === STATUS.NEEDS_INPUT);
  const queue = all.filter(t => t.status !== STATUS.DONE && t.status !== STATUS.REVERTED && t.status !== STATUS.NEEDS_INPUT);
  if (!queue.length) {
    if (waitingInput.length) {
      if (kanbanStatusEl) kanbanStatusEl.textContent = 'Waiting for input…';
      // keep chat clean; status is enough
    } else {
      if (kanbanStatusEl) kanbanStatusEl.textContent = 'No pending tasks to execute.';
    }
    refreshIdleStatus();
    try { await maybeSendRunWrapUp(); } catch {}
    return;
  }
  noPendingNoticeShown = false;
  const t = queue[0];
  try { await ensureTaskOverlay(t); } catch {}
  v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.EXECUTING, notes: 'Applying patch' });
  startStatus('Applying patch…');
  if (!perms.write) {
    v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED, notes: 'Write permission required' });
    stopStatus();
    addMessage({ who:'system', text:'✋ Write permission is disabled. Click Permissions to enable writes, then continue.' });
    return;
  }
  let patchRes;
  try {
    patchRes = await latestApplyPatchForTask(t);
    if (patchRes && patchRes.snapshotId) {
      if (!Array.isArray(v3Snapshots[t.taskId])) v3Snapshots[t.taskId] = [];
      v3Snapshots[t.taskId].push(patchRes.snapshotId);
    }
    const changed = Array.isArray(patchRes.changes) ? patchRes.changes : [];
    const savedAbs = changed.map(c => (c.absPath || c.path)).map(p => ` - ${p}`).join('\n');
    const savedRel = changed.map(c => c.path).join(', ');
    const root = patchRes.workspaceRoot || '';
    const logs = [`snapshot: ${patchRes.snapshotId}`, root ? `root: ${root}` : '', savedAbs ? `saved:\n${savedAbs}` : (savedRel ? `saved: ${savedRel}` : '')].filter(Boolean).join('\n');
    const fileDiffs = changed.map(c => ({ path: c.path, type: c.type, diff: c.diff || '' }));
    v3Evidence[t.taskId] = { diff: patchRes.diff || '(no diff)', logs, tests: 'Ready to run tests', files: fileDiffs };
    v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.VERIFYING, notes: 'Running tests' });
    // keep chat lean; summarize after tests
  } catch (e) {
    v3Evidence[t.taskId] = { diff: 'Patch failed.', logs: String(e), tests: '' };
    v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED });
    if (kanbanStatusEl) { kanbanStatusEl.textContent = 'Patch failed'; stopStatus(); }
    addMessage({ who: 'system', text: `❌ Patch failed: ${String(e).slice(0,180)}` });
    return;
  }
  try {
    startStatus('Running tests…');
    if (!perms.test) { throw new Error('Tests require permission'); }
    const runRes = await apiPost('/api/run', { kind: 'test', timeoutMs: 15000, confirm: true });
    const ok = !!runRes.ok;
    v3Evidence[t.taskId] = { diff: v3Evidence[t.taskId]?.diff || '', logs: `tests: ${ok ? 'ok' : 'fail'}\n${(runRes.stdout || '').slice(0, 2000)}`, tests: (runRes.stdout || '').slice(0, 4000), files: v3Evidence[t.taskId]?.files || [] };
    if (ok) {
      v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.DONE, notes: 'Completed' });
      if (kanbanStatusEl) { kanbanStatusEl.textContent = ''; stopStatus(); }
      if (execInChat) addExecutionSummary(patchRes, runRes, t);
      // Auto-switch Evidence tab to Plan; skip if user recently focused Diff
      try {
        const recent = Date.now() - (lastTabClickTs || 0) < 8000;
        if (!(recent && lastSelectedTab === 'diff')) selectTab('plan');
      } catch {}
      schedule(200, latestRunQueue);
    } else {
      v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED, notes: 'Tests failed' });
      if (kanbanStatusEl) { kanbanStatusEl.textContent = 'Tests failed'; stopStatus(); }
      addExecutionSummary(patchRes, runRes, t); // always show on failure
    }
  } catch (e) {
    const msg = String(e||'');
    v3Evidence[t.taskId] = { diff: v3Evidence[t.taskId]?.diff || '', logs: msg.includes('permission') ? 'tests: permission required' : 'Error running tests', tests: String(e), files: v3Evidence[t.taskId]?.files || [] };
    v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED, notes: msg.includes('permission') ? 'Tests permission required' : 'Tests error' });
    if (kanbanStatusEl) { kanbanStatusEl.textContent = msg.includes('permission') ? 'Tests require permission' : 'Error running tests'; stopStatus(); }
    addExecutionSummary(patchRes, { ok: false, stdout: String(e) }, t);
  }
}

async function postRunWrapUp(task, patchRes, runRes) {
  const changes = Array.isArray(patchRes?.changes) ? patchRes.changes.map(c => ({ path: c.path, type: c.type })) : [];
  const lastUser = chatHistory.slice().reverse().find(m => m.role === 'user' && (m.content||'').trim().length>0);
  const goal = lastUser ? lastUser.content.trim() : (plan?.goal || '');
  const summary = {
    goal,
    task: task?.title || '',
    changes,
    tests: { ok: !!runRes?.ok, brief: !!runRes?.ok ? 'pass' : String(runRes?.stdout||'').split(/\r?\n/)[0] || 'fail' },
    snapshotId: patchRes?.snapshotId || ''
  };
  try {
    const res = await apiPost('/api/wrapup', { summary });
    const msg = (res && res.message) ? String(res.message) : '';
    if (msg) addMessage({ who: 'agent', text: msg });
  } catch {
    const names = changes.slice(0,3).map(c=>c.path).join(', ');
    const ok = !!runRes?.ok;
    const fallback = ok
      ? `Done — ${task?.title || 'task'}. Files: ${names || 'none'}. Want to make another change?`
      : `Tests failed in ${task?.title || 'task'}. I can show failing output or revert; what should I do?`;
    addMessage({ who: 'agent', text: fallback });
  }
}

// ----- Run wrap-up (once at end of plan) -----
let currentRunId = null; // updated when setting a new plan
let wrapUpSentRunId = null;

async function maybeSendRunWrapUp() {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) return;
  const pending = (plan.tasks || []).filter(t => t.status !== STATUS.DONE && t.status !== STATUS.REVERTED).length;
  if (pending > 0) return;
  const rid = currentRunId || plan.planId || plan.goal || 'run';
  if (wrapUpSentRunId === rid) return;
  const summary = aggregateRunSummary();
  if (!summary) return;
  try {
    const res = await apiPost('/api/wrapup', { summary });
    const msg = (res && res.message) ? String(res.message) : '';
    if (msg) addMessage({ who: 'agent', text: msg });
  } catch {
    const names = (summary.primaryFiles || []).join(', ');
    const ok = !!(summary.tests && summary.tests.ok);
    const fallback = ok
      ? `Done — ${summary.task || 'task'}. Files: ${names || 'none'}. Want to make another change?`
      : `Tests failed. I can show failing output or revert — what should I do?`;
    addMessage({ who: 'agent', text: fallback });
  }
  wrapUpSentRunId = rid;
}

function aggregateRunSummary() {
  try {
    const all = [];
    for (const t of (plan?.tasks || [])) {
      const ev = v3Evidence[t.taskId];
      if (ev && Array.isArray(ev.files)) {
        for (const f of ev.files) all.push({ path: f.path, type: f.type });
      }
    }
    const prio = { deleted: 3, added: 2, modified: 1 };
    const byPath = new Map();
    for (const c of all) {
      if (!c || !c.path) continue;
      const prev = byPath.get(c.path);
      if (!prev || (prio[String(c.type)||''] > prio[String(prev.type)||''])) byPath.set(c.path, { path: c.path, type: c.type });
    }
    let files = Array.from(byPath.values());
    const meaningful = files.filter(x => !/\.gitkeep$/i.test(x.path));
    if (meaningful.length) files = meaningful;
    const primaryFiles = files.slice(0, 3).map(x => x.path);
    const anyBlocked = (plan.tasks || []).some(t => t.status === STATUS.BLOCKED);
    const task = (plan.tasks || []).slice(-1)[0]?.title || '';
    const lastUser = chatHistory.slice().reverse().find(m => m.role === 'user' && (m.content||'').trim().length>0);
    const goal = lastUser ? lastUser.content.trim() : (plan?.goal || '');
    let lastSnap = '';
    for (const t of (plan.tasks || []).slice().reverse()) {
      const arr = v3Snapshots[t.taskId];
      const s = Array.isArray(arr) ? arr[arr.length-1] : arr;
      if (s) { lastSnap = s; break; }
    }
    return { goal, task, changes: files, primaryFiles, tests: { ok: !anyBlocked }, snapshotId: lastSnap };
  } catch { return null; }
}

function v2CreatePlan(goal) {
  return {
    planId: uuid(),
    goal,
    tasks: [
      { taskId: uuid(), title: 'Analyze repository', status: STATUS.PLANNED, steps: ['list tree'], notes: '' },
      { taskId: uuid(), title: 'Search relevant code', status: STATUS.PLANNED, steps: ['keyword search'], notes: '' },
      { taskId: uuid(), title: 'Read candidate files', status: STATUS.PLANNED, steps: ['open files'], notes: '' },
      { taskId: uuid(), title: 'Propose diffs (no write)', status: STATUS.PLANNED, steps: ['plan changes'], notes: '' },
    ],
  };
}

async function apiJson(pathname) {
  const res = await fetch(`${apiBase}${pathname}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiPost(pathname, body) {
  const res = await fetch(`${apiBase}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const v2Tools = {
  async tree(root='.', depth=2) {
    const data = await apiJson(`/api/tree?path=${encodeURIComponent(root)}&depth=${depth}`);
    const lines = data.entries.map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.path}${e.type === 'file' ? ` (${e.size}b)` : ''}`);
    return [`# Repo Tree (${data.root}, depth=${data.depth})`, ...lines].slice(0, 200).join('\n');
  },
  async file(p) {
    const data = await apiJson(`/api/file?path=${encodeURIComponent(p)}`);
    return `# File: ${data.path} (${data.size} bytes)\n\n${data.content}`;
  },
  async search(q) {
    const data = await apiJson(`/api/search?q=${encodeURIComponent(q)}&max=50`);
    const lines = data.matches.map(m => `${m.path}:${m.line}: ${m.text}`);
    return [`# Search: ${data.q}`, ...lines].slice(0, 200).join('\n');
  }
};

function v2NormalizeTasksFromPlan() {
  tasks = (plan?.tasks || []).map(t => ({ id: t.taskId, title: t.title, status: t.status }));
  renderKanban();
}

function v2Dispatch(action) {
  // reuse semantics of V1 without persistence
  if (!action || !action.action) return;
  if (action.action === 'CREATE_TASKS') {
    plan.tasks = action.tasks;
    v2NormalizeTasksFromPlan();
    addMessage({ who: 'agent', text: `Created ${action.tasks.length} analysis tasks.` });
  } else if (action.action === 'UPDATE_TASK') {
    const t = plan.tasks.find(x => x.taskId === action.taskId);
    if (!t) return;
    t.status = action.status;
    if (action.notes) t.notes = action.notes;
    v2NormalizeTasksFromPlan();
    updateEvidence(t.taskId, t.status);
  }
}

function v2HandleCommand(text) {
  const t = text.toLowerCase();
  if (t === 'stop') {
    addMessage({ who: 'user', text });
    clearTimers();
    addMessage({ who: 'agent', text: 'Paused. Say “continue” to resume.' });
    return true;
  }
  if (t === 'continue') {
    addMessage({ who: 'user', text });
    addMessage({ who: 'agent', text: 'Resuming…' });
    v2RunQueue();
    return true;
  }
  if (t === 'try again') {
    addMessage({ who: 'user', text });
    clearTimers();
    const goal = plan?.goal || '';
    plan = null; tasks = []; renderKanban();
    addMessage({ who: 'agent', text: 'Resetting analysis and trying again…' });
    if (goal) v2Start(goal);
    return true;
  }
  return false;
}

async function v2Start(goal) {
  addMessage({ who: 'user', text: goal });
  plan = v2CreatePlan(goal);
  v2Dispatch({ action: 'CREATE_TASKS', tasks: plan.tasks });
  setEvidence({ taskId: null, diff: `# V2 Plan Created\nPlanId: ${plan.planId}\nGoal: ${plan.goal}`, logs: 'Tools: tree, file, search', tests: 'Read-only' });

  // Quick health check: ping /api/tree
  try {
    await apiJson('/api/tree?path=.');
  } catch (e) {
    const t = plan.tasks[0];
    v2Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED, notes: 'Server not running' });
    v2Evidence[t.taskId] = {
      diff: 'Blocked: Read-only server not reachable.',
      logs: 'Start the server: node server.js (default port 7080). Then reload this page from http://localhost:7080/.',
      tests: 'N/A'
    };
    updateEvidence(t.taskId, STATUS.BLOCKED);
    return;
  }

  v2RunQueue();
}

function bestQueryFromGoal(goal) {
  const words = goal.toLowerCase().match(/[a-z0-9_][a-z0-9_-]{2,}/g) || [];
  words.sort((a, b) => b.length - a.length);
  return words.slice(0, 2).join(' ');
}

function v2RunQueue() {
  clearTimers();
  const [tAnalyze, tSearch, tRead, tPropose] = plan.tasks;

  // Analyze repository
  schedule(200, async () => {
    v2Dispatch({ action: 'UPDATE_TASK', taskId: tAnalyze.taskId, status: STATUS.EXECUTING });
    try {
      const tree = await v2Tools.tree('.', 2);
      v2Evidence[tAnalyze.taskId] = { diff: tree, logs: 'tool: tree ✓', tests: 'N/A' };
      v2Dispatch({ action: 'UPDATE_TASK', taskId: tAnalyze.taskId, status: STATUS.VERIFYING });
      schedule(300, () => v2Dispatch({ action: 'UPDATE_TASK', taskId: tAnalyze.taskId, status: STATUS.DONE }));
    } catch (e) {
      v2Evidence[tAnalyze.taskId] = { diff: 'Error listing tree', logs: String(e), tests: '' };
      v2Dispatch({ action: 'UPDATE_TASK', taskId: tAnalyze.taskId, status: STATUS.BLOCKED });
      return;
    }
  });

  // Search relevant code
  schedule(1200, async () => {
    v2Dispatch({ action: 'UPDATE_TASK', taskId: tSearch.taskId, status: STATUS.EXECUTING });
    try {
      const q = bestQueryFromGoal(plan.goal) || 'index.html';
      const results = await v2Tools.search(q);
      v2Evidence[tSearch.taskId] = { diff: results, logs: `tool: search "${q}" ✓`, tests: 'N/A' };
      v2Dispatch({ action: 'UPDATE_TASK', taskId: tSearch.taskId, status: STATUS.VERIFYING });
      schedule(300, () => v2Dispatch({ action: 'UPDATE_TASK', taskId: tSearch.taskId, status: STATUS.DONE }));
    } catch (e) {
      v2Evidence[tSearch.taskId] = { diff: 'Error searching', logs: String(e), tests: '' };
      v2Dispatch({ action: 'UPDATE_TASK', taskId: tSearch.taskId, status: STATUS.BLOCKED });
      return;
    }
  });

  // Read candidate files
  schedule(2200, async () => {
    v2Dispatch({ action: 'UPDATE_TASK', taskId: tRead.taskId, status: STATUS.EXECUTING });
    try {
      const candidates = ['index.html', 'app.js', 'styles.css', 'README.md'];
      const snippets = [];
      for (const p of candidates) {
        try { snippets.push(await v2Tools.file(p)); } catch {}
      }
      v2Evidence[tRead.taskId] = { diff: snippets.join('\n\n---\n\n') || 'No candidate files found', logs: 'tool: file ✓', tests: 'N/A' };
      v2Dispatch({ action: 'UPDATE_TASK', taskId: tRead.taskId, status: STATUS.VERIFYING });
      schedule(300, () => v2Dispatch({ action: 'UPDATE_TASK', taskId: tRead.taskId, status: STATUS.DONE }));
    } catch (e) {
      v2Evidence[tRead.taskId] = { diff: 'Error reading files', logs: String(e), tests: '' };
      v2Dispatch({ action: 'UPDATE_TASK', taskId: tRead.taskId, status: STATUS.BLOCKED });
      return;
    }
  });

  // Propose diffs (no write)
  schedule(3200, async () => {
    v2Dispatch({ action: 'UPDATE_TASK', taskId: tPropose.taskId, status: STATUS.EXECUTING });
    const suggestion = [
      '*** Proposed changes (no write):',
      '--- a/index.html',
      '+++ b/index.html',
      '@@',
      '- <title>ViBE V0 — Chat → Plan → Kanban</title>',
      '+ <title>ViBE — Kanban Agent (V2)</title>',
    ].join('\n');
    v2Evidence[tPropose.taskId] = { diff: suggestion, logs: 'analysis only; no patch applied', tests: 'N/A' };
    v2Dispatch({ action: 'UPDATE_TASK', taskId: tPropose.taskId, status: STATUS.VERIFYING });
    schedule(300, () => v2Dispatch({ action: 'UPDATE_TASK', taskId: tPropose.taskId, status: STATUS.DONE }));
  });
}

// ========== V3 Agent (single-card write + verify) ==========

function v3CreatePlan(goal) {
  return {
    planId: uuid(),
    goal,
    tasks: [
      { taskId: uuid(), title: 'Update page title', status: STATUS.PLANNED, steps: ['edit index.html'], notes: '' },
      { taskId: uuid(), title: 'Append README note', status: STATUS.PLANNED, steps: ['write README.md'], notes: '' },
      { taskId: uuid(), title: 'Add CSS tweak', status: STATUS.PLANNED, steps: ['write styles.css'], notes: '' },
    ],
  };
}

function v3NormalizeTasksFromPlan() {
  tasks = (plan?.tasks || []).map(t => ({ id: t.taskId, title: t.title, status: t.status }));
  renderKanban();
}

function v3Dispatch(action) {
  if (!action || !action.action) return;
  if (action.action === 'CREATE_TASKS') {
    plan.tasks = action.tasks;
    v3NormalizeTasksFromPlan();
    addMessage({ who: 'agent', text: `Created ${action.tasks.length} execution tasks.` });
  } else if (action.action === 'UPDATE_TASK') {
    const t = plan.tasks.find(x => x.taskId === action.taskId);
    if (!t) return;
    t.status = action.status;
    if (action.notes) t.notes = action.notes;
    v3NormalizeTasksFromPlan();
    updateEvidence(t.taskId, t.status);
    if (typeof updateRevertButton === 'function') updateRevertButton();
    if (t.status === STATUS.DONE) { try { v6Log('TASK_DONE', { taskId: t.taskId, title: t.title }); v6FetchAndRender(); } catch {} }
  }
}

function v3HandleCommand(text) {
  const t = text.toLowerCase();
  if (t === 'stop') {
    addMessage({ who: 'user', text });
    clearTimers();
    addMessage({ who: 'agent', text: 'Paused. Say “continue” to resume.' });
    return true;
  }
  if (t === 'continue') {
    addMessage({ who: 'user', text });
    addMessage({ who: 'agent', text: 'Resuming…' });
    v3RunQueue();
    return true;
  }
  if (t === 'try again') {
    addMessage({ who: 'user', text });
    clearTimers();
    const goal = plan?.goal || '';
    plan = null; tasks = []; renderKanban();
    addMessage({ who: 'agent', text: 'Resetting execution and trying again…' });
    if (goal) v3Start(goal);
    return true;
  }
  return false;
}

async function v3Start(goal) {
  addMessage({ who: 'user', text: goal });
  plan = v3CreatePlan(goal);
  v3Dispatch({ action: 'CREATE_TASKS', tasks: plan.tasks });
  setEvidence({ taskId: null, diff: `# V3 Plan Created\nPlanId: ${plan.planId}\nGoal: ${plan.goal}`, logs: 'One atomic changeset per card.', tests: 'Verify per card' });
  // Quick ping server
  try { await apiJson('/api/ping'); } catch (e) {
    const t = plan.tasks[0];
    v3Evidence[t.taskId] = { diff: 'Blocked: server not running.', logs: 'Start with: node server.js (http://localhost:7080)', tests: '' };
    v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED });
    return;
  }
  v3RunQueue();
}

async function v3RunQueue() {
  clearTimers();
  const queue = plan.tasks.filter(t => t.status !== STATUS.DONE);
  if (queue.length === 0) return;
  const t = queue[0];
  // EXECUTING: apply patch
  v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.EXECUTING, notes: 'Applying patch' });
  try {
    const patchRes = await v3ApplyPatchForTask(t);
    if (patchRes && patchRes.snapshotId) v3Snapshots[t.taskId] = patchRes.snapshotId;
    v3Evidence[t.taskId] = { diff: patchRes.diff || '(no diff)', logs: `snapshot: ${patchRes.snapshotId}`, tests: 'Ready to run tests' };
    v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.VERIFYING, notes: 'Running tests' });
  } catch (e) {
    v3Evidence[t.taskId] = { diff: 'Patch failed.', logs: String(e), tests: '' };
    v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED });
    return;
  }
  // VERIFYING: run tests (or pass if none)
  try {
    const runRes = await apiPost('/api/run', { kind: 'test', timeoutMs: 15000 });
    const ok = !!runRes.ok;
    v3Evidence[t.taskId] = { diff: v3Evidence[t.taskId]?.diff || '', logs: `tests: ${ok ? 'ok' : 'fail'}\n${(runRes.stdout || '').slice(0, 2000)}`, tests: (runRes.stdout || '').slice(0, 4000) };
    if (ok) {
      v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.DONE, notes: 'Completed' });
      // proceed to next
      schedule(200, v3RunQueue);
    } else {
      v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED, notes: 'Tests failed' });
    }
  } catch (e) {
    v3Evidence[t.taskId] = { diff: v3Evidence[t.taskId]?.diff || '', logs: 'Error running tests', tests: String(e) };
    v3Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED });
  }
}

async function v3ApplyPatchForTask(task) {
  if (task.title === 'Update page title') {
    // Read index.html and replace <title>
    const file = await apiJson('/api/file?path=index.html');
    const updated = String(file.content).replace(/<title>[\s\S]*?<\/title>/i, '<title>ViBE — Kanban Agent (V3)</title>');
    return apiPost('/api/patch', { ops: [{ op: 'write', path: 'index.html', content: updated }] });
  }
  if (task.title === 'Append README note') {
    // Append note to README.md (create if missing)
    let content = '';
    try { const file = await apiJson('/api/file?path=README.md'); content = String(file.content); } catch {}
    const note = `\n\nV3 note: Applied at ${new Date().toISOString()}`;
    return apiPost('/api/patch', { ops: [{ op: content ? 'write' : 'add', path: 'README.md', content: content + note }] });
  }
  if (task.title === 'Add CSS tweak') {
    let content = '';
    try { const file = await apiJson('/api/file?path=styles.css'); content = String(file.content); } catch {}
    const tweak = '\n/* V3 tweak: subtle shadow */\n';
    const next = content.includes(tweak) ? content : (content + tweak);
    return apiPost('/api/patch', { ops: [{ op: content ? 'write' : 'add', path: 'styles.css', content: next }] });
  }
  // default
  return apiPost('/api/patch', { ops: [] });
}
let modalScrollTop = 0;

// ========== V5 Agent (autopilot + needs input) ==========

let v5PendingQuestion = null; // { taskId, question, options: [] }
let v5StyleChoice = null; // 'css-vars' | 'tailwind'

function v5CreatePlan(goal) {
  return {
    planId: uuid(),
    goal,
    tasks: [
      { taskId: uuid(), title: 'Update page title', status: STATUS.PLANNED, steps: ['edit index.html'], notes: '' },
      { taskId: uuid(), title: 'Decide styling approach', status: STATUS.PLANNED, steps: ['ask user'], notes: '' },
      { taskId: uuid(), title: 'Append README note', status: STATUS.PLANNED, steps: ['write README.md'], notes: '' },
      { taskId: uuid(), title: 'Add CSS tweak', status: STATUS.PLANNED, steps: ['write styles.css'], notes: '' },
    ],
  };
}

function v5NormalizeTasksFromPlan() {
  tasks = (plan?.tasks || []).map(t => ({ id: t.taskId, title: t.title, status: t.status }));
  renderKanban();
}

function v5Dispatch(action) {
  if (!action || !action.action) return;
  if (action.action === 'CREATE_TASKS') {
    plan.tasks = action.tasks;
    v5NormalizeTasksFromPlan();
    addMessage({ who: 'agent', text: `Created ${action.tasks.length} tasks.` });
  } else if (action.action === 'UPDATE_TASK') {
    const t = plan.tasks.find(x => x.taskId === action.taskId);
    if (!t) return;
    t.status = action.status;
    if (action.notes) t.notes = action.notes;
    v5NormalizeTasksFromPlan();
    updateEvidence(t.taskId, t.status);
    if (t.status === STATUS.DONE) { try { v6Log('TASK_DONE', { taskId: t.taskId, title: t.title }); v6FetchAndRender(); } catch {} }
  } else if (action.action === 'ASK_INPUT') {
    const t = plan.tasks.find(x => x.taskId === action.taskId);
    if (!t) return;
    t.status = STATUS.NEEDS_INPUT;
    v5PendingQuestion = { taskId: action.taskId, question: action.question, options: action.options || [] };
    v5NormalizeTasksFromPlan();
    v3Evidence[action.taskId] = {
      diff: `? ${action.question}\nOptions:\n${(action.options || []).map((o, i) => ` ${i+1}. ${o}`).join('\n')}`,
      logs: 'action: ASK_INPUT',
      tests: 'N/A'
    };
    updateEvidence(action.taskId, STATUS.NEEDS_INPUT);
    addMessage({ who: 'agent', text: `Question: ${action.question}\nOptions: ${(action.options || []).map((o,i)=>`${i+1}) ${o}`).join(', ')}` });
    v6Log('ASK_INPUT', { taskId: action.taskId, question: action.question, options: action.options || [] });
    v6FetchAndRender();
  }
}

async function v5Start(goal) {
  addMessage({ who: 'user', text: goal });
  v5PendingQuestion = null; v5StyleChoice = null; v5Autopilot = true;
  plan = v5CreatePlan(goal);
  v5Dispatch({ action: 'CREATE_TASKS', tasks: plan.tasks });
  setEvidence({ taskId: null, diff: `# V5 Plan Created\nPlanId: ${plan.planId}\nGoal: ${plan.goal}`, logs: 'Autopilot enabled', tests: 'Per-card verification' });
  try { await v6Log('START', { goal }); } catch {}
  try { await apiJson('/api/ping'); } catch (e) {
    const t = plan.tasks[0];
    v3Evidence[t.taskId] = { diff: 'Blocked: server not running.', logs: 'Start with: node server.js (http://localhost:7080)', tests: '' };
    v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED });
    return;
  }
  v5RunQueue();
}

function v5HandleCommand(text) {
  // Do not intercept any messages in V7; let the agent handle everything
  if (mode === 'V7') return false;
  const t = text.toLowerCase();
  if (t === 'stop') {
    addMessage({ who: 'user', text });
    clearTimers();
    v5Autopilot = false;
    if (btnAutopilot) { btnAutopilot.classList.remove('on'); btnAutopilot.textContent = 'Autopilot: Off'; }
    addMessage({ who: 'agent', text: 'Autopilot paused. Say “continue” to resume.' });
    return true;
  }
  if (t === 'continue') {
    addMessage({ who: 'user', text });
    v5Autopilot = true;
    if (btnAutopilot) { btnAutopilot.classList.add('on'); btnAutopilot.textContent = 'Autopilot: On'; }
    if (v5PendingQuestion) {
      addMessage({ who: 'agent', text: 'Awaiting your answer to the question.' });
    } else {
      addMessage({ who: 'agent', text: 'Resuming execution…' });
      if (mode === 'V7') latestRunQueue(); else v5RunQueue();
    }
    return true;
  }
  if (t === 'try again') {
    addMessage({ who: 'user', text });
    clearTimers();
    const goal = plan?.goal || '';
    plan = null; tasks = []; renderKanban();
    addMessage({ who: 'agent', text: 'Resetting and trying again…' });
    if (goal) v5Start(goal);
    return true;
  }
  // Answer handling
  if (v5PendingQuestion) {
    addMessage({ who: 'user', text });
    const ans = text.trim().toLowerCase();
    const opts = v5PendingQuestion.options.map(o => o.toLowerCase());
    let pick = null;
    const num = parseInt(ans, 10);
    if (!isNaN(num) && num >= 1 && num <= opts.length) pick = opts[num - 1];
    if (!pick) {
      if (opts.some(o => ans.includes(o))) pick = opts.find(o => ans.includes(o));
      else if (ans.includes('css')) pick = 'css-vars';
      else if (ans.includes('tail')) pick = 'tailwind';
    }
    if (!pick) { addMessage({ who: 'agent', text: 'Sorry, please choose one of the options by number or name.' }); return true; }
    v5StyleChoice = pick;
    addMessage({ who: 'agent', text: `Got it: ${pick}. Continuing…` });
    const qTaskId = v5PendingQuestion.taskId;
    v5PendingQuestion = null;
    // Progress the question task quickly through statuses
    v5Dispatch({ action: 'UPDATE_TASK', taskId: qTaskId, status: STATUS.EXECUTING, notes: 'Applying choice' });
    schedule(300, () => v5Dispatch({ action: 'UPDATE_TASK', taskId: qTaskId, status: STATUS.VERIFYING }));
    schedule(700, () => {
      v5Dispatch({ action: 'UPDATE_TASK', taskId: qTaskId, status: STATUS.DONE, notes: `Chose ${v5StyleChoice}` });
      if (v5Autopilot) v5RunQueue();
    });
    v6Log('ANSWER', { taskId: qTaskId, answer: v5StyleChoice });
    v6FetchAndRender();
    return true;
  }
  return false;
}

async function v5RunQueue() {
  if (!v5Autopilot) return;
  clearTimers();
  const queue = plan.tasks.filter(t => t.status !== STATUS.DONE);
  if (queue.length === 0) return;
  const t = queue[0];
  // Needs input?
  if (t.title === 'Decide styling approach' && !v5StyleChoice && !v5PendingQuestion) {
    if (mode === 'V6') {
      const pref = v6PreferredStyleChoice();
      if (pref) {
        v5StyleChoice = pref;
        addMessage({ who: 'agent', text: `Using prior choice from memory: ${pref}` });
        v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.EXECUTING, notes: 'Applying prior choice' });
        schedule(200, () => v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.VERIFYING }));
        schedule(600, () => { v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.DONE, notes: `Chose ${pref} (memory)` }); v6Log('USED_MEMORY_CHOICE', { taskId: t.taskId, choice: pref }); if (v5Autopilot) v5RunQueue(); });
        return;
      }
    }
    return v5Dispatch({ action: 'ASK_INPUT', taskId: t.taskId, question: 'Choose a styling approach', options: ['css-vars', 'tailwind'] });
  }
  // If previously reverted, skip applying same idea
  if (mode === 'V6' && v6WasRevertedTaskTitle(t.title)) {
    v3Evidence[t.taskId] = { diff: '(skipped due to prior revert)', logs: 'memory: skip', tests: 'N/A' };
    v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.DONE, notes: 'Skipped due to prior revert' });
    v6Log('SKIP_DUE_TO_MEMORY', { taskId: t.taskId, title: t.title });
    schedule(150, v5RunQueue);
    return;
  }
  // EXECUTING: apply patch (reuse V3 mechanics)
  v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.EXECUTING, notes: 'Applying patch' });
  try {
    const patchRes = await v5ApplyPatchForTask(t);
    if (patchRes && patchRes.snapshotId) v3Snapshots[t.taskId] = patchRes.snapshotId;
    v3Evidence[t.taskId] = { diff: patchRes.diff || '(no diff)', logs: `snapshot: ${patchRes.snapshotId}`, tests: 'Ready to run tests' };
    v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.VERIFYING, notes: 'Running tests' });
    v6FetchAndRender();
  } catch (e) {
    v3Evidence[t.taskId] = { diff: 'Patch failed.', logs: String(e), tests: '' };
    v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED });
    return;
  }
  try {
    const runRes = await apiPost('/api/run', { kind: 'test', timeoutMs: 15000 });
    const ok = !!runRes.ok;
    v3Evidence[t.taskId] = { diff: v3Evidence[t.taskId]?.diff || '', logs: `tests: ${ok ? 'ok' : 'fail'}\n${(runRes.stdout || '').slice(0, 2000)}`, tests: (runRes.stdout || '').slice(0, 4000) };
    if (ok) {
      v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.DONE, notes: 'Completed' });
      schedule(200, v5RunQueue);
    } else {
      v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED, notes: 'Tests failed' });
    }
    v6FetchAndRender();
  } catch (e) {
    v3Evidence[t.taskId] = { diff: v3Evidence[t.taskId]?.diff || '', logs: 'Error running tests', tests: String(e) };
    v5Dispatch({ action: 'UPDATE_TASK', taskId: t.taskId, status: STATUS.BLOCKED });
  }
}

async function v5ApplyPatchForTask(task) {
  // Reuse V3 operations; adjust CSS tweak based on style choice
  if (task.title === 'Update page title') {
    const file = await apiJson('/api/file?path=index.html');
    const updated = String(file.content).replace(/<title>[\s\S]*?<\/title>/i, '<title>ViBE — Kanban Agent (V5)</title>');
    return apiPost('/api/patch', { ops: [{ op: 'write', path: 'index.html', content: updated }] });
  }
  if (task.title === 'Append README note') {
    let content = '';
    try { const file = await apiJson('/api/file?path=README.md'); content = String(file.content); } catch {}
    const note = `\n\nV5 note: Applied at ${new Date().toISOString()}`;
    return apiPost('/api/patch', { ops: [{ op: content ? 'write' : 'add', path: 'README.md', content: content + note }] });
  }
  if (task.title === 'Add CSS tweak') {
    let content = '';
    try { const file = await apiJson('/api/file?path=styles.css'); content = String(file.content); } catch {}
    const tweak = v5StyleChoice === 'tailwind'
      ? '\n/* V5 tweak: tailwind-friendly spacing */\n'
      : '\n/* V5 tweak: using css-vars */\n';
    const next = content.includes(tweak) ? content : (content + tweak);
    return apiPost('/api/patch', { ops: [{ op: content ? 'write' : 'add', path: 'styles.css', content: next }] });
  }
  if (task.title === 'Decide styling approach') {
    return { ok: true, snapshotId: `noop_${Date.now()}`, diff: '(no diff)' };
  }
  return apiPost('/api/patch', { ops: [] });
}
// V6 memory cache
let v6Events = [];
let v6Stats = null;

async function v6Log(type, data) {
  try { await apiPost('/api/event', { type, data }); } catch {}
}

async function v6FetchAndRender() {
  try {
    const out = await apiJson('/api/events');
    v6Events = Array.isArray(out.events) ? out.events : [];
  } catch { v6Events = []; }
  try { v6Stats = await apiJson('/api/stats'); } catch { v6Stats = null; }
  renderMemory();
}

function v6PreferredStyleChoice() {
  for (let i = v6Events.length - 1; i >= 0; i--) {
    const e = v6Events[i];
    if (e.type === 'ANSWER') {
      const ans = String(e.data && e.data.answer || '').toLowerCase();
      if (ans.includes('css')) return 'css-vars';
      if (ans.includes('tail')) return 'tailwind';
    }
  }
  return null;
}

function v6WasRevertedTaskTitle(title) {
  const t = String(title).toLowerCase();
  return v6Events.some(e => e.type === 'REVERT' && String(e.data && e.data.title || '').toLowerCase() === t);
}

function renderMemory() {
  if (!tabMemory) return;
  const lastStyle = v6PreferredStyleChoice();
  const lines = [];
  lines.push(`# Memory Summary`);
  lines.push(`Preferred style: ${lastStyle || 'unknown'}`);
  const revs = v6Events.filter(e => e.type === 'REVERT').length;
  const checks = v6Events.filter(e => e.type === 'REVERT_CHECK').length;
  lines.push(`Reverts: ${revs}`);
  lines.push(`Revert checks: ${checks}`);
  if (v6Stats && v6Stats.ok) {
    lines.push('');
    lines.push(`# Agent Stats`);
    const c = v6Stats.counts || {};
    lines.push(`Events: ${v6Stats.totalEvents || 0}`);
    lines.push(`Patches: ${(v6Stats.patches && v6Stats.patches.count) || 0} (files ${(v6Stats.patches && v6Stats.patches.files) || 0})`);
    const t = v6Stats.tests || { ok: 0, fail: 0 };
    lines.push(`Tests: ok=${t.ok||0} fail=${t.fail||0}`);
    if (Array.isArray(v6Stats.recentFiles) && v6Stats.recentFiles.length) {
      lines.push(`Recent files: ${v6Stats.recentFiles.slice(0,5).join(', ')}`);
    }
    lines.push(`Snapshots: ${v6Stats.snapshots || 0}`);
  }
  lines.push('');
  lines.push(`# Recent Events`);
  const recent = v6Events.slice(-20);
  for (const e of recent) {
    const ts = new Date(e.ts || Date.now()).toISOString();
    let info = '';
    if (e.type === 'ANSWER') info = `answer=${e.data && e.data.answer}`;
    else if (e.type === 'ASK_INPUT') info = `q=${e.data && e.data.question}`;
    else if (e.type === 'PATCH_APPLIED') info = `changes=${(e.data && e.data.changes && e.data.changes.length) || 0}`;
    else if (e.type === 'TEST_RESULT') info = `ok=${e.data && e.data.ok}`;
    else if (e.type === 'REVERT') info = `snapshot=${e.data && e.data.snapshotId}`;
    else if (e.type === 'REVERT_CHECK') info = `warnings=${Array.isArray(e.data && e.data.warnings) ? e.data.warnings.length : 0}`;
    else if (e.type === 'TASK_DONE') info = `task=${e.data && e.data.title}`;
    lines.push(`${ts}  ${e.type}  ${info}`);
  }
  tabMemory.textContent = lines.join('\n');
}

// Optional: quick endpoint cheat sheet appended after first render
try {
  const orig = renderMemory;
  renderMemory = function() {
    orig();
    if (!tabMemory) return;
    const extra = [
      '',
      '# Endpoint Cheatsheet',
      '- GET /api/file?path=...&head=2000 — read first N bytes',
      '- GET /api/file?path=...&tail=2000 — read last N bytes',
      '- GET /api/file?path=...&start=0&end=5000 — byte range',
      '- GET /api/search?q=term&context=2 — search with ±N lines',
      '- GET /api/search?q=^POST%20/api/patch&regex=1&case=sensitive — regex',
      '- POST /api/patch/diff { diff, keepRegions } — apply unified diff (returns diffPath)',
      '- POST /api/diff/generate { path, newContent } — build a minimal diff',
      '- POST /api/run { kind:"test" } — run tests (returns logPath, last)',
      '- POST /api/revert { snapshotId, direction } — revert or reapply',
      '- GET /api/stats — tool call counters'
    ].join('\n');
    // Append only once per load
    if (!renderMemory._cheats) {
      tabMemory.textContent = tabMemory.textContent + '\n' + extra;
      renderMemory._cheats = true;
    }
  }
} catch {}
let lastTabClickTs = 0;
let lastSelectedTab = 'diff';
// (Removed natural-language router and adhoc task creators; model must drive tool calls)
