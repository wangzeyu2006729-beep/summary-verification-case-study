'use strict';

const NOTE_KEY = 'summary-verification:case100:20261008:notes:v1';
const THEME_KEY = 'summary-verification:case100:theme';
const COLLECTION = 'case100-20261008';
const SHORT = {
  'RAGTruth-Summary': 'RAGTruth', 'DiverseSumm-LongFormFact': 'DiverseSumm',
};
const ALIAS = { DiverseSumm: 'DiverseSumm-LongFormFact', RAGTruth: 'RAGTruth-Summary' };
const NO_INLINE = new Set(['AggreFact', 'SummEval', 'ExtEval']);
const TONE_RANK = { err: 3, gray: 2, ok: 1, neutral: 0 };

let CASES = [], META = {}, SUMMARY_MD = '', DATASETS = [], BY_ID = new Map(), SECTIONS = {};
let notes = {};
const state = { view: 'overview', ds: 'all', st: 'all', gen: 'all', flag: 'all', tag: 'all', q: '', unread: false, sort: 'order', case: null };
let findIndex = -1;

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => new Intl.NumberFormat('en-US').format(n);
const short = ds => SHORT[ds] || ds;
const toneOfState = s => /^(无错误 span|所有问题字段为 no|全部句子正确|仅 Yes 标注|仅支持\/无事实|支持|高分)/.test(s) ? 'ok'
  : /错误|有问题|低分/.test(s) ? 'err' : /灰区|No 标注|中分/.test(s) ? 'gray' : 'neutral';

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

/* ---------- persistence ---------- */
function loadNotes() { try { notes = JSON.parse(localStorage.getItem(NOTE_KEY) || '{}') || {}; } catch { notes = {}; } }
function saveNotes() {
  try { localStorage.setItem(NOTE_KEY, JSON.stringify(notes)); return true; } catch { return false; }
}
function applyTheme(mode) {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  $('#themeBtn').innerHTML = '<span class="lbl">配色：</span>' + ({ auto: '自动', light: '浅色', dark: '深色' }[mode]);
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* per-viewer convenience only */ }
}

/* ---------- routing ---------- */
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.view = p.get('view') === 'reader' || p.get('case') ? 'reader' : 'overview';
  for (const k of ['ds', 'st', 'gen', 'flag', 'tag', 'sort']) state[k] = p.get(k) || (k === 'sort' ? 'order' : 'all');
  state.q = p.get('q') || '';
  state.unread = p.get('unread') === '1';
  state.case = p.get('case');
}
function writeHash(replace = true) {
  const p = new URLSearchParams();
  p.set('view', state.view);
  if (state.view === 'reader') {
    for (const k of ['ds', 'st', 'gen', 'flag', 'tag']) if (state[k] !== 'all') p.set(k, state[k]);
    if (state.sort !== 'order') p.set('sort', state.sort);
    if (state.q) p.set('q', state.q);
    if (state.unread) p.set('unread', '1');
    if (state.case) p.set('case', state.case);
  }
  const h = '#' + p.toString();
  if (h !== location.hash) (replace ? history.replaceState : history.pushState).call(history, null, '', h);
}
function go(params) {
  Object.assign(state, { ds: 'all', st: 'all', gen: 'all', flag: 'all', tag: 'all', q: '', unread: false, sort: 'order', case: null }, params, { view: 'reader' });
  writeHash(false); render();
}

/* ---------- filtering ---------- */
function scoped() { return CASES.filter(c => state.ds === 'all' || c.ds === state.ds); }
function matches(c) {
  if (state.st !== 'all' && c.state !== state.st) return false;
  if (state.gen !== 'all' && c.generator !== state.gen) return false;
  if (state.flag !== 'all' && !(state.flag === 'any' ? c.flags.length : c.flags.some(f => f.key === state.flag))) return false;
  if (state.tag !== 'all' && !(state.tag === 'any' ? c.note : c.note && c.note.tags.includes(state.tag))) return false;
  if (state.unread && notes[c.id]?.reviewed) return false;
  const q = state.q.trim().toLowerCase();
  if (q && ![c.id, c.summary, c.query, c.generator, c.subset, c.sources.join('\n'), JSON.stringify(c.annotation), c.note?.note || '']
    .some(v => String(v).toLowerCase().includes(q))) return false;
  return true;
}
function filtered() {
  const rows = scoped().filter(matches);
  const by = { flags: (a, b) => b.flags.length - a.flags.length, 'd-desc': (a, b) => b.d_tok - a.d_tok, 's-desc': (a, b) => b.s_tok - a.s_tok };
  return rows.sort((a, b) => (by[state.sort]?.(a, b) || 0) || DATASETS.indexOf(a.ds) - DATASETS.indexOf(b.ds) || a.order - b.order);
}
const flagLabel = k => META.flags[k]?.label || k;
const allTags = () => [...new Set(CASES.flatMap(c => c.note?.tags || []))].sort((a, b) => a.localeCompare(b, 'zh'));

