/* ============ RICO GAMES ERP — Módulos ============ */
const Calc = {
  isToday(d) { const x = new Date(d), n = new Date(); return x.toDateString() === n.toDateString(); },
  isThisMonth(d) { const x = new Date(d), n = new Date(); return x.getMonth() === n.getMonth() && x.getFullYear() === n.getFullYear(); },
  isThisYear(d) { return new Date(d).getFullYear() === new Date().getFullYear(); },
  isPrevMonth(d) { const x = new Date(d), n = new Date(); const pm = new Date(n.getFullYear(), n.getMonth() - 1, 1); return x.getMonth() === pm.getMonth() && x.getFullYear() === pm.getFullYear(); },
  // Lucro líquido = lucro bruto das vendas - despesas (saídas não-compra) no período
  vendasValidas() { return DB.all('vendas').filter(v => !v.cancelada); },
  faturamento(filter) { return this.vendasValidas().filter(v => filter(v.data)).reduce((s, v) => s + v.total, 0); },
  lucroBruto(filter) { return this.vendasValidas().filter(v => filter(v.data)).reduce((s, v) => s + (v.lucro || 0), 0); },
  despesas(filter) {
    return DB.all('financeiro').filter(f => f.tipo === 'saida' && f.origem !== 'compra' && f.status === 'pago' && filter(f.data))
      .reduce((s, f) => s + f.valor, 0);
  },
  lucroLiquido(filter) { return this.lucroBruto(filter) - this.despesas(filter); },
  contasPagar() { return DB.all('financeiro').filter(f => f.tipo === 'saida' && f.status === 'pendente').reduce((s, f) => s + f.valor, 0); },
  contasReceber() { return DB.all('financeiro').filter(f => f.tipo === 'entrada' && f.status === 'pendente').reduce((s, f) => s + f.valor, 0); },
  estoqueUnidades() { return DB.all('produtos').reduce((s, p) => s + (p.qtd || 0), 0); },
  estoqueValorCusto() { return DB.all('produtos').reduce((s, p) => s + (p.custoMedio || p.custo) * p.qtd, 0); },
  estoqueBaixo() { return DB.all('produtos').filter(p => p.qtd <= p.min); },
  produtosParados(dias) {
    const lim = dias || 60; const now = new Date();
    const vendidosSku = new Set();
    this.vendasValidas().filter(v => (now - new Date(v.data)) / 86400000 <= lim).forEach(v => v.itens.forEach(i => vendidosSku.add(i.sku)));
    return DB.all('produtos').filter(p => p.qtd > 0 && !vendidosSku.has(p.sku));
  }
};

