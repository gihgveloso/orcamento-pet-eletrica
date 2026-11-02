'use strict';
/* =========================================================
   Orçamento PET Elétrica — app.js
   - Tudo roda no navegador; dados só no localStorage.
   - Valores monetários SEMPRE em centavos (números inteiros).
   - Texto digitado pelo usuário passa por esc() antes de ir ao HTML.
   Organização: constantes > utilidades > dados > cálculos >
   telas (render*) > ações > eventos > inicialização.
   ========================================================= */

/* ---------- 1. Constantes ---------- */
const STORAGE_KEY = 'pet-orcamento';
const DATA_VERSION = 1;          // aumente ao mudar o formato e escreva a migração em migrate()
const UNDO_MS = 7000;
const MAX_CENTS = 100000000000;  // R$ 1 bilhão, limite de sanidade

/* Ordem de exibição: o futuro primeiro (regra de inverter a ordem). */
const CATS = [
  { id: 'liberdade', nome: 'Liberdade financeira', icone: '', cor: '#FFC74B', pct: 25,
    desc: 'O que você investe para o futuro, separado antes de tudo. Inclui a reserva de emergência.',
    ex: 'Tesouro Selic, CDB, reserva de emergência' },
  { id: 'conhecimento', nome: 'Conhecimento', icone: '', cor: '#F2EBD7', pct: 5,
    desc: 'Estudo e desenvolvimento.', ex: 'Cursos, livros, inscrição em congresso' },
  { id: 'essenciais', nome: 'Essenciais', icone: '', cor: '#A39F93', pct: 40,
    desc: 'Custo fixo: o que se paga todo mês.', ex: 'Aluguel, contas, seguro, financiamento' },
  { id: 'conforto', nome: 'Conforto', icone: '', cor: '#B89443', pct: 10,
    desc: 'O que não é realmente necessário.', ex: 'Streaming, pizza no fim de semana, versão mais cara' },
  { id: 'metas', nome: 'Metas', icone: '', cor: '#7F9AA1', pct: 10,
    desc: 'Planos com objetivo definido.', ex: 'Viagem, notebook, compra planejada' },
  { id: 'prazeres', nome: 'Prazeres', icone: '', cor: '#D07A52', pct: 10,
    desc: 'Gastos feitos por diversão.', ex: 'Bar com amigos, churrasco, show' }
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const DEFAULT_PERC = Object.fromEntries(CATS.map((c) => [c.id, c.pct]));
const SUBTIPOS = { investimento: 'Investimento', reserva: 'Reserva de emergência' };
const STATUS = {
  ok: { icon: '✓', label: 'Dentro do orçamento' },
  warn: { icon: '!', label: 'Perto do limite' },
  over: { icon: '✕', label: 'Estourou' }
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/* ---------- 2. Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const pad = (n) => String(n).padStart(2, '0');
const fmt = (cents) => BRL.format(cents / 100);
const pctTxt = (ratio) => `${Math.round(ratio * 100)}%`;

/** Escapa texto para inserir com segurança no HTML (evita XSS). */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function currentMonth() { return todayISO().slice(0, 7); }
function isoToBR(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }
function isValidISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return y > 1999 && y < 2200 && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
function isMonthKey(k) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(k); }
function addMonths(key, n) {
  let [y, m] = key.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}
function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** Data padrão de um lançamento: hoje, se for o mês aberto; senão, dia 1 do mês aberto. */
function defaultDateFor(key) { return currentMonth() === key ? todayISO() : `${key}-01`; }

/**
 * Converte o texto digitado em centavos. Aceita "1.234,56", "1234,5", "30", "12.50".
 * Retorna NaN se não for um valor válido.
 */
function parseCents(txt) {
  let s = String(txt ?? '').trim().replace(/R\$|\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = s.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = parts.join(''); // "1.234" = mil
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [i, f = ''] = s.split('.');
  const cents = Number(i) * 100 + Number((f + '00').slice(0, 2));
  return cents > MAX_CENTS ? NaN : cents;
}
function centsToInput(c) { return c ? (c / 100).toFixed(2).replace('.', ',') : ''; }
const isCents = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_CENTS;

/* ---------- 3. Dados (localStorage) ---------- */
let state;
let storageOk = true;
const ui = { view: 'painel', month: currentMonth(), editingId: null, entryType: 'gasto', filterCat: '', search: '' };

function defaultState() {
  return { version: DATA_VERSION, onboarded: false, presentation: false, hasExample: false,
    baseIncome: 0, basePerc: { ...DEFAULT_PERC }, months: {}, lastExpense: null };
}
function newMonth(planned, perc) {
  return { income: { planned, entries: [] }, perc: { ...perc }, expenses: [], dismissed: [] };
}

/** Limpa e valida um objeto de dados (usado ao carregar e ao importar). Lança erro se for inválido. */
function sanitizeState(obj) {
  if (!obj || typeof obj !== 'object' || typeof obj.months !== 'object' || obj.months === null) {
    throw new Error('O arquivo não tem o formato do Orçamento PET.');
  }
  const out = defaultState();
  out.onboarded = !!obj.onboarded;
  out.presentation = !!obj.presentation;
  out.hasExample = !!obj.hasExample;
  out.baseIncome = isCents(obj.baseIncome) ? obj.baseIncome : 0;
  out.basePerc = cleanPerc(obj.basePerc);
  for (const [key, m] of Object.entries(obj.months)) {
    if (!isMonthKey(key) || !m || typeof m !== 'object') continue;
    const planned = isCents(m.income?.planned) ? m.income.planned : 0;
    const month = newMonth(planned, cleanPerc(m.perc));
    month.income.entries = (Array.isArray(m.income?.entries) ? m.income.entries : [])
      .filter((e) => e && isCents(e.amount) && e.amount > 0 && isValidISO(e.date))
      .map((e) => ({ id: String(e.id || uid()), name: String(e.name || 'Entrada').slice(0, 80),
        amount: e.amount, date: e.date, example: !!e.example }));
    month.expenses = (Array.isArray(m.expenses) ? m.expenses : [])
      .filter((e) => e && CAT[e.cat] && isCents(e.amount) && e.amount > 0 && isValidISO(e.date))
      .map((e) => ({ id: String(e.id || uid()), name: String(e.name || 'Gasto').slice(0, 80), amount: e.amount,
        cat: e.cat, date: e.date, note: String(e.note || '').slice(0, 300), recurring: !!e.recurring,
        recId: e.recId ? String(e.recId) : null,
        sub: e.cat === 'liberdade' && SUBTIPOS[e.sub] ? e.sub : (e.cat === 'liberdade' ? 'investimento' : null),
        example: !!e.example }));
    month.dismissed = (Array.isArray(m.dismissed) ? m.dismissed : []).map(String);
    out.months[key] = month;
  }
  if (obj.lastExpense && CAT[obj.lastExpense.cat] && isCents(obj.lastExpense.amount)) {
    const l = obj.lastExpense;
    out.lastExpense = { name: String(l.name || '').slice(0, 80), amount: l.amount, cat: l.cat,
      note: String(l.note || '').slice(0, 300), sub: SUBTIPOS[l.sub] ? l.sub : null };
  }
  return out;
}
function cleanPerc(p) {
  const out = {};
  for (const c of CATS) {
    const v = Number(p?.[c.id]);
    out[c.id] = Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : c.pct;
  }
  return out;
}
/** Migrações entre versões do formato. Hoje só existe a versão 1. */
function migrate(obj) {
  const v = Number(obj?.version || 1);
  if (v > DATA_VERSION) throw new Error('Este arquivo foi criado por uma versão mais nova do app.');
  // Exemplo futuro: if (v < 2) { ...converter campos...; obj.version = 2; }
  return sanitizeState(obj);
}

function loadState() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { storageOk = false; }
  if (!raw) return defaultState();
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    // Dados corrompidos: guarda uma cópia e começa do zero, sem quebrar a página.
    try { localStorage.setItem(STORAGE_KEY + '-corrompido', raw); } catch (_) { /* ignora */ }
    showBanner('Os dados salvos estavam danificados e não puderam ser lidos. O app recomeçou do zero; uma cópia foi guardada para recuperação.');
    return defaultState();
  }
}
function saveState() {
  if (!storageOk) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    storageOk = false;
    showBanner('Não foi possível salvar neste navegador (modo anônimo ou armazenamento cheio). Use Exportar para não perder o que digitou.');
  }
}

