/* ============ RICO GAMES ERP — Financeiro Premium ============ */
const Fin = {
  recs() { return DB.all('financeiro'); },
  venc(r) { return r.vencimento || r.data; },
  emis(r) { return r.emissao || r.data; },
  pagoVal(r) { return r.pago != null ? r.pago : ((r.status === 'pago' || r.status === 'recebido') ? r.valor : 0); },
  restante(r) { return Math.max(0, (r.valor || 0) - this.pagoVal(r)); },
  startToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; },
  status(r) {
    if (r.status === 'cancelado') return 'cancelado';
    const pg = this.pagoVal(r), tot = r.valor || 0, quit = tot > 0 && pg >= tot - 0.005;
    if (r.tipo === 'saida') {
      if (quit) return 'pago';
      if (pg > 0) return 'parcial';
      return new Date(this.venc(r)) < this.startToday() ? 'vencido' : 'pendente';
    } else {
      if (quit) return 'recebido';
      if (pg > 0) return 'parcial';
      return new Date(this.venc(r)) < this.startToday() ? 'vencido' : 'areceber';
    }
  },
  isOpen(r) { const s = this.status(r); return s !== 'pago' && s !== 'recebido' && s !== 'cancelado'; },
  monthOf(d, off) { const x = new Date(d), n = new Date(), m = new Date(n.getFullYear(), n.getMonth() + (off || 0), 1); return x.getMonth() === m.getMonth() && x.getFullYear() === m.getFullYear(); },
  diasAte(d) { const v = new Date(this.venc({ vencimento: d })); v.setHours(0, 0, 0, 0); return Math.round((v - this.startToday()) / 86400000); },
  // saldos
  totalRecebido() { return this.recs().filter(r => r.tipo === 'entrada' && r.status !== 'cancelado').reduce((s, r) => s + this.pagoVal(r), 0); },
  totalSaidasPagas() { return this.recs().filter(r => r.tipo === 'saida' && r.status !== 'cancelado').reduce((s, r) => s + this.pagoVal(r), 0); },
  disponivel() { return this.totalRecebido() - this.totalSaidasPagas(); },
  caixaFisico() { return (typeof Caixa !== 'undefined') ? Caixa.saldo() : 0; },
  banco() { return this.disponivel() - this.caixaFisico(); },
  // obrigações por mês (por vencimento)
  obrigMes(tipo, off) { return this.recs().filter(r => r.tipo === tipo && r.status !== 'cancelado' && this.monthOf(this.venc(r), off)).reduce((s, r) => s + (r.valor || 0), 0); },
  abertoMes(tipo) { return this.recs().filter(r => r.tipo === tipo && this.isOpen(r) && this.monthOf(this.venc(r))).reduce((s, r) => s + this.restante(r), 0); },
  vencidoAberto(tipo) { return this.recs().filter(r => r.tipo === tipo && this.isOpen(r) && new Date(this.venc(r)) < this.startToday()).reduce((s, r) => s + this.restante(r), 0); },
  abertoAteDias(tipo, dias) { return this.recs().filter(r => r.tipo === tipo && this.isOpen(r)).filter(r => { const d = this.diasAte(this.venc(r)); return d >= 0 && d <= dias; }).reduce((s, r) => s + this.restante(r), 0); },
  // projeção diária
  projDaily(dias) {
    const today = this.startToday(), open = this.recs().filter(r => this.isOpen(r));
    let saldo = this.disponivel();
    open.forEach(r => { if (this.diasAte(this.venc(r)) < 0) saldo += (r.tipo === 'entrada' ? this.restante(r) : -this.restante(r)); });
    const pts = [];
    for (let i = 0; i <= dias; i++) {
      if (i > 0) open.forEach(r => { if (this.diasAte(this.venc(r)) === i) saldo += (r.tipo === 'entrada' ? this.restante(r) : -this.restante(r)); });
      const day = new Date(today); day.setDate(day.getDate() + i);
      pts.push({ i, date: day, saldo });
    }
    return pts;
  },
  projMonthly(meses) {
    const today = this.startToday(), open = this.recs().filter(r => this.isOpen(r));
    let saldo = this.disponivel();
    open.forEach(r => { if (this.diasAte(this.venc(r)) < 0) saldo += (r.tipo === 'entrada' ? this.restante(r) : -this.restante(r)); });
    const pts = [{ i: 0, date: new Date(today), saldo }];
    for (let mo = 1; mo <= meses; mo++) {
      const mDate = new Date(today.getFullYear(), today.getMonth() + mo, 1);
      open.forEach(r => { const v = new Date(this.venc(r)); if (v.getFullYear() === mDate.getFullYear() && v.getMonth() === mDate.getMonth()) saldo += (r.tipo === 'entrada' ? this.restante(r) : -this.restante(r)); });
      pts.push({ i: mo, date: mDate, saldo });
    }
    return pts;
  },
  fornNome(id) { const f = DB.get('fornecedores', id); return f ? f.nome : ''; }
};

function finBadge(s) {
  const map = { pendente: ['b-amber', 'Pendente'], pago: ['b-green', 'Pago'], parcial: ['b-parcial', 'Parcial'], vencido: ['b-vencido', 'Vencido'], cancelado: ['b-gray', 'Cancelado'], recebido: ['b-green', 'Recebido'], areceber: ['b-amber', 'A receber'] };
  const m = map[s] || ['b-gray', s]; return `<span class="badge ${m[0]}">${m[1]}</span>`;
}

Modules.finState = { tab: 'overview', periodo: 30, cal: null };