const Modules = {
  /* ===================== DASHBOARD ===================== */
  dashboard() {
    const c = Calc;
    const fatDia = c.faturamento(c.isToday.bind(c)), fatMes = c.faturamento(c.isThisMonth.bind(c));
    const lbDia = c.lucroBruto(c.isToday.bind(c)), lbMes = c.lucroBruto(c.isThisMonth.bind(c));
    const llDia = c.lucroLiquido(c.isToday.bind(c)), llMes = c.lucroLiquido(c.isThisMonth.bind(c)), llAno = c.lucroLiquido(c.isThisYear.bind(c));
    const fatMesAnt = c.faturamento(c.isPrevMonth.bind(c));
    const varMes = fatMesAnt ? ((fatMes - fatMesAnt) / fatMesAnt * 100) : 0;
    const baixo = c.estoqueBaixo(), parados = c.produtosParados(60);
    const movs = DB.all('movimentacoes').slice(0, 8);

    return `
    <div class="page-head"><div><h1>Dashboard</h1><p>Visão geral em tempo real · ${Fmt.date(new Date())}</p></div>
      <div class="actions"><button class="btn-primary" onclick="App.go('pdv')">🛒 Nova venda</button></div></div>

    <div class="grid kpis" style="margin-bottom:16px">
      ${kpi('Faturamento do dia', Fmt.brl(fatDia), c.vendasValidas().filter(v => c.isToday(v.data)).length + ' vendas hoje', '💵', '')}
      ${kpi('Faturamento do mês', Fmt.brl(fatMes), `<span class="${varMes >= 0 ? 'up' : 'down'}">${varMes >= 0 ? '▲' : '▼'} ${Fmt.pct(Math.abs(varMes))} vs mês ant.</span>`, '📅', 'blue')}
      ${kpi('Lucro bruto (mês)', Fmt.brl(lbMes), 'Hoje: ' + Fmt.brl(lbDia), '📈', '')}
      ${kpi('Lucro líquido (mês)', Fmt.brl(llMes), 'Após despesas', '💎', 'purple')}
    </div>

    <div class="grid kpis" style="margin-bottom:16px">
      ${kpi('Lucro líquido — Dia', Fmt.brl(llDia), null, '🟢', '')}
      ${kpi('Lucro líquido — Mês', Fmt.brl(llMes), null, '🟢', '')}
      ${kpi('Lucro líquido — Ano', Fmt.brl(llAno), null, '🟢', '')}
      ${kpi('Valor em estoque (custo)', Fmt.brl(c.estoqueValorCusto()), c.estoqueUnidades() + ' unidades', '📦', 'blue')}
    </div>

    <div class="grid kpis" style="margin-bottom:20px">
      ${kpi('Produtos em estoque', Fmt.num(DB.all('produtos').length) + ' itens', c.estoqueUnidades() + ' unidades', '🗃️', '')}
      ${kpi('Estoque baixo', Fmt.num(baixo.length), 'Abaixo do mínimo', '⚠️', 'amber')}
      ${kpi('Produtos parados', Fmt.num(parados.length), 'Sem venda há 60d', '🐌', 'red')}
      ${kpi('Contas a pagar', Fmt.brl(c.contasPagar()), 'Contas a receber: ' + Fmt.brl(c.contasReceber()), '🧾', 'red')}
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">Faturamento — últimos 14 dias</div>
        ${this.barChart14()}
      </div>
      <div class="card">
        <div class="section-title">Estoque baixo <a onclick="App.go('estoque')">Ver estoque →</a></div>
        ${baixo.length ? baixo.slice(0, 6).map(p => `
          <div class="list-row"><div class="lr-ico">📦</div>
            <div class="lr-main"><div class="lr-title">${esc(p.nome)}</div><div class="lr-sub">${p.sku} · mín. ${p.min}</div></div>
            <span class="badge b-red">${p.qtd} un.</span></div>`).join('') : '<p class="muted" style="padding:14px 0">Tudo acima do mínimo 👍</p>'}
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card">
        <div class="section-title">Últimas movimentações <a onclick="App.go('movimentacoes')">Ver todas →</a></div>
        ${movs.map(m => `
          <div class="list-row"><div class="lr-ico">${movIcon(m.tipo)}</div>
            <div class="lr-main"><div class="lr-title">${esc(m.descricao)}</div><div class="lr-sub">${Fmt.datetime(m.data)} · ${m.usuario}</div></div>
            ${m.valor ? `<span class="strong">${Fmt.brl(m.valor)}</span>` : ''}</div>`).join('')}
      </div>
      <div class="card">
        <div class="section-title">Produtos parados <a onclick="App.go('relatorios')">Relatórios →</a></div>
        ${parados.length ? parados.slice(0, 6).map(p => `
          <div class="list-row"><div class="lr-ico">🐌</div>
            <div class="lr-main"><div class="lr-title">${esc(p.nome)}</div><div class="lr-sub">${p.sku} · ${condBadge(p.condicao)}</div></div>
            <span class="muted">${p.qtd} un.</span></div>`).join('') : '<p class="muted" style="padding:14px 0">Sem produtos parados 🎉</p>'}
      </div>
    </div>`;
  },

  barChart14() {
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const totals = days.map(d => Calc.vendasValidas().filter(v => new Date(v.data).toDateString() === d.toDateString()).reduce((s, v) => s + v.total, 0));
    const max = Math.max(1, ...totals);
    return `<div style="display:flex;align-items:flex-end;gap:5px;height:170px;padding-top:10px">
      ${totals.map((t, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%">
        <div style="flex:1;display:flex;align-items:flex-end;width:100%">
          <div title="${Fmt.brl(t)}" style="width:100%;border-radius:5px 5px 0 0;background:linear-gradient(180deg,var(--green),var(--green-2));height:${Math.max(3, t / max * 100)}%"></div>
        </div>
        <div style="font-size:9.5px;color:var(--txt-3)">${days[i].getDate()}/${days[i].getMonth() + 1}</div>
      </div>`).join('')}
    </div>`;
  },

  /* ===================== ESTOQUE ===================== */
  estoque() {
    const prods = DB.all('produtos');
    const cats = DB.all('categorias').map(c => c.nome);
    const canEd = App.can('podeEditarProduto'), canFin = App.canFinance();
    return `
    <div class="page-head"><div><h1>Estoque</h1><p>${prods.length} produtos cadastrados · ${Calc.estoqueUnidades()} unidades${canFin ? ' · ' + Fmt.brl(Calc.estoqueValorCusto()) + ' em custo' : ''}</p></div>
      <div class="actions">${canEd ? '<button class="btn-ghost" onclick="Modules.ajusteEstoque()">⚖️ Ajuste</button><button class="btn-ghost" onclick="App.go(\'entrada\')">📥 Entrada de estoque</button><button class="btn-primary" onclick="Modules.produtoForm()">+ Novo produto</button>' : ''}</div></div>
    <div class="toolbar">
      <input class="grow" id="est-search" placeholder="Buscar nome, SKU ou código..." oninput="Modules.renderEstoqueTable()" />
      <select id="est-cat" onchange="Modules.renderEstoqueTable()"><option value="">Todas categorias</option>${cats.map(c => `<option>${c}</option>`).join('')}</select>
      <select id="est-cond" onchange="Modules.renderEstoqueTable()"><option value="">Toda condição</option><option>novo</option><option>seminovo</option><option>usado</option></select>
      <select id="est-status" onchange="Modules.renderEstoqueTable()"><option value="">Todo status</option><option value="disponivel">Disponível</option><option value="baixo">Estoque baixo</option></select>
    </div>
    <div id="est-table"></div>`;
  },
  renderEstoqueTable() {
    const q = (fval('est-search') || '').toLowerCase();
    const cat = fval('est-cat'), cond = fval('est-cond'), st = fval('est-status');
    let list = DB.all('produtos').filter(p => {
      if (q && !(p.nome.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').includes(q))) return false;
      if (cat && p.categoria !== cat) return false;
      if (cond && p.condicao !== cond) return false;
      if (st === 'baixo' && p.qtd > p.min) return false;
      if (st === 'disponivel' && p.status !== 'disponivel') return false;
      return true;
    });
    const canEd = App.can('podeEditarProduto'), canFin = App.canFinance();
    const rows = list.map(p => `
      <tr>
        <td><div class="strong">${esc(p.nome)}</div><div class="muted" style="font-size:11.5px">${p.sku}${p.serie ? ' · S/N ' + p.serie : ''}</div></td>
        <td>${p.categoria}<div class="muted" style="font-size:11px">${p.marca}</div></td>
        <td>${condBadge(p.condicao)}</td>
        <td class="num ${p.qtd <= p.min ? 'down strong' : ''}" style="${p.qtd <= p.min ? 'color:var(--red)' : ''}">${p.qtd}${p.qtd <= p.min ? ' ⚠️' : ''}<div class="muted" style="font-size:11px">mín ${p.min}</div></td>
        ${canFin ? `<td class="num">${Fmt.brl(p.custoMedio || p.custo)}</td>` : ''}
        <td class="num strong">${Fmt.brl(p.preco)}</td>
        ${canFin ? `<td class="num"><span class="badge b-green">${Fmt.pct((p.preco - (p.custoMedio || p.custo)) / p.preco * 100)}</span></td>` : ''}
        <td>${p.local || '-'}</td>
        <td>${statusBadge(p.status)}</td>
        ${canEd ? `<td class="num"><button class="btn-icon" onclick="Modules.produtoForm('${p.id}')">✏️</button> <button class="btn-icon" onclick="Modules.delProduto('${p.id}')">🗑️</button></td>` : ''}
      </tr>`).join('');
    document.getElementById('est-table').innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Produto</th><th>Categoria</th><th>Condição</th><th class="num">Qtd</th>${canFin ? '<th class="num">Custo méd.</th>' : ''}<th class="num">Preço</th>${canFin ? '<th class="num">Margem</th>' : ''}<th>Local</th><th>Status</th>${canEd ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="muted" style="text-align:center;padding:30px">Nenhum produto encontrado.</td></tr>'}</tbody></table></div>`;
  },
  produtoForm(id) {
    const p = id ? DB.get('produtos', id) : {};
    const cats = DB.all('categorias').map(c => c.nome), marcas = DB.all('marcas').map(m => m.nome);
    Modal.open({
      title: id ? 'Editar produto' : 'Novo produto', wide: true,
      body: `<div class="form-grid">
        <div class="field full"><label>Nome do produto *</label><input id="p-nome" value="${esc(p.nome || '')}"></div>
        <div class="field"><label>SKU *</label><input id="p-sku" value="${esc(p.sku || '')}"></div>
        <div class="field"><label>Código de barras</label><input id="p-barcode" value="${esc(p.barcode || '')}"></div>
        <div class="field"><label>Categoria</label><select id="p-cat">${cats.map(c => `<option ${p.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Marca</label><select id="p-marca">${marcas.map(m => `<option ${p.marca === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Modelo</label><input id="p-modelo" value="${esc(p.modelo || '')}"></div>
        <div class="field"><label>Condição</label><select id="p-cond"><option ${p.condicao === 'novo' ? 'selected' : ''}>novo</option><option ${p.condicao === 'seminovo' ? 'selected' : ''}>seminovo</option><option ${p.condicao === 'usado' ? 'selected' : ''}>usado</option></select></div>
        <div class="field"><label>Quantidade</label><input id="p-qtd" type="number" value="${p.qtd ?? 0}"></div>
        <div class="field"><label>Estoque mínimo</label><input id="p-min" type="number" value="${p.min ?? 1}"></div>
        <div class="field"><label>Custo unitário (R$)</label><input id="p-custo" type="number" step="0.01" value="${p.custo ?? 0}"></div>
        <div class="field"><label>Preço de venda (R$)</label><input id="p-preco" type="number" step="0.01" value="${p.preco ?? 0}"></div>
        <div class="field"><label>Nº de série (opcional)</label><input id="p-serie" value="${esc(p.serie || '')}"></div>
        <div class="field"><label>Localização</label><input id="p-local" value="${esc(p.local || '')}"></div>
        <div class="field"><label>Status</label><select id="p-status">
          ${['disponivel', 'reservado', 'vendido', 'manutencao', 'garantia'].map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
      </div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveProduto('${id || ''}')">Salvar</button>`
    });
  },
  saveProduto(id) {
    const nome = fval('p-nome'), sku = fval('p-sku');
    if (!nome || !sku) return Toast.err('Informe nome e SKU.');
    const data = {
      nome, sku, barcode: fval('p-barcode'), categoria: fval('p-cat'), marca: fval('p-marca'),
      modelo: fval('p-modelo'), condicao: fval('p-cond'), qtd: parseInt(fval('p-qtd')) || 0,
      min: parseInt(fval('p-min')) || 0, custo: fnum('p-custo'), preco: fnum('p-preco'),
      serie: fval('p-serie'), local: fval('p-local'), status: fval('p-status')
    };
    if (id) { DB.update('produtos', id, data); Toast.ok('Produto atualizado.'); }
    else { data.custoMedio = data.custo; DB.insert('produtos', data); DB.logMov('ajuste', 'Cadastro de produto: ' + nome, { valor: 0 }); Toast.ok('Produto cadastrado.'); }
    Modal.close(); App.go('estoque');
  },
  delProduto(id) {
    Modal.confirm('Excluir este produto do estoque?', () => { DB.remove('produtos', id); Toast.ok('Produto removido.'); App.go('estoque'); }, 'Excluir');
  },
  ajusteEstoque() {
    const prods = DB.all('produtos');
    Modal.open({
      title: '⚖️ Ajuste de estoque',
      body: `<div class="field"><label>Produto</label><select id="aj-prod">${prods.map(p => `<option value="${p.id}">${esc(p.nome)} (atual: ${p.qtd})</option>`).join('')}</select></div>
        <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Nova quantidade</label><input id="aj-qtd" type="number" value="0"></div>
        <div class="field"><label>Motivo</label><input id="aj-motivo" placeholder="Ex: contagem física, perda, quebra"></div></div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveAjuste()">Aplicar ajuste</button>`
    });
  },
  saveAjuste() {
    const id = fval('aj-prod'), q = parseInt(fval('aj-qtd')), motivo = fval('aj-motivo') || 'ajuste manual';
    const p = DB.get('produtos', id); const dif = q - p.qtd;
    DB.update('produtos', id, { qtd: q });
    DB.logMov('ajuste', `Ajuste de estoque: ${p.nome} (${p.qtd}→${q}, ${dif >= 0 ? '+' : ''}${dif}) · ${motivo}`, { valor: 0 });
    Toast.ok('Estoque ajustado.'); Modal.close(); App.go('estoque');
  },

  /* ===================== ENTRADA DE ESTOQUE ===================== */
  entradaLines: [],
  entrada() {
    this.entradaLines = [];
    setTimeout(() => { const e = document.getElementById('ent-busca'); if (e) e.focus(); this.entRender(); }, 30);
    const fs = DB.all('fornecedores');
    return `
    <div class="page-head"><div><h1>Entrada de Estoque</h1><p>Reabasteça produtos já cadastrados — sem cadastrar de novo</p></div>
      <div class="actions"><button class="btn-ghost" onclick="App.go('estoque')">📦 Ver estoque</button></div></div>
    <div class="card" style="margin-bottom:16px">
      <div class="section-title">1. Busque o produto</div>
      <div class="ms" style="max-width:560px">
        <div class="ms-box"><span class="ic" style="color:var(--txt-3);padding-left:4px">🔎</span>
          <input class="ms-input" id="ent-busca" autocomplete="off" placeholder="Digite o nome, SKU ou código de barras (ex: cont...)" oninput="Modules.entBusca()" onfocus="Modules.entBusca()" onblur="Modules.entBlur()"></div>
        <div class="ms-drop" id="ent-drop"></div>
      </div>
      <p class="muted" style="margin-top:8px;font-size:12px">Comece a digitar e selecione o produto na lista. Não está cadastrado? <a style="color:var(--green);cursor:pointer" onclick="App.go('estoque');setTimeout(()=>Modules.produtoForm(),120)">Cadastrar novo produto</a>.</p>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="section-title">2. Dados da entrada</div>
      <div class="form-grid">
        <div class="field"><label>Fornecedor (opcional)</label><select id="ent-forn"><option value="">—</option>${fs.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></div>
        <div class="field"><label>Data da entrada</label><input id="ent-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field full"><label>Observação</label><input id="ent-obs" placeholder="Ex: nota fiscal, lote, etc."></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--txt-2)"><input type="checkbox" id="ent-fin"> Também lançar como compra no Financeiro (contas a pagar)</label>
    </div>
    <div class="card">
      <div class="section-title">3. Produtos a dar entrada</div>
      <div id="ent-lines"></div>
      <div id="ent-resumo"></div>
      <button class="btn-primary btn-block" style="margin-top:14px" onclick="Modules.entSalvar()">✅ Confirmar entrada no estoque</button>
    </div>`;
  },
  entBusca() {
    const q = (fval('ent-busca') || '').toLowerCase();
    const drop = document.getElementById('ent-drop'); if (!drop) return;
    let list = DB.all('produtos').filter(p => !this.entradaLines.some(l => l.produtoId === p.id));
    if (q) list = list.filter(p => p.nome.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').includes(q));
    list = list.slice(0, 10);
    drop.innerHTML = list.length
      ? list.map(p => `<div class="ms-opt" onmousedown="event.preventDefault();Modules.entAddLine('${p.id}')"><span>${esc(p.nome)} ${condBadge(p.condicao)}</span><span class="o-sku">${p.sku} · ${p.qtd} un</span></div>`).join('')
      : '<div class="ms-empty">Nenhum produto encontrado. Cadastre-o primeiro em Estoque.</div>';
    drop.classList.add('show');
  },
  entBlur() { setTimeout(() => { const d = document.getElementById('ent-drop'); if (d) d.classList.remove('show'); }, 160); },
  entAddLine(id) {
    const p = DB.get('produtos', id); if (!p) return;
    if (!this.entradaLines.some(l => l.produtoId === id)) this.entradaLines.push({ produtoId: id, nome: p.nome, sku: p.sku, qtd: 1, custo: p.custoMedio || p.custo || 0 });
    const inp = document.getElementById('ent-busca'); if (inp) { inp.value = ''; inp.focus(); }
    this.entBusca(); this.entRender();
  },
  entSetLine(i, f, v) { this.entradaLines[i][f] = parseFloat(String(v).replace(',', '.')) || 0; this.entRender(); },
  entDelLine(i) { this.entradaLines.splice(i, 1); this.entRender(); },
  entRender() {
    const box = document.getElementById('ent-lines'); if (!box) return;
    if (!this.entradaLines.length) { box.innerHTML = '<p class="muted" style="padding:6px 0">Nenhum produto adicionado. Use a busca acima.</p>'; document.getElementById('ent-resumo').innerHTML = ''; return; }
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Estoque atual</th><th class="num">Quantidade</th><th class="num">Custo unitário</th><th class="num">Subtotal</th><th></th></tr></thead>
      <tbody>${this.entradaLines.map((l, i) => { const p = DB.get('produtos', l.produtoId) || {}; return `<tr>
        <td class="strong">${esc(l.nome)}<div class="muted" style="font-size:11px">${l.sku}</div></td>
        <td class="num muted">${p.qtd != null ? p.qtd : '-'}</td>
        <td class="num"><input type="number" min="1" value="${l.qtd}" style="width:80px;text-align:right;background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:7px 9px" onchange="Modules.entSetLine(${i},'qtd',this.value)"></td>
        <td class="num"><input type="number" step="0.01" value="${l.custo}" style="width:110px;text-align:right;background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:7px 9px" onchange="Modules.entSetLine(${i},'custo',this.value)"></td>
        <td class="num strong">${Fmt.brl(l.qtd * l.custo)}</td>
        <td class="num"><span class="ci-rm" onclick="Modules.entDelLine(${i})">✕</span></td></tr>`; }).join('')}</tbody></table></div>`;
    const totQ = this.entradaLines.reduce((s, l) => s + l.qtd, 0), totV = this.entradaLines.reduce((s, l) => s + l.qtd * l.custo, 0);
    document.getElementById('ent-resumo').innerHTML = `<div class="card" style="background:var(--bg-2);margin-top:14px">
      <div class="mini-stat"><span>Total de itens</span><b>${totQ} un</b></div>
      <div class="mini-stat" style="font-size:16px"><span class="strong">Custo total da entrada</span><b style="color:var(--green)">${Fmt.brl(totV)}</b></div></div>`;
  },
  entSalvar() {
    if (!this.entradaLines.length) return Toast.err('Adicione ao menos um produto.');
    if (this.entradaLines.some(l => l.qtd <= 0)) return Toast.err('Quantidade deve ser maior que zero.');
    const fornId = fval('ent-forn'), data = new Date(fval('ent-data') + 'T12:00:00').toISOString(), obs = fval('ent-obs');
    const fornNome = fornId ? (DB.get('fornecedores', fornId) || {}).nome : '';
    let totV = 0;
    this.entradaLines.forEach(l => {
      const p = DB.get('produtos', l.produtoId); if (!p) return;
      const qtdNova = p.qtd + l.qtd;
      const custoMedio = qtdNova ? (((p.custoMedio || p.custo || 0) * p.qtd) + (l.custo * l.qtd)) / qtdNova : l.custo;
      DB.update('produtos', l.produtoId, { qtd: qtdNova, custo: l.custo, custoMedio: Math.round(custoMedio * 100) / 100, status: 'disponivel' });
      DB.logMov('compra', 'Entrada de estoque: ' + l.qtd + 'x ' + l.nome + (fornNome ? ' (' + fornNome + ')' : '') + (obs ? ' · ' + obs : ''), { valor: l.qtd * l.custo, data });
      totV += l.qtd * l.custo;
    });
    if (fchk('ent-fin')) {
      DB.logFin({ tipo: 'saida', categoria: 'Compras de mercadorias', subcategoria: 'Entrada de estoque', descricao: 'Entrada de estoque' + (fornNome ? ' — ' + fornNome : '') + (obs ? ' (' + obs + ')' : ''), valor: totV, emissao: data, vencimento: data, data, pago: 0, status: 'pendente', fornecedorId: fornId || null, formaPagamento: 'Boleto', origem: 'compra' });
    }
    Toast.ok('Entrada registrada! Estoque e custo médio atualizados.');
    this.entradaLines = []; App.go('estoque');
  },

  /* ===================== PDV ===================== */
  cart: { itens: [], desconto: 0, pagamentos: [], usado: null },
  pdv() {
    this.cart = { itens: [], desconto: 0, pagamentos: [], usado: null };
    setTimeout(() => { const e = document.getElementById('pdv-q'); if (e) e.focus(); }, 50);
    return `
    <div class="page-head"><div><h1>Ponto de Venda</h1><p>Busque pelo nome, SKU ou bipe o código de barras</p></div>
      <div class="actions"><span class="pdv-kbd">↵ Enter adiciona</span><span class="pdv-kbd">Esc limpa</span></div></div>
    <div class="pdv">
      <div class="pdv-main">
        <div class="pdv-searchbar"><span class="ic">🔎</span>
          <input id="pdv-q" placeholder="Escaneie o código de barras ou digite o nome / SKU..." oninput="Modules.pdvSearch()" onkeydown="Modules.pdvEnter(event)" autocomplete="off"></div>
        <div class="pdv-results" id="pdv-results"></div>
      </div>
      <aside class="cart" id="cart"></aside>
    </div>`;
  },
  condColor(c) { return c === 'novo' ? 'var(--green)' : c === 'seminovo' ? 'var(--blue)' : 'var(--amber)'; },
  pdvSearch() {
    const q = (fval('pdv-q') || '').toLowerCase();
    let list = DB.all('produtos').filter(p => p.qtd > 0 && p.status === 'disponivel');
    if (q) list = list.filter(p => p.nome.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').includes(q));
    list = list.slice(0, 24);
    document.getElementById('pdv-results').innerHTML = list.map(p => {
      const low = p.qtd <= p.min;
      return `<div class="prod-card" onclick="Modules.addCart('${p.id}')">
        <span class="pc-bar" style="background:${this.condColor(p.condicao)}"></span>
        <div class="pc-head"><span class="pc-cat">${esc(p.categoria)}</span>${condBadge(p.condicao)}</div>
        <div class="pc-name">${esc(p.nome)}</div>
        <div class="pc-foot"><span class="pc-price">${Fmt.brl(p.preco)}</span><span class="pc-stock ${low ? 'low' : ''}">${low ? '⚠ ' : ''}${p.qtd} un</span></div>
        <div class="pc-sku">${p.sku}</div>
        <span class="pc-add">+</span>
      </div>`;
    }).join('') || '<div class="empty-state" style="grid-column:1/-1"><div class="big">🔎</div>Nenhum produto disponível encontrado.</div>';
    if (!document.getElementById('cart').innerHTML) this.renderCart();
  },
  pdvEnter(e) {
    if (e.key === 'Escape') { document.getElementById('pdv-q').value = ''; this.pdvSearch(); return; }
    if (e.key !== 'Enter') return;
    const q = fval('pdv-q').toLowerCase();
    const exact = DB.all('produtos').find(p => p.barcode === fval('pdv-q') || p.sku.toLowerCase() === q);
    if (exact && exact.qtd > 0) { this.addCart(exact.id); document.getElementById('pdv-q').value = ''; this.pdvSearch(); }
  },
  addCart(id) {
    const p = DB.get('produtos', id);
    const ex = this.cart.itens.find(i => i.produtoId === id);
    if (ex) { if (ex.qtd < p.qtd) ex.qtd++; else return Toast.warn('Estoque máximo atingido.'); }
    else this.cart.itens.push({ produtoId: id, sku: p.sku, nome: p.nome, preco: p.preco, precoOriginal: p.preco, custo: p.custoMedio || p.custo, qtd: 1, max: p.qtd });
    this.renderCart();
  },
  cartQty(id, d) {
    const it = this.cart.itens.find(i => i.produtoId === id); if (!it) return;
    it.qtd += d; if (it.qtd <= 0) this.cart.itens = this.cart.itens.filter(i => i.produtoId !== id);
    if (it.qtd > it.max) { it.qtd = it.max; Toast.warn('Estoque máximo.'); }
    this.renderCart();
  },
  renderCart() {
    const c = this.cart;
    const bruto = c.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    const usadoVal = c.usado ? c.usado.valor : 0;
    const total = Math.max(0, bruto - c.desconto - usadoVal);
    const custo = c.itens.reduce((s, i) => s + i.custo * i.qtd, 0);
    const lucro = total - custo + (c.usado ? 0 : 0); // usado entra como estoque, lucro real apurado na revenda
    const qtdTotal = c.itens.reduce((s, i) => s + i.qtd, 0);
    const el = document.getElementById('cart');
    el.innerHTML = `
      <div class="cart-head"><span>🛒 Carrinho ${c.itens.length ? `<span class="ch-count">· ${qtdTotal} ${qtdTotal === 1 ? 'item' : 'itens'}</span>` : ''}</span>${c.itens.length ? `<a class="muted" style="font-size:12px;cursor:pointer" onclick="Modules.clearCart()">limpar</a>` : ''}</div>
      <div class="cart-items">
        ${c.itens.length ? c.itens.map(i => `
          <div class="cart-item">
            <span class="ci-thumb">${this.catIcon(i)}</span>
            <div class="ci-name">${esc(i.nome)}<small>${i.precoOriginal != null && i.preco !== i.precoOriginal ? `<s style="color:var(--txt-3)">${Fmt.brl(i.precoOriginal)}</s> ` : ''}${App.can('podeAlterarPreco') ? `<a style="color:var(--green);cursor:pointer" onclick="Modules.precoEdit('${i.produtoId}')">${Fmt.brl(i.preco)} ✎</a>` : Fmt.brl(i.preco)} un.${i.precoMotivo ? ' · ' + esc(i.precoMotivo) : ''}</small></div>
            <div class="qty"><button onclick="Modules.cartQty('${i.produtoId}',-1)">−</button><b>${i.qtd}</b><button onclick="Modules.cartQty('${i.produtoId}',1)">+</button></div>
            <div class="strong" style="width:74px;text-align:right">${Fmt.brl(i.preco * i.qtd)}</div>
            <span class="ci-rm" title="Remover" onclick="Modules.cartRemove('${i.produtoId}')">✕</span>
          </div>`).join('') : '<div class="cart-empty">🛒<br>Carrinho vazio.<br>Busque ou escaneie um produto.</div>'}
        ${c.usado ? `<div class="cart-item" style="background:var(--green-soft)"><span class="ci-thumb">🔄</span><div class="ci-name">${esc(c.usado.nome)}<small>Usado na troca</small></div><div class="strong" style="color:var(--green)">− ${Fmt.brl(c.usado.valor)}</div><span class="ci-rm" onclick="Modules.removeUsado()">✕</span></div>` : ''}
      </div>
      <div class="cart-foot">
        <div class="cart-line"><span>Subtotal</span><span>${Fmt.brl(bruto)}</span></div>
        ${App.can('podeDesconto') ? `<div class="cart-line"><span>Desconto</span><span><input type="number" id="cart-desc" value="${c.desconto}" style="width:90px;text-align:right;background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:4px 8px" oninput="Modules.setDesc(this.value)"></span></div>` : (c.desconto ? `<div class="cart-line"><span>Desconto</span><span>− ${Fmt.brl(c.desconto)}</span></div>` : '')}
        ${c.usado ? `<div class="cart-line"><span>Usado na troca</span><span style="color:var(--green)">− ${Fmt.brl(usadoVal)}</span></div>` : ''}
        <div class="cart-total"><span>Total</span><span class="val">${Fmt.brl(total)}</span></div>
        <button class="btn-ghost btn-block" style="margin-top:10px" onclick="Modules.addUsadoTroca()">🔄 Receber usado como pagamento</button>
        <button class="btn-primary btn-block" style="margin-top:8px" onclick="Modules.checkout()" ${c.itens.length ? '' : 'disabled style="opacity:.45;margin-top:8px"'}>Finalizar venda →</button>
      </div>`;
  },
  catIcon(i) {
    const p = DB.get('produtos', i.produtoId) || {};
    return { 'Consoles': '🎮', 'Jogos': '💿', 'Controles': '🕹️', 'Acessórios': '🎧', 'Colecionáveis': '🏆' }[p.categoria] || '📦';
  },
  cartRemove(id) { this.cart.itens = this.cart.itens.filter(i => i.produtoId !== id); this.renderCart(); },
  removeUsado() { this.cart.usado = null; this.renderCart(); },
  precoEdit(id) {
    if (!App.can('podeAlterarPreco')) return Toast.err('Você não tem permissão para alterar preço.');
    const it = this.cart.itens.find(i => i.produtoId === id); if (!it) return;
    Modal.open({
      title: '✎ Alterar preço nesta venda',
      body: `<p class="muted" style="margin-bottom:12px">${esc(it.nome)} — vale só para esta venda; não altera o cadastro.</p>
        <div class="form-grid">
          <div class="field"><label>Preço padrão</label><input value="${Fmt.brl(it.precoOriginal != null ? it.precoOriginal : it.preco)}" disabled></div>
          <div class="field"><label>Preço nesta venda (R$) *</label><input id="pe-valor" type="number" step="0.01" value="${it.preco}"></div>
          <div class="field full"><label>Motivo</label><select id="pe-motivo"><option>Desconto negociado</option><option>Produto com detalhe</option><option>Promoção</option><option>Ajuste de preço</option></select></div>
          <div class="field full"><label>Observação (opcional)</label><input id="pe-obs" placeholder="Detalhe da negociação"></div>
        </div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.precoSave('${id}')">Aplicar preço</button>`
    });
  },
  precoSave(id) {
    const it = this.cart.itens.find(i => i.produtoId === id); if (!it) return;
    const novo = fnum('pe-valor'); if (novo <= 0) return Toast.err('Informe um preço válido.');
    if (it.precoOriginal == null) it.precoOriginal = it.preco;
    it.preco = novo;
    const obs = fval('pe-obs');
    it.precoMotivo = (novo !== it.precoOriginal) ? (fval('pe-motivo') + (obs ? ' — ' + obs : '')) : null;
    Modal.close(); this.renderCart(); Toast.ok('Preço aplicado nesta venda.');
  },
  setDesc(v) { this.cart.desconto = parseFloat(v) || 0; this.renderCart(); },
  clearCart() { this.cart = { itens: [], desconto: 0, pagamentos: [], usado: null }; this.renderCart(); },
  utSel: null,
  addUsadoTroca() {
    this.utSel = null;
    Modal.open({
      title: '🔄 Receber usado como pagamento', wide: true,
      body: `<div id="ut-body"></div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Fechar</button>`
    });
    setTimeout(() => this.utRender(), 10);
  },
  utRender() {
    const b = document.getElementById('ut-body'); if (!b) return;
    if (!this.utSel) {
      const cats = DB.all('categorias').map(c => c.nome), marcas = DB.all('marcas').map(m => m.nome);
      b.innerHTML = `
        <p class="muted" style="margin-bottom:12px">Busque o produto no catálogo. Ao selecionar, será adicionada 1 unidade ao estoque desse produto (sem duplicar cadastro).</p>
        <div class="toolbar">
          <input class="grow" id="ut-q" placeholder="Buscar nome, SKU ou código..." oninput="Modules.utFilter()">
          <select id="ut-cat" onchange="Modules.utFilter()"><option value="">Categoria</option>${cats.map(c => `<option>${c}</option>`).join('')}</select>
          <select id="ut-marca" onchange="Modules.utFilter()"><option value="">Marca</option>${marcas.map(m => `<option>${m}</option>`).join('')}</select>
          <select id="ut-cond" onchange="Modules.utFilter()"><option value="">Condição</option><option>novo</option><option>seminovo</option><option>usado</option></select>
        </div>
        <div id="ut-list" style="max-height:46vh;overflow:auto;margin-bottom:12px"></div>
        <button class="btn-ghost" onclick="Modules.utNovo()">+ Cadastrar novo produto</button>`;
      this.utFilter();
    } else {
      const p = this.utSel;
      b.innerHTML = `
        <div class="list-row" style="background:var(--green-soft);border-radius:10px;padding:12px;margin-bottom:14px">
          <div class="lr-ico">🎮</div><div class="lr-main"><div class="lr-title">${esc(p.nome)} ${condBadge(p.condicao)}</div><div class="lr-sub">${p.sku} · ${p.categoria} · ${p.marca} · estoque atual: ${p.qtd}</div></div>
          <button class="btn-ghost btn-sm" onclick="Modules.utBack()">Trocar produto</button>
        </div>
        <div class="form-grid">
          <div class="field"><label>Valor aceito na troca (R$) *</label><input id="u-valor" type="number" step="0.01" placeholder="0,00"></div>
          <div class="field"><label>Estado do produto</label><select id="u-estado"><option>Excelente</option><option selected>Bom</option><option>Regular</option><option>Com defeito</option></select></div>
          <div class="field"><label>Número de série</label><input id="u-serie"></div>
          <div class="field"><label>Status inicial</label><select id="u-status"><option>Disponível</option><option selected>Aguardando revisão</option><option>Manutenção</option><option>Bloqueado</option></select></div>
          <div class="field full"><label>Acompanha</label><div style="display:flex;gap:18px;padding-top:8px;flex-wrap:wrap"><label style="font-weight:400"><input type="checkbox" id="u-controle" checked> Controle</label><label style="font-weight:400"><input type="checkbox" id="u-cabos" checked> Cabos</label><label style="font-weight:400"><input type="checkbox" id="u-caixa"> Caixa</label></div></div>
          <div class="field full"><label>Observações</label><input id="u-obs" placeholder="Detalhes da unidade recebida"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn-ghost" onclick="Modules.utBack()">Voltar</button><button class="btn-primary" onclick="Modules.utConfirm()">Adicionar à venda</button></div>`;
    }
  },
  utFilter() {
    const el = document.getElementById('ut-list'); if (!el) return;
    const q = (fval('ut-q') || '').toLowerCase(), cat = fval('ut-cat'), marca = fval('ut-marca'), cond = fval('ut-cond');
    let list = DB.all('produtos').filter(p =>
      (!q || p.nome.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').includes(q)) &&
      (!cat || p.categoria === cat) && (!marca || p.marca === marca) && (!cond || p.condicao === cond)).slice(0, 30);
    el.innerHTML = list.length ? list.map(p => `
      <div class="list-row" style="cursor:pointer" onclick="Modules.utPick('${p.id}')">
        <div class="lr-ico">🎮</div><div class="lr-main"><div class="lr-title">${esc(p.nome)} ${condBadge(p.condicao)}</div><div class="lr-sub">${p.sku} · ${p.categoria} · ${p.marca} · ${p.qtd} em estoque</div></div>
        <span style="font-size:18px;color:var(--txt-3)">›</span></div>`).join('')
      : '<div class="empty-state" style="padding:24px">Nenhum produto encontrado. Use "Cadastrar novo produto".</div>';
  },
  utPick(id) { this.utSel = DB.get('produtos', id); this.utRender(); },
  utBack() { this.utSel = null; this.utRender(); },
  utNovo() {
    const b = document.getElementById('ut-body'); if (!b) return;
    const cats = DB.all('categorias').map(c => c.nome), marcas = DB.all('marcas').map(m => m.nome);
    b.innerHTML = `
      <p class="muted" style="margin-bottom:12px">Cadastro rápido — fica salvo no catálogo geral e já é selecionado.</p>
      <div class="form-grid">
        <div class="field full"><label>Nome do produto *</label><input id="un-nome" placeholder="Ex: PS4 Slim 1TB"></div>
        <div class="field"><label>Categoria</label><select id="un-cat">${cats.map(c => `<option ${c === 'Consoles' ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Marca</label><select id="un-marca">${marcas.map(m => `<option>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Modelo</label><input id="un-modelo"></div>
        <div class="field"><label>Condição padrão</label><select id="un-cond"><option>usado</option><option>seminovo</option><option>novo</option></select></div>
        <div class="field"><label>Preço sugerido de venda (R$)</label><input id="un-preco" type="number" step="0.01" value="0"></div>
        <div class="field"><label>Estoque mínimo</label><input id="un-min" type="number" value="1"></div>
        <div class="field"><label>SKU / código interno (opcional)</label><input id="un-sku" placeholder="gerado automaticamente"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn-ghost" onclick="Modules.utRender()">Voltar</button><button class="btn-primary" onclick="Modules.utNovoSave()">Cadastrar e selecionar</button></div>`;
  },
  utNovoSave() {
    const nome = fval('un-nome'); if (!nome) return Toast.err('Informe o nome do produto.');
    const p = DB.insert('produtos', {
      nome, sku: fval('un-sku') || 'USD-' + Date.now().toString(36).toUpperCase().slice(-5), barcode: '',
      categoria: fval('un-cat'), marca: fval('un-marca'), modelo: fval('un-modelo'), condicao: fval('un-cond'),
      qtd: 0, min: parseInt(fval('un-min')) || 1, custo: 0, custoMedio: 0, preco: fnum('un-preco'), serie: '', local: 'Usados', status: 'disponivel'
    });
    Toast.ok('Produto cadastrado no catálogo.');
    this.utSel = p; this.utRender();
  },
  utConfirm() {
    const p = this.utSel, valor = fnum('u-valor');
    if (!p || !valor) return Toast.err('Informe o valor aceito na troca.');
    this.cart.usado = {
      produtoId: p.id, nome: p.nome, categoria: p.categoria, marca: p.marca, condicao: p.condicao, valor,
      estado: fval('u-estado'), serie: fval('u-serie'), controle: fchk('u-controle'), cabos: fchk('u-cabos'), caixa: fchk('u-caixa'),
      obs: fval('u-obs'), statusInicial: fval('u-status')
    };
    Modal.close(); this.renderCart(); Toast.ok('Usado adicionado: ' + p.nome + ' (' + Fmt.brl(valor) + ').');
  },
  checkout() {
    if (!this.cart.itens.length) return;
    const c = this.cart;
    const bruto = c.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    const usadoVal = c.usado ? c.usado.valor : 0;
    const totalVenda = Math.max(0, bruto - c.desconto);
    const total = Math.max(0, totalVenda - usadoVal); // valor a pagar em dinheiro/cartão
    const custoTot = c.itens.reduce((s, i) => s + i.custo * i.qtd, 0);
    this.coCtx = { total, totalVenda, custoTot, bruto, usadoVal };
    const primeira = (typeof Taxas !== 'undefined' && Taxas.ativas()[0]) ? Taxas.ativas()[0].key : 'PIX';
    this.coPays = [{ method: primeira, valor: total }];
    Modal.open({
      title: 'Finalizar venda — ' + Fmt.brl(total), wide: true,
      body: `<div class="form-grid" style="gap:18px">
        <div><div class="section-title">Formas de pagamento</div>
          <div id="co-lines"></div>
          <button class="btn-ghost btn-sm" style="margin-top:8px" onclick="Modules.coAddLine()">+ Adicionar pagamento</button>
        </div>
        <div><div class="section-title">Resumo da venda</div><div id="co-sim"></div></div>
      </div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Voltar</button><button class="btn-primary" id="co-confirm" onclick="Modules.confirmVenda()">✅ Confirmar venda</button>`
    });
    setTimeout(() => this.coRender(), 10);
  },
  coMethods() { return (typeof Taxas !== 'undefined') ? Taxas.ativas().map(t => t.key) : ['PIX', 'Dinheiro', 'Débito', 'Crédito à vista']; },
  coAddLine() { const soma = this.coPays.reduce((s, p) => s + (+p.valor || 0), 0); this.coPays.push({ method: 'Dinheiro', valor: Math.max(0, this.coCtx.total - soma) }); this.coRender(); },
  coDel(i) { this.coPays.splice(i, 1); this.coRender(); },
  coSet(i, f, v) { this.coPays[i][f] = f === 'valor' ? (parseFloat(String(v).replace(',', '.')) || 0) : v; this.coRender(); },
  coMethodToPag(key, valor) { if (key.indexOf('Crédito') === 0) { const m = key.match(/(\d+)x/); return { tipo: 'Crédito', valor, parcelas: m ? +m[1] : 1 }; } return { tipo: key, valor, parcelas: 1 }; },
  coRender() {
    const linesEl = document.getElementById('co-lines'); if (!linesEl) return;
    const pays = this.coPays, { total } = this.coCtx, opts = this.coMethods();
    linesEl.innerHTML = pays.map((p, idx) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <select onchange="Modules.coSet(${idx},'method',this.value)" style="flex:1;background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:9px 10px">${opts.map(o => `<option ${o === p.method ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <input type="number" step="0.01" value="${p.valor}" onchange="Modules.coSet(${idx},'valor',this.value)" style="width:120px;text-align:right;background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:9px 10px">
        ${pays.length > 1 ? `<span class="ci-rm" title="Remover" onclick="Modules.coDel(${idx})">✕</span>` : '<span style="width:14px"></span>'}
      </div>`).join('');

    const soma = pays.reduce((s, p) => s + (+p.valor || 0), 0);
    const cash = pays.filter(p => p.method === 'Dinheiro').reduce((s, p) => s + (+p.valor || 0), 0);
    const nonCash = soma - cash;
    const restante = +(total - soma).toFixed(2);
    const excedenteCartao = +(nonCash - total).toFixed(2);
    const troco = soma > total ? +(soma - total).toFixed(2) : 0;
    const invalido = restante > 0.01 || excedenteCartao > 0.01;
    const usadoVal = this.coCtx.usadoVal || 0, totalVenda = this.coCtx.totalVenda != null ? this.coCtx.totalVenda : total;
    document.getElementById('co-sim').innerHTML = `
      <div class="card" style="background:var(--bg-2)">
        <div class="mini-stat" style="font-size:17px"><span class="strong">Total da venda</span><b style="color:var(--green)">${Fmt.brl(totalVenda)}</b></div>
        ${this.cart.desconto ? `<div class="mini-stat"><span>Desconto aplicado</span><b style="color:var(--red)">− ${Fmt.brl(this.cart.desconto)}</b></div>` : ''}
        ${usadoVal ? `<div class="mini-stat"><span>🔄 Usado recebido${this.cart.usado ? ' (' + esc(this.cart.usado.nome) + ')' : ''}</span><b style="color:var(--green)">− ${Fmt.brl(usadoVal)}</b></div>` : ''}
        ${usadoVal ? `<div class="mini-stat"><span class="strong">A pagar</span><b>${Fmt.brl(total)}</b></div>` : ''}
        <div class="mini-stat"><span>Valor já pago</span><b>${Fmt.brl(soma)}</b></div>
        <div class="mini-stat"><span>Saldo restante</span><b style="color:${restante > 0.01 ? 'var(--amber)' : 'var(--green)'}">${Fmt.brl(Math.max(0, restante))}</b></div>
      </div>
      ${troco > 0.01 && excedenteCartao <= 0.01 ? `<div class="troco-box"><span class="muted">Troco (dinheiro)</span><span class="tb-val">${Fmt.brl(troco)}</span></div>` : ''}
      ${excedenteCartao > 0.01 ? `<div class="alert-card danger" style="margin-top:12px"><div class="a-ico">⚠️</div><div><div class="a-lbl">Pagamentos eletrônicos excedem o total em ${Fmt.brl(excedenteCartao)}. Ajuste os valores.</div></div></div>` : ''}`;
    const btn = document.getElementById('co-confirm'); if (btn) { btn.disabled = invalido; btn.style.opacity = invalido ? '.5' : '1'; }
  },
  confirmVenda() {
    const c = this.cart, { total, custoTot, bruto } = this.coCtx, pays = this.coPays;
    const totalVenda = this.coCtx.totalVenda != null ? this.coCtx.totalVenda : total;
    const usadoVal = this.coCtx.usadoVal || 0;
    const soma = pays.reduce((s, p) => s + (+p.valor || 0), 0);
    const cash = pays.filter(p => p.method === 'Dinheiro').reduce((s, p) => s + (+p.valor || 0), 0);
    if (soma < total - 0.01) return Toast.err('Ainda falta ' + Fmt.brl(total - soma) + ' a pagar.');
    if ((soma - cash) > total + 0.01) return Toast.err('Pagamentos eletrônicos excedem o total. Ajuste os valores.');
    const pagamentos = pays.map(p => { const pg = this.coMethodToPag(p.method, +p.valor || 0); pg.taxa = (typeof Taxas !== 'undefined') ? Taxas.feeByKey(p.method, +p.valor || 0) : 0; return pg; });
    const taxaTotal = pagamentos.reduce((s, p) => s + p.taxa, 0);
    const lucro = totalVenda - custoTot, liquido = totalVenda - taxaTotal, lucroLiquido = liquido - custoTot;
    c.itens.forEach(i => { const p = DB.get('produtos', i.produtoId); const novaQtd = p.qtd - i.qtd; DB.update('produtos', i.produtoId, { qtd: novaQtd, status: novaQtd <= 0 ? 'vendido' : p.status }); });
    const troco = Math.max(0, soma - total);
    const operador = (typeof App !== 'undefined' && App.user() && App.user().nome) ? App.user().nome : 'Admin';
    const itensArr = c.itens.map(i => { const pr = DB.get('produtos', i.produtoId) || {}; return { produtoId: i.produtoId, sku: i.sku, nome: i.nome, qtd: i.qtd, preco: i.preco, precoOriginal: i.precoOriginal != null ? i.precoOriginal : i.preco, precoMotivo: i.precoMotivo || null, custo: i.custo, categoria: pr.categoria || '—', condicao: pr.condicao || 'novo' }; });
    const cupomSnap = (typeof Cupom !== 'undefined') ? Cupom.snapshot({ itens: itensArr }) : null;
    const venda = DB.insert('vendas', {
      data: new Date().toISOString(), itens: itensArr,
      bruto, desconto: c.desconto, total: totalVenda, aPagar: total, custoTotal: custoTot, lucro, taxaTotal, liquido, lucroLiquido,
      pagamentos, recebido: soma, troco, usadoEntrada: c.usado ? c.usado.nome : null, usadoValor: usadoVal, usado: c.usado || null, usuario: operador, cupom: cupomSnap
    });
    // Usado como pagamento → reutiliza o produto do catálogo: +1 unidade (sem duplicar) e custo médio
    if (c.usado) {
      const u = c.usado;
      const stMap = { 'Disponível': 'disponivel', 'Aguardando revisão': 'manutencao', 'Manutenção': 'manutencao', 'Bloqueado': 'reservado' };
      const p = DB.get('produtos', u.produtoId);
      if (p) {
        const qNova = p.qtd + 1;
        const custoMedio = qNova ? (((p.custoMedio || p.custo || 0) * p.qtd) + u.valor) / qNova : u.valor;
        const patch = { qtd: qNova, custo: u.valor, custoMedio: Math.round(custoMedio * 100) / 100 };
        if (u.serie && !p.serie) patch.serie = u.serie;
        if (u.statusInicial && u.statusInicial !== 'Disponível') patch.status = stMap[u.statusInicial] || p.status;
        DB.update('produtos', u.produtoId, patch);
      }
      DB.logMov('usado', 'Usado recebido na troca: ' + u.nome + (u.serie ? ' (S/N ' + u.serie + ')' : '') + ' — ' + Fmt.brl(u.valor) + ' · venda #' + venda.id.slice(-4), { valor: u.valor, refId: venda.id });
      DB.logFin({ tipo: 'saida', categoria: 'Compra de usado', subcategoria: 'Troca', descricao: 'Usado recebido em troca: ' + u.nome + ' (venda #' + venda.id.slice(-4) + ')', valor: u.valor, status: 'pago', origem: 'usado', refId: venda.id });
    }
    const formaStr = pagamentos.map(p => p.tipo + (p.parcelas > 1 ? ' ' + p.parcelas + 'x' : '')).join(' + ');
    DB.logMov('venda', 'Venda: ' + c.itens.map(i => i.qtd + 'x ' + i.nome).join(', ') + (c.usado ? ' (troca c/ usado)' : ''), { valor: totalVenda, refId: venda.id });
    DB.logFin({ tipo: 'entrada', categoria: 'Venda', descricao: 'Venda PDV #' + venda.id.slice(-4) + ' (' + formaStr + (c.usado ? ' + usado' : '') + ')', valor: totalVenda, taxa: taxaTotal, liquido: liquido, status: 'pago', origem: 'venda', refId: venda.id });
    // dinheiro líquido (descontado troco) entra no Caixa
    const dinheiro = pagamentos.filter(p => p.tipo === 'Dinheiro').reduce((s, p) => s + p.valor, 0);
    const netCash = Math.max(0, dinheiro - Math.max(0, soma - total));
    if (netCash > 0 && typeof Caixa !== 'undefined') Caixa.add({ fluxo: 'entrada', tipo: 'Venda em dinheiro', origem: 'Venda em dinheiro', categoria: 'Venda', valor: netCash, obs: c.itens.map(i => i.nome).join(', '), refId: venda.id });
    Modal.close();
    Toast.ok('Venda concluída! ' + Fmt.brl(totalVenda) + (c.usado ? ' · usado ' + Fmt.brl(usadoVal) : '') + (troco > 0 ? ' · Troco ' + Fmt.brl(troco) : ''));
    this.clearCart(); this.pdvSearch();
    if (typeof Print !== 'undefined') Print.maybeAfterSale(venda);
  },

  /* ===================== FORNECEDORES ===================== */
  fornecedores() {
    const f = DB.all('fornecedores');
    return `<div class="page-head"><div><h1>Fornecedores</h1><p>${f.length} fornecedores cadastrados</p></div>
      <div class="actions"><button class="btn-primary" onclick="Modules.fornForm()">+ Novo fornecedor</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Fornecedor</th><th>CNPJ</th><th>Contato</th><th>Telefone</th><th>Cidade</th><th></th></tr></thead>
      <tbody>${f.map(x => `<tr><td class="strong">${esc(x.nome)}<div class="muted" style="font-size:11px">${esc(x.email || '')}</div></td><td>${esc(x.cnpj || '-')}</td><td>${esc(x.contato || '-')}</td><td>${esc(x.tel || '-')}</td><td>${esc(x.cidade || '-')}</td>
      <td class="num"><button class="btn-icon" onclick="Modules.fornForm('${x.id}')">✏️</button> <button class="btn-icon" onclick="Modules.delForn('${x.id}')">🗑️</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Nenhum fornecedor.</td></tr>'}</tbody></table></div>`;
  },
  fornForm(id) {
    const f = id ? DB.get('fornecedores', id) : {};
    Modal.open({
      title: id ? 'Editar fornecedor' : 'Novo fornecedor',
      body: `<div class="form-grid">
        <div class="field full"><label>Nome / Razão social *</label><input id="f-nome" value="${esc(f.nome || '')}"></div>
        <div class="field"><label>CNPJ</label><input id="f-cnpj" value="${esc(f.cnpj || '')}"></div>
        <div class="field"><label>Contato</label><input id="f-contato" value="${esc(f.contato || '')}"></div>
        <div class="field"><label>Telefone</label><input id="f-tel" value="${esc(f.tel || '')}"></div>
        <div class="field"><label>E-mail</label><input id="f-email" value="${esc(f.email || '')}"></div>
        <div class="field full"><label>Cidade/UF</label><input id="f-cidade" value="${esc(f.cidade || '')}"></div></div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveForn('${id || ''}')">Salvar</button>`
    });
  },
  saveForn(id) {
    const nome = fval('f-nome'); if (!nome) return Toast.err('Informe o nome.');
    const d = { nome, cnpj: fval('f-cnpj'), contato: fval('f-contato'), tel: fval('f-tel'), email: fval('f-email'), cidade: fval('f-cidade') };
    if (id) DB.update('fornecedores', id, d); else DB.insert('fornecedores', d);
    Modal.close(); Toast.ok('Fornecedor salvo.'); App.go('fornecedores');
  },
  delForn(id) { Modal.confirm('Excluir este fornecedor?', () => { DB.remove('fornecedores', id); App.go('fornecedores'); Toast.ok('Removido.'); }, 'Excluir'); },

  /* ===================== COMPRAS ===================== */
  compras() {
    const cs = DB.all('compras').slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const fmap = {}; DB.all('fornecedores').forEach(f => fmap[f.id] = f.nome);
    return `<div class="page-head"><div><h1>Compras</h1><p>Entrada de mercadorias e histórico de compras</p></div>
      <div class="actions"><button class="btn-primary" onclick="Modules.compraForm()">+ Entrada de mercadoria</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>NF</th><th>Fornecedor</th><th>Itens</th><th class="num">Frete</th><th class="num">Impostos</th><th class="num">Total</th><th>Status</th></tr></thead>
      <tbody>${cs.map(c => `<tr><td>${Fmt.date(c.data)}</td><td>${esc(c.nf || '-')}</td><td>${esc(fmap[c.fornecedorId] || '-')}</td>
        <td>${c.itens.reduce((s, i) => s + i.qtd, 0)} un · ${c.itens.length} itens</td><td class="num">${Fmt.brl(c.frete)}</td><td class="num">${Fmt.brl(c.impostos)}</td>
        <td class="num strong">${Fmt.brl(c.total)}</td><td>${statusBadge(c.status)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">Nenhuma compra.</td></tr>'}</tbody></table></div>`;
  },
  compraItens: [],
  compraForm() {
    this.compraItens = [];
    const fs = DB.all('fornecedores');
    Modal.open({
      title: '🚚 Entrada de mercadoria', wide: true,
      body: `<div class="form-grid">
        <div class="field"><label>Fornecedor</label><select id="c-forn">${fs.map(f => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></div>
        <div class="field"><label>Nota Fiscal</label><input id="c-nf" placeholder="NF-0000"></div>
        <div class="field"><label>Frete (R$)</label><input id="c-frete" type="number" step="0.01" value="0" oninput="Modules.renderCompraResumo()"></div>
        <div class="field"><label>Impostos (R$)</label><input id="c-imp" type="number" step="0.01" value="0" oninput="Modules.renderCompraResumo()"></div>
      </div>
      <div class="section-title" style="margin-top:18px">Itens da compra</div>
      <div class="form-grid">
        <div class="field full"><label>Produto (existente ou novo nome)</label><input id="ci-prod" list="ci-prodlist" placeholder="Buscar ou digitar novo produto">
          <datalist id="ci-prodlist">${DB.all('produtos').map(p => `<option value="${esc(p.nome)}">${p.sku}</option>`).join('')}</datalist></div>
        <div class="field"><label>Quantidade</label><input id="ci-qtd" type="number" value="1"></div>
        <div class="field"><label>Custo unitário (R$)</label><input id="ci-custo" type="number" step="0.01" value="0"></div>
      </div>
      <button class="btn-ghost btn-sm" style="margin-top:8px" onclick="Modules.addCompraItem()">+ Adicionar item</button>
      <div id="compra-itens" style="margin-top:14px"></div>
      <div id="compra-resumo"></div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveCompra()">Confirmar entrada</button>`
    });
    this.renderCompraResumo();
  },
  addCompraItem() {
    const nome = fval('ci-prod'), qtd = parseInt(fval('ci-qtd')) || 0, custo = fnum('ci-custo');
    if (!nome || qtd <= 0) return Toast.err('Informe produto e quantidade.');
    const existente = DB.all('produtos').find(p => p.nome.toLowerCase() === nome.toLowerCase());
    this.compraItens.push({ nome, qtd, custo, sku: existente ? existente.sku : null, produtoId: existente ? existente.id : null });
    document.getElementById('ci-prod').value = ''; document.getElementById('ci-qtd').value = '1'; document.getElementById('ci-custo').value = '0';
    this.renderCompraResumo();
  },
  renderCompraResumo() {
    const box = document.getElementById('compra-itens'); if (!box) return;
    box.innerHTML = this.compraItens.length ? `<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Custo un.</th><th class="num">Subtotal</th><th></th></tr></thead>
      <tbody>${this.compraItens.map((i, idx) => `<tr><td>${esc(i.nome)} ${i.produtoId ? '' : '<span class="badge b-blue">novo</span>'}</td><td class="num">${i.qtd}</td><td class="num">${Fmt.brl(i.custo)}</td><td class="num">${Fmt.brl(i.qtd * i.custo)}</td><td class="num"><button class="btn-icon" onclick="Modules.compraItens.splice(${idx},1);Modules.renderCompraResumo()">🗑️</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum item adicionado ainda.</p>';
    const sub = this.compraItens.reduce((s, i) => s + i.qtd * i.custo, 0);
    const frete = fnum('c-frete'), imp = fnum('c-imp');
    document.getElementById('compra-resumo').innerHTML = `<div class="card" style="margin-top:14px;background:var(--bg-2)">
      <div class="mini-stat"><span>Subtotal mercadoria</span><b>${Fmt.brl(sub)}</b></div>
      <div class="mini-stat"><span>Frete</span><b>${Fmt.brl(frete)}</b></div>
      <div class="mini-stat"><span>Impostos</span><b>${Fmt.brl(imp)}</b></div>
      <div class="mini-stat" style="font-size:16px"><span class="strong">Total da compra</span><b style="color:var(--green)">${Fmt.brl(sub + frete + imp)}</b></div></div>`;
  },
  saveCompra() {
    if (!this.compraItens.length) return Toast.err('Adicione ao menos um item.');
    const sub = this.compraItens.reduce((s, i) => s + i.qtd * i.custo, 0);
    const frete = fnum('c-frete'), imp = fnum('c-imp'), total = sub + frete + imp;
    const rateio = sub ? (frete + imp) / sub : 0; // rateia frete+impostos no custo
    this.compraItens.forEach(i => {
      const custoReal = i.custo * (1 + rateio);
      if (i.produtoId) {
        const p = DB.get('produtos', i.produtoId);
        const qtdNova = p.qtd + i.qtd;
        const custoMedio = ((p.custoMedio || p.custo) * p.qtd + custoReal * i.qtd) / qtdNova;
        DB.update('produtos', i.produtoId, { qtd: qtdNova, custoMedio: Math.round(custoMedio * 100) / 100, custo: i.custo, status: 'disponivel' });
      } else {
        DB.insert('produtos', { nome: i.nome, sku: 'NEW-' + Date.now().toString(36).toUpperCase().slice(-5), barcode: '', categoria: 'Acessórios', marca: '—', modelo: '', condicao: 'novo', qtd: i.qtd, min: 1, custo: i.custo, custoMedio: Math.round(custoReal * 100) / 100, preco: Math.round(custoReal * 1.6), serie: '', local: 'A definir', status: 'disponivel' });
      }
    });
    const compra = DB.insert('compras', {
      data: new Date().toISOString(), fornecedorId: fval('c-forn'), nf: fval('c-nf'),
      itens: this.compraItens, frete, impostos: imp, subtotal: sub, total, status: 'recebido'
    });
    DB.logMov('compra', 'Entrada de mercadoria — ' + (fval('c-nf') || 'sem NF') + ' (' + this.compraItens.reduce((s, i) => s + i.qtd, 0) + ' un)', { valor: total, refId: compra.id });
    DB.logFin({ tipo: 'saida', categoria: 'Compra de mercadoria', descricao: 'Compra ' + (fval('c-nf') || compra.id.slice(-4)), valor: total, status: 'pago', origem: 'compra', refId: compra.id });
    Modal.close(); Toast.ok('Mercadoria recebida e estoque atualizado.'); App.go('compras');
  },

  /* ===================== AVALIAÇÃO DE USADOS ===================== */
  usados() {
    const a = DB.all('avaliacoes').slice().sort((x, y) => new Date(y.data) - new Date(x.data));
    return `<div class="page-head"><div><h1>Avaliação de Usados</h1><p>Avalie aparelhos recebidos: estado, manutenção, margem prevista</p></div>
      <div class="actions"><button class="btn-primary" onclick="Modules.avalForm()">+ Nova avaliação</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Estado</th><th>Caixa/Acess.</th><th class="num">Mercado</th><th class="num">Aceito</th><th class="num">Manut.</th><th class="num">Custo final</th><th class="num">Preço sug.</th><th class="num">Margem</th><th></th></tr></thead>
      <tbody>${a.map(x => `<tr><td class="strong">${esc(x.produtoNome)}<div class="muted" style="font-size:11px">${x.marca || ''} ${x.modelo || ''}${x.serie ? ' · S/N ' + x.serie : ''}</div></td>
        <td>${esc(x.estado)}</td><td>${x.temCaixa ? '📦' : '—'} ${x.temAcessorios ? '🎮' : ''}</td>
        <td class="num">${Fmt.brl(x.valorMercado)}</td><td class="num">${Fmt.brl(x.valorAceito)}</td><td class="num">${Fmt.brl(x.custoManutencao)}</td>
        <td class="num strong">${Fmt.brl(x.custoFinal)}</td><td class="num">${Fmt.brl(x.precoSugerido)}</td>
        <td class="num"><span class="badge ${x.margem > 0 ? 'b-green' : 'b-red'}">${Fmt.brl(x.margem)}</span></td>
        <td class="num"><button class="btn-ghost btn-sm" onclick="Modules.aprovarUsado('${x.id}')">→ Estoque</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:30px">Nenhuma avaliação.</td></tr>'}</tbody></table></div>`;
  },
  avalForm() {
    Modal.open({
      title: '🔍 Avaliação de usado', wide: true,
      body: `<div class="form-grid">
        <div class="field full"><label>Produto recebido *</label><input id="a-nome" placeholder="Ex: PlayStation 4 Pro 1TB"></div>
        <div class="field"><label>Categoria</label><select id="a-cat">${DB.all('categorias').map(c => `<option>${c.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Marca</label><select id="a-marca">${DB.all('marcas').map(m => `<option>${m.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Modelo</label><input id="a-modelo"></div>
        <div class="field"><label>Nº de série</label><input id="a-serie"></div>
        <div class="field"><label>Estado geral</label><select id="a-estado"><option>Excelente</option><option selected>Bom</option><option>Regular</option><option>Com defeito</option></select></div>
        <div class="field"><label>Acompanha</label><div style="display:flex;gap:16px;padding-top:8px"><label style="font-weight:400"><input type="checkbox" id="a-caixa" checked> Caixa</label><label style="font-weight:400"><input type="checkbox" id="a-acess" checked> Acessórios</label></div></div>
        <div class="field"><label>Valor de mercado (R$)</label><input id="a-mercado" type="number" step="0.01" value="0" oninput="Modules.calcAval()"></div>
        <div class="field"><label>Valor aceito pela loja (R$) *</label><input id="a-aceito" type="number" step="0.01" value="0" oninput="Modules.calcAval()"></div>
        <div class="field"><label>Custo de manutenção (R$)</label><input id="a-manut" type="number" step="0.01" value="0" oninput="Modules.calcAval()"></div>
        <div class="field"><label>Preço sugerido de venda (R$)</label><input id="a-preco" type="number" step="0.01" value="0" oninput="Modules.calcAval()"></div>
      </div>
      <div id="aval-resumo"></div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveAval()">Salvar avaliação</button>`
    });
    this.calcAval();
  },
  calcAval() {
    const aceito = fnum('a-aceito'), manut = fnum('a-manut'), preco = fnum('a-preco');
    const custoFinal = aceito + manut, margem = preco - custoFinal;
    const box = document.getElementById('aval-resumo'); if (!box) return;
    box.innerHTML = `<div class="card" style="margin-top:14px;background:var(--bg-2)">
      <div class="mini-stat"><span>Custo final (aceito + manutenção)</span><b>${Fmt.brl(custoFinal)}</b></div>
      <div class="mini-stat"><span>Preço sugerido</span><b>${Fmt.brl(preco)}</b></div>
      <div class="mini-stat" style="font-size:16px"><span class="strong">Margem prevista</span><b style="color:${margem >= 0 ? 'var(--green)' : 'var(--red)'}">${Fmt.brl(margem)} ${preco ? '(' + Fmt.pct(margem / preco * 100) + ')' : ''}</b></div></div>`;
  },
  saveAval() {
    const nome = fval('a-nome'), aceito = fnum('a-aceito');
    if (!nome || !aceito) return Toast.err('Informe produto e valor aceito.');
    const manut = fnum('a-manut'), preco = fnum('a-preco'), custoFinal = aceito + manut;
    DB.insert('avaliacoes', {
      data: new Date().toISOString(), produtoNome: nome, categoria: fval('a-cat'), marca: fval('a-marca'),
      modelo: fval('a-modelo'), serie: fval('a-serie'), estado: fval('a-estado'),
      temCaixa: fchk('a-caixa'), temAcessorios: fchk('a-acess'),
      valorMercado: fnum('a-mercado'), valorAceito: aceito, custoManutencao: manut,
      custoFinal, precoSugerido: preco, margem: preco - custoFinal, status: 'avaliado'
    });
    Modal.close(); Toast.ok('Avaliação registrada.'); App.go('usados');
  },
  aprovarUsado(id) {
    const a = DB.get('avaliacoes', id);
    DB.insert('produtos', {
      nome: a.produtoNome, sku: 'USD-' + Date.now().toString(36).toUpperCase().slice(-5), barcode: '',
      categoria: a.categoria, marca: a.marca, modelo: a.modelo, condicao: 'usado',
      qtd: 1, min: 1, custo: a.custoFinal, custoMedio: a.custoFinal, preco: a.precoSugerido,
      serie: a.serie, local: 'Usados', status: a.estado === 'Com defeito' ? 'manutencao' : 'disponivel'
    });
    DB.logMov('usado', 'Usado aprovado p/ estoque: ' + a.produtoNome, { valor: a.custoFinal });
    DB.logFin({ tipo: 'saida', categoria: 'Compra de usado', descricao: 'Compra de usado: ' + a.produtoNome, valor: a.valorAceito, status: 'pago', origem: 'usado' });
    if (a.custoManutencao) DB.logFin({ tipo: 'saida', categoria: 'Manutenção', descricao: 'Manutenção: ' + a.produtoNome, valor: a.custoManutencao, status: 'pago' });
    Toast.ok('Usado adicionado ao estoque.'); App.go('usados');
  },

  /* ===================== TROCAS ===================== */
  trocas() {
    const t = DB.all('vendas').filter(v => v.usadoEntrada && !v.cancelada).slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    return `<div class="page-head"><div><h1>Trocas e Usados</h1><p>Compra de usado, troca parcial, troca direta e usado como pagamento</p></div>
      <div class="actions"><button class="btn-primary" onclick="App.go('pdv')">🛒 Iniciar troca no PDV</button></div></div>
      <div class="card" style="margin-bottom:18px">
        <div class="section-title">Como funciona a troca</div>
        <p class="muted" style="line-height:1.7">No PDV, adicione o produto que o cliente vai levar, clique em <b style="color:var(--green)">"Receber usado como pagamento"</b> e informe o valor aceito. O sistema abate o usado do total, dá entrada do usado no estoque e atualiza financeiro e lucro automaticamente.<br><br>
        <b>Exemplo:</b> Venda de PS5 por R$ 3.500 · Entrada de PS4 avaliado em R$ 800 · Cliente paga a diferença de <b style="color:var(--green)">R$ 2.700</b>.</p>
      </div>
      <div class="section-title">Trocas realizadas</div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Produto vendido</th><th>Usado recebido</th><th class="num">Valor venda</th><th class="num">Lucro</th><th>Pagamento</th></tr></thead>
      <tbody>${t.map(v => `<tr><td>${Fmt.date(v.data)}</td><td>${v.itens.map(i => esc(i.nome)).join(', ')}</td><td><span class="badge b-green">🔄 ${esc(v.usadoEntrada)}</span></td>
        <td class="num strong">${Fmt.brl(v.total)}</td><td class="num">${Fmt.brl(v.lucro)}</td><td>${v.pagamentos.map(p => p.tipo).join(', ')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:30px">Nenhuma troca realizada ainda.</td></tr>'}</tbody></table></div>`;
  },

  /* ===================== MOVIMENTAÇÕES ===================== */
  movimentacoes() {
    return `<div class="page-head"><div><h1>Movimentações</h1><p>Histórico completo e rastreabilidade de tudo que acontece no sistema</p></div></div>
      <div class="toolbar"><input class="grow" id="mov-q" placeholder="Buscar movimentação..." oninput="Modules.renderMovs()">
        <select id="mov-tipo" onchange="Modules.renderMovs()"><option value="">Todos os tipos</option>
        ${['venda', 'compra', 'usado', 'troca', 'garantia', 'devolucao', 'ajuste', 'manutencao'].map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
      <div id="mov-list"></div>`;
  },
  renderMovs() {
    const q = (fval('mov-q') || '').toLowerCase(), tipo = fval('mov-tipo');
    let list = DB.all('movimentacoes').filter(m => (!tipo || m.tipo === tipo) && (!q || m.descricao.toLowerCase().includes(q)));
    document.getElementById('mov-list').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Data/Hora</th><th>Tipo</th><th>Descrição</th><th>Usuário</th><th class="num">Valor</th></tr></thead>
      <tbody>${list.map(m => `<tr><td>${Fmt.datetime(m.data)}</td><td><span class="badge b-gray">${movIcon(m.tipo)} ${m.tipo}</span></td><td>${esc(m.descricao)}</td><td>${m.usuario}</td><td class="num">${m.valor ? Fmt.brl(m.valor) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">Nenhuma movimentação.</td></tr>'}</tbody></table></div>`;
  },

  /* ===================== GARANTIAS ===================== */
  garantias() {
    const g = DB.all('garantias').slice().sort((a, b) => new Date(b.dataVenda) - new Date(a.dataVenda));
    const now = new Date();
    return `<div class="page-head"><div><h1>Garantias</h1><p>Controle de garantias por número de série e atendimentos</p></div>
      <div class="actions"><button class="btn-primary" onclick="Modules.garForm()">+ Registrar garantia</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Nº série</th><th>Venda</th><th>Prazo</th><th>Validade</th><th>Defeito</th><th class="num">Custo</th><th>Status</th><th></th></tr></thead>
      <tbody>${g.map(x => {
        const venc = new Date(x.dataVenda); venc.setDate(venc.getDate() + x.prazoDias);
        const vigente = venc >= now;
        return `<tr><td class="strong">${esc(x.produtoNome)}</td><td>${esc(x.serie || '-')}</td><td>${Fmt.date(x.dataVenda)}</td><td>${x.prazoDias} dias</td>
        <td>${Fmt.date(venc)} ${vigente ? '<span class="badge b-green">vigente</span>' : '<span class="badge b-red">vencida</span>'}</td>
        <td>${esc(x.defeito || '—')}</td><td class="num">${Fmt.brl(x.custo)}</td><td>${statusBadge(x.status)}</td>
        <td class="num"><button class="btn-ghost btn-sm" onclick="Modules.garDetalhe('${x.id}')">Atender</button></td></tr>`;
      }).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:30px">Nenhuma garantia.</td></tr>'}</tbody></table></div>`;
  },
  garForm() {
    const prods = DB.all('produtos');
    Modal.open({
      title: '🛡️ Registrar garantia',
      body: `<div class="form-grid">
        <div class="field full"><label>Produto</label><input id="g-prod" placeholder="Nome do produto vendido"></div>
        <div class="field"><label>Nº de série</label><input id="g-serie"></div>
        <div class="field"><label>Data da venda</label><input id="g-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Prazo de garantia (dias)</label><input id="g-prazo" type="number" value="365"></div>
        <div class="field full"><label>Defeito informado</label><textarea id="g-defeito" placeholder="Descreva o defeito relatado pelo cliente"></textarea></div>
      </div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveGar()">Salvar</button>`
    });
  },
  saveGar() {
    const nome = fval('g-prod'); if (!nome) return Toast.err('Informe o produto.');
    const defeito = fval('g-defeito');
    DB.insert('garantias', {
      produtoNome: nome, serie: fval('g-serie'), dataVenda: new Date(fval('g-data')).toISOString(),
      prazoDias: parseInt(fval('g-prazo')) || 365, defeito, custo: 0,
      status: defeito ? 'em_atendimento' : 'ativa', ocorrencias: defeito ? [{ data: new Date().toISOString(), texto: 'Abertura: ' + defeito }] : []
    });
    DB.logMov('garantia', 'Garantia registrada: ' + nome, { valor: 0 });
    Modal.close(); Toast.ok('Garantia registrada.'); App.go('garantias');
  },
  garDetalhe(id) {
    const g = DB.get('garantias', id);
    Modal.open({
      title: '🛡️ ' + esc(g.produtoNome),
      body: `<div class="card" style="background:var(--bg-2);margin-bottom:14px">
          <div class="mini-stat"><span>Nº série</span><b>${esc(g.serie || '-')}</b></div>
          <div class="mini-stat"><span>Data da venda</span><b>${Fmt.date(g.dataVenda)}</b></div>
          <div class="mini-stat"><span>Prazo</span><b>${g.prazoDias} dias</b></div>
          <div class="mini-stat"><span>Custo acumulado</span><b>${Fmt.brl(g.custo)}</b></div>
        </div>
        <div class="section-title">Histórico de ocorrências</div>
        ${(g.ocorrencias || []).map(o => `<div class="list-row"><div class="lr-ico">📝</div><div class="lr-main"><div class="lr-title">${esc(o.texto)}</div><div class="lr-sub">${Fmt.datetime(o.data)}</div></div></div>`).join('') || '<p class="muted">Sem ocorrências.</p>'}
        <div class="form-grid" style="margin-top:16px">
          <div class="field full"><label>Nova ocorrência / atualização</label><textarea id="gar-oco" placeholder="Ex: enviado à assistência, reparo concluído..."></textarea></div>
          <div class="field"><label>Custo gerado (R$)</label><input id="gar-custo" type="number" step="0.01" value="0"></div>
          <div class="field"><label>Status</label><select id="gar-status">
            <option value="ativa" ${g.status === 'ativa' ? 'selected' : ''}>Ativa</option>
            <option value="em_atendimento" ${g.status === 'em_atendimento' ? 'selected' : ''}>Em atendimento</option>
            <option value="encerrada" ${g.status === 'encerrada' ? 'selected' : ''}>Encerrada</option></select></div>
        </div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Fechar</button><button class="btn-primary" onclick="Modules.saveGarOco('${id}')">Salvar atualização</button>`
    });
  },
  saveGarOco(id) {
    const g = DB.get('garantias', id);
    const texto = fval('gar-oco'), custo = fnum('gar-custo');
    const oco = (g.ocorrencias || []).slice();
    if (texto) oco.unshift({ data: new Date().toISOString(), texto });
    DB.update('garantias', id, { ocorrencias: oco, custo: g.custo + custo, status: fval('gar-status') });
    if (custo) DB.logFin({ tipo: 'saida', categoria: 'Garantia', descricao: 'Custo garantia: ' + g.produtoNome, valor: custo, status: 'pago' });
    if (texto || custo) DB.logMov('garantia', 'Atendimento garantia: ' + g.produtoNome + (custo ? ' (custo ' + Fmt.brl(custo) + ')' : ''), { valor: custo });
    Modal.close(); Toast.ok('Garantia atualizada.'); App.go('garantias');
  },

  /* ===================== FINANCEIRO ===================== */
  financeiro() {
    const f = DB.all('financeiro');
    const ent = f.filter(x => x.tipo === 'entrada' && x.status === 'pago').reduce((s, x) => s + x.valor, 0);
    const sai = f.filter(x => x.tipo === 'saida' && x.status === 'pago').reduce((s, x) => s + x.valor, 0);
    const saldo = ent - sai;
    return `<div class="page-head"><div><h1>Financeiro</h1><p>Fluxo de caixa, contas a pagar/receber e despesas</p></div>
      <div class="actions"><button class="btn-ghost" onclick="Modules.lancForm('entrada')">+ Entrada</button><button class="btn-primary" onclick="Modules.lancForm('saida')">+ Saída / Despesa</button></div></div>
      <div class="grid kpis" style="margin-bottom:18px">
        ${kpi('Entradas (pagas)', Fmt.brl(ent), null, '⬆️', '')}
        ${kpi('Saídas (pagas)', Fmt.brl(sai), null, '⬇️', 'red')}
        ${kpi('Saldo em caixa', Fmt.brl(saldo), null, '💰', saldo >= 0 ? 'blue' : 'red')}
        ${kpi('A pagar / A receber', Fmt.brl(Calc.contasPagar()), 'Receber: ' + Fmt.brl(Calc.contasReceber()), '🧾', 'amber')}
      </div>
      <div class="tabs" id="fin-tabs">
        <div class="tab active" onclick="Modules.finTab(this,'mov')">Fluxo de caixa</div>
        <div class="tab" onclick="Modules.finTab(this,'pagar')">Contas a pagar</div>
        <div class="tab" onclick="Modules.finTab(this,'receber')">Contas a receber</div>
        <div class="tab" onclick="Modules.finTab(this,'cat')">Por categoria</div>
      </div>
      <div id="fin-content"></div>`;
  },
  finTab(el, tab) {
    document.querySelectorAll('#fin-tabs .tab').forEach(t => t.classList.remove('active')); el.classList.add('active');
    const box = document.getElementById('fin-content');
    const f = DB.all('financeiro').slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    if (tab === 'mov') {
      box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Tipo</th><th class="num">Valor</th><th>Status</th></tr></thead>
        <tbody>${f.map(x => `<tr><td>${Fmt.date(x.data)}</td><td>${esc(x.categoria)}</td><td>${esc(x.descricao)}</td>
        <td><span class="badge ${x.tipo === 'entrada' ? 'b-green' : 'b-red'}">${x.tipo === 'entrada' ? '↑ entrada' : '↓ saída'}</span></td>
        <td class="num strong" style="color:${x.tipo === 'entrada' ? 'var(--green)' : 'var(--red)'}">${x.tipo === 'entrada' ? '+' : '−'} ${Fmt.brl(x.valor)}</td><td>${statusBadge(x.status)}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'pagar' || tab === 'receber') {
      const tipo = tab === 'pagar' ? 'saida' : 'entrada';
      const list = f.filter(x => x.tipo === tipo && x.status === 'pendente');
      box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Vencimento</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${list.map(x => `<tr><td>${Fmt.date(x.data)}</td><td>${esc(x.categoria)}</td><td>${esc(x.descricao)}</td><td class="num strong">${Fmt.brl(x.valor)}</td>
        <td class="num"><button class="btn-ghost btn-sm" onclick="Modules.quitar('${x.id}')">✓ ${tab === 'pagar' ? 'Pagar' : 'Receber'}</button></td></tr>`).join('') || `<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">Nenhuma conta pendente.</td></tr>`}</tbody></table></div>`;
    } else {
      const cats = {};
      f.filter(x => x.status === 'pago').forEach(x => { const k = x.categoria; cats[k] = cats[k] || { ent: 0, sai: 0 }; cats[k][x.tipo === 'entrada' ? 'ent' : 'sai'] += x.valor; });
      box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Categoria</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th></tr></thead>
        <tbody>${Object.entries(cats).map(([k, v]) => `<tr><td class="strong">${esc(k)}</td><td class="num" style="color:var(--green)">${Fmt.brl(v.ent)}</td><td class="num" style="color:var(--red)">${Fmt.brl(v.sai)}</td><td class="num strong">${Fmt.brl(v.ent - v.sai)}</td></tr>`).join('')}</tbody></table></div>`;
    }
  },
  quitar(id) { const x = DB.get('financeiro', id); DB.update('financeiro', id, { status: 'pago' }); DB.logMov(x.tipo === 'entrada' ? 'venda' : 'compra', (x.tipo === 'entrada' ? 'Recebimento' : 'Pagamento') + ': ' + x.descricao, { valor: x.valor }); Toast.ok('Conta quitada.'); App.go('financeiro'); },
  lancForm(tipo) {
    Modal.open({
      title: tipo === 'entrada' ? '+ Nova entrada' : '+ Nova saída / despesa',
      body: `<div class="form-grid">
        <div class="field full"><label>Descrição *</label><input id="l-desc"></div>
        <div class="field"><label>Categoria</label><select id="l-cat">${(tipo === 'entrada' ? ['Venda', 'Crediário', 'Outros'] : ['Compra de mercadoria', 'Despesa Fixa', 'Despesa Variável', 'Manutenção', 'Garantia', 'Outros']).map(c => `<option>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Valor (R$) *</label><input id="l-valor" type="number" step="0.01" value="0"></div>
        <div class="field"><label>Data</label><input id="l-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Status</label><select id="l-status"><option value="pago">Pago</option><option value="pendente">Pendente (conta a ${tipo === 'entrada' ? 'receber' : 'pagar'})</option></select></div>
      </div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveLanc('${tipo}')">Salvar</button>`
    });
  },
  saveLanc(tipo) {
    const desc = fval('l-desc'), valor = fnum('l-valor'); if (!desc || !valor) return Toast.err('Informe descrição e valor.');
    DB.logFin({ tipo, categoria: fval('l-cat'), descricao: desc, valor, data: new Date(fval('l-data')).toISOString(), status: fval('l-status') });
    Modal.close(); Toast.ok('Lançamento salvo.'); App.go('financeiro');
  }
};