/* ---------- overview ---------- */
function heatCell(n, title, params) {
  const p = Math.round(n / META.per_dataset * 100);
  const cls = n === 0 ? 'zero' : p >= 55 ? 'dark-ink' : '';
  return `<td><button class="${cls}" style="--p:${Math.max(p, n ? 8 : 0)}%" title="${esc(title)}" ${n ? `data-go='${esc(JSON.stringify(params))}'` : 'disabled'}>${n || '·'}</button></td>`;
}
function heatTable(rows, kind) {
  const head = `<thead><tr><th>${kind === 'flag' ? '自动标记' : '人工观察'}</th>${DATASETS.map(d => `<th title="${esc(d)}">${esc(short(d))}</th>`).join('')}<th>合计</th></tr></thead>`;
  const body = rows.map(r => {
    const counts = DATASETS.map(d => CASES.filter(c => c.ds === d && (kind === 'flag' ? c.flags.some(f => f.key === r.key) : c.note?.tags.includes(r.key))).length);
    const total = counts.reduce((a, b) => a + b, 0);
    const param = kind === 'flag' ? 'flag' : 'tag';
    return `<tr><th><button data-go='${esc(JSON.stringify({ [param]: r.key }))}'>${esc(r.label)}</button>${r.def ? `<small>${esc(r.def)}</small>` : ''}</th>${counts.map((n, i) => heatCell(n, `${DATASETS[i]} · ${r.label}：${n}/${META.per_dataset}`, { ds: DATASETS[i], [param]: r.key })).join('')}<td class="total">${total}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="heat">${head}<tbody>${body}</tbody></table></div>`;
}
function renderOverview() {
  const el = $('#overviewInner');
  if (el.dataset.ready) return;
  const flagged = CASES.filter(c => c.flags.length).length;
  const noted = CASES.filter(c => c.note).length;
  const flagRows = Object.entries(META.flags).map(([key, v]) => ({ key, label: v.label, def: v.definition }))
    .filter(r => CASES.some(c => c.flags.some(f => f.key === r.key)));
  const tagRows = allTags().map(t => ({ key: t, label: t }));
  const intro = sectionOf(/^## 0\./);
  el.innerHTML = `
    <h1>10 个摘要事实性数据集的 case study</h1>
    <p class="lede">每个数据集 ${META.per_dataset} 条，共 ${CASES.length} 条：先按原生标注状态、D/S 长度、子集、生成器和错误类型覆盖式选 20 条，再保留细读过的样本、按标注状态平衡补足到 ${META.per_dataset} 条。数据没有清洗：D、S 和官方标注都按发布原样展示，目的就是看清数据集本身有什么问题。因为优先保留了细读过的样本，有问题的样本偏多，比例不代表整个数据集。</p>
    <div class="stat-row">
      <div class="stat"><b>${CASES.length}</b><span>样本（${DATASETS.length} × ${META.per_dataset}）</span></div>
      <div class="stat"><b>${flagged}</b><span>至少有 1 个自动标记</span></div>
      <div class="stat"><b>${noted}</b><span>有人工观察</span></div>
      <div class="stat"><b>${fmt(Math.max(...CASES.map(c => c.d_tok)))}</b><span>最长 D（token）</span></div>
    </div>
    <h2>自动问题标记</h2>
    <p class="lede">规则检测，只是阅读提示，不是更正。每格是该数据集 ${META.per_dataset} 条里命中的条数；点格子打开对应样本，点行名看所有数据集里命中的样本。</p>
    ${heatTable(flagRows, 'flag')}
    <div class="heat-legend">颜色越深，命中越多：<i style="background:color-mix(in srgb,var(--seq) 10%,var(--surface))"></i>1 条
      <i style="background:color-mix(in srgb,var(--seq) 50%,var(--surface))"></i>${META.per_dataset / 2} 条
      <i style="background:var(--seq)"></i>${META.per_dataset} 条</div>
    <h2>人工观察</h2>
    <p class="lede">来自 case study 总结里细读过的 ${noted} 条，只覆盖这些 case，计数不代表各数据集的整体情况。</p>
    ${heatTable(tagRows, 'tag')}
    <h2>每个数据集</h2>
    <div class="ds-cards">${DATASETS.map(dsCard).join('')}</div>
    ${['## 1\\.', '## 3\\.', '## 4\\.', '## 5\\.'].map(h => `<div class="md">${mdHTML(sectionOf(new RegExp('^' + h)))}</div>`).join('')}
    <details class="sec"><summary>这份总结怎么读</summary><div class="inner md">${mdHTML(intro.replace(/^## .*\n/, ''))}</div></details>`;
  linkify(el, null);
  el.dataset.ready = '1';
}
function dsCard(d) {
  const m = META.datasets[d], rows = CASES.filter(c => c.ds === d);
  const states = Object.entries(rows.reduce((a, c) => (a[c.state] = (a[c.state] || 0) + 1, a), {}));
  const flagCounts = Object.entries(rows.flatMap(c => [...new Set(c.flags.map(f => f.key))]).reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {}))
    .sort((a, b) => b[1] - a[1]);
  return `<article class="ds-card">
    <header><h3>${esc(d)}</h3><button class="small" data-go='${esc(JSON.stringify({ ds: d }))}'>阅读 ${rows.length} 条</button></header>
    <div class="ds-domain">${esc(m.domain)} · 全量 ${fmt(m.raw_records)} 条</div>
    <p class="ds-label"><b>标注：</b>${esc(m.unit)} —— ${esc(m.meaning)}</p>
    <div class="chips">${states.map(([s, n]) => `<span class="badge ${toneOfState(s)}">${esc(s)} ${n}</span>`).join('')}</div>
    <div class="chips">${flagCounts.map(([k, n]) => `<a href="#" class="badge flag" data-go='${esc(JSON.stringify({ ds: d, flag: k }))}'>${esc(flagLabel(k))} ${n}</a>`).join('') || '<span class="none">没有自动标记</span>'}</div>
    <details><summary>本数据集的 case study 总结</summary><div class="md" data-ds="${esc(d)}">${mdHTML(SECTIONS[d] || '')}</div></details>
  </article>`;
}

/* ---------- markdown helpers ---------- */
function sectionOf(re) {
  const lines = SUMMARY_MD.split('\n'), out = [];
  let on = false;
  for (const line of lines) {
    if (/^## /.test(line)) on = re.test(line);
    if (on) out.push(line);
  }
  return out.join('\n');
}
function splitDatasetSections() {
  let cur = null;
  for (const line of SUMMARY_MD.split('\n')) {
    const m = line.match(/^### 2\.\d+ (.+)$/);
    if (m) { cur = m[1].trim(); SECTIONS[cur] = ''; continue; }
    if (/^## /.test(line)) cur = null;
    if (cur) SECTIONS[cur] += line + '\n';
  }
}
function mdHTML(md) {
  if (window.marked?.parse) return window.marked.parse(md);
  return `<pre>${esc(md)}</pre>`;
}
/* Turn `Dataset:NN` and `:NN` (resolved against the most recent dataset name in reading order) into links. */
function linkify(root, defaultDs) {
  const names = [...DATASETS, ...Object.keys(ALIAS)].sort((a, b) => b.length - a.length);
  const nameRe = new RegExp(`(?<![\\w-])(${names.map(n => n.replace(/[-]/g, '\\-')).join('|')})(?![\\w-])`, 'g');
  const resolve = n => ALIAS[n] || n;
  root.querySelectorAll('.md').forEach(md => {
    const fixed = md.dataset.ds || null;
    let ctx = defaultDs;
    const walker = document.createTreeWalker(md, NodeFilter.SHOW_TEXT);
    const codes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode, text = node.nodeValue;
      if (node.parentElement.tagName === 'CODE') {
        const full = text.match(/^([A-Za-z-]+):(\d{2})$/), rel = text.match(/^:(\d{2})$/);
        let id = null;
        if (full && (DATASETS.includes(resolve(full[1])))) { ctx = resolve(full[1]); id = `${ctx}:${full[2]}`; }
        else if (rel && (fixed || ctx)) id = `${fixed || ctx}:${rel[1]}`;
        if (id && BY_ID.has(id)) codes.push([node.parentElement, id]);
      } else {
        let m; nameRe.lastIndex = 0;
        while ((m = nameRe.exec(text))) ctx = resolve(m[1]);
      }
    }
    for (const [code, id] of codes) {
      const a = document.createElement('a');
      a.className = 'caseref'; a.textContent = code.textContent; a.href = '#view=reader&case=' + encodeURIComponent(id);
      a.title = '打开 ' + id;
      code.replaceWith(a);
    }
  });
}

/* ---------- reader: filters + list ---------- */
function options(sel, values, current, allLabel) {
  sel.innerHTML = `<option value="all">${esc(allLabel)}</option>` + values.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  sel.value = values.some(([v]) => v === current) ? current : 'all';
  return sel.value;
}
function renderFilters() {
  options($('#fDs'), DATASETS.map(d => [d, `${d} · ${CASES.filter(c => c.ds === d).length}`]), state.ds, `全部 ${DATASETS.length} 个数据集`);
  const sc = scoped();
  const count = f => sc.filter(f).length;
  state.st = options($('#fState'), [...new Set(sc.map(c => c.state))].map(s => [s, `${s} · ${count(c => c.state === s)}`]), state.st, '全部状态');
  state.gen = options($('#fGen'), [...new Set(sc.map(c => c.generator))].sort().map(g => [g, `${g} · ${count(c => c.generator === g)}`]), state.gen, '全部模型');
  const flags = Object.keys(META.flags).filter(k => sc.some(c => c.flags.some(f => f.key === k)));
  state.flag = options($('#fFlag'), [['any', `任一标记 · ${count(c => c.flags.length)}`], ...flags.map(k => [k, `${flagLabel(k)} · ${count(c => c.flags.some(f => f.key === k))}`])], state.flag, '不限');
  const tags = [...new Set(sc.flatMap(c => c.note?.tags || []))].sort((a, b) => a.localeCompare(b, 'zh'));
  state.tag = options($('#fTag'), [['any', `有人工观察 · ${count(c => c.note)}`], ...tags.map(t => [t, `${t} · ${count(c => c.note?.tags.includes(t))}`])], state.tag, '不限');
  $('#fSort').value = state.sort; $('#fQ').value = state.q; $('#fUnread').checked = state.unread;
  const active = ['ds', 'st', 'gen', 'flag', 'tag'].filter(k => state[k] !== 'all').length + (state.q ? 1 : 0) + (state.unread ? 1 : 0);
  $('#filterToggle').textContent = (active ? `筛选（已用 ${active} 项）` : '筛选') + ($('#filters').classList.contains('collapsed') ? ' ▾' : ' ▴');
}
function renderList(rows) {
  const read = CASES.filter(c => notes[c.id]?.reviewed).length;
  $('#listCount').textContent = `${rows.length} 条 · 已读 ${read}/${CASES.length}`;
  $('#list').innerHTML = rows.length ? rows.map(c => `
    <button class="item" role="option" data-id="${esc(c.id)}" aria-selected="${c.id === state.case}">
      <div class="row1"><span>${state.ds === 'all' ? esc(short(c.ds)) + ' ' : ''}${String(c.order).padStart(2, '0')} · ${esc(c.subset)}</span>${notes[c.id]?.reviewed ? '<span class="read">✓ 已读</span>' : ''}</div>
      <div class="row2"><span class="badge ${toneOfState(c.state)}">${esc(c.state)}</span>
        ${c.flags.length ? `<span class="badge flag count" title="${esc(c.flags.map(f => flagLabel(f.key)).join('、'))}">⚑ ${c.flags.length}</span>` : ''}
        ${c.note ? '<span class="badge tag" title="有人工观察">观察</span>' : ''}</div>
      <small>D ${fmt(c.d_tok)} · S ${fmt(c.s_tok)} token · ${esc(c.generator)}</small>
    </button>`).join('') : '<p class="empty">没有符合条件的样本，可以重置筛选。</p>';
  $('#list').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

/* ---------- reader: detail ---------- */
function highlightSummary(c) {
  const s = c.summary, n = s.length;
  if (NO_INLINE.has(c.ds) || !n) return esc(s);
  const tone = new Array(n).fill(null), unit = new Array(n).fill(-1), strong = new Array(n).fill(false);
  if (c.ds === 'RAGTruth-Summary') {
    c.spans.forEach((sp, i) => { for (let k = sp.start; k < sp.end && k < n; k++) { tone[k] = 'err'; unit[k] = i; } });
  } else {
    // Exact match first; otherwise ignore whitespace (LongEval units re-tokenize "70-year" as "70- year").
    const map = [];
    let ns = '';
    for (let k = 0; k < n; k++) if (!/\s/.test(s[k])) { map.push(k); ns += s[k]; }
    const locate = (t, from) => {
      let at = s.indexOf(t, from);
      if (at < 0) at = s.indexOf(t);
      if (at >= 0) return [at, at + t.length];
      const nt = t.replace(/\s+/g, '');
      const x = nt ? ns.indexOf(nt) : -1;
      return x < 0 ? null : [map[x], map[x + nt.length - 1] + 1];
    };
    let cursor = 0;
    c.units.forEach((u, i) => {
      const t = u.text.trim();
      const hit = t && locate(t, cursor);
      if (!hit) return;
      const [at, end] = hit;
      for (let k = at; k < end; k++) if (tone[k] === null || TONE_RANK[u.tone] > TONE_RANK[tone[k]]) { tone[k] = u.tone; unit[k] = i; }
      for (const sp of u.error_spans || []) {
        const x = sp ? locate(sp.trim(), at) : null;
        if (x && x[0] >= at && x[1] <= end) for (let k = x[0]; k < x[1]; k++) strong[k] = true;
      }
      cursor = end;
    });
  }
  let html = '', i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && tone[j] === tone[i] && unit[j] === unit[i] && strong[j] === strong[i]) j++;
    const seg = esc(s.slice(i, j));
    html += tone[i] && tone[i] !== 'neutral' ? `<span class="hl ${tone[i]}${strong[i] ? ' es' : ''}" data-u="${unit[i]}">${seg}</span>` : seg;
    i = j;
  }
  return html;
}
function markText(text, term, counter) {
  if (!term) return esc(text);
  const lower = text.toLowerCase(), needle = term.toLowerCase();
  let out = '', from = 0, at = lower.indexOf(needle);
  while (at >= 0) {
    out += esc(text.slice(from, at)) + `<mark class="find" data-i="${counter.n++}">${esc(text.slice(at, at + term.length))}</mark>`;
    from = at + term.length; at = lower.indexOf(needle, from);
  }
  return out + esc(text.slice(from));
}
function docDupMap(c) {
  const f = c.flags.find(x => x.key === 'near_dup_docs');
  return f ? new Set((f.detail.match(/(Article|Document) \d+/g) || []).map(x => x)) : new Set();
}
function renderSources(c, term) {
  const counter = { n: 0 }, dups = docDupMap(c), multi = c.sources.length > 1;
  const html = c.sources.map((t, i) => {
    const name = c.ds === 'DiverseSumm-LongFormFact' ? `Article ${i}` : `Document ${i + 1}`;
    const head = multi ? `<div class="doc-head">${c.ds === 'DiverseSumm-LongFormFact' ? `Article ${i}（摘要里从 0 编号；第 ${i + 1} 篇）` : name}
      ${dups.has(name) ? '<span class="badge flag">与其他篇近似重复</span>' : ''}</div>` : '';
    return head + `<div class="text">${markText(t, term, counter)}</div>`;
  }).join('');
  return { html, count: counter.n };
}
function problemsBlock(c) {
  const caseLinks = d => d.split('、').map(id => `<a class="caseref" href="#view=reader&case=${encodeURIComponent(id)}">${esc(id)}</a>`).join(' ');
  const flags = c.flags.length ? `<ul>${c.flags.map(f => `<li><span class="badge flag">${esc(flagLabel(f.key))}</span> ${f.key === 'shared_D' ? caseLinks(f.detail) : f.detail ? `<code>${esc(f.detail)}</code>` : ''}
      <br><small class="none">${esc(META.flags[f.key]?.definition || '')}</small></li>`).join('')}</ul>` : '<p class="none">没有命中自动规则。</p>';
  const manual = c.note ? `<div class="manual"><div class="chips">${c.note.tags.map(t => `<span class="badge tag">${esc(t)}</span>`).join('')}</div><p class="md-inline">${esc(c.note.note)}</p></div>` : '';
  return `<section class="block"><h3>数据/标注问题 <span>自动标记 ${c.flags.length}${c.note ? ' · 有人工观察' : ''}</span></h3><div class="problems">${flags}${manual}</div></section>`;
}
function unitsBlock(c) {
  if (c.ds === 'SummEval') {
    const a = c.annotation;
    const rowsOf = list => list.map(x => `<td>${x.consistency}</td><td>${x.coherence}</td><td>${x.fluency}</td><td>${x.relevance}</td>`);
    return `<section class="block"><h3>原生标注 <span>${esc(c.label_display)}</span></h3>
      <table class="gloss"><tr><td></td><td>consistency</td><td>coherence</td><td>fluency</td><td>relevance</td></tr>
      ${rowsOf(a.expert_annotations).map((r, i) => `<tr><td>专家 ${i + 1}</td>${r}</tr>`).join('')}
      ${rowsOf(a.turker_annotations).map((r, i) => `<tr><td>众包 ${i + 1}</td>${r}</tr>`).join('')}</table></section>`;
  }
  if (c.ds === 'RAGTruth-Summary' && !c.spans.length) {
    return `<section class="block"><h3>原生标注 <span>${esc(c.label_display)}</span></h3><p class="none">labels=[]：标注员没有在这条摘要里标出任何错误 span。</p></section>`;
  }
  const noun = c.ds === 'ExtEval' ? '字段' : c.ds === 'RAGTruth-Summary' ? 'span' : c.ds === 'AggreFact' ? '整篇' : '单元';
  return `<section class="block"><h3>原生标注 <span>${esc(c.label_display)} · ${c.units.length} 个${noun}</span></h3>
    <div class="units">${c.units.map((u, i) => `<article class="unit ${u.tone}" id="u-${i}" data-u="${i}">
      <div class="unit-head"><b>${noun} ${i + 1}</b><span class="badge ${u.tone === 'neutral' ? '' : u.tone}">${esc(u.label)}</span>${u.types.map(t => `<span class="badge">${esc(t)}</span>`).join('')}</div>
      ${c.ds === 'AggreFact' ? '' : `<p>${esc(u.text)}</p>`}
      ${u.explanation ? `<div class="exp">${esc(u.explanation)}</div>` : ''}</article>`).join('')}</div></section>`;
}
function datasetBlock(c) {
  const m = META.datasets[c.ds];
  const excluded = Object.entries(m.excluded || {}).map(([k, v]) => `${k} ${v}`).join('、') || '无';
  return `<details class="sec"><summary>标签和错误类型说明（${esc(c.ds)}）</summary><div class="inner">
      <p><b>标注单元：</b>${esc(m.unit)}<br><b>标签含义：</b>${esc(m.meaning)}</p>
      <p>${esc(m.data_note)}</p>
      ${m.glossary.length ? `<table class="gloss">${m.glossary.map(g => `<tr><td>${esc(g.label)}</td><td>${esc(g.meaning)}${g.example ? `<br><small class="none">例：${esc(g.example)}</small>` : ''}</td></tr>`).join('')}</table>` : ''}
      <p class="none">全量 ${fmt(m.raw_records)} 条；选样候选 ${fmt(m.eligible_records)} 条；排除：${esc(excluded)}。</p></div></details>
    <details class="sec"><summary>本数据集的 case study 总结</summary><div class="inner md" data-ds="${esc(c.ds)}">${mdHTML(SECTIONS[c.ds] || '')}</div></details>`;
}
function notesBlock(c) {
  const n = notes[c.id] || {};
  const field = (k, label, ph) => `<label>${label}<textarea data-note="${k}" placeholder="${esc(ph)}">${esc(n[k] || '')}</textarea></label>`;
  return `<section class="block notes"><h3>我的笔记 <label class="check"><input type="checkbox" data-note="reviewed" ${n.reviewed ? 'checked' : ''}>标为已读</label></h3>
    ${field('issue', '数据或标注有什么问题？', '标签是否可信？D 是否完整？S 是否是正常输出？')}
    ${field('observation', '样本有什么特点？', '领域、写作风格、错误发生在哪个命题？')}
    ${field('evidence', '原文证据与判断理由', '摘录 D 的依据或位置；官方解释和我的理解分开写。')}
    ${field('efficiency', '和核验成本有什么关系？', '要核几个命题？证据跨几处？要算数、跨说话人或跨文档吗？')}
    <div class="status" id="noteStatus">笔记只保存在当前浏览器；可在左侧导出备份。官方标签不会被改动。</div></section>`;
}
function renderDetail(rows) {
  const el = $('#detail');
  const c = BY_ID.get(state.case);
  if (!c) { el.innerHTML = '<p class="empty">当前筛选没有样本。</p>'; return; }
  const pos = rows.findIndex(r => r.id === c.id);
  const src = renderSources(c, '');
  el.innerHTML = `
    <div class="detail-head">
      <div class="title"><h2>${esc(c.id)}</h2><span class="badge ${toneOfState(c.state)}">${esc(c.label_display)}</span>
        <span class="meta">${esc(c.subset)} · ${esc(c.generator)} · D ${fmt(c.d_tok)} · S ${fmt(c.s_tok)} token</span></div>
      <div class="nav"><button class="small" id="prevBtn" ${pos <= 0 ? 'disabled' : ''}>← 上一条</button>
        <span>${pos >= 0 ? `${pos + 1}/${rows.length}` : '不在当前筛选中'}</span>
        <button class="small" id="nextBtn" ${pos < 0 || pos >= rows.length - 1 ? 'disabled' : ''}>下一条 →</button></div>
    </div>
    <div class="detail-body">
      <section class="pane d-pane">
        <div class="pane-head"><div class="ttl"><strong>D · 原文</strong><span>${fmt(c.d_tok)} token · ${c.sources.length} 篇</span></div>
          <div class="findbar"><input id="findInput" type="search" placeholder="在原文中查找（字面匹配）">
            <button class="small" id="findSel" title="先在摘要或标注里选中一段文字">用选中文字查找</button>
            <button class="small" id="findPrev" aria-label="上一处">↑</button><button class="small" id="findNext" aria-label="下一处">↓</button>
            <span class="count" id="findCount"></span></div></div>
        <div class="pane-scroll" id="dScroll">${src.html}</div>
      </section>
      <section class="pane s-pane">
        <div class="pane-head"><div class="ttl"><strong>S · 摘要与标注</strong><span>${fmt(c.s_tok)} token</span></div></div>
        <div class="pane-scroll" id="sScroll">
          ${problemsBlock(c)}
          ${c.query ? `<section class="block"><h3>Query / Topic</h3><div class="query">${esc(c.query)}</div></section>` : ''}
          <section class="block"><h3>摘要原文</h3><div class="summary-text">${highlightSummary(c)}</div>
            ${NO_INLINE.has(c.ds) ? '' : `<div class="legend"><span><i style="background:var(--hl-err)"></i>标为错误</span><span><i style="background:var(--hl-gray)"></i>灰区/有分歧</span><span><i style="background:var(--hl-ok)"></i>支持</span>${c.ds === 'DiaSumFact' ? '<span>波浪线：错误 span</span>' : ''}<span>点高亮跳到对应标注</span></div>`}</section>
          ${unitsBlock(c)}
          ${notesBlock(c)}
          ${datasetBlock(c)}
          <details class="sec"><summary>原始 annotation JSON</summary><div class="inner"><pre>${esc(JSON.stringify(c.annotation, null, 2))}</pre></div></details>
          <details class="sec"><summary>出处</summary><div class="inner">
            <p>record_id：<code>${esc(c.record_id)}</code><br>文件：${esc(c.source_file)} 第 ${c.source_line} 行<br>记录 SHA-256：<code>${esc(c.sha)}</code></p>
            <p>${esc(META.datasets[c.ds].generator_note)}</p>
            <p><a href="${esc(META.datasets[c.ds].source_url)}" target="_blank" rel="noreferrer">官方数据</a> · <a href="${esc(META.datasets[c.ds].paper_url)}" target="_blank" rel="noreferrer">论文</a></p></div></details>
        </div>
      </section>
    </div>`;
  linkify(el, c.ds);
  $('#prevBtn').onclick = () => step(-1, rows);
  $('#nextBtn').onclick = () => step(1, rows);
  bindFind(c);
  bindSummary();
  bindNotes(c);
  $('#dScroll').scrollTop = 0; $('#sScroll').scrollTop = 0;
}
function step(d, rows) {
  const pos = rows.findIndex(r => r.id === state.case);
  const next = rows[pos + d];
  if (next) { state.case = next.id; writeHash(); renderReader(); }
}
function bindFind(c) {
  const input = $('#findInput');
  const run = () => {
    const term = input.value;
    const { html, count } = renderSources(c, term);
    $('#dScroll').innerHTML = html;
    $('#findCount').textContent = term ? (count ? `${count} 处；匹配不等于支持` : '没有字面匹配') : '';
    findIndex = -1; if (count) jump(1);
  };
  let t; input.oninput = () => { clearTimeout(t); t = setTimeout(run, 180); };
  $('#findSel').onmousedown = e => e.preventDefault();
  $('#findSel').onclick = () => {
    const sel = String(window.getSelection() || '').trim().slice(0, 200);
    if (!sel) { toast('先在摘要或标注里选中一段文字'); return; }
    input.value = sel; run();
  };
  $('#findNext').onclick = () => jump(1);
  $('#findPrev').onclick = () => jump(-1);
}
function jump(d) {
  const marks = [...document.querySelectorAll('#dScroll mark.find')];
  if (!marks.length) return;
  marks[findIndex]?.classList.remove('current');
  findIndex = (findIndex + d + marks.length) % marks.length;
  marks[findIndex].classList.add('current');
  marks[findIndex].scrollIntoView({ block: 'center' });
  $('#findCount').textContent = `${findIndex + 1}/${marks.length} 处；匹配不等于支持`;
}
function bindSummary() {
  const s = $('#sScroll');
  s.querySelectorAll('.hl').forEach(h => h.onclick = () => {
    const u = $(`#u-${h.dataset.u}`, s);
    if (!u) return;
    u.scrollIntoView({ block: 'center', behavior: 'smooth' });
    u.classList.add('flash'); setTimeout(() => u.classList.remove('flash'), 1400);
  });
  s.querySelectorAll('.unit').forEach(u => {
    const spans = () => s.querySelectorAll(`.hl[data-u="${u.dataset.u}"]`);
    u.onmouseenter = () => spans().forEach(x => x.classList.add('active'));
    u.onmouseleave = () => spans().forEach(x => x.classList.remove('active'));
  });
}
function bindNotes(c) {
  $('#detail').querySelectorAll('[data-note]').forEach(f => {
    const handler = () => {
      const cur = notes[c.id] || {};
      cur[f.dataset.note] = f.type === 'checkbox' ? f.checked : f.value;
      cur.updatedAt = new Date().toISOString();
      notes[c.id] = cur;
      $('#noteStatus').textContent = saveNotes() ? '已保存在当前浏览器 · ' + new Date().toLocaleTimeString() : '浏览器无法保存，请先导出备份';
      if (f.type === 'checkbox') renderList(filtered());
    };
    f.addEventListener(f.type === 'checkbox' ? 'change' : 'input', handler);
  });
}
function exportNotes() {
  const blob = new Blob([JSON.stringify({ version: 1, collection: COLLECTION, exportedAt: new Date().toISOString(), notes }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'case100-reading-notes.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importNotes(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.collection !== COLLECTION || typeof data.notes !== 'object') throw new Error(`不是这一批 ${CASES.length} 条的笔记文件`);
    let n = 0;
    for (const [id, v] of Object.entries(data.notes)) {
      if (!BY_ID.has(id) || !v || typeof v !== 'object') continue;
      const clean = {};
      for (const k of ['issue', 'observation', 'evidence', 'efficiency', 'updatedAt']) if (typeof v[k] === 'string') clean[k] = v[k];
      clean.reviewed = v.reviewed === true;
      notes[id] = { ...notes[id], ...clean }; n++;
    }
    saveNotes(); toast(`已导入 ${n} 条笔记`); renderReader();
  } catch (e) { toast('导入失败：' + e.message); }
}

/* ---------- top-level render ---------- */
function renderReader() {
  renderFilters();
  const rows = filtered();
  // A linked case stays open even if the current filters exclude it.
  if (!BY_ID.has(state.case)) state.case = rows[0]?.id || null;
  writeHash();
  renderList(rows);
  renderDetail(rows);
}
function render() {
  document.querySelectorAll('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === state.view ? 'page' : 'false'));
  $('#overview').hidden = state.view !== 'overview';
  $('#reader').hidden = state.view !== 'reader';
  if (state.view === 'overview') renderOverview(); else renderReader();
}
function bindChrome() {
  const set = (k, v) => { state[k] = v; if (k === 'ds') Object.assign(state, { st: 'all', gen: 'all' }); state.case = null; renderReader(); };
  $('#fDs').onchange = e => set('ds', e.target.value);
  $('#fState').onchange = e => set('st', e.target.value);
  $('#fGen').onchange = e => set('gen', e.target.value);
  $('#fFlag').onchange = e => set('flag', e.target.value);
  $('#fTag').onchange = e => set('tag', e.target.value);
  $('#fSort').onchange = e => { state.sort = e.target.value; renderReader(); };
  let t; $('#fQ').oninput = e => { clearTimeout(t); t = setTimeout(() => set('q', e.target.value), 220); };
  $('#fUnread').onchange = e => set('unread', e.target.checked);
  $('#resetBtn').onclick = () => go({});
  if (matchMedia('(max-width: 980px)').matches) {
    $('#filters').classList.add('collapsed'); $('#filterToggle').setAttribute('aria-expanded', 'false');
  }
  $('#filterToggle').onclick = () => {
    const open = $('#filters').classList.toggle('collapsed') === false;
    $('#filterToggle').setAttribute('aria-expanded', String(open));
    renderFilters();
  };
  $('#exportBtn').onclick = exportNotes;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = e => { const f = e.target.files?.[0]; if (f) importNotes(f); e.target.value = ''; };
  $('#list').onclick = e => {
    const b = e.target.closest('.item'); if (!b) return;
    state.case = b.dataset.id; writeHash(); renderList(filtered()); renderDetail(filtered());
    if (matchMedia('(max-width: 980px)').matches) $('#detail').scrollIntoView({ block: 'start' });
  };
  document.body.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); go(JSON.parse(g.dataset.go)); }
  });
  document.querySelectorAll('.tabs a').forEach(a => a.onclick = e => {
    e.preventDefault(); state.view = a.dataset.view; writeHash(false); render();
  });
  window.addEventListener('hashchange', () => { readHash(); render(); });
  document.addEventListener('keydown', e => {
    if (state.view !== 'reader' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'j') step(1, filtered());
    if (e.key === 'ArrowLeft' || e.key === 'k') step(-1, filtered());
  });
  let mode = 'auto';
  try { mode = localStorage.getItem(THEME_KEY) || 'auto'; } catch { /* default */ }
  applyTheme(mode);
  $('#themeBtn').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'auto';
    applyTheme({ auto: 'light', light: 'dark', dark: 'auto' }[cur]);
  };
}

async function main() {
  bindChrome();
  loadNotes();
  try {
    const [cases, meta, md] = await Promise.all([
      fetch('data/cases.json').then(r => r.json()), fetch('data/meta.json').then(r => r.json()), fetch('data/summary.md').then(r => r.text())]);
    CASES = cases; META = meta; SUMMARY_MD = md;
  } catch (e) {
    $('#overviewInner').innerHTML = `<p class="loading">数据加载失败：${esc(e.message)}。请通过 HTTP 打开（例如 GitHub Pages 或 python3 -m http.server）。</p>`;
    $('#overview').hidden = false; return;
  }
  DATASETS = [...new Set(CASES.map(c => c.ds))];
  CASES.forEach(c => BY_ID.set(c.id, c));
  splitDatasetSections();
  readHash();
  render();
}
main();
