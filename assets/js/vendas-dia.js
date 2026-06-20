/* ============ RICO GAMES ERP — Vendas do Dia ============ */
Modules.vendasDia = function () {
  const cats = DB.all('categorias').map(c => c.nome);
  setTimeout(() => Modules.vdRender(), 20);
  return `
  <div class="page-head">
    <div><h1>Vendas do Dia</h1><p>Tudo o que foi vendido, por quanto e qual o resultado financeiro</p></div>
    <div class="actions">
      ${App.canFinance() ? '<button class="btn-ghost" onclick="Modules.vdExportXlsx()">⬇️ Excel</button><button class="btn-ghost" onclick="Modules.vdExportPdf()">🖨️ PDF</button>' : ''}
      <button class="btn-primary" onclick="App.go('pdv')">🛒 Nova venda</button>
    </div>
  </div>

  <div class="toolbar">
    <select id="vd-periodo" onchange="Modules.vdPeriodChange()">
      <option value="hoje">Hoje</option><option value="ontem">Ontem</option>
      <option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option>
      <option value="custom">Período personalizado</option>
    </select>
    <span id="vd-custom" style="display:none;gap:8px;align-items:center">
      <input type="date" id="vd-de" onchange="Modules.vdRender()">
      <span class="muted">até</span>
      <input type="date" id="vd-ate" onchange="Modules.vdRender()">
    </span>
    <select id="vd-cat" onchange="Modules.vdRender()"><option value="">Todas categorias</option>${cats.map(c => `<option>${c}</option>`).join('')}</select>
    <select id="vd-tipo" onchange="Modules.vdRender()"><option value="">Todo tipo</option><option value="novo">Novo</option><option value="seminovo">Seminovo</option><option value="usado">Usado</option></select>
    <select id="vd-pay" onchange="Modules.vdRender()"><option value="">Toda forma de pagto.</option><option>PIX</option><option>Dinheiro</option><option>Débito</option><option>Crédito</option></select>
    <input class="grow" id="vd-prod" placeholder="Buscar produto..." oninput="Modules.vdRender()">
  </div>

  <div class="grid kpis" id="vd-kpis" style="margin-bottom:18px"></div>

  <div class="grid cols-2">
    <div><div class="section-title" id="vd-count">Produtos vendidos</div><div id="vd-table"></div></div>
    <div class="card"><div class="section-title">🏆 Mais vendidos do dia</div><div id="vd-ranking"></div></div>
  </div>`;
};

Modules.vdPeriodChange = function () {
  const custom = document.getElementById('vd-custom');
  const isC = fval('vd-periodo') === 'custom';
  custom.style.display = isC ? 'inline-flex' : 'none';
  if (isC && !fval('vd-de')) {
    const t = new Date().toISOString().slice(0, 10);
    document.getElementById('vd-de').value = t; document.getElementById('vd-ate').value = t;
  }
  this.vdRender();
};

Modules.vdGetRange = function () {
  const per = fval('vd-periodo') || 'hoje', now = new Date();
  const startOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOf = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  let start, end;
  if (per === 'hoje') { start = startOf(now); end = endOf(now); }
  else if (per === 'ontem') { const y = new Date(now); y.setDate(y.getDate() - 1); start = startOf(y); end = endOf(y); }
  else if (per === '7d') { const s = new Date(now); s.setDate(s.getDate() - 6); start = startOf(s); end = endOf(now); }
  else if (per === '30d') { const s = new Date(now); s.setDate(s.getDate() - 29); start = startOf(s); end = endOf(now); }
  else {
    const s = fval('vd-de'), e = fval('vd-ate');
    start = s ? startOf(new Date(s + 'T12:00:00')) : startOf(now);
    end = e ? endOf(new Date(e + 'T12:00:00')) : endOf(now);
  }
  return { start, end, per };
};

