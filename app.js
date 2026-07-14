/* =========================================================================
   Pipelovers × Redarbor — Painel de Performance
   Dados carregados diretamente dos arquivos CSV (data/membros.csv e
   data/redarbor.csv) a cada carregamento da página — sem dados embutidos.
   ========================================================================= */

const CSV_MEMBROS_URL = 'data/membros.csv';
const CSV_CONSUMO_URL = 'data/redarbor.csv';

/* ---------- CSV parser (RFC4180: aspas, vírgulas dentro de aspas, CRLF) ---------- */
function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  text = text.replace(/^\uFEFF/, ''); // remove BOM se existir
  for(let i=0;i<text.length;i++){
    const c = text[i], next = text[i+1];
    if(inQuotes){
      if(c === '"' && next === '"'){ field += '"'; i++; }
      else if(c === '"'){ inQuotes = false; }
      else field += c;
    } else {
      if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field=''; }
      else if(c === '\r'){ /* ignore */ }
      else if(c === '\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else field += c;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  const clean = rows.filter(r => r.length>1 || (r.length===1 && r[0].trim()!==''));
  if(!clean.length) return [];
  const headers = clean[0].map(h=>h.trim());
  return clean.slice(1).map(r=>{
    const obj = {};
    headers.forEach((h,idx)=> obj[h] = (r[idx]||'').trim());
    return obj;
  });
}

async function fetchCSV(url){
  const res = await fetch(url, {cache:'no-store'});
  if(!res.ok) throw new Error(`Não foi possível carregar ${url} (status ${res.status})`);
  const text = await res.text();
  return parseCSV(text);
}

/* ---------- Helpers ---------- */
function titleCase(str){
  return str.toLowerCase().replace(/(^|\s|\-)([a-zà-ÿ])/g, (m,sep,ch)=> sep+ch.toUpperCase());
}
function initials(name){
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if(parts.length===0) return "?";
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}
function normName(n){ return n.trim().toUpperCase().replace(/\s+/g,' '); }
function parseBRDateTime(s){
  // "02/07/2026 16:38" -> Date (local)
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if(!m) return null;
  const [,d,mo,y,h,mi] = m;
  return new Date(Number(y), Number(mo)-1, Number(d), Number(h), Number(mi));
}
function isoDateFromDate(d){
  if(!d) return null;
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function fmtDateShort(d){
  if(!d) return null;
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function fmtBRRaw(d){
  if(!d) return '';
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function daysAgo(d){ if(!d) return Infinity; return Math.floor((Date.now()-d.getTime())/86400000); }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Global model (preenchido por loadData) ---------- */
let TEAMS = [];
let CORRECOES = [];
let CONFLITOS = [];
let GLOBAL_MIN_DATE = null; // ISO yyyy-mm-dd
let GLOBAL_MAX_DATE = null;
let DATA_GERADO_EM = null;

async function loadData(){
  const [membrosRows, consumoRows] = await Promise.all([
    fetchCSV(CSV_MEMBROS_URL),
    fetchCSV(CSV_CONSUMO_URL)
  ]);

  // ---- Estrutura de times (líder -> membros) ----
  const teamsRaw = {}; // liderRaw -> [{name,email}]
  membrosRows.forEach(r=>{
    const leader = (r['LIDER/Gestão'] || r['LIDER/Gestao'] || '').trim();
    const name = (r['Nome completo do membro'] || '').trim();
    const email = (r['E-mail do membro'] || '').trim().toLowerCase();
    if(!leader || !name) return;
    teamsRaw[leader] = teamsRaw[leader] || [];
    teamsRaw[leader].push({name, email});
  });

  // ---- Consumo agrupado por nome (chave primária robusta, ver README) ----
  const consByName = {}; // NOME_NORMALIZADO -> [{titulo,data(Date),emailReal}]
  const allDates = [];
  consumoRows.forEach(r=>{
    const nome = normName(r['Nome']||'');
    const email = (r['Email']||'').trim().toLowerCase();
    const conteudo = (r['Conteúdo']||r['Conteudo']||'').trim();
    const dataRaw = (r['Data']||'').trim();
    const dt = parseBRDateTime(dataRaw);
    if(!nome || !conteudo || !dt) return;
    consByName[nome] = consByName[nome] || [];
    consByName[nome].push({titulo:conteudo, data:dataRaw, ts:dt, emailReal:email});
    allDates.push(dt);
  });
  Object.values(consByName).forEach(list => list.sort((a,b)=> b.ts - a.ts));

  const emailTrueOwner = {}; // email -> nome normalizado dono real
  Object.entries(consByName).forEach(([nome, list])=>{
    emailTrueOwner[list[0].emailReal] = nome;
  });

  // ---- Monta times finais + matching + flags de qualidade de dados ----
  CORRECOES = [];
  CONFLITOS = [];
  const teamsOut = Object.entries(teamsRaw).map(([lider, membros])=>{
    const membrosOut = membros.map(m=>{
      const nname = normName(m.name);
      let lessons = consByName[nname] || [];
      let usedEmail = m.email;
      if(lessons.length){
        const realEmail = lessons[0].emailReal;
        if(realEmail && realEmail !== m.email){
          usedEmail = realEmail;
          CORRECOES.push({nome:m.name, emailPlanilha:m.email, emailReal:realEmail});
        }
      } else {
        const owner = emailTrueOwner[m.email];
        if(owner && owner !== nname){
          CONFLITOS.push({nome:m.name, emailPlanilhaIncorreto:m.email, pertenceRealmenteA:owner});
        }
      }
      return {
        nome: m.name,
        email: m.email,
        emailUsado: usedEmail,
        aulas: lessons.map(l=>({titulo:l.titulo, data:l.data, ts:l.ts})),
      };
    });
    return { liderRaw: lider, membros: membrosOut };
  });

  TEAMS = teamsOut.map((t, idx) => ({
    key: 'team_'+idx,
    liderRaw: t.liderRaw,
    lider: titleCase(t.liderRaw),
    membros: t.membros
  }));

  const leaderNameToKey = {};
  TEAMS.forEach(t => { leaderNameToKey[normName(t.liderRaw)] = t.key; });
  TEAMS.forEach(t => t.membros.forEach(m => { m.lideraTimeKey = leaderNameToKey[normName(m.nome)] || null; }));

  if(allDates.length){
    const min = new Date(Math.min(...allDates));
    const max = new Date(Math.max(...allDates));
    GLOBAL_MIN_DATE = isoDateFromDate(min);
    GLOBAL_MAX_DATE = isoDateFromDate(max);
  }
  DATA_GERADO_EM = new Date();
}

/* ---------- State ---------- */
const state = {
  view: 'overview',
  dateFrom: null,
  dateTo: null,
  activePreset: 'all',
  selectedLeaders: [],
  expandedRows: new Set(),
  search: '',
  sortKey: 'qtd',
  sortDir: 'desc'
};

/* ---------- Date filtering ---------- */
function lessonsInRange(aulas){
  if(!state.dateFrom && !state.dateTo) return aulas;
  return aulas.filter(a => {
    const d = isoDateFromDate(a.ts);
    if(state.dateFrom && d < state.dateFrom) return false;
    if(state.dateTo && d > state.dateTo) return false;
    return true;
  });
}
function memberComputed(m){
  const aulasFiltradas = lessonsInRange(m.aulas);
  const ultimoNoPeriodo = aulasFiltradas.length ? aulasFiltradas[0].ts : null;
  return { ...m, aulasFiltradas, qtd: aulasFiltradas.length, ultimoNoPeriodo };
}
function teamComputed(team){
  const membros = team.membros.map(memberComputed);
  const totalAulas = membros.reduce((s,m)=>s+m.qtd,0);
  const ativos = membros.filter(m=>m.qtd>0).length;
  const ultimos = membros.map(m=>m.ultimoNoPeriodo).filter(Boolean).sort((a,b)=>b-a);
  return {
    ...team, membros, totalAulas,
    totalMembros: membros.length, ativos,
    media: membros.length ? (totalAulas/membros.length) : 0,
    ultimoAcessoTime: ultimos[0] || null
  };
}

/* ---------- Sidebar nav ---------- */
function renderSidebar(){
  const nav = document.getElementById('navScroll');
  let html = `<div class="nav-label">Painel</div>`;
  html += navItem('overview', 'Visão geral', TEAMS.length, iconGrid(), state.view==='overview');
  html += `<div class="nav-label">Times por liderança</div>`;
  TEAMS.slice().sort((a,b)=>a.lider.localeCompare(b.lider,'pt-BR')).forEach(t=>{
    html += navItem(t.key, t.lider, t.membros.length, iconUsers(), state.view===t.key);
  });
  nav.innerHTML = html;
  nav.querySelectorAll('.nav-item').forEach(btn=>{
    btn.addEventListener('click', ()=> setView(btn.dataset.key));
  });
  const foot = document.getElementById('sidebarFoot');
  foot.innerHTML = `Base de dados: <b style="color:var(--blue-gray)">${TEAMS.reduce((s,t)=>s+t.membros.length,0)}</b> colaboradores<br>Consumo carregado de <b style="color:var(--blue-gray)">data/redarbor.csv</b><br>Carregado em ${DATA_GERADO_EM.toLocaleDateString('pt-BR')} às ${DATA_GERADO_EM.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
}
function navItem(key,name,count,icon,active){
  return `<button class="nav-item ${active?'active':''}" data-key="${key}">
    <span class="nav-ico">${icon}</span>
    <span class="nav-name">${escapeHtml(name)}</span>
    <span class="nav-badge">${count}</span>
  </button>`;
}
function iconGrid(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`;}
function iconUsers(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`;}

/* ---------- Leader multi-select dropdown (overview filter) ---------- */
function renderLeaderDropdown(){
  const dd = document.getElementById('leaderDropdown');
  let html = `<div class="dropdown-actions">
    <button class="link-btn" id="selAll">Selecionar todos</button>
    <button class="link-btn" id="selNone">Limpar</button>
  </div>`;
  TEAMS.slice().sort((a,b)=>a.lider.localeCompare(b.lider,'pt-BR')).forEach(t=>{
    const checked = state.selectedLeaders.includes(t.key) ? 'checked' : '';
    html += `<label class="check-row">
      <input type="checkbox" data-key="${t.key}" ${checked}>
      <span>${escapeHtml(t.lider)}</span>
      <span class="cnt">${t.membros.length}</span>
    </label>`;
  });
  dd.innerHTML = html;
  dd.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const k = cb.dataset.key;
      if(cb.checked){ if(!state.selectedLeaders.includes(k)) state.selectedLeaders.push(k); }
      else { state.selectedLeaders = state.selectedLeaders.filter(x=>x!==k); }
      updateLeaderSelectLabel();
      renderContent();
    });
  });
  dd.querySelector('#selAll').addEventListener('click', ()=>{
    state.selectedLeaders = TEAMS.map(t=>t.key);
    renderLeaderDropdown(); updateLeaderSelectLabel(); renderContent();
  });
  dd.querySelector('#selNone').addEventListener('click', ()=>{
    state.selectedLeaders = [];
    renderLeaderDropdown(); updateLeaderSelectLabel(); renderContent();
  });
}
function updateLeaderSelectLabel(){
  const label = document.getElementById('leaderSelectLabel');
  const n = state.selectedLeaders.length;
  if(n === TEAMS.length) label.textContent = 'Todos os times';
  else if(n === 0) label.textContent = 'Nenhum time selecionado';
  else if(n === 1) label.textContent = TEAMS.find(t=>t.key===state.selectedLeaders[0]).lider;
  else label.textContent = n + ' times selecionados';
}
document.getElementById('leaderSelectBtn').addEventListener('click', (e)=>{
  e.stopPropagation();
  document.getElementById('leaderSelectBtn').classList.toggle('open');
  document.getElementById('leaderDropdown').classList.toggle('open');
});
document.addEventListener('click', (e)=>{
  const field = document.getElementById('leaderFilterField');
  if(!field.contains(e.target)){
    document.getElementById('leaderSelectBtn').classList.remove('open');
    document.getElementById('leaderDropdown').classList.remove('open');
  }
});

/* ---------- Date controls ---------- */
const dateFromEl = document.getElementById('dateFrom');
const dateToEl = document.getElementById('dateTo');
dateFromEl.addEventListener('change', ()=>{ state.dateFrom = dateFromEl.value; state.activePreset=null; setActivePresetUI(); renderContent(); });
dateToEl.addEventListener('change', ()=>{ state.dateTo = dateToEl.value; state.activePreset=null; setActivePresetUI(); renderContent(); });
document.getElementById('presets').addEventListener('click', (e)=>{
  const btn = e.target.closest('.preset-btn');
  if(!btn) return;
  const p = btn.dataset.preset;
  state.activePreset = p;
  const max = new Date(GLOBAL_MAX_DATE+'T00:00:00');
  if(p === 'all'){
    state.dateFrom = GLOBAL_MIN_DATE; state.dateTo = GLOBAL_MAX_DATE;
  } else if(p === '7' || p === '30'){
    const from = new Date(max); from.setDate(from.getDate() - Number(p) + 1);
    const fromIso = isoDateFromDate(from);
    state.dateFrom = fromIso < GLOBAL_MIN_DATE ? GLOBAL_MIN_DATE : fromIso;
    state.dateTo = GLOBAL_MAX_DATE;
  } else if(p === 'month'){
    const from = isoDateFromDate(new Date(max.getFullYear(), max.getMonth(), 1));
    state.dateFrom = from < GLOBAL_MIN_DATE ? GLOBAL_MIN_DATE : from;
    state.dateTo = GLOBAL_MAX_DATE;
  }
  dateFromEl.value = state.dateFrom; dateToEl.value = state.dateTo;
  setActivePresetUI();
  renderContent();
});
function setActivePresetUI(){
  document.querySelectorAll('.preset-btn').forEach(b=>b.classList.toggle('active', b.dataset.preset===state.activePreset));
}

/* ---------- View switching ---------- */
function setView(key){
  state.view = key;
  state.expandedRows.clear();
  state.search='';
  renderSidebar();
  renderContent();
  const c = document.getElementById('content');
  if(c.scrollIntoView) c.scrollIntoView({behavior:'smooth', block:'start'});
}

/* ---------- Rendering: Overview ---------- */
function renderOverview(){
  const teams = TEAMS.filter(t => state.selectedLeaders.includes(t.key)).map(teamComputed);
  const totalMembros = teams.reduce((s,t)=>s+t.totalMembros,0);
  const totalAulas = teams.reduce((s,t)=>s+t.totalAulas,0);
  const totalAtivos = teams.reduce((s,t)=>s+t.ativos,0);
  const media = totalMembros ? (totalAulas/totalMembros) : 0;
  const maxAulas = Math.max(1, ...teams.map(t=>t.totalAulas));

  document.getElementById('topEyebrow').textContent = 'Monitoramento contínuo · Redarbor';
  document.getElementById('topTitle').textContent = 'Visão geral';
  document.getElementById('topSubtitle').textContent = `${teams.length} de ${TEAMS.length} times selecionados`;

  const rankedTeams = teams.slice().sort((a,b)=>b.totalAulas-a.totalAulas);

  let html = `
  <div class="kpi-grid">
    ${kpiCard('Colaboradores no filtro', totalMembros, iconUsers(), `${totalAtivos} assistiram ao menos 1 aula`)}
    ${kpiCard('Aulas assistidas', totalAulas, iconPlay(), 'no período selecionado')}
    ${kpiCard('Média por colaborador', media.toFixed(1), iconChart(), 'aulas / colaborador')}
    ${kpiCard('Times monitorados', teams.length, iconGrid(), `de ${TEAMS.length} lideranças cadastradas`)}
  </div>

  <div class="section-head"><h2>Ranking de times · aulas assistidas no período</h2><span class="hint">clique em um time para abrir o detalhe</span></div>
  <div class="panel">
    <div class="chart-wrap">
      ${rankedTeams.map(t=>{
        const pct = Math.round((t.totalAulas/maxAulas)*100);
        return `<div class="bar-row">
          <span class="lbl" data-key="${t.key}" title="${escapeHtml(t.lider)}">${escapeHtml(t.lider)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="val">${t.totalAulas}</span>
        </div>`;
      }).join('') || emptyState('Nenhum time selecionado no filtro de liderança.')}
    </div>
  </div>

  <div class="section-head"><h2>Detalhe por time</h2><span class="hint">${rankedTeams.length} times</span></div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Liderança</th><th>Membros</th><th>Ativos</th><th>Aulas assistidas</th><th>Média/membro</th><th>Último acesso do time</th>
      </tr></thead>
      <tbody>
        ${rankedTeams.map(t=>`
          <tr class="row" data-key="${t.key}">
            <td><div class="name-cell"><div class="avatar">${initials(t.lider)}</div><div><div class="member-name">${escapeHtml(t.lider)}</div></div></div></td>
            <td>${t.totalMembros}</td>
            <td>${t.ativos}</td>
            <td><span class="pill ${pillClass(t.totalAulas)}">${t.totalAulas}</span></td>
            <td>${t.media.toFixed(1)}</td>
            <td class="${lastAccessClass(t.ultimoAcessoTime)}">${t.ultimoAcessoTime ? fmtDateShort(t.ultimoAcessoTime) : '— sem registro'}</td>
          </tr>`).join('') || `<tr><td colspan="6">${emptyState('Nenhum time selecionado.')}</td></tr>`}
      </tbody>
    </table>
  </div>
  `;

  document.getElementById('content').innerHTML = html;
  document.querySelectorAll('.chart-wrap .lbl').forEach(el=> el.addEventListener('click', ()=> setView(el.dataset.key)));
  document.querySelectorAll('tbody tr[data-key]').forEach(el=> el.addEventListener('click', ()=> setView(el.dataset.key)));
}

/* ---------- Rendering: Team detail ---------- */
function renderTeam(teamKey){
  const teamRaw = TEAMS.find(t=>t.key===teamKey);
  const team = teamComputed(teamRaw);

  document.getElementById('topEyebrow').textContent = 'Time · Liderança';
  document.getElementById('topTitle').textContent = team.lider;
  document.getElementById('topSubtitle').textContent = `${team.totalMembros} colaboradores nesta equipe`;

  let membros = team.membros.slice();
  if(state.search.trim()){
    const q = state.search.trim().toLowerCase();
    membros = membros.filter(m => m.nome.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }
  membros = sortMembers(membros);
  const maxQtd = Math.max(1, ...team.membros.map(m=>m.qtd));

  let html = `
  <div class="team-head">
    <div class="team-avatar">${initials(team.lider)}</div>
    <div>
      <h1>${escapeHtml(team.lider)}</h1>
      <p>Equipe direta · acompanhamento de aulas assistidas na Pipelovers</p>
    </div>
  </div>

  ${dataQualityBanner(team)}

  <div class="kpi-grid">
    ${kpiCard('Membros da equipe', team.totalMembros, iconUsers(), `${team.ativos} ativos no período`)}
    ${kpiCard('Aulas assistidas', team.totalAulas, iconPlay(), 'no período selecionado')}
    ${kpiCard('Média por membro', team.media.toFixed(1), iconChart(), 'aulas / colaborador')}
    ${kpiCard('Último acesso do time', team.ultimoAcessoTime ? fmtDateShort(team.ultimoAcessoTime).split(' ')[0] : '—', iconClock(), team.ultimoAcessoTime ? fmtDateShort(team.ultimoAcessoTime).split(' ')[1] : 'sem registros no período')}
  </div>

  <div class="section-head"><h2>Aulas assistidas por membro</h2><span class="hint">período filtrado</span></div>
  <div class="panel">
    <div class="chart-wrap">
      ${team.membros.slice().sort((a,b)=>b.qtd-a.qtd).map(m=>{
        const pct = Math.round((m.qtd/maxQtd)*100);
        return `<div class="bar-row">
          <span class="lbl" title="${escapeHtml(m.nome)}">${escapeHtml(titleCase(m.nome))}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <span class="val">${m.qtd}</span>
        </div>`;
      }).join('')}
    </div>
  </div>

  <div class="section-head"><h2>Colaboradores</h2><span class="hint">clique em um membro para ver as aulas assistidas</span></div>
  <div class="toolbar">
    <div class="toolbar-left">
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" id="memberSearch" placeholder="Buscar por nome ou e-mail…" value="${escapeHtml(state.search)}">
      </div>
    </div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th style="width:24px"></th>
        <th data-sort="nome">Membro <span class="arrow">${sortArrow('nome')}</span></th>
        <th data-sort="qtd">Aulas assistidas <span class="arrow">${sortArrow('qtd')}</span></th>
        <th data-sort="ultimo">Último acesso <span class="arrow">${sortArrow('ultimo')}</span></th>
      </tr></thead>
      <tbody>
        ${membros.map(m=>memberRows(m)).join('') || `<tr><td colspan="4">${emptyState('Nenhum colaborador encontrado.')}</td></tr>`}
      </tbody>
    </table>
  </div>
  `;

  document.getElementById('content').innerHTML = html;

  document.getElementById('memberSearch').addEventListener('input', (e)=>{ state.search = e.target.value; renderContent(); });
  document.querySelectorAll('th[data-sort]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const k = th.dataset.sort;
      if(state.sortKey===k) state.sortDir = state.sortDir==='asc'?'desc':'asc';
      else { state.sortKey=k; state.sortDir = k==='nome' ? 'asc':'desc'; }
      renderContent();
    });
  });
  document.querySelectorAll('tr.row[data-email]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const em = el.dataset.email;
      if(state.expandedRows.has(em)) state.expandedRows.delete(em);
      else state.expandedRows.add(em);
      renderContent();
    });
  });
  document.querySelectorAll('.tag-lead').forEach(el=>{
    el.addEventListener('click', (e)=>{ e.stopPropagation(); setView(el.dataset.gokey); });
  });
}

function memberRows(m){
  const rowId = m.email + '|' + m.nome;
  const expanded = state.expandedRows.has(rowId) || state.expandedRows.has(m.email);
  const subTag = m.lideraTimeKey ? `<span class="tag-lead" data-gokey="${m.lideraTimeKey}">lidera outro time →</span>` : '';
  const lastCls = lastAccessClass(m.ultimoNoPeriodo);
  return `
    <tr class="row ${expanded?'expanded':''}" data-email="${escapeHtml(m.email)}">
      <td class="chev-cell">▸</td>
      <td>
        <div class="name-cell">
          <div class="avatar">${initials(m.nome)}</div>
          <div>
            <div class="member-name">${escapeHtml(titleCase(m.nome))}${subTag}</div>
            <div class="member-email">${escapeHtml(m.emailUsado || m.email)}</div>
          </div>
        </div>
      </td>
      <td><span class="pill ${pillClass(m.qtd)}">${m.qtd}</span></td>
      <td class="last-access ${lastCls}">${m.ultimoNoPeriodo ? fmtDateShort(m.ultimoNoPeriodo) : 'sem acesso no período'}</td>
    </tr>
    <tr class="detail-row ${expanded?'open':''}"><td colspan="4"><div class="detail-inner">
      ${m.aulasFiltradas.length ? `<ul class="lesson-list">${m.aulasFiltradas.map(a=>`
        <li class="lesson-item"><span class="lesson-title">${escapeHtml(a.titulo)}</span><span class="lesson-date">${escapeHtml(a.data)}</span></li>
      `).join('')}</ul>` : `<div class="empty-lessons">Nenhuma aula assistida no período selecionado.</div>`}
    </div></td></tr>
  `;
}

function sortMembers(membros){
  const dir = state.sortDir==='asc' ? 1 : -1;
  const arr = membros.slice();
  arr.sort((a,b)=>{
    if(state.sortKey==='nome') return dir*a.nome.localeCompare(b.nome,'pt-BR');
    if(state.sortKey==='ultimo'){
      const av = a.ultimoNoPeriodo ? a.ultimoNoPeriodo.getTime() : -1;
      const bv = b.ultimoNoPeriodo ? b.ultimoNoPeriodo.getTime() : -1;
      return dir*(av-bv);
    }
    return dir*(a.qtd-b.qtd);
  });
  return arr;
}
function sortArrow(key){ return state.sortKey===key ? (state.sortDir==='asc'?'▲':'▼') : ''; }

/* ---------- Small UI helpers ---------- */
function kpiCard(label, value, icon, sub){
  return `<div class="kpi-card">
    <p class="kpi-label">${icon}${label}</p>
    <p class="kpi-value">${value}</p>
    <p class="kpi-sub">${sub}</p>
  </div>`;
}
function pillClass(qtd){
  if(qtd<=0) return 'zero';
  if(qtd>=8) return 'hi';
  if(qtd>=3) return 'mid';
  return 'low';
}
function lastAccessClass(d){
  if(!d) return 'none';
  return daysAgo(d) > 14 ? 'stale' : '';
}
function emptyState(msg){ return `<div class="empty-state">${msg}</div>`; }
function iconPlay(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4V8z" fill="currentColor" stroke="none"/></svg>`;}
function iconChart(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>`;}
function iconClock(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;}
function iconWarn(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>`;}

let dataQualityDismissed = false;
function dataQualityBanner(team){
  if(dataQualityDismissed) return '';
  const correcoes = CORRECOES.filter(c => team.membros.some(m=>m.nome===c.nome));
  const conflitos = CONFLITOS.filter(c => team.membros.some(m=>m.nome===c.nome));
  if(correcoes.length===0 && conflitos.length===0) return '';
  return `<div class="badge-note">
    ${iconWarn()}
    <div>
      <b>Divergência de e-mail identificada na planilha de membros deste time.</b><br>
      ${correcoes.length? `${correcoes.length} colaborador(es) tiveram o e-mail corrigido automaticamente com base no nome (a planilha trazia o e-mail de outro colega).<br>`:''}
      ${conflitos.length? `${conflitos.length} colaborador(es) estão com e-mail incorreto na planilha e não puderam ser conciliados com segurança — nenhum dado de aula foi atribuído a eles para evitar duplicidade. Recomendamos corrigir a planilha de origem (data/membros.csv).<br>`:''}
      <button onclick="dataQualityDismissed=true; renderContent();">Ok, entendi</button>
    </div>
  </div>`;
}

/* ---------- Main render dispatcher ---------- */
function renderContent(){
  if(state.view === 'overview') renderOverview();
  else renderTeam(state.view);
}

/* ---------- PDF Export ---------- */
document.getElementById('exportPdfBtn').addEventListener('click', exportPdf);

async function exportPdf(){
  const btn = document.getElementById('exportPdfBtn');
  const original = btn.innerHTML;
  btn.setAttribute('disabled','disabled');
  btn.innerHTML = 'Gerando PDF…';
  try{
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({unit:'pt', format:'a4'});
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const renderTarget = document.getElementById('pdf-render');

    const teamsData = TEAMS.map(teamComputed);
    const totalMembros = teamsData.reduce((s,t)=>s+t.totalMembros,0);
    const totalAulas = teamsData.reduce((s,t)=>s+t.totalAulas,0);
    const periodoTxt = `${fmtBRDate(state.dateFrom)} a ${fmtBRDate(state.dateTo)}`;

    renderTarget.innerHTML = pdfCoverHtml(teamsData, totalMembros, totalAulas, periodoTxt);
    await paintPage(pdf, renderTarget, pageW, pageH, true);

    for(const team of teamsData){
      pdf.addPage();
      renderTarget.innerHTML = pdfTeamHtml(team, periodoTxt);
      await paintPage(pdf, renderTarget, pageW, pageH, false);
    }

    pdf.save(`pipelovers-redarbor-performance-${todayStamp()}.pdf`);
    renderTarget.innerHTML = '';
  } catch(err){
    console.error(err);
    alert('Não foi possível gerar o PDF: ' + err.message);
  } finally {
    btn.removeAttribute('disabled');
    btn.innerHTML = original;
  }
}
async function paintPage(pdf, node, pageW, pageH, isFirst){
  const canvas = await html2canvas(node, {backgroundColor:'#0f052e', scale:2, windowWidth:960});
  const imgData = canvas.toDataURL('image/png');
  const ratio = canvas.height / canvas.width;
  const w = pageW;
  const h = w * ratio;
  pdf.addImage(imgData, 'PNG', 0, 0, w, Math.min(h, pageH));
}
function fmtBRDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function todayStamp(){ const d=new Date(); return d.toISOString().slice(0,10); }

function pdfCoverHtml(teamsData, totalMembros, totalAulas, periodoTxt){
  const ranked = teamsData.slice().sort((a,b)=>b.totalAulas-a.totalAulas);
  return `
  <div style="font-family:Poppins,sans-serif;background:#0f052e;color:#ebf2f7;padding:56px 50px;width:960px;min-height:1250px;">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:44px;">
      <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#266ef2,#4c8bff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:19px;">PL</div>
      <div>
        <div style="font-weight:700;font-size:19px;">Pipelovers</div>
        <div style="font-size:12px;color:rgba(235,242,247,.55);">Painel de Performance · Redarbor</div>
      </div>
    </div>
    <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#4c8bff;font-weight:700;margin-bottom:10px;">Relatório de acompanhamento</div>
    <div style="font-size:34px;font-weight:800;line-height:1.2;margin-bottom:10px;">Performance de cursos<br>por liderança e time</div>
    <div style="font-size:13px;color:rgba(235,242,247,.65);margin-bottom:40px;">Período analisado: ${periodoTxt} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    <div style="display:flex;gap:16px;margin-bottom:40px;">
      ${pdfKpi('Colaboradores', totalMembros)}
      ${pdfKpi('Aulas assistidas', totalAulas)}
      ${pdfKpi('Times', teamsData.length)}
      ${pdfKpi('Média/colab.', (totalMembros?(totalAulas/totalMembros):0).toFixed(1))}
    </div>
    <div style="font-size:14px;font-weight:700;margin-bottom:14px;">Ranking de times</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${ranked.map((t,i)=>`
        <div style="display:flex;align-items:center;gap:10px;background:rgba(235,242,247,.04);border:1px solid rgba(235,242,247,.1);border-radius:10px;padding:10px 14px;">
          <div style="width:22px;font-family:monospace;color:rgba(235,242,247,.4);font-size:11px;">${String(i+1).padStart(2,'0')}</div>
          <div style="flex:1;font-size:13px;font-weight:600;">${escapeHtml(t.lider)}</div>
          <div style="font-size:11px;color:rgba(235,242,247,.5);">${t.totalMembros} membros</div>
          <div style="font-family:monospace;font-size:13px;color:#4c8bff;font-weight:700;width:50px;text-align:right;">${t.totalAulas}</div>
        </div>
      `).join('')}
    </div>
  </div>`;
}
function pdfKpi(label, value){
  return `<div style="flex:1;background:rgba(235,242,247,.05);border:1px solid rgba(235,242,247,.12);border-radius:12px;padding:16px;">
    <div style="font-size:10.5px;color:rgba(235,242,247,.55);font-weight:600;margin-bottom:8px;">${label}</div>
    <div style="font-size:24px;font-weight:800;font-family:monospace;">${value}</div>
  </div>`;
}
function pdfTeamHtml(team, periodoTxt){
  const membros = team.membros.slice().sort((a,b)=>b.qtd-a.qtd);
  return `
  <div style="font-family:Poppins,sans-serif;background:#0f052e;color:#ebf2f7;padding:44px 46px;width:960px;min-height:1250px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
      <div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#266ef2,#8a4bff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;">${initials(team.lider)}</div>
      <div>
        <div style="font-size:19px;font-weight:700;">${escapeHtml(team.lider)}</div>
        <div style="font-size:11.5px;color:rgba(235,242,247,.55);">Período: ${periodoTxt}</div>
      </div>
    </div>
    <div style="display:flex;gap:14px;margin:22px 0 26px;">
      ${pdfKpi('Membros', team.totalMembros)}
      ${pdfKpi('Aulas assistidas', team.totalAulas)}
      ${pdfKpi('Ativos', team.ativos)}
      ${pdfKpi('Média/membro', team.media.toFixed(1))}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
      <thead>
        <tr style="border-bottom:1px solid rgba(235,242,247,.18);">
          <th style="text-align:left;padding:8px 6px;color:rgba(235,242,247,.5);font-size:10px;text-transform:uppercase;letter-spacing:.6px;">Colaborador</th>
          <th style="text-align:left;padding:8px 6px;color:rgba(235,242,247,.5);font-size:10px;text-transform:uppercase;letter-spacing:.6px;">E-mail</th>
          <th style="text-align:right;padding:8px 6px;color:rgba(235,242,247,.5);font-size:10px;text-transform:uppercase;letter-spacing:.6px;">Aulas</th>
          <th style="text-align:right;padding:8px 6px;color:rgba(235,242,247,.5);font-size:10px;text-transform:uppercase;letter-spacing:.6px;">Último acesso</th>
        </tr>
      </thead>
      <tbody>
        ${membros.map(m=>`
          <tr style="border-bottom:1px solid rgba(235,242,247,.08);">
            <td style="padding:7px 6px;font-weight:600;">${escapeHtml(titleCase(m.nome))}</td>
            <td style="padding:7px 6px;color:rgba(235,242,247,.6);font-family:monospace;font-size:10.5px;">${escapeHtml(m.emailUsado||m.email)}</td>
            <td style="padding:7px 6px;text-align:right;font-family:monospace;color:#4c8bff;font-weight:700;">${m.qtd}</td>
            <td style="padding:7px 6px;text-align:right;font-family:monospace;font-size:10.5px;color:rgba(235,242,247,.6);">${m.ultimoNoPeriodo? fmtDateShort(m.ultimoNoPeriodo): '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
}

/* ---------- Init ---------- */
async function init(){
  try{
    await loadData();
    state.dateFrom = GLOBAL_MIN_DATE;
    state.dateTo = GLOBAL_MAX_DATE;
    state.selectedLeaders = TEAMS.map(t=>t.key);
    dateFromEl.min = GLOBAL_MIN_DATE; dateFromEl.max = GLOBAL_MAX_DATE; dateFromEl.value = GLOBAL_MIN_DATE;
    dateToEl.min = GLOBAL_MIN_DATE; dateToEl.max = GLOBAL_MAX_DATE; dateToEl.value = GLOBAL_MAX_DATE;
    renderSidebar();
    renderLeaderDropdown();
    updateLeaderSelectLabel();
    renderContent();
  } catch(err){
    console.error(err);
    document.getElementById('content').innerHTML = `
      <div class="panel" style="border-color:rgba(255,176,32,.35);">
        <div class="badge-note" style="margin:0;">
          ${iconWarn()}
          <div>
            <b>Não foi possível carregar os dados.</b><br>
            ${escapeHtml(err.message)}<br><br>
            Confirme se os arquivos <code>data/membros.csv</code> e <code>data/redarbor.csv</code> estão publicados
            junto com o <code>index.html</code> no mesmo repositório/pasta, e se o painel está sendo acessado via
            <b>http(s)://</b> (GitHub Pages) — abrir o arquivo direto do disco (<code>file://</code>) bloqueia o
            carregamento dos CSVs por segurança do navegador.
          </div>
        </div>
      </div>`;
  }
}
init();
