import fs from "node:fs";
import path from "node:path";

function safeRead(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function parseTaskLine(line) {
  // Supports the TASK_FORMAT.md contract:
  // - [ ] Title ... (ctx:work) (proj:projects/X) (due:YYYY-MM-DD) (id:t-...)
  // - [x] Title ... @done(YYYY-MM-DD) (id:...)
  const m = line.match(/^\s*-\s*\[( |x)\]\s+(.*)$/i);
  if (!m) return null;
  const checked = String(m[1]).toLowerCase() === "x";
  let rest = String(m[2] || "");

  const doneM = rest.match(/@done\((\d{4}-\d{2}-\d{2})\)/);
  const completedAt = doneM ? doneM[1] : null;

  // Pull tokens of the form (key:value)
  const tokenRe = /\(([^:()\s]+):([^)]*)\)/g;
  const tokens = {};
  let tok;
  while ((tok = tokenRe.exec(rest))) {
    const k = tok[1].trim();
    const v = tok[2].trim();
    tokens[k] = v;
  }

  // Title is rest with tokens removed.
  const title = rest
    .replace(/@done\([^)]*\)/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const id = tokens.id || null;

  return {
    id,
    title,
    ctx: tokens.ctx || "",
    project: tokens.proj || "",
    area: tokens.area || "",
    due: tokens.due || null,
    pri: tokens.pri || null,
    est: tokens.est || null,
    note: tokens.note || "",
    completedAt: checked ? (completedAt || new Date().toISOString()) : null,
    _raw: line,
  };
}

function weekFromDonePath(p) {
  // tasks/done/2026-W06.md → 2026-W06
  const base = path.basename(p);
  const m = base.match(/^(\d{4}-W\d{2})\.md$/);
  return m ? m[1] : null;
}

function normalizeTask(t, defaults) {
  const now = new Date().toISOString();
  return {
    id: t.id || defaults.id || null,
    title: t.title || defaults.title || "(untitled)",
    list: defaults.list,
    ctx: t.ctx || defaults.ctx || "",
    project: t.project || defaults.project || "",
    area: t.area || defaults.area || "",
    due: t.due || null,
    createdAt: now,
    updatedAt: now,
    completedAt: t.completedAt || null,
    deletedAt: null,
    notes: t.note || "",
    legacy: {
      source: defaults.source,
      raw: t._raw,
      pri: t.pri,
      est: t.est,
    },
  };
}

export async function migrate({ workspaceDir }) {
  const tasksDir = path.join(workspaceDir, "tasks");
  const outPath = path.join(workspaceDir, "tasks.json");

  const state = {
    schemaVersion: 1,
    migratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [],
  };

  const pushFromFile = (p, defaults) => {
    const text = safeRead(p);
    if (!text) return;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseTaskLine(line);
      if (!parsed) continue;
      const week = defaults.week || null;
      const task = normalizeTask(parsed, { ...defaults, source: p });
      if (week) task.legacy.week = week;
      state.tasks.push(task);
    }
  };

  // Next actions by context
  const nextDir = path.join(tasksDir, "next");
  if (fs.existsSync(nextDir)) {
    const files = fs.readdirSync(nextDir).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const ctx = path.basename(f, ".md");
      pushFromFile(path.join(nextDir, f), { list: "next", ctx });
    }
  }

  pushFromFile(path.join(tasksDir, "this-week.md"), { list: "week" });
  pushFromFile(path.join(tasksDir, "waiting-for.md"), { list: "waiting" });
  pushFromFile(path.join(tasksDir, "someday-maybe.md"), { list: "someday" });

  // Done history
  const doneDir = path.join(tasksDir, "done");
  if (fs.existsSync(doneDir)) {
    const files = fs.readdirSync(doneDir).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const full = path.join(doneDir, f);
      const wk = weekFromDonePath(full);
      pushFromFile(full, { list: "done", week: wk });
    }
  }

  // De-dupe by id if possible (keep first)
  const seen = new Set();
  const deduped = [];
  for (const t of state.tasks) {
    const key = t.id || t.legacy.raw;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(t);
  }
  state.tasks = deduped;

  // Back up existing JSON if present.
  if (fs.existsSync(outPath)) {
    const backup = `${outPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(outPath, backup);
  }

  fs.writeFileSync(outPath, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });

  return {
    ok: true,
    tasks: state.tasks.length,
    outPath,
  };
}