Modules.vdData = function () {
  const { start, end } = this.vdGetRange();
  const pay = fval('vd-pay'), cat = fval('vd-cat'), tipo = fval('vd-tipo'), q = (fval('vd-prod') || '').toLowerCase();
  const vendas = Calc.vendasValidas()
    .filter(v => { const d = new Date(v.data); return d >= start && d <= end; })
    .filter(v => !pay || v.pagamentos.some(p => p.tipo === pay))
    .sort((a, b) => new Date(b.data) - new Date(a.data));
  const items = [];
  vendas.forEach(v => {
    const pagStr = v.pagamentos.map(p => p.tipo + (p.parcelas > 1 ? ' ' + p.parcelas + 'x' : '')).join(', ');
    v.itens.forEach(i => {
      const prod = DB.get('produtos', i.produtoId);
      const categoria = i.categoria || (prod ? prod.categoria : '—');
      const condicao = i.condicao || (prod ? prod.condicao : 'novo');
      if (cat && categoria !== cat) return;
      if (tipo && condicao !== tipo) return;
      if (q && !i.nome.toLowerCase().includes(q)) return;
      items.push({ data: v.data, nome: i.nome, categoria, condicao, qtd: i.qtd, custo: i.custo * i.qtd, precoUnit: i.preco, valor: i.preco * i.qtd, lucro: (i.preco - i.custo) * i.qtd, pag: pagStr, vendaId: v.id });
    });
  });
  // resumo
  const fat = items.reduce((s, i) => s + i.valor, 0);
  const lucroB = items.reduce((s, i) => s + i.lucro, 0);
  const qtdProd = items.reduce((s, i) => s + i.qtd, 0);
  const nVendas = new Set(items.map(i => i.vendaId)).size;
  const despesas = DB.all('financeiro').filter(f => f.tipo === 'saida' && f.origem !== 'compra' && f.status === 'pago' && new Date(f.data) >= start && new Date(f.data) <= end).reduce((s, f) => s + f.valor, 0);
  return { start, end, vendas, items, fat, lucroB, qtdProd, nVendas, ticket: nVendas ? fat / nVendas : 0, liquido: lucroB - despesas };
};

Modules.vdRender = function () {
  if (!document.getElementById('vd-kpis')) return;
  const d = this.vdData();
  const canFin = App.canFinance();
  document.getElementById('vd-kpis').innerHTML =
    kpi('Faturamento bruto', Fmt.brl(d.fat), null, '💵', '') +
    (canFin ? kpi('Lucro bruto', Fmt.brl(d.lucroB), null, '📈', '') : '') +
    (canFin ? kpi('Lucro líquido estimado', Fmt.brl(d.liquido), 'após despesas do período', '💎', 'purple') : '') +
    kpi('Produtos vendidos', Fmt.num(d.qtdProd), 'unidades', '📦', 'blue') +
    kpi('Ticket médio', Fmt.brl(d.ticket), null, '🎟️', '') +
    kpi('Vendas realizadas', Fmt.num(d.nVendas), null, '🧾', 'amber');

  document.getElementById('vd-count').innerHTML = `Produtos vendidos <span class="muted" style="font-weight:500">${d.items.length} itens · ${Fmt.date(d.start)}${Fmt.date(d.start) !== Fmt.date(d.end) ? ' – ' + Fmt.date(d.end) : ''}</span>`;

  const rows = d.items.map(i => `
    <tr style="cursor:pointer" onclick="Modules.vdDetail('${i.vendaId}')">
      <td>${Fmt.time(i.data)}<div class="muted" style="font-size:11px">${Fmt.date(i.data)}</div></td>
      <td class="strong">${esc(i.nome)}</td>
      <td>${esc(i.categoria)}</td>
      <td>${condBadge(i.condicao)}</td>
      <td class="num">${i.qtd}</td>
      ${canFin ? `<td class="num muted">${Fmt.brl(i.custo)}</td>` : ''}
      <td class="num strong">${Fmt.brl(i.valor)}</td>
      ${canFin ? `<td class="num" style="color:var(--green)">${Fmt.brl(i.lucro)}</td>` : ''}
      <td><span class="badge b-gray">${esc(i.pag)}</span></td>
      <td class="muted">#${i.vendaId.slice(-4)}</td>
    </tr>`).join('');
  document.getElementById('vd-table').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Hora</th><th>Produto</th><th>Categoria</th><th>Condição</th><th class="num">Qtd</th>${canFin ? '<th class="num">Custo</th>' : ''}<th class="num">Venda</th>${canFin ? '<th class="num">Lucro</th>' : ''}<th>Pagto.</th><th>Nº</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="10" class="muted" style="text-align:center;padding:34px">Nenhuma venda no período selecionado.</td></tr>'}</tbody></table></div>`;

  // ranking
  const rk = {};
  d.items.forEach(i => { rk[i.nome] = rk[i.nome] || { nome: i.nome, qtd: 0, fat: 0 }; rk[i.nome].qtd += i.qtd; rk[i.nome].fat += i.valor; });
  const ranking = Object.values(rk).sort((a, b) => b.fat - a.fat).slice(0, 8);
  document.getElementById('vd-ranking').innerHTML = ranking.length ? ranking.map((r, idx) => {
    const part = d.fat ? r.fat / d.fat * 100 : 0;
    return `<div style="padding:11px 0;border-bottom:1px solid var(--line-soft)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div class="lr-title"><b style="color:var(--green)">${idx + 1}º</b> ${esc(r.nome)}</div>
        <div class="strong" style="white-space:nowrap">${Fmt.brl(r.fat)}</div></div>
      <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--txt-3);margin:5px 0 6px"><span>${r.qtd} un. vendidas</span><span>${Fmt.pct(part)} do dia</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${part}%"></div></div>
    </div>`;
  }).join('') : '<p class="muted" style="padding:14px 0">Sem dados no período.</p>';
};

