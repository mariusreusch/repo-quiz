/* ============================================================
   Repo Trading Quiz — application logic
   No framework, no build step, no backend.
   ============================================================ */
(() => {
"use strict";

const STORE_KEY = "repoquiz.stats.v1";
const THEME_KEY = "repoquiz.theme";
const DIFF_NAME = { 1: "Foundational", 2: "Practitioner", 3: "Advanced" };

/* ── game modes ──────────────────────────────────────── */
const MODES = {
  quick: {
    icon: "⚡", name: "Quick Five",
    desc: "Five random questions, mixed difficulty",
    count: 5, feedback: "immediate"
  },
  sudden: {
    icon: "☠", name: "Sudden Death",
    desc: "Keep going until the first wrong answer",
    endless: true, stopOnWrong: true, feedback: "immediate"
  },
  timeattack: {
    icon: "⏱", name: "Time Attack",
    desc: "As many as you can in three minutes",
    endless: true, seconds: 180, feedback: "immediate"
  },
  daily: {
    icon: "◷", name: "Daily Challenge",
    desc: "Ten questions, the same set all day",
    count: 10, feedback: "immediate", seeded: true
  },
  weak: {
    icon: "◎", name: "Weak Spots",
    desc: "What you last got wrong, plus what you have not seen",
    count: 15, feedback: "immediate", pick: "weak"
  },
  topic: {
    icon: "◆", name: "Topic Round",
    desc: "Drill one topic or subtopic",
    setup: true
  },
  review: {
    icon: "↻", name: "Review Round",
    desc: "The questions you just missed",
    hidden: true, feedback: "immediate"
  }
};

/* Modes retired from the menu — kept so older run history still reads properly. */
const LEGACY_MODE_NAMES = { exam: "Exam Simulation", custom: "Custom Round" };

/* ── state ───────────────────────────────────────────── */
const S = {
  data: null,
  byId: new Map(),
  stats: loadStats(),
  run: null,
  setup: null,
  timerId: null
};

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const el = (tag, props = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) n.append(kid);
  return n;
};

/* ── persistence ─────────────────────────────────────── */
function loadStats() {
  const empty = { questions: {}, runs: [], bestStreak: 0, daily: {} };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? Object.assign(empty, JSON.parse(raw)) : empty;
  } catch { return empty; }
}
function saveStats() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S.stats)); } catch { /* private mode */ }
}
function qStat(id) {
  return S.stats.questions[id] || (S.stats.questions[id] = { seen: 0, correct: 0, wrong: 0, lastCorrect: null });
}

/* ── helpers ─────────────────────────────────────────── */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashString = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const todayKey = () => new Date().toISOString().slice(0, 10);
const topicName = id => (S.data.topics.find(t => t.id === id) || {}).name || id;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmtClock = ms => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/* ── views ───────────────────────────────────────────── */
const VIEWS = ["loading", "error", "home", "setup", "quiz", "result", "stats", "sources"];
function show(name) {
  VIEWS.forEach(v => $(`#view-${v}`).classList.toggle("hidden", v !== name));
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}
function navigate(name) {
  if (S.run && name !== "quiz") stopTimer();
  if (name === "home")    renderHome();
  if (name === "stats")   renderStats();
  if (name === "sources") renderSources();
  show(name);
}