Modules.financeiro = function () {
  if (!this.finState.cal) this.finState.cal = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const tabs = [['overview', '📊 Visão geral'], ['pagar', '🔴 Contas a pagar'], ['receber', '🟢 Contas a receber'], ['produtos', '🔎 Análise por produto'], ['calendario', '📅 Calendário'], ['fluxo', '📈 Fluxo projetado'], ['conciliacao', '✅ Conciliação'], ['relatorios', '📄 Relatórios']];
  setTimeout(() => Modules.finRenderTab(), 20);
  return `
  <div class="page-head"><div><h1>Financeiro</h1><p>Gestão de fluxo de caixa, obrigações e recebíveis</p></div>
    <div class="actions"><button class="btn-ghost" onclick="Modules.finForm('entrada')">+ Conta a receber</button><button class="btn-primary" onclick="Modules.finForm('saida')">+ Conta a pagar</button></div></div>
  <div class="tabs" id="fin-subnav">
    ${tabs.map(t => `<div class="tab ${this.finState.tab === t[0] ? 'active' : ''}" onclick="Modules.finSetTab('${t[0]}')">${t[1]}</div>`).join('')}
  </div>
  <div id="fin-body"></div>`;
};
Modules.finSetTab = function (t) {
  this.finState.tab = t;
  const keys = ['overview', 'pagar', 'receber', 'produtos', 'calendario', 'fluxo', 'conciliacao', 'relatorios'];
  document.querySelectorAll('#fin-subnav .tab').forEach((el, i) => el.classList.toggle('active', keys[i] === t));
  this.finRenderTab();
};
Modules.finInit = function () { this.finRenderTab(); };
Modules.finRenderTab = function () {
  const b = document.getElementById('fin-body'); if (!b) return;
  const t = this.finState.tab;
  if (t === 'overview') b.innerHTML = this.finOverview();
  else if (t === 'pagar') b.innerHTML = this.finLista('saida');
  else if (t === 'receber') b.innerHTML = this.finLista('entrada');
  else if (t === 'produtos') b.innerHTML = this.finProdutos();
  else if (t === 'calendario') b.innerHTML = this.finCalendario();
  else if (t === 'fluxo') { b.innerHTML = this.finFluxo(); }
  else if (t === 'conciliacao') b.innerHTML = this.finConciliacao();
  else if (t === 'relatorios') b.innerHTML = this.finRelatorios();
};

/* ---------- VISÃO GERAL ---------- */
Modules.finOverview = function () {
  const F = Fin;
  const cmp = (a, b) => { if (!b) return ''; const p = (a - b) / b * 100; return `<span class="kpi-cmp ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs mês ant.</span>`; };
  const pagarMes = F.obrigMes('saida'), pagarAnt = F.obrigMes('saida', -1);
  const recebMes = F.obrigMes('entrada'), recebAnt = F.obrigMes('entrada', -1);
  const fluxoPrev = F.abertoMes('entrada') - F.abertoMes('saida');
  const venPagar = F.vencidoAberto('saida'), venReceber = F.vencidoAberto('entrada');
  const proj30 = F.disponivel() + F.abertoAteDias('entrada', 30) - F.abertoAteDias('saida', 30);
  const vv = DB.all('vendas').filter(v => !v.cancelada);
  const txFn = v => (typeof Taxas !== 'undefined') ? Taxas.feeVenda(v) : 0;
  const txMes = vv.filter(v => F.monthOf(v.data)).reduce((s, v) => s + txFn(v), 0);
  const txDia = vv.filter(v => new Date(v.data).toDateString() === new Date().toDateString()).reduce((s, v) => s + txFn(v), 0);
  // alertas
  const open = F.recs().filter(r => F.isOpen(r));
  const vencidas = open.filter(r => F.diasAte(F.venc(r)) < 0);
  const hoje = open.filter(r => F.diasAte(F.venc(r)) === 0);
  const sete = open.filter(r => { const d = F.diasAte(F.venc(r)); return d > 0 && d <= 7; });
  const proj = F.projDaily(30); const negativo = proj.find(p => p.saldo < 0);
  const sum = arr => arr.reduce((s, r) => s + F.restante(r), 0);

  return `
  <div class="alerts">
    ${vencidas.length ? `<div class="alert-card danger"><div class="a-ico">⏰</div><div><div class="a-val">${Fmt.brl(sum(vencidas))}</div><div class="a-lbl">${vencidas.length} conta(s) vencida(s)</div></div></div>` : `<div class="alert-card ok"><div class="a-ico">✅</div><div><div class="a-val">Em dia</div><div class="a-lbl">Nenhuma conta vencida</div></div></div>`}
    ${hoje.length ? `<div class="alert-card warn"><div class="a-ico">📌</div><div><div class="a-val">${Fmt.brl(sum(hoje))}</div><div class="a-lbl">Vence hoje (${hoje.length})</div></div></div>` : ''}
    <div class="alert-card warn"><div class="a-ico">🗓️</div><div><div class="a-val">${Fmt.brl(sum(sete))}</div><div class="a-lbl">Vence em 7 dias (${sete.length})</div></div></div>
    ${venReceber ? `<div class="alert-card danger"><div class="a-ico">📥</div><div><div class="a-val">${Fmt.brl(venReceber)}</div><div class="a-lbl">Recebimentos atrasados</div></div></div>` : ''}
    ${negativo ? `<div class="alert-card danger"><div class="a-ico">⚠️</div><div><div class="a-val">${Fmt.brl(negativo.saldo)}</div><div class="a-lbl">Saldo negativo em ${Fmt.date(negativo.date)}</div></div></div>` : `<div class="alert-card ok"><div class="a-ico">📈</div><div><div class="a-val">Saudável</div><div class="a-lbl">Sem furo de caixa em 30d</div></div></div>`}
  </div>

  <div class="grid kpis" style="margin-bottom:16px">
    <div class="card kpi kpi-hero"><div class="kpi-ico">💰</div><div class="kpi-label">Total disponível</div><div class="kpi-value">${Fmt.brl(F.disponivel())}</div><div class="kpi-sub">Caixa ${Fmt.brl(F.caixaFisico())} · Banco ${Fmt.brl(F.banco())}</div></div>
    ${kpi('Saldo em caixa (loja)', Fmt.brl(F.caixaFisico()), 'dinheiro físico', '🪙', '')}
    ${kpi('Saldo bancário (estim.)', Fmt.brl(F.banco()), 'recebido − pago − caixa', '🏦', 'blue')}
  </div>

  <div class="grid kpis" style="margin-bottom:16px">
    <div class="card kpi red"><div class="kpi-ico">🔴</div><div class="kpi-label">Contas a pagar do mês</div><div class="kpi-value">${Fmt.brl(pagarMes)}</div>${cmp(pagarMes, pagarAnt)}</div>
    <div class="card kpi"><div class="kpi-ico">🟢</div><div class="kpi-label">Contas a receber do mês</div><div class="kpi-value">${Fmt.brl(recebMes)}</div>${cmp(recebMes, recebAnt)}</div>
    ${kpi('Fluxo líquido previsto (mês)', Fmt.brl(fluxoPrev), 'a receber − a pagar', fluxoPrev >= 0 ? '📈' : '📉', fluxoPrev >= 0 ? '' : 'red')}
    ${kpi('Resultado projetado 30 dias', Fmt.brl(proj30), 'saldo + recebíveis − contas', '🔮', 'purple')}
  </div>

  <div class="grid kpis" style="margin-bottom:20px">
    ${kpi('Vencido a pagar', Fmt.brl(venPagar), null, '⏰', 'red')}
    ${kpi('Vencido a receber', Fmt.brl(venReceber), null, '📥', 'amber')}
    ${kpi('A pagar (em aberto)', Fmt.brl(F.recs().filter(r => r.tipo === 'saida' && F.isOpen(r)).reduce((s, r) => s + F.restante(r), 0)), null, '🧾', '')}
    ${kpi('Taxas pagas (mês)', Fmt.brl(txMes), 'Hoje: ' + Fmt.brl(txDia), '💳', 'red')}
  </div>

  <div class="grid cols-2">
    <div class="fin-chart"><div class="section-title">Fluxo de caixa projetado (30 dias)</div>${this.finChartSvg(F.projDaily(30), false)}</div>
    <div class="card"><div class="section-title">Caixa da Loja <a onclick="App.go('caixa')">Abrir →</a></div>
      ${(typeof Caixa !== 'undefined') ? `
        <div class="mini-stat"><span>🪙 Saldo físico</span><b>${Fmt.brl(Caixa.saldo())}</b></div>
        <div class="mini-stat"><span>⬆️ Entradas hoje</span><b style="color:var(--green)">${Fmt.brl(Caixa.somaHoje('entrada'))}</b></div>
        <div class="mini-stat"><span>🏦 Depósitos hoje</span><b>${Fmt.brl(Caixa.somaHoje('saida', m => m.tipo === 'Depósito bancário'))}</b></div>
        <div class="mini-stat"><span>🧾 Despesas pelo caixa hoje</span><b style="color:var(--red)">${Fmt.brl(Caixa.somaHoje('saida', m => m.tipo === 'Despesa pelo caixa'))}</b></div>
        <div class="mini-stat"><span>⬇️ Sangrias hoje</span><b>${Fmt.brl(Caixa.somaHoje('saida', m => m.tipo === 'Sangria'))}</b></div>
        <p class="muted" style="margin-top:10px;font-size:12px">Sincronizado automaticamente com o módulo Caixa.</p>` : '<p class="muted">Módulo Caixa indisponível.</p>'}
    </div>
  </div>`;
};