Modules.vdDetail = function (id) {
  const v = DB.get('vendas', id); if (!v) return;
  const itensHtml = v.itens.map(i => `<tr><td>${esc(i.nome)}${i.precoOriginal != null && i.preco !== i.precoOriginal ? `<div class="muted" style="font-size:11px">preço alterado: <s>${Fmt.brl(i.precoOriginal)}</s> → ${Fmt.brl(i.preco)}${i.precoMotivo ? ' · ' + esc(i.precoMotivo) : ''}</div>` : ''}</td><td class="num">${i.qtd}</td><td class="num">${Fmt.brl(i.preco)}</td><td class="num strong">${Fmt.brl(i.preco * i.qtd)}</td></tr>`).join('');
  Modal.open({
    title: '🧾 Venda #' + id.slice(-4) + (v.cancelada ? ' — CANCELADA' : ''),
    body: `
      <div class="card" style="background:var(--bg-2);margin-bottom:14px">
        <div class="mini-stat"><span>Data e horário</span><b>${Fmt.datetime(v.data)}</b></div>
        <div class="mini-stat"><span>Forma de pagamento</span><b>${v.pagamentos.map(p => p.tipo + (p.parcelas > 1 ? ' ' + p.parcelas + 'x' : '')).join(', ')}</b></div>
        ${v.usadoEntrada ? `<div class="mini-stat"><span>Usado recebido na troca</span><b style="color:var(--green)">🔄 ${esc(v.usadoEntrada)}</b></div>` : ''}
      </div>
      <div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Valor unit.</th><th class="num">Total</th></tr></thead><tbody>${itensHtml}</tbody></table></div>
      <div class="card" style="background:var(--bg-2);margin-top:14px">
        <div class="mini-stat"><span>Subtotal</span><b>${Fmt.brl(v.bruto)}</b></div>
        ${v.desconto ? `<div class="mini-stat"><span>Desconto aplicado</span><b style="color:var(--red)">− ${Fmt.brl(v.desconto)}</b></div>` : ''}
        <div class="mini-stat" style="font-size:16px"><span class="strong">Total da venda</span><b style="color:var(--green)">${Fmt.brl(v.total)}</b></div>
        ${App.canFinance() ? `<div class="mini-stat"><span>Lucro da operação</span><b style="color:var(--green)">${Fmt.brl(v.lucro)}</b></div>` : ''}
      </div>`,
    foot: v.cancelada
      ? `<span class="badge b-red" style="margin-right:auto">Venda cancelada em ${Fmt.date(v.canceladaEm || v.data)}</span>${typeof Print !== 'undefined' ? `<button class="btn-ghost" onclick="Print.print(DB.get('vendas','${id}'))">🖨️ Reimprimir</button>` : ''}<button class="btn-ghost" onclick="Modal.close()">Fechar</button>`
      : `${App.can('podeCancelar') ? `<button class="btn-danger" style="margin-right:auto" onclick="Modules.vdCancel('${id}')">✕ Cancelar venda</button>` : ''}${App.isAdmin() ? `<button class="btn-ghost" onclick="Modules.vdGarantia('${id}')">🛡️ Garantia</button>` : ''}${typeof Print !== 'undefined' ? `<button class="btn-ghost" onclick="Print.print(DB.get('vendas','${id}'))">🖨️ Reimprimir cupom</button>` : ''}<button class="btn-ghost" onclick="Modal.close()">Fechar</button>`
  });
};