/* ── boot ────────────────────────────────────────────── */
async function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  $("#theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  });
  $("#brand").addEventListener("click", () => navigate("home"));
  document.addEventListener("click", e => {
    const nav = e.target.closest("[data-nav]");
    if (nav) navigate(nav.dataset.nav);
  });
  document.addEventListener("keydown", onKey);

  try {
    const res = await fetch("data/questions.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    S.data = await res.json();
  } catch (err) {
    $("#error-detail").textContent = String(err);
    show("error");
    return;
  }
  S.data.questions.forEach(q => S.byId.set(q.id, q));
  $("#footer-disclaimer").textContent = S.data.meta.disclaimer;
  navigate("home");
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $("#theme-toggle").textContent = t === "dark" ? "☾" : "☀";
}

/* ── home ────────────────────────────────────────────── */
function renderHome() {
  const qs = S.data.questions;
  const subtopicCount = new Set(qs.map(q => q.topic + "/" + q.subtopic)).size;

  $("#mode-list").replaceChildren(...Object.entries(MODES)
    .filter(([, m]) => !m.hidden)
    .map(([key, m]) => el("button", {
      class: "mode-row", type: "button", onclick: () => startMode(key)
    }, [
      el("span", { class: "mode-icon", text: m.icon }),
      el("span", { class: "mode-body" }, [
        el("span", { class: "mode-name", text: m.name }),
        el("span", { class: "mode-desc", text: m.desc })
      ]),
      el("span", { class: "mode-meta", text: modeMeta(key) }),
      el("span", { class: "mode-go", "aria-hidden": "true", text: "›" })
    ])));

  $("#home-meta").textContent =
    `${qs.length} questions · ${S.data.topics.length} topics · ${subtopicCount} subtopics`;
}

/* Short status line on the right of each mode row — empty when there is nothing to say. */
function modeMeta(key) {
  if (key === "daily") {
    const d = S.stats.daily[todayKey()];
    return d ? `${d.correct}/${d.total} today` : "";
  }
  if (key === "sudden") return S.stats.bestStreak ? `best ${S.stats.bestStreak}` : "";
  if (key === "weak") {
    const n = weakPool().length;
    return n ? `${n} pending` : "";
  }
  return "";
}

/* ── question selection ──────────────────────────────── */
function weakPool() {
  return S.data.questions.filter(q => {
    const s = S.stats.questions[q.id];
    return s && s.seen > 0 && s.lastCorrect === false;
  });
}

function pickQuestions(mode, cfg = {}) {
  const m = MODES[mode];
  let pool = S.data.questions.slice();

  if (cfg.topics?.length)      pool = pool.filter(q => cfg.topics.includes(q.topic));
  if (cfg.subtopics?.length)   pool = pool.filter(q => cfg.subtopics.includes(q.subtopic));
  if (cfg.difficulties?.length) pool = pool.filter(q => cfg.difficulties.includes(q.difficulty));
  if (cfg.ids?.length)         pool = S.data.questions.filter(q => cfg.ids.includes(q.id));

  const rnd = m.seeded ? mulberry32(hashString(todayKey())) : Math.random;

  if (m.pick === "weak") {
    const weak   = shuffle(weakPool(), rnd);
    const unseen = shuffle(pool.filter(q => !(S.stats.questions[q.id]?.seen)), rnd);
    const rest   = shuffle(pool.filter(q => !weak.includes(q) && !unseen.includes(q)), rnd);
    pool = [...weak, ...unseen, ...rest];
  } else {
    pool = shuffle(pool, rnd);
  }

  const count = cfg.count ?? m.count;
  if (m.endless || count === "all" || !count) return pool;
  return pool.slice(0, Math.min(count, pool.length));
}

/* ── run lifecycle ───────────────────────────────────── */
function startMode(key) {
  if (MODES[key].setup) { openSetup(); return; }
  startRun(key, {});
}

function startRun(mode, cfg) {
  const m = MODES[mode];
  const questions = pickQuestions(mode, cfg);
  if (!questions.length) { alert("No questions match that selection."); return; }

  S.run = {
    mode, cfg, questions,
    idx: 0,
    answers: [],
    streak: 0,
    locked: false,
    feedback: cfg.feedback || m.feedback || "immediate",
    startedAt: Date.now(),
    endsAt: m.seconds ? Date.now() + m.seconds * 1000 : null,
    optionOrder: null
  };
  show("quiz");
  startTimer();
  renderQuestion();
}

function startTimer() {
  stopTimer();
  const t = $("#quiz-timer");
  if (!S.run.endsAt) { t.classList.add("hidden"); return; }
  t.classList.remove("hidden");
  const tick = () => {
    if (!S.run) return stopTimer();
    const left = S.run.endsAt - Date.now();
    t.textContent = fmtClock(left);
    t.classList.toggle("pill-urgent", left < 30000);
    if (left <= 0) { stopTimer(); finishRun("time"); }
  };
  tick();
  S.timerId = setInterval(tick, 250);
}
function stopTimer() { if (S.timerId) { clearInterval(S.timerId); S.timerId = null; } }

/* ── quiz rendering ──────────────────────────────────── */
function renderQuestion() {
  const r = S.run;
  const q = r.questions[r.idx];
  const m = MODES[r.mode];

  $("#quiz-mode").textContent = m.name;
  $("#quiz-counter").textContent = m.endless
    ? `Question ${r.idx + 1}`
    : `Question ${r.idx + 1} of ${r.questions.length}`;
  $("#quiz-score").textContent = `${r.answers.filter(a => a.correct).length} correct`;
  $("#quiz-progress").style.width = m.endless
    ? `${Math.min(100, (r.idx / 20) * 100)}%`
    : `${(r.idx / r.questions.length) * 100}%`;

  $("#q-topic").textContent = topicName(q.topic);
  $("#q-subtopic").textContent = q.subtopic;
  const d = $("#q-difficulty");
  d.textContent = DIFF_NAME[q.difficulty];
  d.dataset.level = q.difficulty;
  $("#q-text").textContent = q.question;

  // shuffle option order but remember the mapping
  r.optionOrder = shuffle(q.options.map((_, i) => i));
  $("#q-options").replaceChildren(...r.optionOrder.map((origIdx, pos) =>
    el("button", {
      class: "option", type: "button", "data-pos": pos,
      onclick: () => answer(pos)
    }, [
      el("span", { class: "option-key", text: String(pos + 1) }),
      el("span", { text: q.options[origIdx] })
    ])
  ));

  $("#q-feedback").classList.add("hidden");
  $("#q-next").classList.add("hidden");
  r.locked = false;
}

function answer(pos) {
  const r = S.run;
  if (r.locked) return;
  r.locked = true;

  const q = r.questions[r.idx];
  const chosen = r.optionOrder[pos];
  const correct = chosen === q.answer;

  r.answers.push({ id: q.id, chosen, correct });

  const st = qStat(q.id);
  st.seen++;
  st.lastCorrect = correct;
  correct ? st.correct++ : st.wrong++;

  if (correct) {
    r.streak++;
    if (r.streak > S.stats.bestStreak) S.stats.bestStreak = r.streak;
  } else {
    r.streak = 0;
  }
  saveStats();

  $("#quiz-score").textContent = `${r.answers.filter(a => a.correct).length} correct`;

  if (r.feedback === "immediate") {
    $$("#q-options .option").forEach(btn => {
      const orig = r.optionOrder[+btn.dataset.pos];
      btn.disabled = true;
      if (orig === q.answer) btn.dataset.state = "correct";
      else if (orig === chosen) btn.dataset.state = "wrong";
    });
    showFeedback(q, correct);
  } else {
    $$("#q-options .option").forEach(btn => {
      btn.disabled = true;
      if (+btn.dataset.pos === pos) btn.dataset.state = "chosen";
    });
  }

  const m = MODES[r.mode];
  if (m.stopOnWrong && !correct) { setTimeout(() => finishRun("streak-broken"), 900); return; }

  const last = !m.endless && r.idx === r.questions.length - 1;
  const btn = $("#q-next");
  btn.textContent = last ? "See results" : "Next question";
  btn.classList.remove("hidden");
  if (r.feedback !== "immediate") setTimeout(next, 180);
}

function showFeedback(q, correct) {
  const box = $("#q-feedback");
  box.dataset.ok = correct ? "1" : "0";
  box.replaceChildren(
    el("div", { class: "feedback-title", text: correct ? "Correct" : "Not quite" }),
    el("p", { text: q.explanation }),
    el("p", { class: "src-line", html: `<b>Source:</b> ${q.sources.map(s => S.data.sources[s]?.label || s).join(" · ")}` })
  );
  box.classList.remove("hidden");
}

function next() {
  const r = S.run;
  const m = MODES[r.mode];
  if (!m.endless && r.idx >= r.questions.length - 1) return finishRun("complete");
  if (m.endless && r.idx >= r.questions.length - 1) return finishRun("exhausted");
  r.idx++;
  renderQuestion();
}

function finishRun(reason) {
  stopTimer();
  const r = S.run;
  if (!r) return;
  const total = r.answers.length;
  const correct = r.answers.filter(a => a.correct).length;

  S.stats.runs.unshift({
    mode: r.mode, ts: Date.now(), correct, total,
    durationMs: Date.now() - r.startedAt, reason
  });
  S.stats.runs = S.stats.runs.slice(0, 40);
  if (MODES[r.mode].seeded) S.stats.daily[todayKey()] = { correct, total };
  saveStats();

  renderResult(reason);
  show("result");
}

/* ── result ──────────────────────────────────────────── */
function renderResult(reason) {
  const r = S.run;
  const m = MODES[r.mode];
  const total = r.answers.length;
  const correct = r.answers.filter(a => a.correct).length;
  const p = pct(correct, total);

  const ring = $("#score-ring");
  ring.style.setProperty("--pct", p);
  $("#score-pct").textContent = total ? `${p}%` : "—";
  $("#score-sub").textContent = `${correct} of ${total}`;

  let title, lede;
  if (reason === "streak-broken") {
    title = `Streak: ${correct}`;
    lede = correct >= S.stats.bestStreak && correct > 0
      ? "A new personal best. The run ended on the question shown below."
      : `Your best streak so far is ${S.stats.bestStreak}. Review the miss below and go again.`;
  } else if (reason === "time") {
    title = `Time up — ${correct} correct`;
    lede = `You answered ${total} question${total === 1 ? "" : "s"} in ${fmtClock(Date.now() - r.startedAt)}.`;
  } else {
    title = p >= 80 ? "Strong round" : p >= 50 ? "Solid, with gaps" : "Worth another pass";
    lede = `${correct} of ${total} correct in ${fmtClock(Date.now() - r.startedAt)}. The review below shows every answer with its explanation and source.`;
  }
  $("#result-title").textContent = title;
  $("#result-lede").textContent = lede;

  const missed = r.answers.filter(a => !a.correct).map(a => a.id);
  const wrongBtn = $("#result-wrong");
  wrongBtn.classList.toggle("hidden", missed.length === 0);
  wrongBtn.onclick = () => startRun("review", { ids: missed, count: missed.length });
  $("#result-again").onclick = () => startRun(r.mode, r.cfg);

  // per-topic breakdown
  const byTopic = new Map();
  for (const a of r.answers) {
    const q = S.byId.get(a.id);
    const t = byTopic.get(q.topic) || { c: 0, n: 0 };
    t.n++; if (a.correct) t.c++;
    byTopic.set(q.topic, t);
  }
  $("#result-breakdown").replaceChildren(...[...byTopic.entries()]
    .sort((a, b) => pct(a[1].c, a[1].n) - pct(b[1].c, b[1].n))
    .map(([id, v]) => bdRow(topicName(id), v.c, v.n)));

  // review
  $("#result-review").replaceChildren(...r.answers.map((a, i) => {
    const q = S.byId.get(a.id);
    const body = el("div", { class: "rv-body hidden" }, [
      el("ul", {}, q.options.map((opt, oi) =>
        el("li", {
          "data-state": oi === q.answer ? "correct" : (oi === a.chosen ? "wrong" : "")
        }, [el("span", { text: opt })])
      )),
      el("p", { class: "exp", text: q.explanation }),
      el("p", { class: "src-line", html: `<b>Source:</b> ${q.sources.map(s => S.data.sources[s]?.label || s).join(" · ")}` }),
      el("p", { class: "src-line", text: `${topicName(q.topic)} › ${q.subtopic} · ${DIFF_NAME[q.difficulty]}` })
    ]);
    const head = el("button", { class: "rv-head", type: "button", onclick: () => {
      body.classList.toggle("hidden");
      head.querySelector(".rv-chevron").textContent = body.classList.contains("hidden") ? "▾" : "▴";
    }}, [
      el("span", { class: "rv-mark", text: a.correct ? "✓" : "✕" }),
      el("span", { class: "rv-q", text: `${i + 1}. ${q.question}` }),
      el("span", { class: "rv-chevron", text: "▾" })
    ]);
    return el("div", { class: "rv", "data-ok": a.correct ? "1" : "0" }, [head, body]);
  }));
}

function bdRow(name, c, n) {
  const p = pct(c, n);
  return el("div", { class: "bd-row" }, [
    el("span", { class: "bd-name", text: name }),
    el("span", { class: "bd-bar", "data-low": p < 50 ? "1" : "0" }, [el("span", { style: `width:${p}%` })]),
    el("span", { class: "bd-val", text: `${c}/${n} · ${p}%` })
  ]);
}

/* ── setup screen ────────────────────────────────────── */
function openSetup() {
  S.setup = { topics: [], subtopics: [], difficulties: [], count: 10 };
  renderSetup();
  show("setup");
}

function renderSetup() {
  const c = S.setup;

  $("#setup-topics").replaceChildren(...S.data.topics.map(t =>
    chip(t.name, c.topics.includes(t.id), () => {
      c.topics = c.topics[0] === t.id ? [] : [t.id];
      c.subtopics = [];
      renderSetup();
    }, S.data.questions.filter(q => q.topic === t.id).length)
  ));

  const subs = availableSubtopics();
  $("#field-subtopic").classList.toggle("hidden", subs.length === 0);
  $("#setup-subtopics").replaceChildren(...subs.map(s =>
    chip(s, c.subtopics.includes(s), () => { toggle(c.subtopics, s); renderSetup(); },
      S.data.questions.filter(q => q.subtopic === s && (!c.topics.length || c.topics.includes(q.topic))).length)
  ));

  $("#setup-difficulty").replaceChildren(...[1, 2, 3].map(d =>
    chip(DIFF_NAME[d], c.difficulties.includes(d), () => { toggle(c.difficulties, d); renderSetup(); },
      matching({ ...c, count: null }).filter(q => q.difficulty === d).length)
  ));

  const avail = matching(c).length;
  $("#setup-count").replaceChildren(...[5, 10, 15, 20, 30, "all"].map(n =>
    chip(n === "all" ? `All (${avail})` : String(n), c.count === n, () => { c.count = n; renderSetup(); })
  ));

  const n = c.count === "all" ? avail : Math.min(avail, c.count);
  $("#setup-available").textContent = `${avail} question${avail === 1 ? "" : "s"} match — this round will use ${n}.`;
  $("#setup-start").disabled = avail === 0;
  $("#setup-start").onclick = () => startRun("topic", {
    topics: c.topics, subtopics: c.subtopics, difficulties: c.difficulties, count: c.count
  });
}

function availableSubtopics() {
  const c = S.setup;
  const ts = c.topics.length ? c.topics : S.data.topics.map(t => t.id);
  return S.data.topics.filter(t => ts.includes(t.id)).flatMap(t => t.subtopics);
}
function matching(c) {
  return S.data.questions.filter(q =>
    (!c.topics.length || c.topics.includes(q.topic)) &&
    (!c.subtopics.length || c.subtopics.includes(q.subtopic)) &&
    (!c.difficulties.length || c.difficulties.includes(q.difficulty))
  );
}
function toggle(arr, v) { const i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1); }
function chip(label, active, onclick, count) {
  return el("button", { class: "chip", type: "button", "aria-pressed": String(!!active), onclick },
    count === undefined ? [el("span", { text: label })]
                        : [el("span", { text: label }), el("span", { class: "chip-count", text: ` ${count}` })]);
}

