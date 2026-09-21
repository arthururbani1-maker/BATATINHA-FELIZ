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

  <div style="margin-bottom:18px"><div class="section-title" id="vd-vcount">Vendas</div><div id="vd-vendas"></div></div>

  <div id="vd-prevendas" style="margin-bottom:18px"></div>

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
    // taxa total da venda (só sobre cartão) e base de rateio (valor de venda de cada item)
    const taxaV = v.taxaTotal != null ? v.taxaTotal : (typeof Taxas !== 'undefined' ? Taxas.feeVenda(v) : 0);
    const base = v.itens.reduce((s, x) => s + x.preco * x.qtd, 0);
    v.itens.forEach(i => {
      const prod = DB.get('produtos', i.produtoId);
      const categoria = i.categoria || (prod ? prod.categoria : '—');
      const condicao = i.condicao || (prod ? prod.condicao : 'novo');
      if (cat && categoria !== cat) return;
      if (tipo && condicao !== tipo) return;
      if (q && !i.nome.toLowerCase().includes(q)) return;
      const custoUnit = (i.custo > 0) ? i.custo : (prod ? (prod.custoMedio || prod.custo || 0) : 0); // usa custo médio atual se a venda gravou custo 0
      const valor = i.preco * i.qtd, custo = custoUnit * i.qtd;
      const taxaItem = base > 0 ? taxaV * (valor / base) : 0;
      const semCusto = !(custoUnit > 0);
      items.push({ data: v.data, nome: i.nome, categoria, condicao, qtd: i.qtd, custo, precoUnit: i.preco, valor, lucro: valor - custo, taxaItem, lucroLiq: valor - custo - taxaItem, semCusto, pag: pagStr, vendaId: v.id });
    });
  });
  // resumo
  const fat = items.reduce((s, i) => s + i.valor, 0);
  const custoTotal = items.reduce((s, i) => s + i.custo, 0);
  const taxasCartao = items.reduce((s, i) => s + i.taxaItem, 0);
  const lucroB = items.reduce((s, i) => s + i.lucro, 0);
  const lucroLiquido = items.reduce((s, i) => s + i.lucroLiq, 0);
  const qtdProd = items.reduce((s, i) => s + i.qtd, 0);
  const nVendas = new Set(items.map(i => i.vendaId)).size;
  return { start, end, vendas, items, fat, custoTotal, taxasCartao, lucroB, lucroLiquido, qtdProd, nVendas, ticket: nVendas ? fat / nVendas : 0, liquido: lucroLiquido };
};

/* Cálculo financeiro completo de UMA venda (com rateio de taxas por item) */
Modules.vdVendaCalc = function (v) {
  const taxaTotal = v.taxaTotal != null ? v.taxaTotal : (typeof Taxas !== 'undefined' ? Taxas.feeVenda(v) : 0);
  const base = (v.itens || []).reduce((s, x) => s + x.preco * x.qtd, 0);
  const itens = (v.itens || []).map(i => {
    const prod = DB.get('produtos', i.produtoId);
    const custoUnit = (i.custo > 0) ? i.custo : (prod ? (prod.custoMedio || prod.custo || 0) : 0); // fallback custo médio atual
    const valor = i.preco * i.qtd, custo = custoUnit * i.qtd;
    const taxaItem = base > 0 ? taxaTotal * (valor / base) : 0;
    return { nome: i.nome, qtd: i.qtd, precoUnit: i.preco, custoUnit, valor, custo, produtoId: i.produtoId,
      lucroBruto: valor - custo, taxaItem, lucroLiq: valor - custo - taxaItem, semCusto: !(custoUnit > 0),
      precoOriginal: i.precoOriginal, precoMotivo: i.precoMotivo, entrega: i.entrega, entregueEm: i.entregueEm, reservado: i.reservado };
  });
  const bruto = v.bruto != null ? v.bruto : base;
  const desconto = v.desconto || 0;
  const liquido = v.total - taxaTotal;
  const lucroTotal = itens.reduce((s, i) => s + i.lucroLiq, 0);
  const qtdItens = (v.itens || []).reduce((s, i) => s + i.qtd, 0);
  return { taxaTotal, base, itens, bruto, desconto, total: v.total, liquido, lucroTotal, qtdItens };
};