Modules.vdGarantia = function (id) {
  const v = DB.get('vendas', id); if (!v) return;
  if (!v.cupom && typeof Cupom !== 'undefined') v.cupom = Cupom.snapshot(v);
  const at = (v.cupom && v.cupom.itens[0]) || { prazo: 90, unidade: 'dias' };
  Modal.open({
    title: '🛡️ Ajustar garantia desta venda',
    body: `<p class="muted" style="margin-bottom:12px">Vale só para esta venda (e para a reimpressão do cupom).</p>
      <div class="form-grid"><div class="field"><label>Prazo</label><input id="vg-prazo" type="number" value="${at.prazo}"></div>
      <div class="field"><label>Unidade</label><select id="vg-un"><option ${at.unidade === 'dias' ? 'selected' : ''}>dias</option><option ${at.unidade === 'meses' ? 'selected' : ''}>meses</option></select></div></div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.vdGarantiaSave('${id}')">Aplicar</button>`
  });
};
Modules.vdGarantiaSave = function (id) {
  const v = DB.get('vendas', id); const prazo = parseInt(fval('vg-prazo')) || 0, un = fval('vg-un');
  const snap = v.cupom || (typeof Cupom !== 'undefined' ? Cupom.snapshot(v) : { cfg: {}, itens: [] });
  const itens = (snap.itens || []).map(i => Object.assign({}, i, { prazo, unidade: un }));
  DB.update('vendas', id, { cupom: Object.assign({}, snap, { itens }) });
  Modal.close(); Toast.ok('Garantia ajustada para esta venda.');
};
Modules.vdCancel = function (id) {
  if (!App.can('podeCancelar')) return Toast.err('Você não tem permissão para cancelar vendas.');
  Modal.confirm('Cancelar esta venda? O estoque será devolvido, o faturamento estornado e o lucro/relatórios atualizados automaticamente.', () => {
    const v = DB.get('vendas', id); if (!v) return;
    v.itens.forEach(i => { const p = DB.get('produtos', i.produtoId); if (p) DB.update('produtos', i.produtoId, { qtd: p.qtd + i.qtd, status: 'disponivel' }); });
    // se houve usado recebido na troca, removê-lo do estoque (entrou pela venda)
    DB.update('vendas', id, { cancelada: true, canceladaEm: new Date().toISOString() });
    const fin = DB.all('financeiro').find(f => f.refId === id && f.origem === 'venda');
    if (fin) DB.remove('financeiro', fin.id);
    // se houve usado recebido na troca: devolve a unidade somada ao produto e estorna o custo
    if (v.usado && v.usado.produtoId) { const p = DB.get('produtos', v.usado.produtoId); if (p) DB.update('produtos', v.usado.produtoId, { qtd: Math.max(0, p.qtd - 1) }); }
    DB.all('produtos').filter(p => p.vendaOrigemId === id).forEach(p => DB.remove('produtos', p.id));
    DB.all('financeiro').filter(f => f.refId === id && f.origem === 'usado').forEach(f => DB.remove('financeiro', f.id));
    // se foi paga em dinheiro, estorna o Caixa da Loja
    if (typeof Caixa !== 'undefined') Caixa.estornarVenda(v);
    DB.logMov('devolucao', 'Venda cancelada #' + id.slice(-4) + ' — estoque devolvido e faturamento estornado (' + Fmt.brl(v.total) + ')', { valor: v.total });
    Toast.ok('Venda cancelada e estornada.');
    Modal.close(); App.go('vendasDia');
  }, 'Cancelar venda');
};