/* ── stats view ──────────────────────────────────────── */
function renderStats() {
  const all = Object.values(S.stats.questions);
  const seen = all.filter(s => s.seen > 0).length;
  const tries = all.reduce((n, s) => n + s.seen, 0);
  const right = all.reduce((n, s) => n + s.correct, 0);
  const shaky = weakPool().length;

  $("#stat-cards").replaceChildren(
    statCard(`${seen}`, `of ${S.data.questions.length} questions seen`),
    statCard(`${pct(right, tries)}%`, "lifetime accuracy"),
    statCard(`${S.stats.bestStreak}`, "best sudden-death streak"),
    statCard(`${shaky}`, "questions currently shaky"),
    statCard(`${S.stats.runs.length}`, "rounds played")
  );

  $("#mastery").replaceChildren(...S.data.topics.map(t => {
    const list = S.data.questions.filter(q => q.topic === t.id);
    const tr = list.reduce((n, q) => n + (S.stats.questions[q.id]?.seen || 0), 0);
    const co = list.reduce((n, q) => n + (S.stats.questions[q.id]?.correct || 0), 0);
    const p = pct(co, tr);

    const subBox = el("div", { class: "ms-sub hidden" }, t.subtopics.map(s => {
      const sl = list.filter(q => q.subtopic === s);
      const st = sl.reduce((n, q) => n + (S.stats.questions[q.id]?.seen || 0), 0);
      const sc = sl.reduce((n, q) => n + (S.stats.questions[q.id]?.correct || 0), 0);
      return bdRow(`${s} (${sl.length})`, sc, st);
    }));

    const head = el("button", { class: "ms-head", type: "button", onclick: () => subBox.classList.toggle("hidden") }, [
      el("span", { class: "ms-name", text: t.name }),
      el("span", { class: "bd-bar", "data-low": tr && p < 50 ? "1" : "0" }, [el("span", { style: `width:${p}%` })]),
      el("span", { class: "bd-val", text: tr ? `${p}% of ${tr} answers` : "not started" })
    ]);
    return el("div", { class: "ms-topic" }, [head, subBox]);
  }));

  $("#runs").replaceChildren(...(S.stats.runs.length
    ? S.stats.runs.slice(0, 12).map(r => el("div", { class: "run-row" }, [
        el("span", { text: MODES[r.mode]?.name || LEGACY_MODE_NAMES[r.mode] || r.mode }),
        el("span", { class: "run-meta", text: `${r.correct}/${r.total} · ${pct(r.correct, r.total)}% · ${new Date(r.ts).toLocaleString()}` })
      ]))
    : [el("p", { class: "muted", text: "No rounds played yet." })]));

  $("#reset-stats").onclick = () => {
    if (!confirm("Delete all locally stored progress?")) return;
    S.stats = { questions: {}, runs: [], bestStreak: 0, daily: {} };
    saveStats();
    renderStats();
  };
}
function statCard(num, label) {
  return el("div", { class: "stat-card" }, [
    el("div", { class: "stat-num", text: num }),
    el("div", { class: "stat-label", text: label })
  ]);
}