/** Mês para exibir: o salvo ou um "virtual" copiado do mês anterior (não é gravado até haver mudança). */
function viewMonth(key) { return state.months[key] || buildMonthFromPrevious(key); }
/** Mês para escrever: cria e grava se ainda não existir. */
function ensureMonth(key) {
  if (!state.months[key]) state.months[key] = buildMonthFromPrevious(key);
  return state.months[key];
}
function buildMonthFromPrevious(key) {
  const prevKey = Object.keys(state.months).filter((k) => k < key).sort().pop();
  const src = prevKey ? state.months[prevKey] : null;
  return newMonth(src ? src.income.planned : state.baseIncome, src ? src.perc : state.basePerc);
}
function findExpense(id) {
  for (const [key, m] of Object.entries(state.months)) {
    const idx = m.expenses.findIndex((e) => e.id === id);
    if (idx >= 0) return { key, month: m, idx, item: m.expenses[idx] };
  }
  return null;
}

/* ---------- 4. Cálculos ---------- */
function monthStats(m) {
  const spent = Object.fromEntries(CATS.map((c) => [c.id, 0]));
  m.expenses.forEach((e) => { spent[e.cat] += e.amount; });
  const totalSpent = sum(Object.values(spent));
  const realIncome = sum(m.income.entries.map((e) => e.amount));
  const base = m.income.planned;
  const planned = Object.fromEntries(CATS.map((c) => [c.id, Math.round(base * m.perc[c.id] / 100)]));
  const reserva = sum(m.expenses.filter((e) => e.cat === 'liberdade' && e.sub === 'reserva').map((e) => e.amount));
  const incomeRef = realIncome || base;
  return { spent, totalSpent, realIncome, base, planned, reserva, incomeRef,
    usingPlanned: !realIncome, saldo: incomeRef - totalSpent, totalPlanned: sum(Object.values(planned)) };
}
function statusOf(spent, planned) {
  if (planned <= 0) return spent > 0 ? 'over' : 'ok';
  const r = spent / planned;
  return r > 1 ? 'over' : r >= 0.8 ? 'warn' : 'ok';
}
function recurringSuggestions(key) {
  const prev = state.months[addMonths(key, -1)];
  if (!prev) return [];
  const cur = state.months[key];
  const have = new Set((cur ? cur.expenses : []).map((e) => e.recId).filter(Boolean));
  const dismissed = new Set(cur ? cur.dismissed : []);
  return prev.expenses.filter((e) => e.recurring && e.recId && !have.has(e.recId) && !dismissed.has(e.recId));
}
/** Frases simples para o resumo do mês, das mais urgentes para as menos. */
function summarySentences(s) {
  const out = [];
  if (!s.base) return [{ st: 'warn', t: 'Defina sua renda prevista em Orçamento para ver quanto cabe em cada categoria.' }];
  const lib = s.planned.liberdade;
  if (lib > 0) {
    const r = s.spent.liberdade / lib;
    out.push(r >= 1
      ? { st: 'ok', t: `Você já separou toda a meta de Liberdade financeira (${fmt(s.spent.liberdade)}).` }
      : { st: r >= 0.5 ? 'ok' : 'warn', t: `Faltam ${fmt(lib - s.spent.liberdade)} para completar a Liberdade financeira. Separe isso antes dos outros gastos.` });
  }
  CATS.filter((c) => c.id !== 'liberdade').forEach((c) => {
    const pl = s.planned[c.id], sp = s.spent[c.id];
    const st = statusOf(sp, pl);
    if (st === 'over') out.push({ st, t: pl ? `${c.nome} estourou: ${fmt(sp - pl)} acima do planejado (${pctTxt(sp / pl)} usado).` : `${c.nome} não tinha orçamento e já tem ${fmt(sp)} em gastos.` });
    else if (st === 'warn') out.push({ st, t: `Você já usou ${pctTxt(sp / pl)} do orçamento de ${c.nome}. Restam ${fmt(pl - sp)}.` });
  });
  out.push(s.saldo >= 0
    ? { st: 'ok', t: `Saldo do mês: ${fmt(s.saldo)} ainda livres${s.usingPlanned ? ' (considerando a renda prevista)' : ''}.` }
    : { st: 'over', t: `Você gastou ${fmt(-s.saldo)} a mais do que ${s.usingPlanned ? 'a renda prevista' : 'recebeu'} neste mês.` });
  if (out.length === 2 && s.totalSpent === 0) out.push({ st: 'ok', t: 'Nenhum gasto lançado ainda. Comece pela aba Lançar.' });
  return out;
}

/* ---------- 5. Telas ---------- */
const view = () => $('#view');