Modules.vdExportXlsx = function () {
  const d = this.vdData(), r = x => Math.round(x * 100) / 100;
  const aoa = [
    ['Rico Games — Relatório de Vendas'],
    ['Período', Fmt.date(d.start) + ' a ' + Fmt.date(d.end)],
    ['Faturamento bruto', r(d.fat)], ['Lucro bruto', r(d.lucroB)], ['Lucro líquido estimado', r(d.liquido)],
    ['Produtos vendidos', d.qtdProd], ['Ticket médio', r(d.ticket)], ['Vendas realizadas', d.nVendas],
    [],
    ['Data/Hora', 'Produto', 'Categoria', 'Condição', 'Qtd', 'Custo', 'Valor Venda', 'Lucro', 'Pagamento', 'Nº Venda']
  ];
  d.items.forEach(i => aoa.push([Fmt.datetime(i.data), i.nome, i.categoria, i.condicao, i.qtd, r(i.custo), r(i.valor), r(i.lucro), i.pag, '#' + i.vendaId.slice(-4)]));
  aoa.push([]); aoa.push(['TOTAIS', '', '', '', d.qtdProd, '', r(d.fat), r(d.lucroB)]);
  Exporter.xlsx('vendas-rico-games-' + new Date().toISOString().slice(0, 10) + '.xlsx', 'Vendas', aoa);
};

Modules.vdExportPdf = function () {
  const d = this.vdData();
  const kp = (l, v) => `<div class="k"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const kpis = `<div class="kpis">
    ${kp('Faturamento bruto', Fmt.brl(d.fat))}${kp('Lucro bruto', Fmt.brl(d.lucroB))}${kp('Lucro líquido est.', Fmt.brl(d.liquido))}
    ${kp('Produtos vendidos', d.qtdProd)}${kp('Ticket médio', Fmt.brl(d.ticket))}${kp('Vendas', d.nVendas)}</div>`;
  const rows = d.items.map(i => `<tr><td>${Fmt.datetime(i.data)}</td><td>${esc(i.nome)}</td><td>${esc(i.categoria)}</td><td>${i.condicao}</td><td class="num">${i.qtd}</td><td class="num">${Fmt.brl(i.valor)}</td><td class="num">${Fmt.brl(i.lucro)}</td><td>${esc(i.pag)}</td><td>#${i.vendaId.slice(-4)}</td></tr>`).join('');
  const table = `<table><thead><tr><th>Data/Hora</th><th>Produto</th><th>Categoria</th><th>Cond.</th><th class="num">Qtd</th><th class="num">Venda</th><th class="num">Lucro</th><th>Pagto.</th><th>Nº</th></tr></thead><tbody>${rows || '<tr><td colspan="9">Sem vendas no período.</td></tr>'}</tbody></table>`;
  Exporter.pdf('Vendas — ' + Fmt.date(d.start) + (Fmt.date(d.start) !== Fmt.date(d.end) ? ' a ' + Fmt.date(d.end) : ''), kpis + table);
};