/* ── sources view ────────────────────────────────────── */
function renderSources() {
  const counts = {};
  for (const q of S.data.questions) for (const s of q.sources) counts[s] = (counts[s] || 0) + 1;
  $("#source-list").replaceChildren(...Object.entries(S.data.sources)
    .sort((a, b) => (counts[b[0]] || 0) - (counts[a[0]] || 0))
    .map(([id, s]) => el("div", { class: "source-item" }, [
      el("span", { class: "source-count", text: `${counts[id] || 0} question${counts[id] === 1 ? "" : "s"}` }),
      el("h3", {}, [
        el("span", { text: s.label }),
        el("span", { class: "source-kind", "data-kind": s.kind, text: s.kind })
      ]),
      el("p", { text: s.detail })
    ])));
}

/* ── keyboard ────────────────────────────────────────── */
function onKey(e) {
  if ($("#view-quiz").classList.contains("hidden")) return;
  if (e.target.matches("input, textarea")) return;

  const r = S.run;
  if (!r) return;

  if (e.key === "Escape") { e.preventDefault(); quitRun(); return; }

  if (!r.locked) {
    const n = "1234".indexOf(e.key);
    const letter = "abcd".indexOf(e.key.toLowerCase());
    const pos = n >= 0 ? n : letter;
    if (pos >= 0 && pos < 4) { e.preventDefault(); answer(pos); }
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (!$("#q-next").classList.contains("hidden")) next();
  }
}

function quitRun() {
  if (!S.run) return navigate("home");
  if (S.run.answers.length && !confirm("End this round? Answers so far will still count towards your progress.")) return;
  if (S.run.answers.length) finishRun("abandoned");
  else { stopTimer(); S.run = null; navigate("home"); }
}

$("#quiz-quit").addEventListener("click", quitRun);
$("#q-next").addEventListener("click", next);

boot();
})();