/* ---------- LISTA (Pagar / Receber) ---------- */
Modules.finLista = function (tipo) {
  const F = Fin, ehPagar = tipo === 'saida';
  let list = F.recs().filter(r => r.tipo === tipo).slice().sort((a, b) => new Date(F.venc(a)) - new Date(F.venc(b)));
  const totAberto = list.filter(r => F.isOpen(r)).reduce((s, r) => s + F.restante(r), 0);
  const totVencido = F.vencidoAberto(tipo);
  const filtroId = ehPagar ? 'fp-filtro' : 'fr-filtro';
  return `
  <div class="grid kpis" style="margin-bottom:16px">
    ${kpi(ehPagar ? 'Total a pagar (aberto)' : 'Total a receber (aberto)', Fmt.brl(totAberto), null, ehPagar ? '🔴' : '🟢', ehPagar ? 'red' : '')}
    ${kpi('Vencido', Fmt.brl(totVencido), null, '⏰', 'amber')}
    ${kpi('Lançamentos', Fmt.num(list.length), null, '🧾', 'blue')}
    ${kpi(ehPagar ? 'Pago no mês' : 'Recebido no mês', Fmt.brl(list.filter(r => F.monthOf(F.venc(r)) && (F.status(r) === 'pago' || F.status(r) === 'recebido')).reduce((s, r) => s + F.pagoVal(r), 0)), null, '✅', '')}
  </div>
  <div class="toolbar">
    <select id="${filtroId}" onchange="Modules.finRenderTab()"><option value="">Todos os status</option>
      ${(ehPagar ? ['pendente', 'parcial', 'vencido', 'pago', 'cancelado'] : ['areceber', 'parcial', 'vencido', 'recebido', 'cancelado']).map(s => `<option value="${s}">${finBadge(s).replace(/<[^>]+>/g, '')}</option>`).join('')}
    </select>
    <input class="grow" id="${ehPagar ? 'fp-q' : 'fr-q'}" placeholder="Buscar descrição..." oninput="Modules.finRenderTab()">
    <button class="btn-ghost" onclick="Modules.finForm('${tipo}')">+ Novo</button>
    <button class="btn-ghost" onclick="Modules.finExportLista('${tipo}','xlsx')">⬇️ Excel</button>
    <button class="btn-ghost" onclick="Modules.finExportLista('${tipo}','pdf')">🖨️ PDF</button>
  </div>
  <div id="${ehPagar ? 'fp-table' : 'fr-table'}">${this.finListaTable(tipo)}</div>`;
};
Modules.finListaTable = function (tipo) {
  const F = Fin, ehPagar = tipo === 'saida';
  const fst = fval(ehPagar ? 'fp-filtro' : 'fr-filtro'), q = (fval(ehPagar ? 'fp-q' : 'fr-q') || '').toLowerCase();
  let list = F.recs().filter(r => r.tipo === tipo).slice().sort((a, b) => new Date(F.venc(a)) - new Date(F.venc(b)));
  if (fst) list = list.filter(r => F.status(r) === fst);
  if (q) list = list.filter(r => (r.descricao || '').toLowerCase().includes(q));
  const head = ehPagar
    ? `<th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th>Emissão</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Restante</th><th>Status</th><th></th>`
    : `<th>Descrição</th><th>Origem</th><th>Emissão</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Recebido</th><th class="num">Restante</th><th>Forma</th><th>Status</th><th></th>`;
  const rows = list.map(r => {
    const st = F.status(r), dias = F.diasAte(F.venc(r)), open = F.isOpen(r);
    const vencCol = `${Fmt.date(F.venc(r))}${open && dias < 0 ? ` <span class="muted" style="color:var(--red)">${-dias}d atraso</span>` : open && dias <= 7 ? ` <span class="muted">${dias === 0 ? 'hoje' : 'em ' + dias + 'd'}</span>` : ''}`;
    const acoes = open && st !== 'cancelado'
      ? `<button class="btn-ghost btn-sm" onclick="Modules.finPagar('${r.id}')">${ehPagar ? '✓ Pagar' : '✓ Receber'}</button> <button class="btn-icon" onclick="Modules.finForm('${tipo}','${r.id}')">✏️</button>`
      : `<button class="btn-icon" onclick="Modules.finForm('${tipo}','${r.id}')">✏️</button>`;
    return ehPagar
      ? `<tr><td class="strong">${esc(r.descricao)}</td><td>${esc(r.categoria || '—')}</td><td>${esc(F.fornNome(r.fornecedorId) || '—')}</td><td>${Fmt.date(F.emis(r))}</td><td>${vencCol}</td><td class="num">${Fmt.brl(r.valor)}</td><td class="num muted">${Fmt.brl(F.pagoVal(r))}</td><td class="num strong">${Fmt.brl(F.restante(r))}</td><td>${finBadge(st)}</td><td class="num">${acoes}</td></tr>`
      : `<tr><td class="strong">${esc(r.descricao)}</td><td>${esc(r.subcategoria || r.categoria || '—')}</td><td>${Fmt.date(F.emis(r))}</td><td>${vencCol}</td><td class="num">${Fmt.brl(r.valor)}</td><td class="num muted">${Fmt.brl(F.pagoVal(r))}</td><td class="num strong">${Fmt.brl(F.restante(r))}</td><td>${esc(r.formaPagamento || '—')}</td><td>${finBadge(st)}</td><td class="num">${acoes}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="10" class="muted" style="text-align:center;padding:30px">Nenhum lançamento.</td></tr>`}</tbody></table></div>`;
};

/* ---------- Pagar / Receber (parcial) ---------- */
Modules.finPagar = function (id) {
  const F = Fin, r = DB.get('financeiro', id), ehPagar = r.tipo === 'saida', rest = F.restante(r);
  Modal.open({
    title: (ehPagar ? '✓ Registrar pagamento' : '✓ Registrar recebimento') + ' — ' + esc(r.descricao),
    body: `<div class="card" style="background:var(--bg-2);margin-bottom:14px">
        <div class="mini-stat"><span>Valor total</span><b>${Fmt.brl(r.valor)}</b></div>
        <div class="mini-stat"><span>Já ${ehPagar ? 'pago' : 'recebido'}</span><b>${Fmt.brl(F.pagoVal(r))}</b></div>
        <div class="mini-stat"><span>Restante</span><b style="color:var(--green)">${Fmt.brl(rest)}</b></div></div>
      <div class="form-grid">
        <div class="field"><label>Valor a ${ehPagar ? 'pagar' : 'receber'} agora (R$)</label><input id="fp-valor" type="number" step="0.01" value="${rest.toFixed(2)}"></div>
        <div class="field"><label>Forma</label><select id="fp-forma">${['PIX', 'Dinheiro', 'Débito', 'Crédito', 'Boleto', 'Transferência'].map(f => `<option ${r.formaPagamento === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="field full"><label>Observação</label><input id="fp-obs" value="${esc(r.obs || '')}"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--txt-2)"><input type="checkbox" id="fp-caixa"> ${ehPagar ? 'Pagar com dinheiro do Caixa da Loja' : 'Entrou no Caixa da Loja (dinheiro)'}</label>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.finConfirmPagar('${id}')">Confirmar</button>`
  });
};
Modules.finConfirmPagar = function (id) {
  const F = Fin, r = DB.get('financeiro', id), ehPagar = r.tipo === 'saida';
  let v = fnum('fp-valor'); if (v <= 0) return Toast.err('Informe um valor.');
  const rest = F.restante(r); if (v > rest) v = rest;
  const novoPago = F.pagoVal(r) + v;
  const quit = novoPago >= (r.valor || 0) - 0.005;
  DB.update('financeiro', id, { pago: novoPago, status: quit ? (ehPagar ? 'pago' : 'recebido') : 'parcial', formaPagamento: fval('fp-forma'), obs: fval('fp-obs') });
  if (fchk('fp-caixa') && typeof Caixa !== 'undefined') {
    if (ehPagar) Caixa.add({ fluxo: 'saida', tipo: 'Despesa pelo caixa', origem: 'Pagamento de conta', categoria: r.categoria || 'Conta', valor: v, obs: r.descricao });
    else Caixa.add({ fluxo: 'entrada', tipo: 'Recebimento', origem: 'Recebimento de conta', categoria: 'Recebível', valor: v, obs: r.descricao });
  }
  DB.logMov(ehPagar ? 'compra' : 'venda', (ehPagar ? 'Pagamento' : 'Recebimento') + ': ' + r.descricao + (quit ? '' : ' (parcial)'), { valor: v });
  Modal.close(); Toast.ok(ehPagar ? 'Pagamento registrado.' : 'Recebimento registrado.'); this.finRenderTab();
};

/* ---------- Form ---------- */
Modules.finForm = function (tipo, id) {
  const ehPagar = tipo === 'saida', r = id ? DB.get('financeiro', id) : {};
  const cats = ehPagar
    ? ['Aluguel', 'Funcionários', 'Impostos', 'Marketing', 'Compras de mercadorias', 'Fretes', 'Manutenção', 'Limpeza', 'Água', 'Energia', 'Internet', 'Telefonia', 'Contabilidade', 'Outros']
    : ['Vendas', 'Recebíveis', 'Crediário', 'Marketplace', 'Serviços', 'Outros'];
  const today = new Date().toISOString().slice(0, 10);
  const dval = k => (r[k] ? new Date(r[k]).toISOString().slice(0, 10) : today);
  Modal.open({
    title: (id ? 'Editar' : 'Nova') + (ehPagar ? ' conta a pagar' : ' conta a receber'), wide: true,
    body: `<div class="form-grid">
      <div class="field full"><label>Descrição *</label><input id="ff-desc" value="${esc(r.descricao || '')}"></div>
      <div class="field"><label>Categoria</label><select id="ff-cat">${cats.map(c => `<option ${r.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>${ehPagar ? 'Subcategoria' : 'Origem'}</label><input id="ff-sub" value="${esc(ehPagar ? (r.subcategoria || '') : (r.subcategoria || ''))}" placeholder="${ehPagar ? 'opcional' : 'Ex: Pedido #2548'}"></div>
      ${ehPagar ? `<div class="field"><label>Fornecedor</label><select id="ff-forn"><option value="">—</option>${DB.all('fornecedores').map(f => `<option value="${f.id}" ${r.fornecedorId === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></div>` : `<div class="field"><label>Forma de recebimento</label><select id="ff-forma">${['PIX', 'Dinheiro', 'Débito', 'Crédito', 'Boleto', 'Transferência'].map(f => `<option ${r.formaPagamento === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>`}
      <div class="field"><label>Data de emissão</label><input id="ff-emis" type="date" value="${dval('emissao')}"></div>
      <div class="field"><label>Data de vencimento</label><input id="ff-venc" type="date" value="${dval('vencimento')}"></div>
      <div class="field"><label>Valor total (R$) *</label><input id="ff-valor" type="number" step="0.01" value="${r.valor || 0}"></div>
      ${ehPagar ? `<div class="field"><label>Forma de pagamento</label><select id="ff-forma">${['Boleto', 'PIX', 'Dinheiro', 'Débito', 'Crédito', 'Transferência'].map(f => `<option ${r.formaPagamento === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>` : `<div class="field"><label>Valor já recebido (R$)</label><input id="ff-pago" type="number" step="0.01" value="${r.pago || 0}"></div>`}
      <div class="field full"><label>Observações</label><textarea id="ff-obs">${esc(r.obs || '')}</textarea></div>
    </div>`,
    foot: `${id ? `<button class="btn-danger" style="margin-right:auto" onclick="Modules.finCancelar('${id}')">Cancelar conta</button>` : ''}<button class="btn-ghost" onclick="Modal.close()">Voltar</button><button class="btn-primary" onclick="Modules.finSave('${tipo}','${id || ''}')">Salvar</button>`
  });
};
Modules.finSave = function (tipo, id) {
  const ehPagar = tipo === 'saida', desc = fval('ff-desc'), valor = fnum('ff-valor');
  if (!desc || valor <= 0) return Toast.err('Informe descrição e valor.');
  const data = {
    tipo, descricao: desc, categoria: fval('ff-cat'), subcategoria: fval('ff-sub'),
    emissao: new Date(fval('ff-emis')).toISOString(), vencimento: new Date(fval('ff-venc')).toISOString(),
    data: new Date(fval('ff-venc')).toISOString(), valor, formaPagamento: fval('ff-forma'), obs: fval('ff-obs'), origem: 'manual'
  };
  if (ehPagar) data.fornecedorId = fval('ff-forn') || null;
  else data.pago = fnum('ff-pago') || 0;
  if (id) { const cur = DB.get('financeiro', id); data.pago = ehPagar ? (cur.pago || 0) : data.pago; DB.update('financeiro', id, data); Toast.ok('Conta atualizada.'); }
  else { data.pago = data.pago || 0; data.conciliado = false; DB.insert('financeiro', data); Toast.ok('Conta lançada.'); }
  Modal.close(); this.finRenderTab();
};
Modules.finCancelar = function (id) {
  Modal.confirm('Cancelar esta conta? Ela deixa de contar no fluxo.', () => { DB.update('financeiro', id, { status: 'cancelado' }); Modal.close(); Toast.ok('Conta cancelada.'); this.finRenderTab(); }, 'Cancelar conta');
};

/* ---------- Análise Financeira por Produto ---------- */
Modules.finProdutos = function () {
  const items = BI.prods().map(p => ({ sku: p.sku, nome: p.nome }));
  MSelect.setup('finprod', items, () => Modules.finProdRender());
  setTimeout(() => { MSelect.mount('finprod'); Modules.finProdRender(); }, 20);
  return `
  <div class="card" style="margin-bottom:16px"><div class="section-title">Análise financeira por produto</div>
    <p class="muted" style="line-height:1.6;margin-bottom:14px">Selecione um ou vários produtos para ver receita, custo, lucro, margens, ticket e participação no faturamento e no lucro. Compare lado a lado.</p>
    <div class="toolbar" style="margin-bottom:4px">
      <select id="fpz-per" onchange="Modules.finProdRender()">${periodOptsHtml('30d')}</select>
      <span id="fpz-custom" style="display:none;gap:8px;align-items:center"><input type="date" id="fpz-de" onchange="Modules.finProdRender()"><span class="muted">até</span><input type="date" id="fpz-ate" onchange="Modules.finProdRender()"></span>
    </div>
    ${MSelect.html('finprod', 'Buscar e selecionar produtos...')}
  </div>
  <div id="finprod-res"></div>`;
};
Modules.finProdRender = function () {
  const host = document.getElementById('finprod-res'); if (!host) return;
  const per = fval('fpz-per') || '30d';
  const cc = document.getElementById('fpz-custom'); if (cc) cc.style.display = per === 'custom' ? 'inline-flex' : 'none';
  const vendas = per === 'all' ? BI.vendas() : BI.vendasPeriodo(per, fval('fpz-de'), fval('fpz-ate'));
  const aggAll = BI.agg(vendas);
  const totReceita = aggAll.reduce((s, x) => s + x.receita, 0), totLucro = aggAll.reduce((s, x) => s + x.lucro, 0);
  const rng = per === 'all' ? null : BI.range(per, fval('fpz-de'), fval('fpz-ate'));
  const despTotal = (typeof Fin !== 'undefined') ? DB.all('financeiro').filter(f => f.tipo === 'saida' && f.status !== 'cancelado' && f.origem !== 'compra' && f.origem !== 'venda' && f.origem !== 'usado').filter(f => { if (!rng) return true; const d = new Date(Fin.venc(f)); return d >= rng.start && d <= rng.end; }).reduce((s, f) => s + Fin.pagoVal(f), 0) : 0;
  const sel = MSelect.selected('finprod');
  if (!sel.length) { host.innerHTML = '<div class="empty-state"><div class="big">🔎</div>Selecione um ou mais produtos acima para ver a análise financeira.</div>'; return; }
  const rows = sel.map(sku => {
    const a = aggAll.find(x => x.sku === sku) || { sku, nome: (BI.prodInfo(sku) || {}).nome || sku, qtd: 0, receita: 0, custo: 0, lucro: 0, margemV: 0, margemC: 0, ticket: 0 };
    a.partFat = totReceita ? a.receita / totReceita * 100 : 0;
    a.partLuc = totLucro ? a.lucro / totLucro * 100 : 0;
    a.liquido = a.lucro - (totReceita ? despTotal * (a.receita / totReceita) : 0);
    return a;
  });
  const T = rows.reduce((s, x) => ({ qtd: s.qtd + x.qtd, receita: s.receita + x.receita, custo: s.custo + x.custo, lucro: s.lucro + x.lucro }), { qtd: 0, receita: 0, custo: 0, lucro: 0 });
  const Tliq = T.lucro - (totReceita ? despTotal * (T.receita / totReceita) : 0);
  const Torders = rows.reduce((s, x) => s + (x.orders || 0), 0);
  host.innerHTML = `
  <div class="grid kpis" style="margin-bottom:16px">
    ${kpi('Receita (seleção)', Fmt.brl(T.receita), sel.length + ' produto(s)', '💵', '')}
    ${kpi('Lucro bruto', Fmt.brl(T.lucro), 'Custo ' + Fmt.brl(T.custo), '📈', '')}
    ${kpi('Lucro líquido (rateio)', Fmt.brl(Tliq), 'após despesas proporcionais', '💎', 'purple')}
    <div class="card kpi blue"><div class="kpi-ico">📐</div><div class="kpi-label">Margem</div><div class="kpi-value">${Fmt.pct(T.receita ? T.lucro / T.receita * 100 : 0)}</div><div class="kpi-sub">s/ venda · ${Fmt.pct(T.custo ? T.lucro / T.custo * 100 : 0)} s/ custo</div></div>
  </div>
  <div class="grid kpis" style="margin-bottom:18px">
    ${kpi('Qtd vendida', Fmt.num(T.qtd), 'unidades', '📦', 'blue')}
    ${kpi('Ticket médio', Fmt.brl(Torders ? T.receita / Torders : 0), null, '🎟️', '')}
    ${kpi('Participação no faturamento', Fmt.pct(totReceita ? T.receita / totReceita * 100 : 0), 'do total do período', '🥧', 'amber')}
    ${kpi('Participação no lucro', Fmt.pct(totLucro ? T.lucro / totLucro * 100 : 0), 'do total do período', '🏆', '')}
  </div>
  <div class="card"><div class="section-title">Comparação por produto</div>
    <div class="table-wrap" style="border:none"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Receita</th><th class="num">Custo</th><th class="num">Lucro bruto</th><th class="num">Lucro líq.</th><th class="num">Mrg venda</th><th class="num">Mrg custo</th><th class="num">Ticket</th><th class="num">% Fat.</th><th class="num">% Lucro</th></tr></thead>
    <tbody>${rows.map(x => `<tr><td class="strong">${esc(x.nome)}</td><td class="num">${x.qtd}</td><td class="num">${Fmt.brl(x.receita)}</td><td class="num muted">${Fmt.brl(x.custo)}</td><td class="num" style="color:var(--green)">${Fmt.brl(x.lucro)}</td><td class="num">${Fmt.brl(x.liquido)}</td><td class="num">${Fmt.pct(x.margemV)}</td><td class="num">${Fmt.pct(x.margemC)}</td><td class="num">${Fmt.brl(x.ticket)}</td><td class="num"><span class="badge b-blue">${Fmt.pct(x.partFat)}</span></td><td class="num"><span class="badge b-green">${Fmt.pct(x.partLuc)}</span></td></tr>`).join('')}</tbody></table></div></div>`;
};

/* ---------- Calendário ---------- */
Modules.finCalendario = function () {
  if (!this.finState.cal) this.finState.cal = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const F = Fin, base = this.finState.cal, y = base.getFullYear(), mo = base.getMonth();
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const first = new Date(y, mo, 1).getDay(), dim = new Date(y, mo + 1, 0).getDate(), todayStr = new Date().toDateString();
  let cells = '';
  for (let i = 0; i < first; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= dim; d++) {
    const date = new Date(y, mo, d);
    const recs = F.recs().filter(r => { const v = new Date(F.venc(r)); return v.getFullYear() === y && v.getMonth() === mo && v.getDate() === d && r.status !== 'cancelado'; });
    const pay = recs.filter(r => r.tipo === 'saida'), rec = recs.filter(r => r.tipo === 'entrada');
    const payV = pay.reduce((s, r) => s + (F.isOpen(r) ? F.restante(r) : r.valor), 0);
    const recV = rec.reduce((s, r) => s + (F.isOpen(r) ? F.restante(r) : r.valor), 0);
    cells += `<div class="cal-cell ${date.toDateString() === todayStr ? 'today' : ''}" onclick="Modules.finCalDay('${date.toISOString()}')">
      <div class="cd-num">${d}</div>
      ${payV ? `<span class="cal-tag pay">↓ ${Fmt.brl(payV)}</span>` : ''}
      ${recV ? `<span class="cal-tag rec">↑ ${Fmt.brl(recV)}</span>` : ''}
    </div>`;
  }
  return `
  <div class="cal">
    <div class="cal-head">
      <button class="btn-icon" onclick="Modules.finCalNav(-1)">‹</button>
      <strong>${meses[mo]} ${y}</strong>
      <button class="btn-icon" onclick="Modules.finCalNav(1)">›</button>
    </div>
    <div class="cal-grid">
      ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
  </div>
  <div class="cal-legend"><span><i class="dotc" style="background:var(--red)"></i> Contas a pagar</span><span><i class="dotc" style="background:var(--green)"></i> Contas a receber</span><span><i class="dotc" style="background:var(--green-soft)"></i> Hoje</span><span class="muted">Clique em um dia para ver os lançamentos.</span></div>`;
};
Modules.finCalNav = function (d) { const c = this.finState.cal; this.finState.cal = new Date(c.getFullYear(), c.getMonth() + d, 1); this.finRenderTab(); };
Modules.finCalDay = function (iso) {
  const F = Fin, date = new Date(iso);
  const recs = F.recs().filter(r => { const v = new Date(F.venc(r)); return v.toDateString() === date.toDateString() && r.status !== 'cancelado'; });
  Modal.open({
    title: '📅 ' + Fmt.date(date),
    body: recs.length ? `<div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Tipo</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody>${recs.map(r => `<tr><td>${esc(r.descricao)}</td><td><span class="badge ${r.tipo === 'entrada' ? 'b-green' : 'b-red'}">${r.tipo === 'entrada' ? '↑ Receber' : '↓ Pagar'}</span></td><td class="num strong">${Fmt.brl(r.valor)}</td><td>${finBadge(F.status(r))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum lançamento neste dia.</p>',
    foot: `<button class="btn-ghost" onclick="Modal.close()">Fechar</button>`
  });
};

/* ---------- Fluxo projetado ---------- */
Modules.finFluxo = function () {
  const p = this.finState.periodo;
  const pts = p === 365 ? Fin.projMonthly(12) : Fin.projDaily(p);
  const fim = pts[pts.length - 1].saldo, min = Math.min(...pts.map(x => x.saldo));
  return `
  <div class="card" style="margin-bottom:16px">
    <div class="section-title" style="align-items:center">Fluxo de caixa projetado
      <div class="period-tabs">
        ${[[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses']].map(o => `<button class="${p === o[0] ? 'active' : ''}" onclick="Modules.finSetPeriodo(${o[0]})">${o[1]}</button>`).join('')}
      </div>
    </div>
    ${this.finChartSvg(pts, p === 365)}
  </div>
  <div class="grid kpis">
    ${kpi('Saldo atual', Fmt.brl(Fin.disponivel()), null, '💰', '')}
    ${kpi('Entradas previstas', Fmt.brl(Fin.abertoAteDias('entrada', p === 365 ? 366 : p)), 'no período', '⬆️', '')}
    ${kpi('Saídas previstas', Fmt.brl(Fin.abertoAteDias('saida', p === 365 ? 366 : p)), 'no período', '⬇️', 'red')}
    ${kpi('Saldo projetado (fim)', Fmt.brl(fim), min < 0 ? '⚠️ chega a ' + Fmt.brl(min) : 'sem furo de caixa', '🔮', fim >= 0 ? 'purple' : 'red')}
  </div>`;
};
Modules.finSetPeriodo = function (n) { this.finState.periodo = n; this.finRenderTab(); };
Modules.finChartSvg = function (pts, monthly) {
  const W = 820, H = 240, pad = { l: 62, r: 16, t: 16, b: 28 };
  const xs = (W - pad.l - pad.r), ys = (H - pad.t - pad.b);
  const vals = pts.map(p => p.saldo);
  let max = Math.max(...vals, 0), min = Math.min(...vals, 0);
  if (max === min) max = min + 1;
  const span = max - min;
  const X = i => pad.l + xs * (i / (pts.length - 1));
  const Y = v => pad.t + ys * (1 - (v - min) / span);
  const zeroY = Y(0);
  const line = pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.saldo).toFixed(1)}`).join(' ');
  const area = `${pad.l},${zeroY.toFixed(1)} ${line} ${X(pts.length - 1).toFixed(1)},${zeroY.toFixed(1)}`;
  const endPos = pts[pts.length - 1].saldo >= 0;
  const stroke = endPos ? 'var(--green)' : 'var(--red)';
  const labelStep = Math.ceil(pts.length / 8);
  const xlabels = pts.map((p, i) => (i % labelStep === 0 || i === pts.length - 1) ? `<text x="${X(i).toFixed(1)}" y="${H - 8}" fill="var(--txt-3)" font-size="10" text-anchor="middle">${monthly ? (p.date.getMonth() + 1) + '/' + String(p.date.getFullYear()).slice(2) : p.date.getDate() + '/' + (p.date.getMonth() + 1)}</text>` : '').join('');
  const ylabels = [max, (max + min) / 2, min].map(v => `<text x="${pad.l - 8}" y="${(Y(v) + 3).toFixed(1)}" fill="var(--txt-3)" font-size="10" text-anchor="end">${Fmt.brl(v).replace('R$ ', '')}</text>`).join('');
  const dots = pts.map((p, i) => (i === 0 || i === pts.length - 1) ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.saldo).toFixed(1)}" r="4" fill="${p.saldo >= 0 ? 'var(--green)' : 'var(--red)'}"/>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img">
    <line x1="${pad.l}" y1="${zeroY.toFixed(1)}" x2="${W - pad.r}" y2="${zeroY.toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
    ${min < 0 ? `<rect x="${pad.l}" y="${zeroY.toFixed(1)}" width="${xs}" height="${(ys + pad.t - zeroY).toFixed(1)}" fill="rgba(245,69,92,.06)"/>` : ''}
    <polygon points="${area}" fill="${endPos ? 'rgba(67,201,37,.12)' : 'rgba(245,69,92,.10)'}"/>
    <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}${xlabels}${ylabels}
  </svg>`;
};

/* ---------- Conciliação ---------- */
Modules.finConciliacao = function () {
  const F = Fin;
  const ent = F.recs().filter(r => r.tipo === 'entrada' && r.status !== 'cancelado').slice().sort((a, b) => new Date(F.venc(b)) - new Date(F.venc(a)));
  const pend = ent.filter(r => !r.conciliado).length;
  return `
  <div class="grid kpis" style="margin-bottom:16px">
    ${kpi('Aguardando conferência', Fmt.num(pend), 'recebimentos não conciliados', '🕓', 'amber')}
    ${kpi('Conciliados', Fmt.num(ent.length - pend), null, '✅', '')}
    ${kpi('Total a conferir', Fmt.brl(ent.filter(r => !r.conciliado).reduce((s, r) => s + F.pagoVal(r), 0)), null, '🔍', 'blue')}
  </div>
  <div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Data</th><th>Forma</th><th class="num">Valor</th><th>Conciliação</th><th></th></tr></thead>
    <tbody>${ent.slice(0, 50).map(r => `<tr>
      <td class="strong">${esc(r.descricao)}</td><td>${Fmt.date(F.venc(r))}</td><td>${esc(r.formaPagamento || '—')}</td><td class="num strong">${Fmt.brl(F.pagoVal(r))}</td>
      <td>${r.conciliado ? '<span class="badge b-green">✓ Conciliado</span>' : '<span class="badge b-amber">Aguardando conferência</span>'}</td>
      <td class="num">${r.conciliado ? `<button class="btn-icon" title="Marcar divergência" onclick="Modules.finDivergencia('${r.id}')">⚠️</button>` : `<button class="btn-ghost btn-sm" onclick="Modules.finConciliar('${r.id}')">Conciliar</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Nada para conciliar.</td></tr>'}</tbody></table></div>`;
};
Modules.finConciliar = function (id) { DB.update('financeiro', id, { conciliado: true }); Toast.ok('Lançamento conciliado.'); this.finRenderTab(); };
Modules.finDivergencia = function (id) { DB.update('financeiro', id, { conciliado: false }); Toast.warn('Marcado como divergente (aguardando conferência).'); this.finRenderTab(); };

/* ---------- Relatórios ---------- */
Modules.finRelatorios = function () {
  const reps = [
    ['fluxo', '💸', 'Fluxo de caixa', 'Todas as movimentações pagas/recebidas'],
    ['pagar', '🔴', 'Contas a pagar', 'Lançamentos a pagar e status'],
    ['receber', '🟢', 'Contas a receber', 'Lançamentos a receber e status'],
    ['despesas', '📊', 'Despesas por categoria', 'Total gasto por categoria'],
    ['taxas', '💳', 'Taxas pagas', 'Taxas de maquininha por forma de pagamento'],
    ['mensal', '📆', 'Comparativo mensal', 'Entradas, saídas e resultado por mês'],
  ];
  return `<div class="card"><div class="section-title">Relatórios financeiros executivos</div>
    ${reps.map(r => `<div class="report-row"><div class="rr-ico">${r[1]}</div>
      <div class="rr-main"><div class="strong">${r[2]}</div><div class="muted" style="font-size:12px">${r[3]}</div></div>
      <button class="btn-ghost btn-sm" onclick="Modules.finReport('${r[0]}','xlsx')">⬇️ Excel</button>
      <button class="btn-ghost btn-sm" onclick="Modules.finReport('${r[0]}','pdf')">🖨️ PDF</button>
    </div>`).join('')}
  </div>`;
};
Modules.finExportLista = function (tipo, fmt) { this.finReport(tipo === 'saida' ? 'pagar' : 'receber', fmt); };
Modules.finReport = function (tipo, fmt) {
  const F = Fin, r2 = x => Math.round(x * 100) / 100;
  let titulo, aoa = [], pdfRows = '', pdfHead = '';
  if (tipo === 'pagar' || tipo === 'receber') {
    const t = tipo === 'pagar' ? 'saida' : 'entrada';
    const list = F.recs().filter(x => x.tipo === t).sort((a, b) => new Date(F.venc(a)) - new Date(F.venc(b)));
    titulo = tipo === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber';
    aoa = [['Descrição', 'Categoria', tipo === 'pagar' ? 'Fornecedor' : 'Origem', 'Emissão', 'Vencimento', 'Valor', tipo === 'pagar' ? 'Pago' : 'Recebido', 'Restante', 'Status']];
    list.forEach(x => aoa.push([x.descricao, x.categoria || '', tipo === 'pagar' ? F.fornNome(x.fornecedorId) : (x.subcategoria || ''), Fmt.date(F.emis(x)), Fmt.date(F.venc(x)), r2(x.valor), r2(F.pagoVal(x)), r2(F.restante(x)), F.status(x)]));
    pdfHead = `<tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th class="num">Valor</th><th class="num">Restante</th><th>Status</th></tr>`;
    pdfRows = list.map(x => `<tr><td>${esc(x.descricao)}</td><td>${esc(x.categoria || '')}</td><td>${Fmt.date(F.venc(x))}</td><td class="num">${Fmt.brl(x.valor)}</td><td class="num">${Fmt.brl(F.restante(x))}</td><td>${F.status(x)}</td></tr>`).join('');
  } else if (tipo === 'fluxo') {
    titulo = 'Fluxo de Caixa';
    const list = F.recs().filter(x => x.status !== 'cancelado' && F.pagoVal(x) > 0).sort((a, b) => new Date(F.venc(a)) - new Date(F.venc(b)));
    aoa = [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']];
    list.forEach(x => aoa.push([Fmt.date(F.venc(x)), x.descricao, x.categoria || '', x.tipo === 'entrada' ? 'Entrada' : 'Saída', r2(x.tipo === 'entrada' ? F.pagoVal(x) : -F.pagoVal(x))]));
    pdfHead = `<tr><th>Data</th><th>Descrição</th><th>Tipo</th><th class="num">Valor</th></tr>`;
    pdfRows = list.map(x => `<tr><td>${Fmt.date(F.venc(x))}</td><td>${esc(x.descricao)}</td><td>${x.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td><td class="num">${Fmt.brl(x.tipo === 'entrada' ? F.pagoVal(x) : -F.pagoVal(x))}</td></tr>`).join('');
  } else if (tipo === 'despesas') {
    titulo = 'Despesas por Categoria';
    const cats = {}; F.recs().filter(x => x.tipo === 'saida' && x.status !== 'cancelado').forEach(x => { cats[x.categoria || 'Outros'] = (cats[x.categoria || 'Outros'] || 0) + F.pagoVal(x); });
    aoa = [['Categoria', 'Total pago']]; const ents = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    ents.forEach(([k, v]) => aoa.push([k, r2(v)]));
    pdfHead = `<tr><th>Categoria</th><th class="num">Total pago</th></tr>`;
    pdfRows = ents.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${Fmt.brl(v)}</td></tr>`).join('');
  } else if (tipo === 'taxas') {
    titulo = 'Taxas Pagas';
    const vv = DB.all('vendas').filter(v => !v.cancelada);
    const porForma = {};
    vv.forEach(v => (v.pagamentos || []).forEach(p => { const fee = (typeof Taxas !== 'undefined') ? (p.taxa != null ? p.taxa : Taxas.fee(p)) : 0; const k = (typeof Taxas !== 'undefined') ? Taxas.keyFor(p.tipo, p.parcelas) : p.tipo; porForma[k] = porForma[k] || { vol: 0, taxa: 0 }; porForma[k].vol += p.valor; porForma[k].taxa += fee; }));
    const ents = Object.entries(porForma).filter(e => e[1].taxa > 0 || e[1].vol > 0).sort((a, b) => b[1].taxa - a[1].taxa);
    const totTaxa = ents.reduce((s, e) => s + e[1].taxa, 0);
    aoa = [['Forma de pagamento', 'Volume transacionado', 'Taxa paga', '% da taxa']];
    ents.forEach(([k, v]) => aoa.push([k, r2(v.vol), r2(v.taxa), r2(v.vol ? v.taxa / v.vol * 100 : 0)]));
    aoa.push([], ['TOTAL', '', r2(totTaxa), '']);
    pdfHead = `<tr><th>Forma de pagamento</th><th class="num">Volume</th><th class="num">Taxa paga</th><th class="num">% taxa</th></tr>`;
    pdfRows = ents.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${Fmt.brl(v.vol)}</td><td class="num">${Fmt.brl(v.taxa)}</td><td class="num">${Fmt.pct(v.vol ? v.taxa / v.vol * 100 : 0)}</td></tr>`).join('') + `<tr><td class="strong">TOTAL</td><td></td><td class="num strong">${Fmt.brl(totTaxa)}</td><td></td></tr>`;
  } else if (tipo === 'mensal') {
    titulo = 'Comparativo Mensal';
    const map = {}; F.recs().filter(x => x.status !== 'cancelado').forEach(x => { const d = new Date(F.venc(x)); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); map[k] = map[k] || { e: 0, s: 0 }; map[k][x.tipo === 'entrada' ? 'e' : 's'] += F.pagoVal(x); });
    aoa = [['Mês', 'Entradas', 'Saídas', 'Resultado']]; const ks = Object.keys(map).sort();
    ks.forEach(k => aoa.push([k, r2(map[k].e), r2(map[k].s), r2(map[k].e - map[k].s)]));
    pdfHead = `<tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Resultado</th></tr>`;
    pdfRows = ks.map(k => `<tr><td>${k}</td><td class="num">${Fmt.brl(map[k].e)}</td><td class="num">${Fmt.brl(map[k].s)}</td><td class="num">${Fmt.brl(map[k].e - map[k].s)}</td></tr>`).join('');
  }
  if (fmt === 'xlsx') Exporter.xlsx('financeiro-' + tipo + '-' + new Date().toISOString().slice(0, 10) + '.xlsx', titulo.slice(0, 28), [[titulo], ['Gerado em', Fmt.date(new Date())], [], ...aoa]);
  else Exporter.pdf(titulo, `<table><thead>${pdfHead}</thead><tbody>${pdfRows || '<tr><td>Sem dados.</td></tr>'}</tbody></table>`);
};