function render(focus = false) {
  document.documentElement.classList.toggle('apresentacao', !!state.presentation);
  $('#btn-apresentacao').setAttribute('aria-pressed', String(!!state.presentation));
  const onboarding = !state.onboarded;
  $('#app-nav').hidden = onboarding;
  $('#month-bar').hidden = onboarding || ui.view === 'ajuda';
  if (onboarding) { renderOnboarding(); return; }
  renderMonthBar();
  $$('#app-nav button').forEach((b) => {
    if (b.dataset.view === ui.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const screens = { painel: renderPainel, lancar: renderLancar, lista: renderLista,
    graficos: renderGraficos, orcamento: renderOrcamento, ajuda: renderAjuda };
  (screens[ui.view] || renderPainel)();
  if (focus) view().focus({ preventScroll: false });
}

function renderMonthBar() {
  $('#month-label').textContent = monthLabel(ui.month);
  $('.month-today').hidden = ui.month === currentMonth();
}

/* Barra de progresso acessível */
function barHTML(spent, planned, label) {
  const ratio = planned > 0 ? spent / planned : (spent > 0 ? 1 : 0);
  return `<div class="bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100"
    aria-valuenow="${Math.round(ratio * 100)}" aria-valuetext="${pctTxt(ratio)} usado"><span style="width:${Math.min(ratio, 1) * 100}%"></span></div>`;
}

/* ---- Onboarding ---- */
function renderOnboarding() {
  const income = state.baseIncome;
  view().innerHTML = `
  <div class="onboard">
    <h1>Seu dinheiro, na ordem certa</h1>
    <p class="lead">Primeiro você separa o dinheiro do futuro. Depois organiza o resto. Este app ajuda a fazer isso todo mês.</p>
    <p class="hint">Sem cadastro. Seus dados ficam só neste aparelho.</p>
    <form id="form-onboard" class="card" novalidate>
      <div class="field">
        <label for="ob-renda">Quanto você recebe por mês?</label>
        <div class="input-money"><span aria-hidden="true">R$</span>
          <input id="ob-renda" name="renda" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"
            value="${esc(centsToInput(income))}" aria-describedby="ob-renda-hint"></div>
        <p class="hint" id="ob-renda-hint">Some bolsa, salário, mesada e outras entradas que se repetem. Dá para mudar depois.</p>
      </div>
      <h2>Divisão sugerida</h2>
      <p class="hint">É uma sugestão do curso, não uma regra. Ajuste ao seu momento; a soma precisa dar 100%.</p>
      ${percEditorHTML(state.basePerc, income, 'ob')}
      <p class="form-err" id="ob-err" role="alert"></p>
      <div class="btn-row">
        <button type="submit" class="btn btn-primary">Começar a usar</button>
        <button type="button" class="btn" data-action="restore-perc">Voltar à sugestão</button>
        <button type="button" class="btn" data-action="onboard-example">Ver com dados de exemplo</button>
      </div>
    </form>
  </div>`;
  const form = $('#form-onboard');
  const refresh = () => updatePercEditor(form, parseCents(form.renda.value) || 0);
  form.addEventListener('input', refresh);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const income = parseCents(form.renda.value);
    const { perc, total } = refresh();
    const err = $('#ob-err');
    form.renda.setAttribute('aria-invalid', String(!(income > 0)));
    if (!(income > 0)) { err.textContent = 'Informe uma renda mensal maior que zero.'; form.renda.focus(); return; }
    if (total !== 100) { err.textContent = 'Ajuste os percentuais para somarem exatamente 100%.'; return; }
    finishOnboarding(income, perc);
  });
  refresh();
  $('#ob-renda').focus();
}
function finishOnboarding(income, perc) {
  state.baseIncome = income;
  state.basePerc = { ...perc };
  const m = ensureMonth(currentMonth());
  m.income.planned = income;
  m.perc = { ...perc };
  state.onboarded = true;
  ui.month = currentMonth();
  ui.view = 'painel';
  saveState();
  render(true);
  toast('Orçamento criado. Agora lance seus gastos.');
}

/* ---- Editor de percentuais (onboarding e Orçamento) ---- */
function percEditorHTML(perc, base, prefix) {
  return `<div class="perc" role="group" aria-label="Percentual da renda por categoria">
    ${CATS.map((c) => `
      <div class="perc-row">
        <label for="${prefix}-p-${c.id}">${esc(c.nome)}</label>
        <span class="perc-input"><input id="${prefix}-p-${c.id}" data-perc="${c.id}" type="number" inputmode="numeric"
          min="0" max="100" step="1" value="${perc[c.id]}"><span aria-hidden="true">%</span></span>
        <output class="perc-val" data-perc-val="${c.id}" for="${prefix}-p-${c.id}">${fmt(Math.round(base * perc[c.id] / 100))}</output>
      </div>`).join('')}
    <p class="perc-sum" aria-live="polite"></p>
  </div>`;
}
function readPerc(root) {
  const perc = {};
  $$('[data-perc]', root).forEach((inp) => {
    const v = Math.round(Number(inp.value));
    perc[inp.dataset.perc] = Number.isFinite(v) && v >= 0 ? Math.min(v, 100) : 0;
  });
  return perc;
}
function updatePercEditor(root, base) {
  const perc = readPerc(root);
  const total = sum(Object.values(perc));
  $$('[data-perc-val]', root).forEach((o) => { o.textContent = fmt(Math.round(base * perc[o.dataset.percVal] / 100)); });
  const msg = $('.perc-sum', root);
  msg.className = 'perc-sum ' + (total === 100 ? 'ok' : 'bad');
  msg.textContent = total === 100 ? 'Soma 100%.'
    : total < 100 ? `Faltam ${100 - total}% para fechar 100% (soma atual: ${total}%).`
    : `Passou ${total - 100}% de 100% (soma atual: ${total}%).`;
  return { perc, total };
}

/* ---- Painel ---- */
function renderPainel() {
  const m = viewMonth(ui.month);
  const s = monthStats(m);
  const libPlan = s.planned.liberdade, libDone = s.spent.liberdade;
  const libRatio = libPlan ? libDone / libPlan : 0;
  const incomePct = s.incomeRef ? libDone / s.incomeRef : 0;

  view().innerHTML = `
  <h2 class="sr-only">Painel do mês</h2>
  <section class="hero" aria-labelledby="hero-t">
    <p class="hero-rule" id="hero-t">Primeiro, o seu futuro</p>
    <p class="hero-value money">${fmt(libDone)}</p>
    <p class="hero-of">de ${fmt(libPlan)} planejados para Liberdade financeira</p>
    ${barHTML(libDone, libPlan, 'Progresso da Liberdade financeira')}
    <p class="sub">${libRatio >= 1 ? 'Meta do mês cumprida.' : `Falta separar ${fmt(Math.max(libPlan - libDone, 0))}.`}
      Isso é ${pctTxt(incomePct)} da ${s.usingPlanned ? 'renda prevista' : 'renda recebida'}${s.reserva ? `, sendo ${fmt(s.reserva)} para a reserva de emergência` : ''}.</p>
  </section>

  <dl class="totals">
    <div class="total ${s.saldo < 0 ? 'neg' : ''}"><dt>Saldo do mês</dt><dd class="money">${fmt(s.saldo)}</dd>
      <small>${s.usingPlanned ? 'sobre a renda prevista' : 'renda recebida − gastos'}</small></div>
    <div class="total"><dt>Total gasto</dt><dd class="money">${fmt(s.totalSpent)}</dd>
      <small>${s.base ? pctTxt(s.totalSpent / s.base) + ' da renda prevista' : '&nbsp;'}</small></div>
    <div class="total"><dt>Renda recebida</dt><dd class="money">${fmt(s.realIncome)}</dd>
      <small>prevista: ${fmt(s.base)}</small></div>
  </dl>

  ${suggestionsHTML()}

  <section class="section resumo" aria-labelledby="resumo-t">
    <h2 id="resumo-t">Resumo do mês</h2>
    <ul>${summarySentences(s).map((x) => `<li class="st-${x.st}">${esc(x.t)}</li>`).join('')}</ul>
  </section>

  <section class="section" aria-labelledby="cats-t">
    <h2 id="cats-t">Por categoria</h2>
    <div class="cats">${CATS.map((c) => catCardHTML(c, s)).join('')}</div>
  </section>
  ${!s.base ? `<div class="empty"><p>Sem renda prevista para ${esc(monthLabel(ui.month))}.</p>
    <button class="btn btn-primary" data-action="nav" data-view="orcamento">Definir orçamento do mês</button></div>` : ''}`;
}
function catCardHTML(c, s) {
  const pl = s.planned[c.id], sp = s.spent[c.id];
  const isLib = c.id === 'liberdade';
  const st = isLib ? (sp >= pl && pl > 0 ? 'ok' : 'warn') : statusOf(sp, pl);
  const badge = isLib ? (st === 'ok' ? { icon: '✓', label: 'Meta cumprida' } : { icon: '', label: 'Em andamento' }) : STATUS[st];
  const ratio = pl ? sp / pl : 0;
  return `<article class="cat st-${st}" style="--c:${c.cor}">
    <div class="cat-head"><h3>${esc(c.nome)}</h3>
      <span class="badge">${badge.icon ? `<span aria-hidden="true">${badge.icon}</span> ` : ''}${badge.label}</span></div>
    <dl>
      <div><dt>Planejado</dt><dd class="money">${fmt(pl)}</dd></div>
      <div><dt>${isLib ? 'Separado' : 'Gasto'}</dt><dd class="money">${fmt(sp)}</dd></div>
      <div><dt>${isLib ? 'Falta' : 'Disponível'}</dt><dd class="money">${fmt(pl - sp)}</dd></div>
    </dl>
    ${barHTML(sp, pl, `${c.nome}: ${pctTxt(ratio)} usado`)}
    <p class="used">${pl ? `${pctTxt(ratio)} ${isLib ? 'da meta' : 'usado'}` : 'Sem orçamento definido'}</p>
  </article>`;
}
function suggestionsHTML() {
  const list = recurringSuggestions(ui.month);
  if (!list.length) return '';
  return `<section class="card suggest" aria-labelledby="sug-t">
    <h2 id="sug-t">Gastos recorrentes do mês passado</h2>
    <p class="hint">Confirme os que se repetem em ${esc(monthLabel(ui.month))}.</p>
    <ul>${list.map((e) => `<li><span><strong>${esc(e.name)}</strong> · ${fmt(e.amount)} <span class="tag">${esc(CAT[e.cat].nome)}</span></span>
      <span><button class="btn btn-small btn-primary" data-action="rec-add" data-id="${esc(e.recId)}">Adicionar</button>
      <button class="btn btn-small" data-action="rec-skip" data-id="${esc(e.recId)}">Agora não</button></span></li>`).join('')}</ul>
    ${list.length > 1 ? `<div class="btn-row"><button class="btn btn-small" data-action="rec-add-all">Adicionar todos (${list.length})</button></div>` : ''}
  </section>`;
}

/* ---- Lançar ---- */
function renderLancar() {
  const editing = ui.editingId ? findExpense(ui.editingId)?.item : null;
  if (ui.editingId && !editing) ui.editingId = null;
  if (editing) ui.entryType = 'gasto';
  const isGasto = ui.entryType === 'gasto';
  const e = editing || { name: '', amount: 0, cat: '', date: defaultDateFor(ui.month), note: '', recurring: false, sub: 'investimento' };
  const names = [...new Set(Object.values(state.months).flatMap((m) => m.expenses.map((x) => x.name)))].slice(-60);

  view().innerHTML = `
  <h2>${editing ? 'Editar gasto' : 'Novo lançamento'}</h2>
  ${editing ? '' : `<div class="segmented" role="group" aria-label="Tipo de lançamento">
    <button type="button" data-action="entry-type" data-type="gasto" aria-pressed="${isGasto}">Gasto</button>
    <button type="button" data-action="entry-type" data-type="renda" aria-pressed="${!isGasto}">Entrada de renda</button></div>`}
  <form id="form-lancar" class="card" novalidate>
    <div class="field">
      <label for="f-valor">Valor</label>
      <div class="input-money"><span aria-hidden="true">R$</span>
        <input id="f-valor" name="valor" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" required value="${esc(centsToInput(e.amount))}"></div>
    </div>
    <div class="field">
      <label for="f-nome">${isGasto ? 'Com o quê?' : 'De onde veio?'}</label>
      <input id="f-nome" name="nome" type="text" maxlength="80" autocomplete="off" list="nomes"
        placeholder="${isGasto ? 'Ex.: Mercado, Aluguel, Cinema' : 'Ex.: Bolsa PET, Estágio, Freela'}" value="${esc(e.name)}">
      <datalist id="nomes">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </div>
    ${isGasto ? `
    <fieldset>
      <legend>Categoria</legend>
      <div class="chips">${CATS.map((c) => `<label class="chip" style="--c:${c.cor}">
        <input type="radio" name="cat" value="${c.id}" ${e.cat === c.id ? 'checked' : ''}><span>${esc(c.nome)}</span></label>`).join('')}</div>
      <p class="hint" id="cat-hint">${e.cat ? esc(CAT[e.cat].desc + ' Ex.: ' + CAT[e.cat].ex + '.') : 'Toque numa categoria para ver o que entra nela.'}</p>
    </fieldset>
    <fieldset id="sub-field" ${e.cat === 'liberdade' ? '' : 'hidden'}>
      <legend>Para onde vai?</legend>
      <div class="chips">${Object.entries(SUBTIPOS).map(([k, v]) => `<label class="chip" style="--c:#FFC74B">
        <input type="radio" name="sub" value="${k}" ${(e.sub || 'investimento') === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div>
    </fieldset>` : ''}
    <div class="grid-2">
      <div class="field"><label for="f-data">Data</label>
        <input id="f-data" name="data" type="date" required value="${esc(e.date)}"></div>
      ${isGasto ? `<div class="field"><label class="check" style="margin-top:2rem"><input type="checkbox" name="recorrente" ${e.recurring ? 'checked' : ''}>
        Repete todo mês</label><p class="hint">Vai aparecer como sugestão no mês seguinte.</p></div>` : ''}
    </div>
    ${isGasto ? `<div class="field"><label for="f-obs">Observação <span class="hint">(opcional)</span></label>
      <textarea id="f-obs" name="obs" maxlength="300">${esc(e.note)}</textarea></div>` : ''}
    <p class="form-err" id="form-err" role="alert"></p>
    <div class="btn-row">
      <button type="submit" class="btn btn-primary">${editing ? 'Salvar alterações' : isGasto ? 'Salvar gasto' : 'Salvar entrada'}</button>
      ${editing ? '<button type="button" class="btn" data-action="cancel-edit">Cancelar edição</button>'
        : isGasto && state.lastExpense ? `<button type="button" class="btn" data-action="repeat-last">Repetir último (${esc(state.lastExpense.name)})</button>` : ''}
    </div>
  </form>`;

  const form = $('#form-lancar');
  form.addEventListener('change', (ev) => {
    if (ev.target.name === 'cat') {
      const c = CAT[ev.target.value];
      $('#cat-hint').textContent = `${c.desc} Ex.: ${c.ex}.`;
      $('#sub-field').hidden = c.id !== 'liberdade';
    }
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); isGasto ? saveExpense(form) : saveIncome(form); });
  $('#f-valor').focus();
}

/* ---- Lista ---- */
function renderLista() {
  const m = viewMonth(ui.month);
  view().innerHTML = `
  <h2>Lançamentos de ${esc(monthLabel(ui.month))}</h2>
  ${suggestionsHTML()}
  <div class="filters">
    <div><label for="busca">Buscar por nome</label>
      <input id="busca" type="search" placeholder="Ex.: mercado" value="${esc(ui.search)}" autocomplete="off"></div>
    <div><label for="filtro-cat">Categoria</label>
      <select id="filtro-cat"><option value="">Todas</option>
        ${CATS.map((c) => `<option value="${c.id}" ${ui.filterCat === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
  </div>
  <p id="lista-total" class="hint" aria-live="polite"></p>
  <ul class="items" id="lista-itens"></ul>
  ${m.expenses.length ? '' : `<div class="empty"><p>Nenhum gasto em ${esc(monthLabel(ui.month))}.</p>
    <button class="btn btn-primary" data-action="nav" data-view="lancar">Lançar o primeiro gasto</button></div>`}`;
  $('#busca').addEventListener('input', (ev) => { ui.search = ev.target.value; renderListItems(); });
  $('#filtro-cat').addEventListener('change', (ev) => { ui.filterCat = ev.target.value; renderListItems(); });
  renderListItems();
}
function normalize(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function renderListItems() {
  const m = viewMonth(ui.month);
  const q = normalize(ui.search.trim());
  const items = m.expenses
    .filter((e) => (!ui.filterCat || e.cat === ui.filterCat) && (!q || normalize(e.name + ' ' + e.note).includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date));
  $('#lista-total').textContent = m.expenses.length
    ? `${items.length} ${items.length === 1 ? 'lançamento' : 'lançamentos'} · total ${fmt(sum(items.map((e) => e.amount)))}` : '';
  $('#lista-itens').innerHTML = items.map((e) => {
    const c = CAT[e.cat];
    return `<li class="item" style="--c:${c.cor}">
      <span class="name">${esc(e.name)}</span><span class="amount money">${fmt(e.amount)}</span>
      <span class="meta">${isoToBR(e.date)} · ${esc(c.nome)}${e.sub === 'reserva' ? ' (reserva)' : ''}${e.recurring ? '<span class="tag">mensal</span>' : ''}${e.example ? '<span class="tag">exemplo</span>' : ''}</span>
      ${e.note ? `<span class="note">${esc(e.note)}</span>` : ''}
      <span class="actions">
        <button class="btn btn-small" data-action="edit" data-id="${esc(e.id)}" aria-label="Editar ${esc(e.name)}">Editar</button>
        <button class="btn btn-small btn-danger" data-action="delete" data-id="${esc(e.id)}" aria-label="Excluir ${esc(e.name)}">Excluir</button>
      </span></li>`;
  }).join('') || (m.expenses.length ? '<li class="empty">Nada encontrado com esse filtro.</li>' : '');
}

/* ---- Gráficos ---- */
function renderGraficos() {
  const s = monthStats(viewMonth(ui.month));
  const maxV = Math.max(1, ...CATS.map((c) => Math.max(s.planned[c.id], s.spent[c.id])));
  view().innerHTML = `
  <h2>Gráficos de ${esc(monthLabel(ui.month))}</h2>
  <section class="card" aria-labelledby="g1">
    <h3 id="g1">Distribuição: planejado × real</h3>
    <div class="chart-wrap">
      ${donutSVG(s)}
      <table>
        <caption class="hint" style="text-align:left">Anel de fora: planejado. Anel de dentro: real (onde o dinheiro foi).</caption>
        <thead><tr><th scope="col">Categoria</th><th scope="col" class="r">Planejado</th><th scope="col" class="r">Real</th></tr></thead>
        <tbody>${CATS.map((c) => `<tr><th scope="row" style="color:var(--text);font-weight:400;font-size:.95rem"><span class="swatch" style="--c:${c.cor}"></span>${esc(c.nome)}</th>
          <td class="r">${s.totalPlanned ? pctTxt(s.planned[c.id] / s.totalPlanned) : '–'}</td>
          <td class="r">${s.totalSpent ? pctTxt(s.spent[c.id] / s.totalSpent) : '–'}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  </section>
  <section class="card" aria-labelledby="g2">
    <h3 id="g2">Planejado × gasto por categoria</h3>
    <p class="hint">Contorno: planejado. Preenchido: gasto. Listras: passou do planejado.</p>
    <div class="bars">${CATS.map((c) => {
      const pl = s.planned[c.id], sp = s.spent[c.id];
      return `<div style="--c:${c.cor}"><h3>${esc(c.nome)}</h3>
        <div class="bar-line"><span>Planejado</span><span class="track"><span class="fill plan" style="width:${pl / maxV * 100}%"></span></span><span class="v money">${fmt(pl)}</span></div>
        <div class="bar-line"><span>${c.id === 'liberdade' ? 'Separado' : 'Gasto'}</span><span class="track"><span class="fill real ${sp > pl && c.id !== 'liberdade' ? 'over' : ''}" style="width:${sp / maxV * 100}%"></span></span><span class="v money">${fmt(sp)}</span></div>
      </div>`; }).join('')}</div>
  </section>`;
}
/** Rosca dupla em SVG: anel externo = planejado, interno = real. */
function donutSVG(s) {
  const ring = (r, values) => {
    const circ = 2 * Math.PI * r;
    const total = sum(values.map((v) => v.v));
    let off = 0, out = `<circle cx="110" cy="110" r="${r}" fill="none" stroke="var(--track)" stroke-width="22"/>`;
    if (!total) return out;
    values.forEach((v) => {
      if (!v.v) return;
      const len = v.v / total * circ;
      const gap = values.filter((x) => x.v).length > 1 ? 2 : 0;
      out += `<circle cx="110" cy="110" r="${r}" fill="none" stroke="${v.cor}" stroke-width="22"
        stroke-dasharray="${Math.max(len - gap, 0.5)} ${circ}" stroke-dashoffset="${-off}" transform="rotate(-90 110 110)"/>`;
      off += len;
    });
    return out;
  };
  const desc = CATS.map((c) => `${c.nome}: planejado ${fmt(s.planned[c.id])}, real ${fmt(s.spent[c.id])}`).join('; ');
  return `<svg class="donut" viewBox="0 0 220 220" role="img" aria-labelledby="donut-title donut-desc">
    <title id="donut-title">Distribuição planejada e real por categoria</title>
    <desc id="donut-desc">${esc(desc)}</desc>
    ${ring(92, CATS.map((c) => ({ v: s.planned[c.id], cor: c.cor })))}
    ${ring(64, CATS.map((c) => ({ v: s.spent[c.id], cor: c.cor })))}
    <text x="110" y="106" text-anchor="middle" font-size="11" opacity=".75">gasto</text>
    <text x="110" y="124" text-anchor="middle" font-size="13" font-weight="700">${esc(fmt(s.totalSpent))}</text>
  </svg>`;
}

/* ---- Orçamento e dados ---- */
function renderOrcamento() {
  const m = viewMonth(ui.month);
  const prevKey = addMonths(ui.month, -1);
  view().innerHTML = `
  <h2>Orçamento de ${esc(monthLabel(ui.month))}</h2>
  <form id="form-orc" class="card" novalidate>
    <div class="field">
      <label for="o-renda">Renda prevista do mês</label>
      <div class="input-money"><span aria-hidden="true">R$</span>
        <input id="o-renda" name="renda" type="text" inputmode="decimal" autocomplete="off" value="${esc(centsToInput(m.income.planned))}"></div>
      <p class="hint">É a base do planejamento. A renda que de fato entrou você lança abaixo.</p>
    </div>
    <h3>Divisão da renda</h3>
    ${percEditorHTML(m.perc, m.income.planned, 'o')}
    <p class="form-err" id="orc-err" role="alert"></p>
    <div class="btn-row">
      <button type="submit" class="btn btn-primary">Salvar orçamento</button>
      <button type="button" class="btn" data-action="restore-perc">Voltar à sugestão</button>
      ${state.months[prevKey] ? `<button type="button" class="btn" data-action="copy-prev">Copiar de ${esc(monthLabel(prevKey))}</button>` : ''}
    </div>
  </form>

  <section class="card" aria-labelledby="renda-t">
    <h3 id="renda-t">Renda recebida no mês</h3>
    ${m.income.entries.length ? `<ul class="items">${m.income.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).map((e) => `
      <li class="item" style="--c:var(--ok)"><span class="name">${esc(e.name)}</span><span class="amount money">${fmt(e.amount)}</span>
        <span class="meta">${isoToBR(e.date)}${e.example ? '<span class="tag">exemplo</span>' : ''}</span>
        <span class="actions"><button class="btn btn-small btn-danger" data-action="delete-income" data-id="${esc(e.id)}" aria-label="Excluir ${esc(e.name)}">Excluir</button></span></li>`).join('')}</ul>
      <p class="hint">Total recebido: ${fmt(sum(m.income.entries.map((e) => e.amount)))}</p>`
      : '<p class="hint">Nenhuma entrada lançada. Lance bolsa, salário e extras quando caírem.</p>'}
    <button class="btn" data-action="new-income">Lançar entrada de renda</button>
  </section>

  <section class="card" aria-labelledby="dados-t">
    <h3 id="dados-t">Seus dados</h3>
    <p class="hint">Tudo fica só neste navegador. Se limpar o navegador ou trocar de aparelho, os dados somem: exporte um backup de vez em quando.</p>
    <div class="btn-row">
      <button class="btn" data-action="export-json">Exportar backup (JSON)</button>
      <label class="btn" for="import-file" style="margin:0">Importar backup</label>
      <input id="import-file" type="file" accept="application/json,.json" hidden>
      <button class="btn" data-action="export-csv">Exportar lançamentos (CSV)</button>
    </div>
    <div class="btn-row">
      ${state.hasExample ? '<button class="btn" data-action="clear-example">Apagar dados de exemplo</button>'
        : '<button class="btn" data-action="load-example">Carregar exemplo</button>'}
      <button class="btn btn-danger" data-action="reset">Zerar todos os dados</button>
    </div>
  </section>`;

  const form = $('#form-orc');
  const refresh = () => updatePercEditor(form, parseCents(form.renda.value) || 0);
  form.addEventListener('input', refresh);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const income = form.renda.value.trim() ? parseCents(form.renda.value) : 0;
    const { perc, total } = refresh();
    const err = $('#orc-err');
    if (Number.isNaN(income)) { err.textContent = 'Renda inválida. Use números, como 1500 ou 1.500,00.'; form.renda.focus(); return; }
    if (total !== 100) { err.textContent = 'Os percentuais precisam somar 100% antes de salvar.'; return; }
    err.textContent = '';
    const mm = ensureMonth(ui.month);
    mm.income.planned = income;
    mm.perc = perc;
    state.baseIncome = income; state.basePerc = { ...perc };   // vira o padrão dos próximos meses novos
    saveState();
    toast('Orçamento salvo.');
  });
  $('#import-file').addEventListener('change', importJSON);
  refresh();
}

/* ---- Como usar ---- */
function renderAjuda() {
  view().innerHTML = `
  <h1 class="page-title">Como usar</h1>
  <section class="section">
    <h2>A regra: inverter a ordem</h2>
    <p>O costume é gastar e investir o que sobra. Quase nunca sobra. Aqui a ordem é outra:</p>
    <ol class="order">
      <li>Quando a renda cair, separe primeiro a <strong>Liberdade financeira</strong> (investimentos e reserva de emergência).</li>
      <li>Pague os <strong>Essenciais</strong> e reserve o de <strong>Conhecimento</strong>.</li>
      <li>Distribua o resto entre <strong>Metas</strong>, <strong>Conforto</strong> e <strong>Prazeres</strong>, dentro do limite de cada um.</li>
    </ol>
  </section>
  <section class="section">
    <h2>As categorias</h2>
    <div class="cat-explain">${CATS.map((c) => `<article style="--c:${c.cor}">
      <h3>${esc(c.nome)} <span class="hint">sugestão: ${c.pct}%</span></h3>
      <p>${esc(c.desc)}</p><p class="ex">Ex.: ${esc(c.ex)}</p></article>`).join('')}</div>
  </section>
  <section class="section">
    <h2>No dia a dia</h2>
    <ol class="order">
      <li>Em <strong>Orçamento</strong>, confira a renda prevista e os percentuais do mês.</li>
      <li>Em <strong>Lançar</strong>, registre cada gasto e cada entrada de renda. Marque “Repete todo mês” para contas fixas.</li>
      <li>No <strong>Painel</strong>, acompanhe as barras: verde está dentro, amarelo passou de 80%, vermelho listrado estourou.</li>
      <li>Exporte um backup de vez em quando em <strong>Orçamento &gt; Seus dados</strong>.</li>
    </ol>
    <div class="btn-row"><button class="btn btn-primary" data-action="nav" data-view="painel">Ir para o painel</button></div>
  </section>`;
}

/* ---------- 6. Ações ---------- */
function setView(v) { ui.view = v; if (v !== 'lancar') ui.editingId = null; render(true); window.scrollTo(0, 0); }

function readMoneyAndDate(form, errEl) {
  const amount = parseCents(form.valor.value);
  const date = form.data.value;
  const name = form.nome.value.trim();
  form.valor.setAttribute('aria-invalid', String(!(amount > 0)));
  form.data.setAttribute('aria-invalid', String(!isValidISO(date)));
  if (!(amount > 0)) { errEl.textContent = 'Informe um valor maior que zero (ex.: 25,90).'; form.valor.focus(); return null; }
  if (!isValidISO(date)) { errEl.textContent = 'Informe uma data válida.'; form.data.focus(); return null; }
  return { amount, date, name };
}

function saveExpense(form) {
  const err = $('#form-err');
  const base = readMoneyAndDate(form, err);
  if (!base) return;
  const cat = form.cat.value;
  if (!CAT[cat]) { err.textContent = 'Escolha uma categoria.'; $('input[name=cat]', form).focus(); return; }
  const data = {
    name: base.name || CAT[cat].nome, amount: base.amount, cat, date: base.date,
    note: form.obs.value.trim(), recurring: form.recorrente.checked,
    sub: cat === 'liberdade' ? (form.sub.value || 'investimento') : null
  };
  const key = base.date.slice(0, 7);
  let msg;
  if (ui.editingId) {
    const found = findExpense(ui.editingId);
    if (found) {
      found.month.expenses.splice(found.idx, 1);
      const item = { ...found.item, ...data, example: false };
      if (item.recurring && !item.recId) item.recId = item.id;
      ensureMonth(key).expenses.push(item);
    }
    ui.editingId = null;
    msg = 'Gasto atualizado.';
  } else {
    const id = uid();
    ensureMonth(key).expenses.push({ id, ...data, recId: data.recurring ? id : null, example: false });
    msg = `Gasto salvo em ${CAT[cat].nome}.`;
  }
  state.lastExpense = { name: data.name, amount: data.amount, cat, note: data.note, sub: data.sub };
  ui.month = key;
  saveState();
  if (msg === 'Gasto atualizado.') { ui.view = 'lista'; render(true); } else render();
  toast(msg + budgetHint(cat));
}
/** Complemento do aviso após salvar: quanto ainda cabe na categoria. */
function budgetHint(cat) {
  const s = monthStats(viewMonth(ui.month));
  const left = s.planned[cat] - s.spent[cat];
  if (cat === 'liberdade') return '';
  return left >= 0 ? ` Restam ${fmt(left)}.` : ` Passou ${fmt(-left)} do planejado.`;
}

function saveIncome(form) {
  const err = $('#form-err');
  const base = readMoneyAndDate(form, err);
  if (!base) return;
  const key = base.date.slice(0, 7);
  ensureMonth(key).income.entries.push({ id: uid(), name: base.name || 'Entrada', amount: base.amount, date: base.date, example: false });
  ui.month = key;
  saveState();
  render();
  toast(`Entrada de ${fmt(base.amount)} salva.`);
}

function repeatLast() {
  const l = state.lastExpense, form = $('#form-lancar');
  if (!l || !form) return;
  form.valor.value = centsToInput(l.amount);
  form.nome.value = l.name;
  const radio = $(`input[name=cat][value="${l.cat}"]`, form);
  if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
  if (l.sub) { const r = $(`input[name=sub][value="${l.sub}"]`, form); if (r) r.checked = true; }
  form.obs.value = l.note || '';
  form.data.value = defaultDateFor(ui.month);
  form.valor.focus();
  form.valor.select();
}

function deleteExpense(id) {
  const found = findExpense(id);
  if (!found) return;
  found.month.expenses.splice(found.idx, 1);
  saveState(); render();
  toast(`“${found.item.name}” excluído.`, 'Desfazer', () => {
    ensureMonth(found.key).expenses.splice(found.idx, 0, found.item);
    saveState(); render();
  });
}
function deleteIncome(id) {
  const m = state.months[ui.month];
  const idx = m ? m.income.entries.findIndex((e) => e.id === id) : -1;
  if (idx < 0) return;
  const [item] = m.income.entries.splice(idx, 1);
  saveState(); render();
  toast(`Entrada “${item.name}” excluída.`, 'Desfazer', () => {
    ensureMonth(ui.month).income.entries.splice(idx, 0, item); saveState(); render();
  });
}

function addRecurring(recIds) {
  const prev = state.months[addMonths(ui.month, -1)];
  if (!prev) return;
  const m = ensureMonth(ui.month);
  let n = 0;
  recIds.forEach((rid) => {
    const src = prev.expenses.find((e) => e.recId === rid && e.recurring);
    if (!src) return;
    const day = Math.min(Number(src.date.slice(8)), daysInMonth(ui.month));
    m.expenses.push({ ...src, id: uid(), date: `${ui.month}-${pad(day)}` });
    n++;
  });
  saveState(); render();
  toast(n === 1 ? 'Gasto recorrente adicionado.' : `${n} gastos recorrentes adicionados.`);
}
function skipRecurring(rid) {
  ensureMonth(ui.month).dismissed.push(rid);
  saveState(); render();
}

/* Dados de exemplo para demonstração no minicurso (marcados com example: true). */
function loadExample() {
  const cur = currentMonth();
  const items = [
    ['Aluguel da república', 55000, 'essenciais', 5, true],
    ['Internet e luz', 9000, 'essenciais', 8, true],
    ['Mercado', 21000, 'essenciais', 12, false],
    ['Tesouro Selic', 30000, 'liberdade', 5, true, 'investimento'],
    ['Reserva de emergência', 15000, 'liberdade', 5, true, 'reserva'],
    ['Curso online de Python', 8000, 'conhecimento', 15, false],
    ['Streaming', 2590, 'conforto', 3, true],
    ['Pizza no sábado', 7800, 'conforto', 14, false],
    ['Passagem da viagem de fim de ano', 15000, 'metas', 20, false],
    ['Bar com a turma', 12500, 'prazeres', 18, false]
  ];
  [addMonths(cur, -1), cur].forEach((k) => {
    const m = ensureMonth(k);
    if (!m.income.planned) { m.income.planned = 200000; m.perc = { ...DEFAULT_PERC }; }
    m.income.entries.push(
      { id: uid(), name: 'Bolsa PET', amount: 110000, date: `${k}-05`, example: true },
      { id: uid(), name: 'Estágio', amount: 90000, date: `${k}-10`, example: true });
    items.forEach(([name, amount, cat, day, recurring, sub], i) => {
      m.expenses.push({ id: uid(), name, amount, cat, date: `${k}-${pad(day)}`, note: '', recurring,
        recId: recurring ? `exemplo-${i}` : null, sub: sub || null, example: true });
    });
  });
  if (!state.baseIncome) state.baseIncome = 200000;
  state.hasExample = true;
}
function clearExample() {
  Object.values(state.months).forEach((m) => {
    m.expenses = m.expenses.filter((e) => !e.example);
    m.income.entries = m.income.entries.filter((e) => !e.example);
  });
  state.hasExample = false;
  saveState(); render();
  toast('Dados de exemplo apagados.');
}

/* Exportar / importar */
function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportJSON() {
  const payload = { app: 'orcamento-pet-eletrica', version: DATA_VERSION, exportedAt: new Date().toISOString(), data: state };
  download(`orcamento-pet-${todayISO()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast('Backup exportado. Guarde o arquivo em um lugar seguro.');
}
function exportCSV() {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;          // evita fórmulas maliciosas no Excel
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const money = (c) => (c / 100).toFixed(2).replace('.', ',');
  const rows = [['Data', 'Mês', 'Tipo', 'Nome', 'Categoria', 'Destino', 'Valor (R$)', 'Recorrente', 'Observação']];
  Object.keys(state.months).sort().forEach((k) => {
    const m = state.months[k];
    m.income.entries.forEach((e) => rows.push([isoToBR(e.date), k, 'Entrada', e.name, '', '', money(e.amount), '', '']));
    m.expenses.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => rows.push([
      isoToBR(e.date), k, 'Gasto', e.name, CAT[e.cat].nome, e.sub ? SUBTIPOS[e.sub] : '', money(e.amount), e.recurring ? 'Sim' : 'Não', e.note]));
  });
  download(`lancamentos-pet-${todayISO()}.csv`, '\uFEFF' + rows.map((r) => r.map(cell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
  toast('CSV exportado. Abre direto no Excel ou Google Planilhas.');
}
function importJSON(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = migrate(parsed && parsed.data ? parsed.data : parsed);
      const n = sum(Object.values(imported.months).map((m) => m.expenses.length));
      if (!confirm(`Importar ${n} lançamentos de ${Object.keys(imported.months).length} mês(es)? Os dados atuais deste aparelho serão substituídos.`)) return;
      imported.onboarded = true;
      state = imported;
      saveState(); render();
      toast('Backup importado.');
    } catch (e) {
      alert('Não foi possível importar: ' + (e.message || 'arquivo inválido.') + ' Escolha um arquivo .json exportado por este app.');
    }
  };
  reader.onerror = () => alert('Não foi possível ler o arquivo.');
  reader.readAsText(file);
}
function resetAll() {
  if (!confirm('Zerar TODOS os dados deste aparelho? Recomendo exportar um backup antes.\n\nOK = continuar; Cancelar = voltar.')) return;
  const typed = prompt('Esta ação não pode ser desfeita. Digite ZERAR para confirmar.');
  if ((typed || '').trim().toUpperCase() !== 'ZERAR') { toast('Nada foi apagado.'); return; }
  state = defaultState();
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignora */ }
  ui.view = 'painel'; ui.month = currentMonth();
  render(true);
}

/* Avisos */
let toastTimer;
function toast(msg, actionLabel, onAction) {
  const el = $('#toast');
  clearTimeout(toastTimer);
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  el.hidden = false;
  if (actionLabel) $('button', el).addEventListener('click', () => { el.hidden = true; onAction(); }, { once: true });
  toastTimer = setTimeout(() => { el.hidden = true; }, actionLabel ? UNDO_MS : 3500);
}
function showBanner(msg) {
  const el = $('#banner');
  el.textContent = msg;
  el.hidden = false;
}

/* ---------- 7. Eventos (delegação: um ouvinte para todos os botões data-action) ---------- */
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  switch (action) {
    case 'nav': setView(btn.dataset.view); break;
    case 'month': ui.month = addMonths(ui.month, Number(btn.dataset.delta)); render(); break;
    case 'month-today': ui.month = currentMonth(); render(); break;
    case 'toggle-presentation': state.presentation = !state.presentation; saveState(); render(); break;
    case 'entry-type': ui.entryType = btn.dataset.type; render(); break;
    case 'repeat-last': repeatLast(); break;
    case 'cancel-edit': ui.editingId = null; setView('lista'); break;
    case 'edit': ui.editingId = id; ui.entryType = 'gasto'; ui.view = 'lancar'; render(true); break;
    case 'delete': deleteExpense(id); break;
    case 'delete-income': deleteIncome(id); break;
    case 'new-income': ui.entryType = 'renda'; setView('lancar'); break;
    case 'rec-add': addRecurring([id]); break;
    case 'rec-add-all': addRecurring(recurringSuggestions(ui.month).map((e) => e.recId)); break;
    case 'rec-skip': skipRecurring(id); break;
    case 'restore-perc': {
      const form = btn.closest('form');
      $$('[data-perc]', form).forEach((inp) => { inp.value = DEFAULT_PERC[inp.dataset.perc]; });
      form.dispatchEvent(new Event('input'));
      break;
    }
    case 'copy-prev': {
      const prev = state.months[addMonths(ui.month, -1)];
      const m = ensureMonth(ui.month);
      m.income.planned = prev.income.planned; m.perc = { ...prev.perc };
      saveState(); render(); toast('Orçamento copiado do mês anterior.');
      break;
    }
    case 'onboard-example':
      loadExample();
      state.basePerc = { ...DEFAULT_PERC };
      state.onboarded = true; ui.month = currentMonth(); ui.view = 'painel';
      saveState(); render(true);
      toast('Exemplo carregado. Apague em Orçamento quando quiser.');
      break;
    case 'load-example': loadExample(); saveState(); render(); toast('Exemplo carregado.'); break;
    case 'clear-example': clearExample(); break;
    case 'export-json': exportJSON(); break;
    case 'export-csv': exportCSV(); break;
    case 'reset': resetAll(); break;
  }
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('#toast').hidden = true; });

/* ---------- 8. Inicialização ---------- */
state = loadState();
if (!storageOk) showBanner('Este navegador não permite salvar dados (talvez esteja em modo anônimo). Você pode usar o app, mas exporte antes de fechar.');
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline indisponível, o app segue funcionando */ });
}