Modules.vdRender = function () {
  if (!document.getElementById('vd-kpis')) return;
  const d = this.vdData();
  const canFin = App.canFinance();

  // ----- Vendas completas (uma linha por venda) -----
  const ve = document.getElementById('vd-vendas');
  if (ve) {
    const q = (fval('vd-prod') || '').toLowerCase();
    const vendas = d.vendas.filter(v => !q || (v.itens || []).some(i => i.nome.toLowerCase().includes(q)));
    const vrows = vendas.map(v => {
      const c = this.vdVendaCalc(v);
      const custoTot = c.itens.reduce((s, i) => s + i.custo, 0);
      const lucroBrutoTot = c.itens.reduce((s, i) => s + i.lucroBruto, 0);
      const pagStr = v.pagamentos.map(p => p.tipo + (p.parcelas > 1 ? ' ' + p.parcelas + 'x' : '')).join(', ');
      const prodNomes = (v.itens || []).map(i => i.qtd + 'x ' + i.nome).join(', ');
      const temPre = (v.itens || []).some(i => i.entrega === 'prevenda');
      return `<tr style="cursor:pointer" onclick="Modules.vdDetail('${v.id}')">
        <td class="strong">#${v.numero || v.id.slice(-4)}</td>
        <td>${Fmt.time(v.data)}<div class="muted" style="font-size:11px">${Fmt.date(v.data)}</div></td>
        <td><div style="max-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(prodNomes)}">${esc(prodNomes)}</div>${v.cliente ? `<div class="muted" style="font-size:11px">👤 ${esc(v.cliente)}</div>` : ''}</td>
        <td class="num strong">${Fmt.brl(v.total)}</td>
        ${canFin ? `<td class="num muted">${Fmt.brl(custoTot)}</td>` : ''}
        ${canFin ? `<td class="num">${Fmt.brl(lucroBrutoTot)}</td>` : ''}
        ${canFin ? `<td class="num" style="color:var(--red)">${c.taxaTotal > 0 ? '− ' + Fmt.brl(c.taxaTotal) : '—'}</td>` : ''}
        ${canFin ? `<td class="num strong" style="color:${c.lucroTotal >= 0 ? 'var(--green)' : 'var(--red)'}">${Fmt.brl(c.lucroTotal)}</td>` : ''}
        <td><span class="badge b-gray">${esc(pagStr)}</span></td>
        <td>${v.cancelada ? '<span class="badge b-red">Cancelada</span>' : (temPre ? '<span class="badge b-amber">Pré-venda</span>' : '<span class="badge b-green">Concluída</span>')}</td>
      </tr>`;
    }).join('');
    document.getElementById('vd-vcount').innerHTML = `Vendas <span class="muted" style="font-weight:500">${vendas.length} venda(s) no período</span>`;
    ve.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Nº</th><th>Horário</th><th>Produtos vendidos</th><th class="num">Total</th>${canFin ? '<th class="num">Custo</th><th class="num">Lucro bruto</th><th class="num">Taxas</th><th class="num">Lucro líquido</th>' : ''}<th>Pagamento</th><th>Status</th></tr></thead>
      <tbody>${vrows || `<tr><td colspan="${canFin ? 10 : 6}" class="muted" style="text-align:center;padding:24px">Nenhuma venda no período.</td></tr>`}</tbody></table></div>`;
  }
  document.getElementById('vd-kpis').innerHTML =
    kpi('Faturamento bruto', Fmt.brl(d.fat), null, '💵', '') +
    (canFin ? kpi('Custo dos produtos', Fmt.brl(d.custoTotal), null, '🏷️', '') : '') +
    (canFin ? kpi('Taxas de cartão', Fmt.brl(d.taxasCartao), 'descontadas do lucro', '💳', 'red') : '') +
    (canFin ? kpi('Lucro líquido', Fmt.brl(d.lucroLiquido), 'após taxas de cartão', '💎', 'purple') : '') +
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
      ${canFin ? `<td class="num strong" style="color:${i.lucroLiq >= 0 ? 'var(--green)' : 'var(--red)'}" title="Venda: ${Fmt.brl(i.valor)}&#10;Custo: ${Fmt.brl(i.custo)}&#10;Taxa de cartão (rateada): ${Fmt.brl(i.taxaItem)}&#10;Lucro líquido: ${Fmt.brl(i.lucroLiq)}">${Fmt.brl(i.lucroLiq)}${i.semCusto ? ' <span title="Custo não cadastrado — lucro pode estar incorreto" style="color:var(--amber)">⚠</span>' : ''}</td>` : ''}
      <td><span class="badge b-gray">${esc(i.pag)}</span></td>
      <td class="muted">#${i.vendaId.slice(-4)}</td>
    </tr>`).join('');
  document.getElementById('vd-table').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Hora</th><th>Produto</th><th>Categoria</th><th>Condição</th><th class="num">Qtd</th>${canFin ? '<th class="num">Custo</th>' : ''}<th class="num">Venda</th>${canFin ? '<th class="num">Lucro líquido</th>' : ''}<th>Pagto.</th><th>Nº</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="10" class="muted" style="text-align:center;padding:34px">Nenhuma venda no período selecionado.</td></tr>'}</tbody>
    ${canFin && d.items.length ? `<tfoot><tr style="font-weight:700;border-top:2px solid var(--line)"><td colspan="5">TOTAIS · ${d.qtdProd} un</td><td class="num">${Fmt.brl(d.custoTotal)}</td><td class="num">${Fmt.brl(d.fat)}</td><td class="num" style="color:${d.lucroLiquido >= 0 ? 'var(--green)' : 'var(--red)'}">${Fmt.brl(d.lucroLiquido)}</td><td colspan="2" class="muted" style="font-weight:500">Taxas: ${Fmt.brl(d.taxasCartao)}</td></tr></tfoot>` : ''}
    </table></div>`;

  // ----- Pré-vendas / Reservas no período (pedidos com status especial) -----
  const pvEl = document.getElementById('vd-prevendas');
  if (pvEl && typeof PV !== 'undefined') {
    const { start, end } = this.vdGetRange();
    const pvs = PV.listAll().filter(v => !v.cancelada).filter(v => { const dt = new Date(v.data); return dt >= start && dt <= end; }).sort((a, b) => (b.numero || 0) - (a.numero || 0));
    if (pvs.length) {
      const prows = pvs.map(v => `<tr style="cursor:pointer" onclick="Modules.pvDetail('${v.id}')">
        <td class="strong">${PV.vLabel(v)} <span class="badge b-purple">Pré-venda</span></td>
        <td>${Fmt.time(v.data)}</td>
        <td>${esc(v.cliente || '—')}</td>
        <td>${esc(PV.produtoResumo(v))}</td>
        <td class="num strong">${Fmt.brl(v.total)}</td>
        <td class="num" style="color:var(--green)">${Fmt.brl(PV.pago(v))}</td>
        <td>${PV.payBadge(v)}</td><td>${PV.entBadge(v)}</td></tr>`).join('');
      pvEl.innerHTML = `<div class="section-title">📋 Pré-vendas do período <span class="muted" style="font-weight:500">${pvs.length} pedido(s) · já contam no faturamento acima; a entrega é que fica pendente</span></div>
        <div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Hora</th><th>Cliente</th><th>Produto</th><th class="num">Total</th><th class="num">Pago</th><th>Pagamento</th><th>Entrega</th></tr></thead><tbody>${prows}</tbody></table></div>`;
    } else pvEl.innerHTML = '';
  }

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
  const fin = App.canFinance();
  const c = this.vdVendaCalc(v);
  const num = v.numero || id.slice(-4);
  const adm = (typeof App !== 'undefined' && App.isAdmin && App.isAdmin());
  // ----- somas que reconciliam com as linhas por produto -----
  const vendaBruta = c.itens.reduce((s, i) => s + i.valor, 0);
  const custoTot = c.itens.reduce((s, i) => s + i.custo, 0);
  const lucroBrutoTot = vendaBruta - custoTot;
  const taxaTot = c.itens.reduce((s, i) => s + i.taxaItem, 0);
  const lucroLiqTot = lucroBrutoTot - taxaTot;
  const margem = vendaBruta ? lucroLiqTot / vendaBruta * 100 : 0;
  const temPre = c.itens.some(i => i.entrega === 'prevenda');
  const stItem = e => e.entrega === 'prevenda' ? (e.reservado ? '<span class="badge b-blue">🔒 Reservado</span>' : '<span class="badge b-amber">⏳ Pré-venda</span>') : '<span class="badge b-green">✔ Entregue</span>';
  const itAcao = (i, idx) => i.entrega === 'prevenda'
    ? `<button class="btn-icon" title="Entregar item (baixa estoque)" onclick="Modal.close();Modules.pvEntregarItem('${id}',${idx})">📦</button>`
    : `<button class="btn-icon" title="Marcar como pré-venda" onclick="Modal.close();Modules.pvMarcarItemPrevenda('${id}',${idx})">📋</button>`;

  /* ---------- Bloco 1: Resumo da venda ---------- */
  const resumo = `<div class="vd-sum">
    <div class="vd-sum-row"><span>Venda bruta</span><b>${Fmt.brl(vendaBruta)}</b></div>
    ${fin ? `<div class="vd-sum-row"><span>(−) Custo dos produtos</span><b style="color:var(--red)">− ${Fmt.brl(custoTot)}</b></div>` : ''}
    ${fin ? `<div class="vd-sum-row" style="border-top:1px dashed var(--line)"><span>(=) Lucro bruto</span><b>${Fmt.brl(lucroBrutoTot)}</b></div>` : ''}
    ${fin ? `<div class="vd-sum-row"><span>(−) Taxas de pagamento</span><b style="color:var(--red)">− ${Fmt.brl(taxaTot)}</b></div>` : ''}
    ${fin ? `<div class="vd-sum-row vd-sum-final"><span>(=) Lucro líquido</span><b style="color:${lucroLiqTot >= 0 ? 'var(--green)' : 'var(--red)'}">${Fmt.brl(lucroLiqTot)}</b></div>` : ''}
  </div>`;

  /* ---------- Bloco 2: Produtos vendidos (com rateio de taxa) ---------- */
  const itensHtml = c.itens.map((i, idx) => {
    const part = vendaBruta ? i.valor / vendaBruta * 100 : 0;
    return `<tr>
      <td>${esc(i.nome)} <span class="muted" style="font-size:11px">(${i.qtd} un · ${Fmt.pct(part)} da venda)</span></td>
      <td>${stItem(i)}</td>
      <td class="num strong">${Fmt.brl(i.valor)}</td>
      ${fin ? `<td class="num muted">${i.semCusto ? '<span title="Custo não cadastrado">⚠️</span> ' : ''}${Fmt.brl(i.custo)}</td>` : ''}
      ${fin ? `<td class="num">${Fmt.brl(i.lucroBruto)}</td>` : ''}
      ${fin ? `<td class="num" style="color:var(--red)">${i.taxaItem > 0 ? '− ' + Fmt.brl(i.taxaItem) : '—'}</td>` : ''}
      ${fin ? `<td class="num" style="color:${i.lucroLiq >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:700">${Fmt.brl(i.lucroLiq)}</td>` : ''}
      ${adm && !v.cancelada ? `<td class="num">${itAcao(i, idx)}</td>` : ''}</tr>`;
  }).join('');
  const produtos = `<div class="section-title" style="margin:0 0 8px">2. Produtos vendidos <span class="muted" style="font-weight:500">· saíram do estoque</span>${fin && c.itens.length > 1 ? ' <span class="muted" style="font-weight:500">· taxa rateada proporcional ao valor de cada produto</span>' : ''}</div>
    <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Entrega</th><th class="num">Valor</th>${fin ? '<th class="num">Custo</th><th class="num">Lucro bruto</th><th class="num">Taxa prop.</th><th class="num">Lucro líq.</th>' : ''}${adm && !v.cancelada ? '<th></th>' : ''}</tr></thead><tbody>${itensHtml}</tbody></table></div>
    ${temPre ? `<div class="muted" style="font-size:12px;margin-top:6px">⏳ Itens em pré-venda são entregues depois pela aba <b>Pré-venda / Reservas</b> — mesma venda, sem duplicar.</div>` : ''}`;

  /* ---------- Bloco 3+4: Formas de pagamento e taxas ---------- */
  const pags = (v.pagamentos || []);
  const pagRows = pags.map(p => {
    const taxa = p.taxa != null ? p.taxa : (typeof Taxas !== 'undefined' ? Taxas.fee(p) : 0);
    const pct = p.valor ? taxa / p.valor * 100 : 0;
    const nome = p.tipo + (p.parcelas > 1 ? ' ' + p.parcelas + 'x' : '');
    const finNota = p.financeira ? `<div class="muted" style="font-size:11px">🏦 a receber em ${p.prazoDias || 0} dia(s)${fin ? ' · líquido ' + Fmt.brl(p.valor - taxa) : ''}</div>` : '';
    return `<tr><td><b>${esc(nome)}</b>${finNota}</td><td class="num">${Fmt.brl(p.valor)}</td>${fin ? `<td class="num">${Fmt.pct(pct)}</td><td class="num" style="color:var(--red)">${taxa > 0 ? '− ' + Fmt.brl(taxa) : 'R$ 0,00'}</td>` : ''}</tr>`;
  }).join('');
  const colTaxaVazia = fin ? '<td class="num">—</td><td class="num">R$ 0,00</td>' : '';
  const usadosPagRows = (v.usados || []).map(u => { const un = u.qtd || 1, vu = (u.valorUnit != null ? u.valorUnit : u.valor); return `<tr><td><b>🔄 Produto usado recebido</b><div class="muted" style="font-size:11.5px">${u.produtoId ? `<a style="color:var(--accent);cursor:pointer" onclick="Modules.vdVerUsado('${esc(u.produtoId)}')">${esc(u.nome)}</a>` : esc(u.nome)}${un > 1 ? ' · ' + un + ' un × ' + Fmt.brl(vu) : ''}${u.categoria ? ' · ' + esc(u.categoria) : ''} — entrou no estoque</div></td><td class="num">${Fmt.brl(u.valor)}</td>${colTaxaVazia}</tr>`; }).join('');
  const totalPago = pags.reduce((s, p) => s + (p.valor || 0), 0) + (v.usados || []).reduce((s, u) => s + (u.valor || 0), 0);
  const formas = `<div class="section-title" style="margin:0 0 8px">3. Formas de pagamento${fin ? ' e taxas aplicadas' : ''}</div>
    <div class="table-wrap"><table><thead><tr><th>Forma</th><th class="num">Valor</th>${fin ? '<th class="num">Taxa %</th><th class="num">Taxa descontada</th>' : ''}</tr></thead><tbody>${pagRows}${usadosPagRows}</tbody>
    <tfoot><tr style="font-weight:700;border-top:2px solid var(--line)"><td>Total da venda</td><td class="num">${Fmt.brl(totalPago)}</td>${fin ? `<td class="num">Taxas</td><td class="num" style="color:var(--red)">− ${Fmt.brl(taxaTot)}</td>` : ''}</tr></tfoot></table></div>
    ${(v.usados && v.usados.length) ? `<div class="muted" style="font-size:12px;margin-top:6px">🔄 O valor do usado é <b>parte do pagamento</b> (não gera taxa nem entra no caixa). Total da venda = pagamentos + usados, sem duplicar valores.</div>` : ''}`;

  /* ---------- Bloco 4: Produtos recebidos na troca (entraram no estoque) ---------- */
  const recebidos = (v.usados && v.usados.length) ? `<div class="section-title" style="margin:0 0 8px">4. Produtos recebidos na troca <span class="muted" style="font-weight:500">· entraram no estoque</span></div>
    <div class="table-wrap"><table><thead><tr><th>Produto recebido</th><th>Categoria</th><th class="num">Qtd</th><th class="num">Vlr unit.</th><th class="num">Valor total</th><th>Entrada</th><th>Venda</th></tr></thead>
    <tbody>${v.usados.map(u => { const un = u.qtd || 1, vu = (u.valorUnit != null ? u.valorUnit : u.valor); return `<tr>
      <td class="strong">${u.produtoId ? `<a style="color:var(--accent);cursor:pointer" onclick="Modules.vdVerUsado('${esc(u.produtoId)}')">${esc(u.nome)} 🔎</a>` : esc(u.nome)}${u.serie ? `<div class="muted" style="font-size:11px">S/N ${esc(u.serie)}</div>` : ''}${u.estado ? `<div class="muted" style="font-size:11px">estado: ${esc(u.estado)}</div>` : ''}</td>
      <td>${esc(u.categoria || '—')}</td>
      <td class="num">${un}</td>
      <td class="num">${Fmt.brl(vu)}</td>
      <td class="num strong">${Fmt.brl(u.valor)}</td>
      <td>${Fmt.date(v.data)}</td>
      <td>#${num}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="muted" style="font-size:12px;margin-top:6px">Esses produtos <b>entraram</b> no estoque como parte do pagamento desta venda. Clique no nome para ver o histórico e a origem do item.</div>` : '';

  /* ---------- Bloco 5: Cálculo do lucro líquido (admin) ---------- */
  const calculo = fin ? `<div class="section-title" style="margin:0 0 8px">5. Como o lucro líquido foi calculado</div>
    <div class="vd-calc">
      <div class="vd-calc-line"><span>Lucro bruto</span><span>= Venda bruta − Custo</span><span>= ${Fmt.brl(vendaBruta)} − ${Fmt.brl(custoTot)} = <b>${Fmt.brl(lucroBrutoTot)}</b></span></div>
      <div class="vd-calc-line"><span>Lucro líquido</span><span>= Lucro bruto − Taxas</span><span>= ${Fmt.brl(lucroBrutoTot)} − ${Fmt.brl(taxaTot)} = <b style="color:${lucroLiqTot >= 0 ? 'var(--green)' : 'var(--red)'}">${Fmt.brl(lucroLiqTot)}</b></span></div>
      <div class="vd-calc-conta">${Fmt.brl(vendaBruta)} − ${Fmt.brl(custoTot)} − ${Fmt.brl(taxaTot)} = <b style="color:${lucroLiqTot >= 0 ? 'var(--green)' : 'var(--red)'}">${Fmt.brl(lucroLiqTot)}</b></div>
    </div>` : '';

  /* ---------- Bloco 6: Resultado final ---------- */
  const resultado = fin ? `<div class="vd-result"><div><div style="font-size:12px;opacity:.85">Lucro líquido da operação</div><div style="font-size:13px;opacity:.85">Margem ${Fmt.pct(margem)}</div></div><div class="vd-result-val">${Fmt.brl(lucroLiqTot)}</div></div>` : '';

  Modal.open({
    title: '📊 Detalhamento Financeiro da Venda #' + num + (v.cancelada ? ' — CANCELADA' : ''),
    wide: true,
    body: `
      <div class="section-title" style="margin:0 0 8px">1. Resumo da venda</div>
      <div class="card" style="background:var(--bg-2);margin-bottom:6px">
        <div class="mini-stat"><span>Número da venda</span><b>#${num}</b></div>
        ${v.cliente ? `<div class="mini-stat"><span>Cliente</span><b>${esc(v.cliente)}${v.telefone ? ' · ' + esc(v.telefone) : ''}</b></div>` : ''}
        <div class="mini-stat"><span>Data e horário</span><b>${Fmt.datetime(v.data)}</b></div>
        <div class="mini-stat"><span>Pagamento</span><b>${pags.map(p => p.tipo + (p.parcelas > 1 ? ' ' + p.parcelas + 'x' : '')).join(', ')}${(v.usados && v.usados.length) ? ' + usado recebido (' + v.usados.map(u => esc(u.nome)).join(', ') + ')' : ''}</b></div>
      </div>
      ${resumo}
      <div style="margin-top:16px">${produtos}</div>
      <div style="margin-top:16px">${formas}</div>
      ${recebidos ? `<div style="margin-top:16px">${recebidos}</div>` : ''}
      ${(v.usados && v.usados.length) ? `<div style="margin-top:16px">${this.vdTrocaResumo(v)}</div>` : ''}
      ${calculo ? `<div style="margin-top:16px">${calculo}</div>` : ''}
      ${resultado ? `<div style="margin-top:16px">${resultado}</div>` : ''}`,
    foot: v.cancelada
      ? `<span class="badge b-red" style="margin-right:auto">Venda cancelada em ${Fmt.date(v.canceladaEm || v.data)}</span>${typeof Print !== 'undefined' ? `<button class="btn-ghost" onclick="Print.print(DB.get('vendas','${id}'))">🖨️ Reimprimir</button>` : ''}<button class="btn-ghost" onclick="Modal.close()">Fechar</button>`
      : `${App.can('podeCancelar') ? `<button class="btn-danger" style="margin-right:auto" onclick="Modules.vdCancel('${id}')">✕ Cancelar venda</button>` : ''}${App.isAdmin() ? `<button class="btn-ghost" onclick="Modules.vdGarantia('${id}')">🛡️ Garantia</button>` : ''}${typeof Print !== 'undefined' ? `<button class="btn-ghost" onclick="Print.print(DB.get('vendas','${id}'))">🖨️ Reimprimir cupom</button>` : ''}<button class="btn-ghost" onclick="Modal.close()">Fechar</button>`
  });
};

/* Resumo da negociação da troca: recebido, entregue, diferença e destino do saldo */
Modules.vdTrocaResumo = function (v) {
  const recebido = (v.usados || []).reduce((s, u) => s + (u.valor || 0), 0);
  const entregue = v.total || 0;
  const dev = v.devolucaoTroca && v.devolucaoTroca.valor > 0 ? v.devolucaoTroca : null;
  const diff = entregue - recebido; // >0 cliente pagou; <0 loja devolveu
  let destino, cor, forma = '';
  if (dev) { destino = 'Devolução ao cliente'; cor = 'var(--red)'; forma = dev.forma; }
  else if (Math.abs(diff) <= 0.009) { destino = 'Troca sem diferença'; cor = 'var(--txt)'; }
  else { destino = 'Cliente pagou a diferença'; cor = 'var(--green)'; forma = (v.pagamentos || []).map(p => p.tipo).join(', '); }
  const linha = (l, val, c) => `<div class="mini-stat"><span>${l}</span><b${c ? ` style="color:${c}"` : ''}>${val}</b></div>`;
  return `<div class="section-title" style="margin:0 0 8px">🔁 Saldo da negociação (troca)</div>
    <div class="card" style="background:var(--bg-2)">
      ${linha('Recebido do cliente', Fmt.brl(recebido), 'var(--green)')}
      ${linha('Entregue ao cliente', Fmt.brl(entregue))}
      ${linha('Diferença', Fmt.brl(Math.abs(diff)), cor)}
      ${linha('Resultado', destino, cor)}
      ${forma ? linha('Forma', forma) : ''}
      ${dev ? linha('Movimentação do caixa', '− ' + Fmt.brl(dev.valor) + (dev.forma === 'Dinheiro' ? ' (caixa)' : ' (' + dev.forma + ' · financeiro)'), 'var(--red)') : ''}
    </div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">Operação única de troca — o usado entrou no estoque pelo valor atribuído e ${dev ? 'a diferença foi devolvida ao cliente' : (Math.abs(diff) <= 0.009 ? 'não houve movimentação financeira' : 'o cliente pagou a diferença')}. Nada é contado em dobro.</div>`;
};

Modules.vdVerUsado = function (produtoId) {
  const p = produtoId ? DB.get('produtos', produtoId) : null;
  if (p && typeof ProdHist !== 'undefined') { Modal.close(); ProdHist.open(produtoId); }
  else Toast.warn('Esse produto usado não está mais no catálogo do estoque.');
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
    // Pré-venda (ou venda com item de entrega pendente): usa o estorno unificado, que só
    // devolve estoque de itens JÁ ENTREGUES e libera a reserva dos pendentes (não baixaram).
    if (typeof PV !== 'undefined' && PV.isPre && PV.isPre(v)) {
      PV.cancelarVenda(v, 'Cancelada em Vendas do Dia');
      Toast.ok('Venda cancelada e estornada.'); Modal.close(); App.go('vendasDia'); return;
    }
    v.itens.forEach(i => { const p = DB.get('produtos', i.produtoId); if (p) DB.update('produtos', i.produtoId, { qtd: p.qtd + i.qtd }); });
    // se houve usado recebido na troca, removê-lo do estoque (entrou pela venda)
    DB.update('vendas', id, { cancelada: true, canceladaEm: new Date().toISOString() });
    const fin = DB.all('financeiro').find(f => f.refId === id && f.origem === 'venda');
    if (fin) DB.remove('financeiro', fin.id);
    // se houve usados recebidos na troca: devolve cada unidade somada ao produto e estorna o custo
    const usadosV = v.usados || (v.usado ? [v.usado] : []);
    usadosV.forEach(u => { if (u && u.produtoId) { const p = DB.get('produtos', u.produtoId); if (p) DB.update('produtos', u.produtoId, { qtd: Math.max(0, p.qtd - 1) }); } });
    DB.all('produtos').filter(p => p.vendaOrigemId === id).forEach(p => DB.remove('produtos', p.id));
    DB.all('financeiro').filter(f => f.refId === id && f.origem === 'usado').forEach(f => DB.remove('financeiro', f.id));
    // se foi paga em dinheiro, estorna o Caixa da Loja
    if (typeof Caixa !== 'undefined') Caixa.estornarVenda(v);
    // se houve DEVOLUÇÃO de troca, o dinheiro que saiu volta (caixa) ou o lançamento financeiro é removido
    if (v.devolucaoTroca && v.devolucaoTroca.valor > 0) {
      if (v.devolucaoTroca.forma === 'Dinheiro' && typeof Caixa !== 'undefined') Caixa.add({ fluxo: 'entrada', tipo: 'Estorno devolução de troca', origem: 'Estorno de troca', categoria: 'Estorno', valor: v.devolucaoTroca.valor, obs: 'Cancelamento troca #' + (v.numero || id.slice(-4)), refId: id });
      else DB.all('financeiro').filter(f => f.refId === id && f.origem === 'troca').forEach(f => DB.remove('financeiro', f.id));
    }
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
    ['Faturamento bruto', r(d.fat)], ['Custo dos produtos', r(d.custoTotal)], ['Taxas de cartão', r(d.taxasCartao)], ['Lucro líquido', r(d.lucroLiquido)],
    ['Produtos vendidos', d.qtdProd], ['Ticket médio', r(d.ticket)], ['Vendas realizadas', d.nVendas],
    [],
    ['Data/Hora', 'Produto', 'Categoria', 'Condição', 'Qtd', 'Custo', 'Valor Venda', 'Taxa cartão', 'Lucro líquido', 'Pagamento', 'Nº Venda']
  ];
  d.items.forEach(i => aoa.push([Fmt.datetime(i.data), i.nome, i.categoria, i.condicao, i.qtd, r(i.custo), r(i.valor), r(i.taxaItem), r(i.lucroLiq), i.pag, '#' + i.vendaId.slice(-4)]));
  aoa.push([]); aoa.push(['TOTAIS', '', '', '', d.qtdProd, r(d.custoTotal), r(d.fat), r(d.taxasCartao), r(d.lucroLiquido)]);
  Exporter.xlsx('vendas-rico-games-' + new Date().toISOString().slice(0, 10) + '.xlsx', 'Vendas', aoa);
};

Modules.vdExportPdf = function () {
  const d = this.vdData();
  const kp = (l, v) => `<div class="k"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const kpis = `<div class="kpis">
    ${kp('Faturamento bruto', Fmt.brl(d.fat))}${kp('Taxas de cartão', Fmt.brl(d.taxasCartao))}${kp('Lucro líquido', Fmt.brl(d.lucroLiquido))}
    ${kp('Produtos vendidos', d.qtdProd)}${kp('Ticket médio', Fmt.brl(d.ticket))}${kp('Vendas', d.nVendas)}</div>`;
  const rows = d.items.map(i => `<tr><td>${Fmt.datetime(i.data)}</td><td>${esc(i.nome)}</td><td>${esc(i.categoria)}</td><td>${i.condicao}</td><td class="num">${i.qtd}</td><td class="num">${Fmt.brl(i.valor)}</td><td class="num">${Fmt.brl(i.taxaItem)}</td><td class="num">${Fmt.brl(i.lucroLiq)}</td><td>${esc(i.pag)}</td><td>#${i.vendaId.slice(-4)}</td></tr>`).join('');
  const table = `<table><thead><tr><th>Data/Hora</th><th>Produto</th><th>Categoria</th><th>Cond.</th><th class="num">Qtd</th><th class="num">Venda</th><th class="num">Taxa</th><th class="num">Lucro líq.</th><th>Pagto.</th><th>Nº</th></tr></thead><tbody>${rows || '<tr><td colspan="10">Sem vendas no período.</td></tr>'}</tbody></table>`;
  Exporter.pdf('Vendas — ' + Fmt.date(d.start) + (Fmt.date(d.start) !== Fmt.date(d.end) ? ' a ' + Fmt.date(d.end) : ''), kpis + table);
};
