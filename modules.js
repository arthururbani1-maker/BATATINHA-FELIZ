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
    // Devolução de diferença de troca (origem 'troca') NÃO é despesa operacional: é parte da
    // aquisição do usado que entrou no estoque (como 'compra'), então não reduz o lucro líquido.
    return DB.all('financeiro').filter(f => f.tipo === 'saida' && f.origem !== 'compra' && f.origem !== 'troca' && f.status === 'pago' && filter(f.data))
      .reduce((s, f) => s + f.valor, 0);
  },
  lucroLiquido(filter) { return this.lucroBruto(filter) - this.despesas(filter); },
  contasPagar() { return DB.all('financeiro').filter(f => f.tipo === 'saida' && f.status === 'pendente').reduce((s, f) => s + f.valor, 0); },
  contasReceber() { return DB.all('financeiro').filter(f => f.tipo === 'entrada' && f.status === 'pendente').reduce((s, f) => s + f.valor, 0); },
  estoqueUnidades() { return DB.all('produtos').reduce((s, p) => s + (p.qtd || 0), 0); },
  estoqueValorCusto() { return DB.all('produtos').reduce((s, p) => s + (p.custoMedio || p.custo) * p.qtd, 0); }
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
    const movs = DB.all('movimentacoes').slice(0, 8);

    return `
    <div class="page-head"><div><h1>Dashboard</h1><p>Visão geral em tempo real · ${Fmt.date(new Date())}</p></div>
      <div class="actions"><button class="btn-primary" onclick="App.go('pdv')">🛒 Nova venda</button></div></div>

    <div class="grid kpis" style="margin-bottom:16px">
      ${kpi('Faturamento do dia', Fmt.brl(fatDia), c.vendasValidas().filter(v => c.isToday(v.data)).length + ' vendas hoje', '💵', '')}
      ${kpi('Faturamento do mês', Fmt.brl(fatMes), `<span class="${varMes >= 0 ? 'up' : 'down'}">${varMes >= 0 ? '▲' : '▼'} ${Fmt.pct(Math.abs(varMes))} vs mês ant.</span>`, '📅', 'blue')}
      ${kpi('Lucro bruto (mês)', Fmt.brl(lbMes), 'Hoje: ' + Fmt.brl(lbDia), '📈', '')}
      ${kpi('Valor em estoque (custo)', Fmt.brl(c.estoqueValorCusto()), c.estoqueUnidades() + ' unidades', '📦', 'blue')}
    </div>

    <div class="grid kpis" style="margin-bottom:20px">
      ${kpi('Lucro líquido — Dia', Fmt.brl(llDia), null, '🟢', '')}
      ${kpi('Lucro líquido — Mês', Fmt.brl(llMes), null, '🟢', '')}
      ${kpi('Lucro líquido — Ano', Fmt.brl(llAno), null, '🟢', '')}
      ${kpi('Contas a pagar', Fmt.brl(c.contasPagar()), 'Contas a receber: ' + Fmt.brl(c.contasReceber()), '🧾', 'red')}
    </div>

    ${this.dashPrevendas()}

    <div class="grid cols-2">
      <div class="card">
        <div class="section-title">Faturamento — últimos 14 dias</div>
        ${this.barChart14()}
      </div>
      <div class="card">
        <div class="section-title">Últimas movimentações <a onclick="App.go('movimentacoes')">Ver todas →</a></div>
        ${movs.map(m => `
          <div class="list-row"><div class="lr-ico">${movIcon(m.tipo)}</div>
            <div class="lr-main"><div class="lr-title">${esc(m.descricao)}</div><div class="lr-sub">${Fmt.datetime(m.data)} · ${m.usuario}</div></div>
            ${m.valor ? `<span class="strong">${Fmt.brl(m.valor)}</span>` : ''}</div>`).join('')}
      </div>
    </div>`;
  },

  // Visão SEPARADA de pré-vendas (elas já entram no faturamento acima; aqui é só o recorte).
  dashPrevendas() {
    if (typeof PV === 'undefined') return '';
    const c = Calc;
    const vendasMes = c.vendasValidas().filter(v => c.isThisMonth(v.data));
    const preMes = vendasMes.filter(v => PV.isPre(v));
    const normaisMes = vendasMes.filter(v => !PV.isPre(v));
    const ativas = PV.listAll().filter(v => !v.cancelada);
    if (!preMes.length && !ativas.length) return ''; // nada a mostrar
    const fatNormais = normaisMes.reduce((s, v) => s + (v.total || 0), 0);
    const fatPre = preMes.reduce((s, v) => s + (v.total || 0), 0);
    const aguardando = ativas.filter(v => !PV.entregue(v)).length;
    const entregues = ativas.filter(v => PV.entregue(v)).length;
    const aReceber = ativas.reduce((s, v) => s + PV.restante(v), 0);
    return `<div class="grid kpis" style="margin-bottom:20px">
      ${kpi('Vendas normais (mês)', Fmt.brl(fatNormais), normaisMes.length + ' venda(s)', '⚡', '')}
      ${kpi('Pré-vendas (mês)', Fmt.brl(fatPre), preMes.length + ' venda(s) · já no faturamento', '📋', 'purple')}
      ${kpi('Aguardando entrega', Fmt.num(aguardando), 'a receber: ' + Fmt.brl(aReceber), '⏳', aguardando ? 'amber' : '')}
      ${kpi('Pré-vendas entregues', Fmt.num(entregues), 'baixa de estoque concluída', '📦', 'green')}
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
      <select id="est-status" onchange="Modules.renderEstoqueTable()"><option value="">Todos os produtos</option><option value="baixo">Estoque baixo</option></select>
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
      return true;
    });
    const canEd = App.can('podeEditarProduto'), canDel = App.can('podeExcluirProduto'), canFin = App.canFinance();
    const rows = list.map(p => {
      const disp = Modules.disp(p), res = p.reservado || 0;
      const dot = disp > 0 ? '🟢' : (res > 0 ? '🟡' : '🔴');
      return `
      <tr>
        <td><div class="strong prod-link" style="cursor:pointer;color:var(--accent,#5b8cff)" onclick="ProdHist.open('${p.id}')" title="Ver histórico do produto">${dot} ${esc(p.nome)} 🔎</div><div class="muted" style="font-size:11.5px">${p.sku}${p.serie ? ' · S/N ' + p.serie : ''}</div></td>
        <td>${p.categoria}<div class="muted" style="font-size:11px">${p.marca}</div></td>
        <td>${condBadge(p.condicao)}</td>
        <td class="num strong">${p.qtd}<div class="muted" style="font-size:11px">mín ${p.min}</div></td>
        <td class="num ${disp <= p.min ? 'down strong' : ''}" style="${disp <= 0 ? 'color:var(--red)' : (disp <= p.min ? 'color:var(--amber)' : 'color:var(--green)')};font-weight:700">${disp}${disp <= 0 ? ' ⛔' : (disp <= p.min ? ' ⚠️' : '')}</td>
        <td class="num">${res ? '<span class="badge b-amber" title="reservado em pré-venda">' + res + '</span>' : '<span class="muted">0</span>'}</td>
        ${canFin ? `<td class="num">${Fmt.brl(p.custoMedio || p.custo)}</td>` : ''}
        <td class="num strong">${Fmt.brl(p.preco)}</td>
        ${canFin ? `<td class="num"><span class="badge b-green">${Fmt.pct((p.preco - (p.custoMedio || p.custo)) / p.preco * 100)}</span></td>` : ''}
        <td>${p.local || '-'}</td>
        ${(canEd || canDel) ? `<td class="num">${canEd ? `<button class="btn-icon" onclick="Modules.produtoForm('${p.id}')">✏️</button> ` : ''}${canDel ? `<button class="btn-icon" onclick="Modules.delProduto('${p.id}')">🗑️</button>` : ''}</td>` : ''}
      </tr>`;
    }).join('');
    document.getElementById('est-table').innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Produto</th><th>Categoria</th><th>Condição</th><th class="num">Estoque total</th><th class="num">Disponível</th><th class="num">Reservado</th>${canFin ? '<th class="num">Custo méd.</th>' : ''}<th class="num">Preço</th>${canFin ? '<th class="num">Margem</th>' : ''}<th>Local</th>${(canEd || canDel) ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows || '<tr><td colspan="12" class="muted" style="text-align:center;padding:30px">Nenhum produto encontrado.</td></tr>'}</tbody></table></div>
      <div class="muted" style="font-size:12px;margin-top:8px">🟢 Disponível · 🟡 Reservado (pré-venda) · 🔴 Sem disponível. Disponível = Estoque total − Reservado.</div>`;
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
        <div class="field"><label>Custo unitário (R$)</label><input id="p-custo" type="text" inputmode="decimal" placeholder="ex: 1.250,50" value="${p.custo != null ? String(p.custo).replace('.', ',') : ''}"></div>
        <div class="field"><label>Preço de venda (R$)</label><input id="p-preco" type="text" inputmode="decimal" placeholder="ex: 1.999,90" value="${p.preco != null ? String(p.preco).replace('.', ',') : ''}"></div>
        <div class="field"><label>Nº de série (opcional)</label><input id="p-serie" value="${esc(p.serie || '')}"></div>
        <div class="field"><label>Localização</label><input id="p-local" value="${esc(p.local || '')}"></div>
        <div class="field full"><label style="display:flex;align-items:center;gap:9px;cursor:pointer"><input type="checkbox" id="p-prevenda" ${p.prevenda ? 'checked' : ''}> 📋 Produto em Pré-venda (pode ser vendido antes de chegar — não dá baixa no estoque até a entrega)</label></div>
      </div>
      ${(p.custoHist && p.custoHist.length) ? `<div style="margin-top:14px"><div style="font-size:12.5px;font-weight:700;color:var(--txt-2);margin-bottom:6px">Histórico de custo</div>${p.custoHist.slice(0, 6).map(h => `<div class="mini-stat"><span>${Fmt.datetime(h.data)} · ${esc(h.usuario || 'Admin')}</span><span>${Fmt.brl(h.de)} → <b>${Fmt.brl(h.para)}</b></span></div>`).join('')}</div>` : ''}`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveProduto('${id || ''}')">Salvar</button>`
    });
  },
  saveProduto(id) {
    if (!App.can('podeEditarProduto')) return Toast.err('Você não tem permissão para cadastrar/editar produtos.');
    const nome = fval('p-nome'), sku = fval('p-sku');
    if (!nome || !sku) return Toast.err('Informe nome e SKU.');
    const custo = moneyBR(fval('p-custo'));
    if (isNaN(custo) || custo < 0) return Toast.err('Informe um custo válido para o produto.');
    const precoNum = moneyBR(fval('p-preco'));
    const preco = isNaN(precoNum) ? 0 : precoNum;
    const data = {
      nome, sku, barcode: fval('p-barcode'), categoria: fval('p-cat'), marca: fval('p-marca'),
      modelo: fval('p-modelo'), condicao: fval('p-cond'), qtd: parseInt(fval('p-qtd')) || 0,
      min: parseInt(fval('p-min')) || 0, custo, custoMedio: custo, preco,
      serie: fval('p-serie'), local: fval('p-local'), prevenda: fchk('p-prevenda')
    };
    if (id) {
      const cur = DB.get('produtos', id) || {};
      const quem = (typeof App !== 'undefined' && App.user() && App.user().nome) ? App.user().nome : 'Admin';
      const custoMudou = Math.abs((cur.custo || 0) - custo) > 0.001;
      if (custoMudou) {
        const hist = (cur.custoHist || []).slice();
        hist.unshift({ de: cur.custo || 0, para: custo, data: new Date().toISOString(), usuario: quem });
        data.custoHist = hist;
        DB.logMov('ajuste', 'Custo alterado: ' + nome + ' (' + Fmt.brl(cur.custo || 0) + ' → ' + Fmt.brl(custo) + ')', { valor: 0 });
      }
      const precoMudou = Math.abs((cur.preco || 0) - preco) > 0.001;
      if (precoMudou) {
        const ph = (cur.precoHist || []).slice();
        ph.unshift({ de: cur.preco || 0, para: preco, data: new Date().toISOString(), usuario: quem });
        data.precoHist = ph;
        DB.logMov('ajuste', 'Preço alterado: ' + nome + ' (' + Fmt.brl(cur.preco || 0) + ' → ' + Fmt.brl(preco) + ')', { valor: 0 });
      }
      // Alteração manual da quantidade na edição → registra AJUSTE auditável (aparece no histórico)
      const qtdAntes = cur.qtd || 0, qtdDepois = data.qtd || 0, deltaQtd = qtdDepois - qtdAntes;
      if (deltaQtd !== 0) {
        const aj = (cur.ajustes || []).slice();
        aj.unshift({ data: new Date().toISOString(), delta: deltaQtd, motivo: 'Alteração manual no cadastro', usuario: quem, de: qtdAntes, para: qtdDepois });
        data.ajustes = aj;
        DB.logMov('ajuste', 'Estoque alterado no cadastro: ' + nome + ' (' + qtdAntes + ' → ' + qtdDepois + ')', { valor: 0, refId: id });
      }
      DB.update('produtos', id, data);
      Toast.ok(custoMudou ? 'Custo do produto atualizado com sucesso.' : 'Produto atualizado.');
    } else {
      data.custoHist = []; data.precoHist = []; data.criadoEm = new Date().toISOString(); DB.insert('produtos', data);
      DB.logMov('ajuste', 'Cadastro de produto: ' + nome, { valor: 0 }); Toast.ok('Produto cadastrado.');
    }
    Modal.close(); App.go('estoque');
  },
  delProduto(id) {
    if (!App.can('podeExcluirProduto')) return Toast.err('Você não tem permissão para excluir produtos.');
    Modal.confirm('Excluir este produto do estoque?', () => { if (!App.can('podeExcluirProduto')) return; DB.remove('produtos', id); Toast.ok('Produto removido.'); App.go('estoque'); }, 'Excluir');
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
    const ents = (p.entradas || []).slice();
    ents.unshift({ data: new Date().toISOString(), tipo: 'Ajuste de estoque', qtd: dif, custoUnit: p.custoMedio || p.custo || 0, obs: motivo, responsavel: (typeof App !== 'undefined' && App.user() && App.user().nome) ? App.user().nome : 'Admin' });
    DB.update('produtos', id, { qtd: q, entradas: ents });
    DB.logMov('ajuste', `Ajuste de estoque: ${p.nome} (${p.qtd}→${q}, ${dif >= 0 ? '+' : ''}${dif}) · ${motivo}`, { valor: 0 });
    Toast.ok('Estoque ajustado.'); Modal.close(); App.go('estoque');
  },

  /* ===================== ENTRADA DE ESTOQUE ===================== */
  entradaLines: [],
  entPagLines: [{ forma: 'Dinheiro', valor: 0 }],
  entFormas() {
    const base = ['Dinheiro', 'PIX', 'Débito', 'Crédito à vista', 'Crédito parcelado', 'Transferência Bancária', 'Boleto', 'Consórcio', 'Outro'];
    const extra = ((DB.all('config')[0] || {}).formasCompra) || [];
    extra.forEach(f => { if (f && base.indexOf(f) < 0) base.push(f); });
    return base;
  },
  entOrigens() { return ['Caixa da loja', 'Conta bancária', 'Cartão da empresa', 'Conta pessoal (adiantamento/sócio)', 'Outro']; },
  entPendentes() { return ['Boleto', 'Crédito parcelado', 'Consórcio']; },
  entTotal() { return this.entradaLines.reduce((s, l) => s + l.qtd * l.custo, 0); },
  entPagAdd() { const soma = this.entPagLines.reduce((s, p) => s + (+p.valor || 0), 0); this.entPagLines.push({ forma: 'PIX', valor: Math.max(0, this.entTotal() - soma) }); this.entPagRender(); },
  entPagDel(i) { this.entPagLines.splice(i, 1); if (!this.entPagLines.length) this.entPagLines.push({ forma: 'Dinheiro', valor: 0 }); this.entPagRender(); },
  entPagSet(i, f, v) { const p = this.entPagLines[i]; if (!p) return; if (f === 'valor') p.valor = moneyBR(v) || 0; else if (f === 'parcelas' || f === 'taxa') p[f] = parseFloat(String(v).replace(',', '.')) || 0; else p[f] = v; this.entPagRender(); },
  entPagFill() { const soma = this.entPagLines.reduce((s, p, ix) => ix === 0 ? s : s + (+p.valor || 0), 0); if (this.entPagLines[0]) this.entPagLines[0].valor = Math.max(0, this.entTotal() - soma); this.entPagRender(); },
  entPagRender() {
    const box = document.getElementById('ent-pags'); if (!box) return;
    const formas = this.entFormas(), pend = this.entPendentes();
    box.innerHTML = this.entPagLines.map((p, i) => {
      const isParc = p.forma === 'Crédito parcelado', isBoleto = p.forma === 'Boleto' || pend.indexOf(p.forma) >= 0 && p.forma !== 'Crédito parcelado';
      const parc = parseInt(p.parcelas) || 0, val = +p.valor || 0, vParc = parc > 0 ? val / parc : 0;
      return `<div class="ent-pagline">
        <div class="ent-pagrow">
          <select onchange="Modules.entPagSet(${i},'forma',this.value)">${formas.map(f => `<option ${p.forma === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
          <input type="text" inputmode="decimal" placeholder="0,00" value="${p.valor ? String(p.valor).replace('.', ',') : ''}" onchange="Modules.entPagSet(${i},'valor',this.value)" style="width:130px;text-align:right">
          ${this.entPagLines.length > 1 ? `<span class="ci-rm" title="Remover" onclick="Modules.entPagDel(${i})">✕</span>` : '<span style="width:14px"></span>'}
        </div>
        ${isParc ? `<div class="ent-pagextra">
          <label>Parcelas<input type="number" min="1" value="${p.parcelas || ''}" placeholder="ex: 3" onchange="Modules.entPagSet(${i},'parcelas',this.value)"></label>
          <label>Taxa operadora (R$)<input type="number" step="0.01" value="${p.taxa || ''}" placeholder="0,00" onchange="Modules.entPagSet(${i},'taxa',this.value)"></label>
          <label>1ª parcela<input type="date" value="${p.primeira || ''}" onchange="Modules.entPagSet(${i},'primeira',this.value)"></label>
          <div class="ent-pagcalc">Valor de cada parcela: <b>${parc > 0 ? Fmt.brl(vParc) : '—'}</b>${p.taxa ? ' · total c/ taxa ' + Fmt.brl(val + (+p.taxa || 0)) : ''}</div>
        </div>` : ''}
        ${isBoleto ? `<div class="ent-pagextra"><label>Vencimento<input type="date" value="${p.venc || ''}" onchange="Modules.entPagSet(${i},'venc',this.value)"></label><div class="ent-pagcalc">Entra em <b>Contas a Pagar</b> até a liquidação.</div></div>` : ''}
      </div>`;
    }).join('');
    const total = this.entTotal(), soma = this.entPagLines.reduce((s, p) => s + (+p.valor || 0), 0), falta = Math.round((total - soma) * 100) / 100;
    const sum = document.getElementById('ent-pag-sum'); if (sum) sum.innerHTML = `<div class="card" style="background:var(--bg-2);margin-top:12px">
      <div class="mini-stat"><span>Total da compra</span><b>${Fmt.brl(total)}</b> <a class="muted" style="font-size:11px;cursor:pointer;margin-left:8px" onclick="Modules.entPagFill()">preencher</a></div>
      <div class="mini-stat"><span>Total informado</span><b>${Fmt.brl(soma)}</b></div>
      <div class="mini-stat" style="font-size:15px"><span class="strong">${Math.abs(falta) < 0.01 ? '✅ Confere' : (falta > 0 ? 'Falta informar' : 'Excede o total')}</span><b style="color:${Math.abs(falta) < 0.01 ? 'var(--green)' : 'var(--red)'}">${Fmt.brl(Math.abs(falta))}</b></div></div>`;
  },
  entrada() {
    this.entradaLines = [];
    this.entPagLines = [{ forma: 'Dinheiro', valor: 0 }];
    setTimeout(() => { const e = document.getElementById('ent-busca'); if (e) e.focus(); this.entRender(); this.entPagRender(); }, 30);
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
      <div class="section-title">2. Dados da compra</div>
      <div class="form-grid" style="margin-bottom:2px"><div class="field"><label>Data da compra</label><input id="ent-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></div></div>
      <div id="ent-lines"></div>
      <div id="ent-resumo"></div>
    </div>
    <div class="card">
      <div class="section-title">3. Pagamento</div>
      <p class="muted" style="font-size:12px;margin:-4px 0 10px">Informe como esta compra foi paga. Você pode dividir em mais de uma forma — a soma precisa ser igual ao total.</p>
      <div id="ent-pags"></div>
      <button class="btn-ghost btn-sm" style="margin-top:8px" onclick="Modules.entPagAdd()">+ Adicionar forma de pagamento</button>
      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Origem do pagamento</label><select id="ent-origem">${this.entOrigens().map(o => `<option>${esc(o)}</option>`).join('')}</select></div>
        <div class="field full"><label>Observação</label><input id="ent-obs" placeholder="Ex: nota fiscal, lote, etc."></div>
      </div>
      <div id="ent-pag-sum"></div>
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
      <div class="mini-stat" style="font-size:16px"><span class="strong">Custo total da compra</span><b style="color:var(--green)">${Fmt.brl(totV)}</b></div></div>`;
    if (this.entPagLines.length === 1) this.entPagLines[0].valor = totV; // mantém a 1ª forma igual ao total enquanto houver só uma
    this.entPagRender();
  },
  entSalvar() {
    if (!this.entradaLines.length) return Toast.err('Adicione ao menos um produto.');
    if (this.entradaLines.some(l => l.qtd <= 0)) return Toast.err('Quantidade deve ser maior que zero.');
    const data = new Date(fval('ent-data') + 'T12:00:00').toISOString(), obs = fval('ent-obs'), origem = fval('ent-origem') || 'Caixa da loja';
    const totV = this.entTotal();
    // ---- valida pagamento ----
    const pags = this.entPagLines.filter(p => (+p.valor || 0) > 0);
    if (!pags.length) return Toast.err('Informe ao menos uma forma de pagamento.');
    const somaPag = pags.reduce((s, p) => s + (+p.valor || 0), 0);
    if (Math.abs(somaPag - totV) > 0.01) return Toast.err('A soma das formas de pagamento (' + Fmt.brl(somaPag) + ') deve ser igual ao total da compra (' + Fmt.brl(totV) + ').');
    const resp = (typeof App !== 'undefined' && App.user() && App.user().nome) ? App.user().nome : 'Admin';
    // ---- atualiza estoque e custo médio ----
    this.entradaLines.forEach(l => {
      const p = DB.get('produtos', l.produtoId); if (!p) return;
      const qtdNova = p.qtd + l.qtd;
      const custoMedio = qtdNova ? (((p.custoMedio || p.custo || 0) * p.qtd) + (l.custo * l.qtd)) / qtdNova : l.custo;
      const ents = (p.entradas || []).slice();
      ents.unshift({ data, tipo: 'Entrada de estoque', qtd: l.qtd, custoUnit: l.custo, fornecedor: pags.map(x => x.forma).join(' + '), obs, responsavel: resp });
      DB.update('produtos', l.produtoId, { qtd: qtdNova, custo: l.custo, custoMedio: Math.round(custoMedio * 100) / 100, entradas: ents });
    });
    // ---- registro da compra (histórico) ----
    const compra = DB.insert('compras', {
      data, responsavel: resp, obs, total: totV, origem: 'entrada', status: 'recebido',
      origemPagamento: origem, formaPagamento: pags.map(p => p.forma).join(' + '),
      itens: this.entradaLines.map(l => ({ nome: l.nome, sku: l.sku, produtoId: l.produtoId, qtd: l.qtd, custo: l.custo, condicao: (DB.get('produtos', l.produtoId) || {}).condicao || 'novo' })),
      pagamentos: pags.map(p => ({ forma: p.forma, valor: +p.valor || 0, parcelas: parseInt(p.parcelas) || null, taxa: +p.taxa || 0, primeiraParcela: p.primeira || null, vencimento: p.venc || null }))
    });
    // ---- financeiro por forma de pagamento ----
    const pend = this.entPendentes();
    pags.forEach(p => {
      const val = +p.valor || 0, ehPend = pend.indexOf(p.forma) >= 0;
      const venc = p.venc ? (p.venc + 'T12:00:00') : (p.primeira ? (p.primeira + 'T12:00:00') : data);
      const desc = 'Compra' + (obs ? ' (' + obs + ')' : '') + ' · ' + p.forma;
      const base = { tipo: 'saida', categoria: 'Compra de mercadoria', descricao: desc, valor: val, emissao: data, formaPagamento: p.forma, origemPagamento: origem, origem: 'compra', refId: compra.id };
      if (ehPend) {
        DB.logFin(Object.assign(base, { subcategoria: 'A pagar (' + p.forma + ')', pago: 0, status: 'pendente', vencimento: venc, data: venc, parcelas: parseInt(p.parcelas) || null, valorParcela: (parseInt(p.parcelas) > 0) ? Math.round(val / parseInt(p.parcelas) * 100) / 100 : null, taxaOperadora: +p.taxa || 0, primeiraParcela: p.primeira || null }));
      } else {
        DB.logFin(Object.assign(base, { subcategoria: 'Entrada de estoque', pago: val, status: 'pago', vencimento: data, data }));
        // Pagamento em DINHEIRO → sai do caixa físico da loja (além da despesa no Financeiro).
        // Vinculado à compra por refId; um único lançamento por forma (sem duplicar).
        if (p.forma === 'Dinheiro' && typeof Caixa !== 'undefined') Caixa.add({ fluxo: 'saida', tipo: 'Compra de estoque', origem: 'Entrada de estoque #' + String(compra.id).slice(-6).toUpperCase(), categoria: 'Compra de estoque', valor: val, data, forma: 'Dinheiro', obs: this.entradaLines.map(l => l.qtd + 'x ' + l.nome).join(', ') + (obs ? ' · ' + obs : ''), refId: compra.id });
      }
    });
    DB.logMov('compra', 'Compra lançada — ' + this.entradaLines.map(l => l.qtd + 'x ' + l.nome).join(', ') + ' · ' + pags.map(p => p.forma).join(' + ') + (obs ? ' · ' + obs : ''), { valor: totV, refId: compra.id });
    Toast.ok('Entrada registrada! Estoque, custo médio e financeiro atualizados.');
    this.entradaLines = []; this.entPagLines = [{ forma: 'Dinheiro', valor: 0 }]; App.go('estoque');
  },

  /* ===================== PDV ===================== */
  cart: { itens: [], desconto: 0, pagamentos: [], usados: [] },
  pdv() {
    this.cart = { itens: [], desconto: 0, pagamentos: [], usados: [] };
    setTimeout(() => { const e = document.getElementById('pdv-q'); if (e) e.focus(); }, 50);
    return `
    <div class="page-head"><div><h1>Ponto de Venda</h1><p>Busque pelo nome, SKU ou bipe o código de barras</p></div>
      <div class="actions"><button class="btn-ghost" onclick="Modules.pvPDVPanel()">📋 Pré-vendas / Reservas</button><span class="pdv-kbd">↵ Enter adiciona</span><span class="pdv-kbd">Esc limpa</span></div></div>
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
  disp(p) { return Math.max(0, (p.qtd || 0) - (p.reservado || 0)); }, // disponível p/ venda = físico − reservado (pré-venda)
  pdvSearch() {
    const q = (fval('pdv-q') || '').toLowerCase();
    let list = DB.all('produtos').filter(p => (this.disp(p) > 0 || p.prevenda));
    if (q) list = list.filter(p => p.nome.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').includes(q));
    list = list.slice(0, 24);
    document.getElementById('pdv-results').innerHTML = list.map(p => {
      const disp = this.disp(p), low = disp <= p.min, isPre = !!p.prevenda;
      return `<div class="prod-card" onclick="Modules.addCart('${p.id}')">
        <span class="pc-bar" style="background:${isPre ? '#a855f7' : this.condColor(p.condicao)}"></span>
        <div class="pc-head"><span class="pc-cat">${esc(p.categoria)}</span>${isPre ? '<span class="badge b-purple">Pré-venda</span>' : condBadge(p.condicao)}</div>
        <div class="pc-name">${esc(p.nome)}</div>
        <div class="pc-foot"><span class="pc-price">${Fmt.brl(p.preco)}</span><span class="pc-stock ${low && !isPre ? 'low' : ''}">${isPre ? '📋 sob encomenda' : (low ? '⚠ ' : '') + disp + ' un' + (p.reservado ? ' <span class="muted" title="reservadas">(' + p.reservado + ' res.)</span>' : '')}</span></div>
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
    if (exact && this.disp(exact) > 0) { this.addCart(exact.id); document.getElementById('pdv-q').value = ''; this.pdvSearch(); }
  },
  addCart(id) {
    const p = DB.get('produtos', id);
    const disp = this.disp(p), isPre = !!p.prevenda;
    const ex = this.cart.itens.find(i => i.produtoId === id);
    if (ex) { if (isPre || ex.qtd < disp) ex.qtd++; else return Toast.warn('Sem unidades disponíveis (estoque ou reserva).'); }
    else this.cart.itens.push({ produtoId: id, sku: p.sku, nome: p.nome, preco: p.preco, precoOriginal: p.preco, custo: p.custoMedio || p.custo, qtd: 1, max: isPre ? 99999 : disp, prevenda: isPre });
    this.renderCart();
  },
  cartTogglePrevenda(id) { const it = this.cart.itens.find(i => i.produtoId === id); if (!it) return; it.prevenda = !it.prevenda; this.renderCart(); },
  cartQty(id, d) {
    const it = this.cart.itens.find(i => i.produtoId === id); if (!it) return;
    it.qtd += d; if (it.qtd <= 0) this.cart.itens = this.cart.itens.filter(i => i.produtoId !== id);
    if (it.qtd > it.max) { it.qtd = it.max; Toast.warn('Estoque máximo.'); }
    this.renderCart();
  },
  renderCart() {
    const c = this.cart;
    if (!Array.isArray(c.usados)) c.usados = c.usado ? [c.usado] : [];
    const bruto = c.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    const usadoVal = c.usados.reduce((s, u) => s + (u.valor || 0), 0);
    const total = Math.max(0, bruto - c.desconto - usadoVal);
    const qtdTotal = c.itens.reduce((s, i) => s + i.qtd, 0);
    const el = document.getElementById('cart');
    el.innerHTML = `
      <div class="cart-head"><span>🛒 Carrinho ${c.itens.length ? `<span class="ch-count">· ${qtdTotal} ${qtdTotal === 1 ? 'item' : 'itens'}</span>` : ''}</span>${c.itens.length ? `<a class="muted" style="font-size:12px;cursor:pointer" onclick="Modules.clearCart()">limpar</a>` : ''}</div>
      <div class="cart-items">
        ${c.itens.length ? c.itens.map(i => `
          <div class="cart-item">
            <span class="ci-thumb">${this.catIcon(i)}</span>
            <div class="ci-name">${esc(i.nome)}<small>${i.precoOriginal != null && i.preco !== i.precoOriginal ? `<s style="color:var(--txt-3)">${Fmt.brl(i.precoOriginal)}</s> ` : ''}${App.can('podeAlterarPreco') ? `<a style="color:var(--green);cursor:pointer" onclick="Modules.precoEdit('${i.produtoId}')">${Fmt.brl(i.preco)} ✎</a>` : Fmt.brl(i.preco)} un.${i.precoMotivo ? ' · ' + esc(i.precoMotivo) : ''}</small>
              <a class="ci-pre ${i.prevenda ? 'on' : ''}" onclick="Modules.cartTogglePrevenda('${i.produtoId}')" title="Marcar/desmarcar este item como pré-venda">${i.prevenda ? '📋 Pré-venda' : '⚡ Entrega imediata'}</a></div>
            <div class="qty"><button onclick="Modules.cartQty('${i.produtoId}',-1)">−</button><b>${i.qtd}</b><button onclick="Modules.cartQty('${i.produtoId}',1)">+</button></div>
            <div class="strong" style="width:74px;text-align:right">${Fmt.brl(i.preco * i.qtd)}</div>
            <span class="ci-rm" title="Remover" onclick="Modules.cartRemove('${i.produtoId}')">✕</span>
          </div>`).join('') : '<div class="cart-empty">🛒<br>Carrinho vazio.<br>Busque ou escaneie um produto.</div>'}
        ${c.usados.map((u, ix) => `<div class="cart-item" style="background:var(--green-soft)"><span class="ci-thumb">🔄</span><div class="ci-name">${esc(u.nome)}<small>Usado na troca${u.estado ? ' · ' + esc(u.estado) : ''}</small></div><div class="strong" style="color:var(--green)">− ${Fmt.brl(u.valor)}</div><span class="ci-rm" onclick="Modules.removeUsado(${ix})">✕</span></div>`).join('')}
      </div>
      <div class="cart-foot">
        <div class="cart-line"><span>Subtotal</span><span>${Fmt.brl(bruto)}</span></div>
        ${App.can('podeDesconto') ? `<div class="cart-line"><span>Desconto</span><span><input type="number" id="cart-desc" value="${c.desconto}" style="width:90px;text-align:right;background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:7px;padding:4px 8px" oninput="Modules.setDesc(this.value)"></span></div>` : (c.desconto ? `<div class="cart-line"><span>Desconto</span><span>− ${Fmt.brl(c.desconto)}</span></div>` : '')}
        ${usadoVal ? `<div class="cart-line"><span>Usados na troca (${c.usados.length})</span><span style="color:var(--green)">− ${Fmt.brl(usadoVal)}</span></div>` : ''}
        <div class="cart-total"><span>Total</span><span class="val">${Fmt.brl(total)}</span></div>
        <button class="btn-ghost btn-block" style="margin-top:10px" onclick="Modules.addUsadoTroca()">🔄 Receber usado como pagamento${c.usados.length ? ' (' + c.usados.length + ')' : ''}</button>
        <button class="btn-primary btn-block" style="margin-top:8px" onclick="Modules.checkout()" ${c.itens.length ? '' : 'disabled style="opacity:.45;margin-top:8px"'}>Finalizar venda →</button>
      </div>`;
  },
  catIcon(i) {
    const p = DB.get('produtos', i.produtoId) || {};
    return { 'Consoles': '🎮', 'Jogos': '💿', 'Controles': '🕹️', 'Acessórios': '🎧', 'Colecionáveis': '🏆' }[p.categoria] || '📦';
  },
  cartRemove(id) { this.cart.itens = this.cart.itens.filter(i => i.produtoId !== id); this.renderCart(); },
  removeUsado(ix) { this.cart.usados.splice(ix, 1); this.renderCart(); },
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
  clearCart() { this.cart = { itens: [], desconto: 0, pagamentos: [], usados: [] }; this.renderCart(); },
  utSel: null, utStep: 'list', utEditIdx: -1,
  addUsadoTroca() {
    if (!Array.isArray(this.cart.usados)) this.cart.usados = [];
    this.utSel = null; this.utStep = 'list'; this.utEditIdx = -1;
    Modal.open({
      title: '🔄 Produtos usados na negociação', wide: true,
      body: `<div id="ut-body"></div>`,
      foot: `<button class="btn-primary" onclick="Modal.close();Modules.renderCart()">Concluir</button>`
    });
    setTimeout(() => this.utRender(), 10);
  },
  utRender() {
    const b = document.getElementById('ut-body'); if (!b) return;
    const c = this.cart;
    if (this.utStep === 'list') {
      const bruto = c.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
      const totalVenda = Math.max(0, bruto - c.desconto);
      const soma = c.usados.reduce((s, u) => s + (u.valor || 0), 0);
      const saldo = totalVenda - soma, troco = soma > totalVenda ? soma - totalVenda : 0;
      b.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span class="muted">${c.usados.length} produto(s) usado(s) na troca</span>
          <button class="btn-primary btn-sm" onclick="Modules.utGoAdd()">+ Adicionar produto usado</button>
        </div>
        ${c.usados.length ? `<div class="table-wrap" style="border:none"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Vlr unit.</th><th>Estado</th><th class="num">Subtotal</th><th></th></tr></thead>
          <tbody>${c.usados.map((u, ix) => `<tr><td class="strong">${esc(u.nome)}<div class="muted" style="font-size:11px">${esc(u.categoria || '—')}${u.serie ? ' · S/N ' + esc(u.serie) : ''}</div></td><td class="num">${u.qtd || 1}</td><td class="num">${Fmt.brl(u.valorUnit != null ? u.valorUnit : u.valor)}</td><td>${esc(u.estado || '—')}</td><td class="num strong" style="color:var(--green)">${Fmt.brl(u.valor)}</td>
            <td class="num"><button class="btn-icon" onclick="Modules.utEdit(${ix})">✏️</button> <button class="btn-icon" onclick="Modules.utRemoveItem(${ix})">🗑️</button></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="empty-state" style="padding:22px"><div class="big">🔄</div>Nenhum usado adicionado. Clique em "Adicionar produto usado".</div>'}
        <div class="card" style="background:var(--bg-2);margin-top:14px">
          <div class="mini-stat"><span>Produtos usados recebidos</span><b>${c.usados.length} item(ns) · ${c.usados.reduce((s, u) => s + (u.qtd || 1), 0)} un</b></div>
          <div class="mini-stat"><span>Total em usados</span><b style="color:var(--green)">${Fmt.brl(soma)}</b></div>
          <div class="mini-stat"><span>Total da venda</span><b>${Fmt.brl(totalVenda)}</b></div>
          <div class="mini-stat" style="font-size:15px"><span class="strong">${saldo >= 0 ? 'Saldo a pagar' : 'Troco'}</span><b style="color:${saldo >= 0 ? 'var(--amber)' : 'var(--green)'}">${Fmt.brl(Math.abs(saldo))}</b></div>
        </div>`;
    } else if (this.utStep === 'pick') {
      const cats = DB.all('categorias').map(x => x.nome), marcas = DB.all('marcas').map(m => m.nome);
      b.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><span class="muted">Selecione o produto no catálogo (ou cadastre um novo).</span><button class="btn-ghost btn-sm" onclick="Modules.utBackToList()">← Voltar à lista</button></div>
        <div class="toolbar">
          <input class="grow" id="ut-q" placeholder="Buscar nome, SKU ou código..." oninput="Modules.utFilter()">
          <select id="ut-cat" onchange="Modules.utFilter()"><option value="">Categoria</option>${cats.map(x => `<option>${x}</option>`).join('')}</select>
          <select id="ut-marca" onchange="Modules.utFilter()"><option value="">Marca</option>${marcas.map(m => `<option>${m}</option>`).join('')}</select>
          <select id="ut-cond" onchange="Modules.utFilter()"><option value="">Condição</option><option>novo</option><option>seminovo</option><option>usado</option></select>
        </div>
        <div id="ut-list" style="max-height:42vh;overflow:auto;margin-bottom:12px"></div>
        <button class="btn-ghost" onclick="Modules.utNovo()">+ Cadastrar novo produto usado</button>`;
      this.utFilter();
    } else if (this.utStep === 'unit') {
      const p = this.utSel, u = this.utEditIdx >= 0 ? c.usados[this.utEditIdx] : null;
      const sel = (v, opt) => v === opt ? 'selected' : '';
      b.innerHTML = `
        <div class="list-row" style="background:var(--green-soft);border-radius:10px;padding:12px;margin-bottom:14px">
          <div class="lr-ico">🎮</div><div class="lr-main"><div class="lr-title">${esc(p.nome)} ${condBadge(p.condicao)}</div><div class="lr-sub">${p.sku} · ${p.categoria} · ${p.marca}</div></div>
          ${this.utEditIdx < 0 ? `<button class="btn-ghost btn-sm" onclick="Modules.utGoAdd()">Trocar</button>` : ''}
        </div>
        <div class="form-grid">
          <div class="field"><label>Quantidade recebida *</label><input id="u-qtd" type="number" min="1" step="1" value="${u ? (u.qtd || 1) : 1}" oninput="Modules.utCalc()"></div>
          <div class="field"><label>Valor unitário atribuído (R$) *</label><input id="u-valor" type="text" inputmode="decimal" placeholder="0,00" value="${u ? String(u.valorUnit != null ? u.valorUnit : u.valor).replace('.', ',') : ''}" oninput="Modules.utCalc()"></div>
          <div class="field full"><div class="mini-stat" style="background:var(--bg-2);border-radius:9px;padding:9px 12px;margin:0"><span>Valor total recebido (qtd × unitário)</span><b style="color:var(--green)" id="u-total-live">${Fmt.brl((u ? (u.qtd || 1) : 1) * (u ? (u.valorUnit != null ? u.valorUnit : u.valor) : 0))}</b></div></div>
          <div class="field"><label>Estado do produto</label><select id="u-estado"><option ${sel(u && u.estado, 'Excelente')}>Excelente</option><option ${u ? sel(u.estado, 'Bom') : 'selected'}>Bom</option><option ${sel(u && u.estado, 'Regular')}>Regular</option><option ${sel(u && u.estado, 'Com defeito')}>Com defeito</option></select></div>
          <div class="field"><label>Nº de série <span class="muted" style="font-weight:400">· itens únicos = qtd 1</span></label><input id="u-serie" value="${u ? esc(u.serie || '') : ''}"></div>
          <div class="field full"><label>Acompanha</label><div style="display:flex;gap:18px;padding-top:8px;flex-wrap:wrap"><label style="font-weight:400"><input type="checkbox" id="u-controle" ${!u || u.controle ? 'checked' : ''}> Controle</label><label style="font-weight:400"><input type="checkbox" id="u-cabos" ${!u || u.cabos ? 'checked' : ''}> Cabos</label><label style="font-weight:400"><input type="checkbox" id="u-caixa" ${u && u.caixa ? 'checked' : ''}> Caixa</label></div></div>
          <div class="field full"><label>Observações (estado, acessórios, defeitos, garantia...)</label><input id="u-obs" value="${u ? esc(u.obs || '') : ''}" placeholder="Detalhes da unidade recebida"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn-ghost" onclick="Modules.utBackToList()">Cancelar</button><button class="btn-primary" onclick="Modules.utConfirm()">${this.utEditIdx >= 0 ? 'Salvar alterações' : 'Adicionar à lista'}</button></div>`;
    } else if (this.utStep === 'novo') {
      const cats = DB.all('categorias').map(x => x.nome), marcas = DB.all('marcas').map(m => m.nome);
      b.innerHTML = `
        <p class="muted" style="margin-bottom:12px">Cadastro rápido — fica salvo no catálogo geral e já é selecionado.</p>
        <div class="form-grid">
          <div class="field full"><label>Nome do produto *</label><input id="un-nome" placeholder="Ex: PS4 Slim 1TB"></div>
          <div class="field"><label>Categoria</label><select id="un-cat">${cats.map(x => `<option ${x === 'Consoles' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
          <div class="field"><label>Marca</label><select id="un-marca">${marcas.map(m => `<option>${m}</option>`).join('')}</select></div>
          <div class="field"><label>Modelo</label><input id="un-modelo"></div>
          <div class="field"><label>Condição padrão</label><select id="un-cond"><option>usado</option><option>seminovo</option><option>novo</option></select></div>
          <div class="field"><label>Preço sugerido de venda (R$)</label><input id="un-preco" type="text" inputmode="decimal" value="0"></div>
          <div class="field"><label>Estoque mínimo</label><input id="un-min" type="number" value="1"></div>
          <div class="field"><label>SKU / código interno (opcional)</label><input id="un-sku" placeholder="gerado automaticamente"></div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px"><button class="btn-ghost" onclick="Modules.utGoAdd()">Voltar</button><button class="btn-primary" onclick="Modules.utNovoSave()">Cadastrar e selecionar</button></div>`;
    }
  },
  utGoAdd() { this.utSel = null; this.utEditIdx = -1; this.utStep = 'pick'; this.utRender(); },
  utBackToList() { this.utStep = 'list'; this.utRender(); },
  utFilter() {
    const el = document.getElementById('ut-list'); if (!el) return;
    const q = (fval('ut-q') || '').toLowerCase(), cat = fval('ut-cat'), marca = fval('ut-marca'), cond = fval('ut-cond');
    const jaNoCart = this.cart.usados.map(u => u.produtoId);
    let list = DB.all('produtos').filter(p =>
      (!q || p.nome.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '').includes(q)) &&
      (!cat || p.categoria === cat) && (!marca || p.marca === marca) && (!cond || p.condicao === cond)).slice(0, 30);
    el.innerHTML = list.length ? list.map(p => { const dup = jaNoCart.includes(p.id); return `
      <div class="list-row" style="${dup ? 'opacity:.5' : 'cursor:pointer'}" ${dup ? '' : `onclick="Modules.utPick('${p.id}')"`}>
        <div class="lr-ico">🎮</div><div class="lr-main"><div class="lr-title">${esc(p.nome)} ${condBadge(p.condicao)}</div><div class="lr-sub">${p.sku} · ${p.categoria} · ${p.marca} · ${p.qtd} em estoque${dup ? ' · já adicionado' : ''}</div></div>
        <span style="font-size:18px;color:var(--txt-3)">${dup ? '✓' : '›'}</span></div>`; }).join('')
      : '<div class="empty-state" style="padding:24px">Nenhum produto encontrado. Use "Cadastrar novo produto usado".</div>';
  },
  utPick(id) {
    if (this.cart.usados.some(u => u.produtoId === id)) return Toast.warn('Esse produto já foi adicionado a esta venda.');
    this.utSel = DB.get('produtos', id); this.utStep = 'unit'; this.utRender();
  },
  utNovo() { this.utStep = 'novo'; this.utRender(); },
  utNovoSave() {
    const nome = fval('un-nome'); if (!nome) return Toast.err('Informe o nome do produto.');
    const p = DB.insert('produtos', {
      nome, sku: fval('un-sku') || 'USD-' + Date.now().toString(36).toUpperCase().slice(-5), barcode: '',
      categoria: fval('un-cat'), marca: fval('un-marca'), modelo: fval('un-modelo'), condicao: fval('un-cond'),
      qtd: 0, min: parseInt(fval('un-min')) || 1, custo: 0, custoMedio: 0, preco: fnum('un-preco'), serie: '', local: 'Usados'
    });
    Toast.ok('Produto cadastrado no catálogo.');
    this.utSel = p; this.utStep = 'unit'; this.utRender();
  },
  utEdit(idx) {
    const u = this.cart.usados[idx]; if (!u) return;
    this.utSel = DB.get('produtos', u.produtoId) || { id: u.produtoId, nome: u.nome, categoria: u.categoria, marca: u.marca, condicao: u.condicao, sku: '' };
    this.utEditIdx = idx; this.utStep = 'unit'; this.utRender();
  },
  utRemoveItem(idx) { this.cart.usados.splice(idx, 1); this.utRender(); },
  utCalc() {
    const q = parseInt(fval('u-qtd')) || 0, v = moneyBR(fval('u-valor'));
    const el = document.getElementById('u-total-live'); if (el) el.textContent = Fmt.brl((isNaN(v) ? 0 : v) * q);
  },
  utConfirm() {
    const p = this.utSel, valorUnit = moneyBR(fval('u-valor'));
    if (!p) return Toast.err('Selecione um produto.');
    if (isNaN(valorUnit) || valorUnit <= 0) return Toast.err('Informe o valor unitário atribuído.');
    let qtd = parseInt(fval('u-qtd')) || 0;
    if (qtd < 1) return Toast.err('A quantidade recebida deve ser maior que zero.');
    const serie = fval('u-serie');
    if (serie && qtd > 1) { qtd = 1; Toast.warn('Item com número de série é único — quantidade ajustada para 1.'); }
    const obj = {
      produtoId: p.id, nome: p.nome, categoria: p.categoria, marca: p.marca, condicao: p.condicao,
      qtd, valorUnit, valor: Math.round(valorUnit * qtd * 100) / 100,
      estado: fval('u-estado'), serie, controle: fchk('u-controle'), cabos: fchk('u-cabos'), caixa: fchk('u-caixa'),
      obs: fval('u-obs')
    };
    if (this.utEditIdx >= 0) { this.cart.usados[this.utEditIdx] = obj; Toast.ok('Usado atualizado.'); }
    else { if (this.cart.usados.some(u => u.produtoId === p.id)) return Toast.warn('Esse produto já foi adicionado — edite para mudar a quantidade.'); this.cart.usados.push(obj); Toast.ok('Usado adicionado: ' + qtd + 'x ' + p.nome + ' (' + Fmt.brl(obj.valor) + ').'); }
    this.utEditIdx = -1; this.utSel = null; this.utStep = 'list'; this.utRender();
  },
  checkout() {
    if (!this.cart.itens.length) return;
    const c = this.cart;
    if (!Array.isArray(c.usados)) c.usados = [];
    const bruto = c.itens.reduce((s, i) => s + i.preco * i.qtd, 0);
    const usadoVal = c.usados.reduce((s, u) => s + (u.valor || 0), 0);
    const totalVenda = Math.max(0, bruto - c.desconto);
    const total = Math.max(0, totalVenda - usadoVal); // valor a pagar em dinheiro/cartão
    const devolucao = Math.max(0, usadoVal - totalVenda); // usado vale mais que o levado → loja devolve
    const custoTot = c.itens.reduce((s, i) => s + i.custo * i.qtd, 0);
    this.coCtx = { total, totalVenda, custoTot, bruto, usadoVal, devolucao };
    const primeira = (typeof Taxas !== 'undefined' && Taxas.ativas()[0]) ? Taxas.ativas()[0].key : 'PIX';
    this.coPays = devolucao > 0 ? [] : [{ method: primeira, valor: total }];
    Modal.open({
      title: devolucao > 0 ? 'Troca — devolver ' + Fmt.brl(devolucao) : 'Finalizar venda — ' + Fmt.brl(total), wide: true,
      body: `<div class="form-grid" style="gap:18px">
        <div><div class="section-title">Formas de pagamento</div>
          <div id="co-lines"></div>
          <button class="btn-ghost btn-sm" style="margin-top:8px" onclick="Modules.coAddLine()">+ Adicionar pagamento</button>
        </div>
        <div><div class="section-title">Resumo da venda</div><div id="co-sim"></div></div>
      </div>
      ${this._coClienteCard()}`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Voltar</button><button class="btn-primary" id="co-confirm" onclick="Modules.confirmVenda()">✅ Confirmar venda</button>`
    });
    setTimeout(() => this.coRender(), 10);
  },
  _coClienteCard() {
    const itensPre = this.cart.itens.filter(i => i.prevenda);
    if (itensPre.length) {
      // Há item de pré-venda no carrinho → cliente obrigatório (uma única venda, item entregue depois)
      return `<div class="card" style="margin-top:14px;background:var(--bg-2);border:1px solid var(--purple,#a855f7)">
        <div style="font-weight:700;margin-bottom:8px">📋 Esta venda contém ${itensPre.length} item(ns) em pré-venda</div>
        <div class="muted" style="font-size:12px;margin-bottom:10px">${itensPre.map(i => '• ' + esc(i.nome) + ' (' + i.qtd + ' un)').join('<br>')}<br>Esses itens entram como <b>aguardando entrega</b> na mesma venda (um único pedido). Você entrega depois pela aba Pré-venda. Informe o cliente:</div>
        <div class="form-grid"><div class="field"><label>Nome do cliente *</label><input id="co-pv-cliente"></div>
        <div class="field"><label>Telefone / WhatsApp *</label><input id="co-pv-tel" placeholder="11 99999-9999"></div>
        <div class="field full"><label>Data prevista de chegada/entrega (opcional)</label><input id="co-pv-data" type="date"></div></div>
        <input type="hidden" id="co-prevenda" value="auto"></div>`;
    }
    // Venda comum (sem itens de pré-venda) — nada a coletar. Dica de como marcar pré-venda por item.
    return `<div class="muted" style="margin-top:12px;font-size:11.5px">Dica: para vender um produto que ainda vai chegar, marque <b>📋 Pré-venda</b> no item dentro do carrinho antes de finalizar.</div>`;
  },
  coMethods() { return (typeof Taxas !== 'undefined') ? Taxas.ativas().map(t => t.key) : ['PIX', 'Dinheiro', 'Débito', 'Crédito à vista']; },
  coAddLine() { const soma = this.coPays.reduce((s, p) => s + (+p.valor || 0), 0); this.coPays.push({ method: 'Dinheiro', valor: Math.max(0, this.coCtx.total - soma) }); this.coRender(); },
  coDel(i) { this.coPays.splice(i, 1); this.coRender(); },
  coSet(i, f, v) { this.coPays[i][f] = f === 'valor' ? (parseFloat(String(v).replace(',', '.')) || 0) : v; this.coRender(); },
  coMethodToPag(key, valor) { if (key.indexOf('Crédito') === 0) { const m = key.match(/(\d+)x/); return { tipo: 'Crédito', valor, parcelas: m ? +m[1] : 1 }; } return { tipo: key, valor, parcelas: 1 }; },
  coRender() {
    const linesEl = document.getElementById('co-lines'); if (!linesEl) return;
    const pays = this.coPays, { total } = this.coCtx, opts = this.coMethods();
    const devolucao = this.coCtx.devolucao || 0, usadoV = this.coCtx.usadoVal || 0, totVenda = this.coCtx.totalVenda != null ? this.coCtx.totalVenda : total;
    // ----- TROCA com DEVOLUÇÃO: o usado vale mais que o produto levado. A loja devolve a diferença. -----
    if (devolucao > 0) {
      const formasDev = ['Dinheiro', 'PIX'].concat(opts.filter(o => o !== 'Dinheiro' && o !== 'PIX'));
      linesEl.innerHTML = `<div class="alert-card" style="background:var(--amber-soft,rgba(245,158,11,.12));border:1px solid var(--amber,#f59e0b);margin-bottom:10px">
          <div class="a-ico">↩️</div><div><div class="a-lbl"><b>DEVOLVER AO CLIENTE ${Fmt.brl(devolucao)}</b></div>
          <div class="muted" style="font-size:11.5px">O produto recebido (${Fmt.brl(usadoV)}) vale mais que o levado (${Fmt.brl(totVenda)}). O sistema registra a saída no caixa/financeiro automaticamente.</div></div></div>
        <label style="font-size:12px;font-weight:600;color:var(--txt-2)">Forma de devolução</label>
        <select id="co-devforma" style="width:100%;margin-top:6px;background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:9px 10px">${formasDev.map(o => `<option>${o}</option>`).join('')}</select>`;
      document.getElementById('co-sim').innerHTML = `<div class="card" style="background:var(--bg-2)">
        <div class="mini-stat"><span>Produto recebido do cliente</span><b style="color:var(--green)">${Fmt.brl(usadoV)}</b></div>
        <div class="mini-stat"><span>Produto entregue ao cliente</span><b>${Fmt.brl(totVenda)}</b></div>
        <div class="mini-stat" style="font-size:16px;border-top:1px solid var(--line);padding-top:8px;margin-top:4px"><span class="strong">↩️ Devolver ao cliente</span><b style="color:var(--red)">− ${Fmt.brl(devolucao)}</b></div>
      </div>`;
      const btn = document.getElementById('co-confirm'); if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✅ Confirmar troca'; }
      return;
    }
    // ----- TROCA SEM DIFERENÇA (usado = produto levado): confirma sem pagamento -----
    if (usadoV > 0 && total <= 0.009) {
      linesEl.innerHTML = `<div class="alert-card" style="background:var(--green-soft,rgba(34,197,94,.12));border:1px solid var(--green);"><div class="a-ico">🔁</div><div><div class="a-lbl"><b>Troca sem diferença</b></div><div class="muted" style="font-size:11.5px">O valor do usado cobre exatamente o produto levado. Nenhuma movimentação de caixa.</div></div></div>`;
      document.getElementById('co-sim').innerHTML = `<div class="card" style="background:var(--bg-2)">
        <div class="mini-stat"><span>Produto recebido</span><b style="color:var(--green)">${Fmt.brl(usadoV)}</b></div>
        <div class="mini-stat"><span>Produto entregue</span><b>${Fmt.brl(totVenda)}</b></div>
        <div class="mini-stat" style="font-size:15px"><span class="strong">Diferença</span><b>${Fmt.brl(0)}</b></div></div>`;
      const btn = document.getElementById('co-confirm'); if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '✅ Confirmar troca'; }
      return;
    }
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
    const ehPrevenda = fchk('co-prevenda');
    const invalido = (!ehPrevenda && restante > 0.01) || excedenteCartao > 0.01;
    const usadoVal = this.coCtx.usadoVal || 0, totalVenda = this.coCtx.totalVenda != null ? this.coCtx.totalVenda : total;
    document.getElementById('co-sim').innerHTML = `
      <div class="card" style="background:var(--bg-2)">
        <div class="mini-stat" style="font-size:17px"><span class="strong">Total da venda</span><b style="color:var(--green)">${Fmt.brl(totalVenda)}</b></div>
        ${this.cart.desconto ? `<div class="mini-stat"><span>Desconto aplicado</span><b style="color:var(--red)">− ${Fmt.brl(this.cart.desconto)}</b></div>` : ''}
        ${usadoVal ? `<div class="mini-stat"><span>🔄 Usados recebidos (${(this.cart.usados || []).length})</span><b style="color:var(--green)">− ${Fmt.brl(usadoVal)}</b></div>` : ''}
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
    const temItemPrevenda = c.itens.some(i => i.prevenda);
    // ----- Venda mista (itens imediatos + itens de pré-venda) exige cliente -----
    let preCliente = '', preTel = '', preData = '';
    if (temItemPrevenda) {
      preCliente = fval('co-pv-cliente'); preTel = fval('co-pv-tel'); preData = fval('co-pv-data');
      if (!preCliente) return Toast.err('Informe o nome do cliente (a venda tem item em pré-venda).');
      if (!preTel) return Toast.err('Informe o telefone/WhatsApp do cliente (a venda tem item em pré-venda).');
    }
    if (soma < total - 0.01) return Toast.err('Ainda falta ' + Fmt.brl(total - soma) + ' a pagar.');
    if ((soma - cash) > total + 0.01) return Toast.err('Pagamentos eletrônicos excedem o total. Ajuste os valores.');
    // Garante que o armazenamento local está gravável ANTES de concluir a venda (não confirma se não conseguir salvar)
    try { if (typeof localStorage !== 'undefined') { localStorage.setItem('rg_wtest', '1'); localStorage.removeItem('rg_wtest'); } }
    catch (e) { return Toast.err('⚠️ Não foi possível salvar (armazenamento cheio ou bloqueado). A venda NÃO foi concluída — verifique o navegador e tente de novo.'); }
    const pagamentos = pays.map(p => {
      const pg = this.coMethodToPag(p.method, +p.valor || 0);
      pg.taxa = (typeof Taxas !== 'undefined') ? Taxas.feeByKey(p.method, +p.valor || 0) : 0;
      const tx = (typeof Taxas !== 'undefined') ? Taxas.get(p.method) : null;
      if (tx && tx.tipo === 'financeira') { pg.financeira = true; pg.financeiraNome = tx.nome; pg.prazoDias = tx.prazoDias || 0; pg.conta = tx.conta || ''; }
      return pg;
    });
    const taxaTotal = pagamentos.reduce((s, p) => s + p.taxa, 0);
    const lucro = totalVenda - custoTot, liquido = totalVenda - taxaTotal, lucroLiquido = liquido - custoTot;
    const agora = new Date().toISOString();
    // baixa estoque SÓ dos itens imediatos. Itens de pré-venda: se já houver estoque, reserva a unidade (não baixa); senão, fica aguardando chegada.
    c.itens.forEach(i => {
      const p = DB.get('produtos', i.produtoId); if (!p) return;
      if (i.prevenda) {
        const disp = (p.qtd || 0) - (p.reservado || 0);
        if (disp >= i.qtd) { DB.update('produtos', i.produtoId, { reservado: (p.reservado || 0) + i.qtd }); i.__res = true; }
        return;
      }
      const novaQtd = p.qtd - i.qtd; DB.update('produtos', i.produtoId, { qtd: novaQtd });
    });
    const troco = Math.max(0, soma - total);
    const operador = (typeof App !== 'undefined' && App.user() && App.user().nome) ? App.user().nome : 'Admin';
    const itensArr = c.itens.map(i => { const pr = DB.get('produtos', i.produtoId) || {}; return { produtoId: i.produtoId, sku: i.sku, nome: i.nome, qtd: i.qtd, preco: i.preco, precoOriginal: i.precoOriginal != null ? i.precoOriginal : i.preco, precoMotivo: i.precoMotivo || null, custo: i.custo, categoria: pr.categoria || '—', condicao: pr.condicao || 'novo', entrega: i.prevenda ? 'prevenda' : 'entregue', entregueEm: i.prevenda ? null : agora, dataPrevista: i.prevenda ? (preData || '') : null, reservado: i.prevenda ? !!i.__res : false }; });
    const cupomSnap = (typeof Cupom !== 'undefined') ? Cupom.snapshot({ itens: itensArr }) : null;
    const usados = (c.usados || []).slice();
    const venda = DB.insert('vendas', {
      data: new Date().toISOString(), numero: (typeof PV !== 'undefined' ? PV.nextNum() : undefined), itens: itensArr,
      cliente: preCliente || null, telefone: preTel || null, temPrevenda: temItemPrevenda,
      bruto, desconto: c.desconto, total: totalVenda, aPagar: total, custoTotal: custoTot, lucro, taxaTotal, liquido, lucroLiquido,
      pagamentos, recebido: soma, troco, usadoEntrada: usados.length ? usados.map(u => u.nome).join(', ') : null, usadoValor: usadoVal, usados: usados, usuario: operador, cupom: cupomSnap
    });
    // Cada usado recebido → reutiliza o produto do catálogo: +1 unidade (sem duplicar) e custo médio
    usados.forEach(u => {
      const un = u.qtd || 1, custoUnit = (u.valorUnit != null ? u.valorUnit : u.valor);
      const p = DB.get('produtos', u.produtoId);
      if (p) {
        const qNova = p.qtd + un;
        const custoMedio = qNova ? (((p.custoMedio || p.custo || 0) * p.qtd) + custoUnit * un) / qNova : custoUnit;
        const patch = { qtd: qNova, custo: custoUnit, custoMedio: Math.round(custoMedio * 100) / 100 };
        if (u.serie && !p.serie && un === 1) patch.serie = u.serie;
        DB.update('produtos', u.produtoId, patch);
      }
      // Usado recebido como pagamento é uma forma NÃO-financeira: só entra no estoque/histórico,
      // não gera saída financeira, não mexe no caixa e não cria conta a pagar.
      DB.logMov('usado', 'Usado recebido na troca: ' + un + 'x ' + u.nome + (u.serie ? ' (S/N ' + u.serie + ')' : '') + ' — ' + Fmt.brl(u.valor) + ' · venda #' + venda.id.slice(-4) + ' (forma de pagamento não-financeira)', { valor: u.valor, refId: venda.id });
    });
    const formaStr = pagamentos.map(p => p.tipo + (p.parcelas > 1 ? ' ' + p.parcelas + 'x' : '')).join(' + ');
    DB.logMov('venda', 'Venda: ' + c.itens.map(i => i.qtd + 'x ' + i.nome).join(', ') + (usados.length ? ' (troca c/ ' + usados.length + ' usado(s))' : ''), { valor: totalVenda, refId: venda.id });
    // ---- Financeiro: separa o recebido AGORA (pago) do que será recebido DEPOIS via financeira (a receber) ----
    const finPays = pagamentos.filter(p => p.financeira);
    const finSum = finPays.reduce((s, p) => s + p.valor, 0);
    const finTaxa = finPays.reduce((s, p) => s + (p.taxa || 0), 0);
    const imediato = total - finSum;                          // parte recebida na hora (PIX/dinheiro/cartão)
    const taxaImediata = taxaTotal - finTaxa;
    if (imediato > 0.009) DB.logFin({ tipo: 'entrada', categoria: 'Venda', descricao: 'Venda PDV #' + (venda.numero || venda.id.slice(-4)) + ' (' + formaStr + (usados.length ? ' + usado (não-financeiro)' : '') + ')', valor: imediato, taxa: taxaImediata, liquido: imediato - taxaImediata, status: 'pago', origem: 'venda', refId: venda.id });
    finPays.forEach(p => {
      const venc = new Date(Date.now() + (p.prazoDias || 0) * 86400000).toISOString();
      DB.logFin({ tipo: 'entrada', categoria: 'Venda — Financeira', subcategoria: p.financeiraNome, descricao: 'Venda #' + (venda.numero || venda.id.slice(-4)) + ' — ' + p.financeiraNome + (venda.cliente ? ' · ' + venda.cliente : ''), valor: p.valor, taxa: p.taxa || 0, liquido: p.valor - (p.taxa || 0), status: 'areceber', pago: 0, emissao: new Date().toISOString(), vencimento: venc, data: venc, origem: 'venda', refId: venda.id, financeira: true, financeiraNome: p.financeiraNome, conta: p.conta || '', formaPagamento: p.financeiraNome });
    });
    if (finSum > 0) DB.logMov('venda', 'Venda #' + (venda.numero || venda.id.slice(-4)) + ' via financeira (' + finPays.map(p => p.financeiraNome).join(', ') + ') — a receber ' + Fmt.brl(finSum - finTaxa), { valor: finSum, refId: venda.id });
    // dinheiro líquido (descontado troco) entra no Caixa
    const dinheiro = pagamentos.filter(p => p.tipo === 'Dinheiro').reduce((s, p) => s + p.valor, 0);
    const netCash = Math.max(0, dinheiro - Math.max(0, soma - total));
    if (netCash > 0 && typeof Caixa !== 'undefined') Caixa.add({ fluxo: 'entrada', tipo: 'Venda em dinheiro', origem: 'Venda em dinheiro', categoria: 'Venda', valor: netCash, obs: c.itens.map(i => i.nome).join(', '), refId: venda.id });
    // ---- TROCA com DEVOLUÇÃO: usado vale mais que o levado → a loja devolve a diferença.
    // Uma única operação (a mesma venda). NÃO é receita nem despesa: só sai dinheiro do caixa
    // (ou saída financeira, se PIX). O usado já entrou no estoque pelo valor atribuído. ----
    const devolucao = this.coCtx.devolucao || 0;
    if (devolucao > 0) {
      const devForma = fval('co-devforma') || 'Dinheiro';
      const obsDev = 'Troca #' + (venda.numero || venda.id.slice(-4)) + ' — recebido ' + usados.map(u => u.nome).join(', ') + ' (' + Fmt.brl(usadoVal) + ') · entregue ' + c.itens.map(i => i.nome).join(', ') + ' (' + Fmt.brl(totalVenda) + ')';
      if (devForma === 'Dinheiro' && typeof Caixa !== 'undefined') {
        Caixa.add({ fluxo: 'saida', tipo: 'Devolução de troca', origem: 'Devolução de diferença de troca', categoria: 'Troca', valor: devolucao, obs: obsDev, refId: venda.id });
      } else {
        DB.logFin({ tipo: 'saida', categoria: 'Devolução de diferença de troca', subcategoria: devForma, descricao: obsDev, valor: devolucao, status: 'pago', origem: 'troca', formaPagamento: devForma, refId: venda.id });
      }
      DB.update('vendas', venda.id, { devolucaoTroca: { valor: devolucao, forma: devForma } });
      DB.logMov('devolucao', 'Devolução de troca #' + (venda.numero || venda.id.slice(-4)) + ': ' + Fmt.brl(devolucao) + ' (' + devForma + ') ao cliente', { valor: devolucao, refId: venda.id });
    }
    Modal.close();
    const nPre = itensArr.filter(i => i.entrega === 'prevenda').length;
    Toast.ok((devolucao > 0 ? 'Troca #' : 'Venda #') + (venda.numero || venda.id.slice(-4)) + ' concluída! ' + (devolucao > 0 ? 'Devolvidos ' + Fmt.brl(devolucao) + ' ao cliente' : Fmt.brl(totalVenda)) + (nPre ? ' · ' + nPre + ' item(ns) em pré-venda (entregar depois)' : '') + (usadoVal ? ' · usados ' + Fmt.brl(usadoVal) : '') + (troco > 0 ? ' · Troco ' + Fmt.brl(troco) : ''));
    this.clearCart(); this.pdvSearch();
    if (typeof Print !== 'undefined') Print.maybeAfterSale(venda);
  },

  /* ===================== COMPRAS ===================== */
  compras() {
    const cs = DB.all('compras').slice().sort((a, b) => new Date(b.data) - new Date(a.data));
    const condB = c => condBadge(c || 'novo');
    const rows = [];
    const seen = {}; const adm = App.isAdmin() || App.can('podeCancelar');
    cs.forEach(c => (c.itens || []).forEach(i => { const first = !seen[c.id]; seen[c.id] = 1; rows.push({
      compraId: c.id, cancelada: !!c.cancelada, first,
      data: c.data, nome: i.nome, qtd: i.qtd, custo: i.custo, condicao: i.condicao || 'novo',
      obs: c.obs || '', resp: c.responsavel || 'Admin', novo: !i.produtoId,
      forma: c.formaPagamento || '—', origem: c.origemPagamento || ''
    }); }));
    return `<div class="page-head"><div><h1>Compras</h1><p>Histórico de compras — produto, custo, pagamento e responsável</p></div>
      <div class="actions"><button class="btn-ghost" onclick="App.go('entrada')">📥 Entrada de estoque</button><button class="btn-primary" onclick="Modules.compraForm()">+ Nova compra</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Produto</th><th class="num">Qtd</th><th class="num">Custo unit.</th><th class="num">Custo total</th><th>Condição</th><th>Pagamento</th><th>Observação</th><th>Responsável</th>${adm ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.map(r => `<tr${r.cancelada ? ' style="opacity:.55"' : ''}>
        <td>${Fmt.date(r.data)}</td>
        <td class="strong">${esc(r.nome)} ${r.novo ? '<span class="badge b-blue">novo</span>' : ''}${r.cancelada && r.first ? ' <span class="badge b-red">Cancelada</span>' : ''}</td>
        <td class="num">${r.qtd}</td>
        <td class="num">${Fmt.brl(r.custo)}</td>
        <td class="num strong">${Fmt.brl(r.qtd * r.custo)}</td>
        <td>${condB(r.condicao)}</td>
        <td>${esc(r.forma)}${r.origem ? `<div class="muted" style="font-size:10.5px">${esc(r.origem)}</div>` : ''}</td>
        <td class="muted">${esc(r.obs) || '—'}</td>
        <td>${esc(r.resp)}</td>
        ${adm ? `<td class="num">${r.first && !r.cancelada ? `<button class="btn-icon" title="Cancelar/estornar esta compra" onclick="Modules.compraCancelar('${r.compraId}')">✕</button>` : ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="${adm ? 10 : 9}" class="muted" style="text-align:center;padding:30px">Nenhuma compra lançada ainda.</td></tr>`}</tbody></table></div>`;
  },
  compraCancelar(id) {
    if (!(App.isAdmin() || App.can('podeCancelar'))) return Toast.err('Você não tem permissão para cancelar compras.');
    Modal.confirm('Cancelar esta compra/entrada? O <b>estoque será revertido</b>, o <b>financeiro estornado</b> e o <b>caixa devolvido</b> (na parte paga em dinheiro). O registro fica marcado como cancelado para auditoria.', () => {
      const c = DB.get('compras', id); if (!c || c.cancelada) return;
      // 1) reverte estoque das unidades que entraram
      (c.itens || []).forEach(i => { if (i.produtoId) { const p = DB.get('produtos', i.produtoId); if (p) DB.update('produtos', i.produtoId, { qtd: Math.max(0, (p.qtd || 0) - (i.qtd || 0)) }); } });
      // 2) estorna os lançamentos financeiros vinculados (mesma compra)
      DB.all('financeiro').filter(f => f.refId === id && f.origem === 'compra').forEach(f => DB.remove('financeiro', f.id));
      // 3) devolve ao caixa a parte paga em dinheiro (estorno = entrada compensatória; mantém o histórico)
      DB.all('caixa').filter(m => m.refId === id && m.fluxo === 'saida').forEach(m => { if (typeof Caixa !== 'undefined') Caixa.add({ fluxo: 'entrada', tipo: 'Estorno de compra', origem: 'Estorno · Entrada de estoque #' + String(id).slice(-6).toUpperCase(), categoria: 'Estorno', valor: m.valor, forma: m.forma || 'Dinheiro', obs: 'Cancelamento da compra', refId: id }); });
      DB.update('compras', id, { cancelada: true, canceladaEm: new Date().toISOString() });
      DB.logMov('devolucao', 'Compra/entrada cancelada — estoque revertido, financeiro estornado' + (c.total ? ' (' + Fmt.brl(c.total) + ')' : ''), { valor: c.total || 0, refId: id });
      Toast.ok('Compra cancelada e estornada.'); App.go('compras');
    }, 'Cancelar compra');
  },
  compraItens: [],
  compraTogglePrazo() { const w = document.getElementById('c-venc-wrap'); if (w) w.style.display = fchk('c-prazo') ? 'block' : 'none'; },
  compraForm() {
    this.compraItens = [];
    const resp = (typeof App !== 'undefined' && App.user() && App.user().nome) ? App.user().nome : 'Admin';
    const formasPg = ['Dinheiro', 'PIX', 'Débito', 'Crédito à vista', 'Transferência', 'Boleto'];
    const hoje = new Date().toISOString().slice(0, 10);
    Modal.open({
      title: '🛒 Nova compra', wide: true,
      body: `<div class="section-title" style="margin-top:0">Produto comprado</div>
      <div class="form-grid">
        <div class="field full"><label>Produto (busque um existente ou digite um novo)</label><input id="ci-prod" list="ci-prodlist" placeholder="Ex: Controle DualSense Branco" onchange="Modules.compraPickProduct()">
          <datalist id="ci-prodlist">${DB.all('produtos').map(p => `<option value="${esc(p.nome)}">${p.sku}</option>`).join('')}</datalist></div>
        <div class="field"><label>Quantidade</label><input id="ci-qtd" type="number" min="1" value="1"></div>
        <div class="field"><label>Custo unitário (R$)</label><input id="ci-custo" type="text" inputmode="decimal" placeholder="ex: 280,00"></div>
        <div class="field"><label>Condição</label><select id="ci-cond"><option value="novo">novo</option><option value="seminovo">seminovo</option><option value="usado">usado</option></select></div>
      </div>
      <button class="btn-primary btn-sm" style="margin-top:10px" onclick="Modules.addCompraItem()">+ Adicionar à compra</button>
      <div id="compra-itens" style="margin-top:14px"></div>
      <div class="form-grid" style="margin-top:14px">
        <div class="field"><label>Forma de pagamento</label><select id="c-forma">${formasPg.map(f => `<option ${f === 'Dinheiro' ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="field"><label>Data da compra</label><input type="date" id="c-data" value="${hoje}"></div>
        <div class="field"><label>&nbsp;</label><label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;padding-top:4px"><input type="checkbox" id="c-prazo" onchange="Modules.compraTogglePrazo()"> 📅 Compra a prazo (lançar em Contas a Pagar)</label></div>
        <div class="field" id="c-venc-wrap" style="display:none"><label>Vencimento</label><input type="date" id="c-venc"></div>
      </div>
      <div class="muted" style="font-size:11.5px;margin-top:2px">Por padrão a compra é <b>paga à vista</b> (registra a saída no financeiro/caixa e NÃO cria conta a pagar). Marque "a prazo" só se o pagamento ficará pendente.</div>
      <div class="form-grid" style="margin-top:14px">
        <div class="field full"><label>Observação (opcional)</label><input id="c-obs" placeholder="Ex: lote promocional, compra balcão, nota fiscal..."></div>
      </div>
      <div class="muted" style="margin-top:10px;font-size:12px">Responsável pelo lançamento: <b>${esc(resp)}</b></div>
      <div id="compra-resumo"></div>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.saveCompra()">✅ Salvar compra</button>`
    });
    this.renderCompraResumo();
  },
  compraPickProduct() {
    const nome = fval('ci-prod');
    const p = DB.all('produtos').find(x => x.nome.toLowerCase() === nome.toLowerCase());
    if (p) {
      const cc = document.getElementById('ci-cond'); if (cc && p.condicao) cc.value = p.condicao;
      const ce = document.getElementById('ci-custo'); if (ce && !ce.value && (p.custo || p.custoMedio)) ce.value = String(p.custo || p.custoMedio).replace('.', ',');
    }
  },
  addCompraItem() {
    const nome = fval('ci-prod'), qtd = parseInt(fval('ci-qtd')) || 0, custo = moneyBR(fval('ci-custo'));
    if (!nome) return Toast.err('Informe o produto comprado.');
    if (qtd <= 0) return Toast.err('Quantidade deve ser maior que zero.');
    if (isNaN(custo) || custo < 0) return Toast.err('Informe um custo unitário válido.');
    const existente = DB.all('produtos').find(p => p.nome.toLowerCase() === nome.toLowerCase());
    this.compraItens.push({ nome, qtd, custo, condicao: fval('ci-cond') || 'novo', sku: existente ? existente.sku : null, produtoId: existente ? existente.id : null });
    document.getElementById('ci-prod').value = ''; document.getElementById('ci-qtd').value = '1'; document.getElementById('ci-custo').value = '';
    document.getElementById('ci-prod').focus();
    this.renderCompraResumo();
  },
  renderCompraResumo() {
    const box = document.getElementById('compra-itens'); if (!box) return;
    box.innerHTML = this.compraItens.length ? `<div class="table-wrap"><table><thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Custo un.</th><th class="num">Custo total</th><th>Condição</th><th></th></tr></thead>
      <tbody>${this.compraItens.map((i, idx) => `<tr><td class="strong">${esc(i.nome)} ${i.produtoId ? '' : '<span class="badge b-blue">novo</span>'}</td><td class="num">${i.qtd}</td><td class="num">${Fmt.brl(i.custo)}</td><td class="num strong">${Fmt.brl(i.qtd * i.custo)}</td><td>${condBadge(i.condicao || 'novo')}</td><td class="num"><button class="btn-icon" onclick="Modules.compraItens.splice(${idx},1);Modules.renderCompraResumo()">🗑️</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum produto adicionado ainda.</p>';
    const sub = this.compraItens.reduce((s, i) => s + i.qtd * i.custo, 0);
    const un = this.compraItens.reduce((s, i) => s + i.qtd, 0);
    const rs = document.getElementById('compra-resumo'); if (!rs) return;
    rs.innerHTML = this.compraItens.length ? `<div class="card" style="margin-top:14px;background:var(--bg-2)">
      <div class="mini-stat"><span>Itens / unidades</span><b>${this.compraItens.length} item(ns) · ${un} un</b></div>
      <div class="mini-stat" style="font-size:16px"><span class="strong">Custo total da compra</span><b style="color:var(--green)">${Fmt.brl(sub)}</b></div></div>` : '';
  },
  saveCompra() {
    if (!this.compraItens.length) return Toast.err('Adicione ao menos um produto à compra.');
    const total = this.compraItens.reduce((s, i) => s + i.qtd * i.custo, 0);
    const obs = fval('c-obs') || '';
    const fornId = null, fornNome = '';
    const resp = (typeof App !== 'undefined' && App.user() && App.user().nome) ? App.user().nome : 'Admin';
    this.compraItens.forEach(i => {
      if (i.produtoId) {
        const p = DB.get('produtos', i.produtoId);
        const qtdNova = p.qtd + i.qtd;
        const custoMedio = qtdNova ? (((p.custoMedio || p.custo || 0) * p.qtd) + i.custo * i.qtd) / qtdNova : i.custo;
        DB.update('produtos', i.produtoId, { qtd: qtdNova, custoMedio: Math.round(custoMedio * 100) / 100, custo: i.custo });
      } else {
        const novo = DB.insert('produtos', { nome: i.nome, sku: 'NEW-' + Date.now().toString(36).toUpperCase().slice(-5), barcode: '', categoria: 'Acessórios', marca: '—', modelo: '', condicao: i.condicao || 'novo', qtd: i.qtd, min: 1, custo: i.custo, custoMedio: Math.round(i.custo * 100) / 100, preco: Math.round(i.custo * 1.6), serie: '', local: 'A definir', criadoEm: new Date().toISOString(), custoHist: [], precoHist: [] });
        i.produtoId = novo.id;
      }
    });
    const forma = fval('c-forma') || 'Dinheiro';
    const aPrazo = fchk('c-prazo');
    const hojeISO = fval('c-data') ? (fval('c-data') + 'T12:00:00') : new Date().toISOString();
    const venc = fval('c-venc') ? (fval('c-venc') + 'T12:00:00') : hojeISO;
    const compra = DB.insert('compras', {
      data: hojeISO, fornecedorId: fornId, nf: '', obs, responsavel: resp, formaPagamento: forma, aPrazo,
      itens: this.compraItens, frete: 0, impostos: 0, subtotal: total, total, status: 'recebido'
    });
    DB.logMov('compra', 'Compra lançada — ' + this.compraItens.map(i => i.qtd + 'x ' + i.nome).join(', ') + (fornNome ? ' (' + fornNome + ')' : '') + ' · ' + (aPrazo ? 'a prazo' : forma) + (obs ? ' · ' + obs : ''), { valor: total, refId: compra.id });
    const descFin = 'Compra' + (fornNome ? ' — ' + fornNome : '') + (obs ? ' (' + obs + ')' : '');
    if (aPrazo) {
      // Exceção: compra a prazo → cria conta a pagar (pendente, com vencimento)
      DB.logFin({ tipo: 'saida', categoria: 'Compra de mercadoria', subcategoria: 'A prazo', descricao: descFin, valor: total, pago: 0, status: 'pendente', emissao: hojeISO, vencimento: venc, data: venc, fornecedorId: fornId || null, formaPagamento: forma, origem: 'compra', refId: compra.id });
      Toast.ok('Compra salva! Lançada em Contas a Pagar (vencimento ' + Fmt.date(venc) + ').');
    } else {
      // Padrão: paga à vista → saída financeira efetiva (NÃO cria conta a pagar)
      DB.logFin({ tipo: 'saida', categoria: 'Compra de mercadoria', descricao: descFin + ' · ' + forma, valor: total, pago: total, status: 'pago', emissao: hojeISO, vencimento: hojeISO, data: hojeISO, fornecedorId: fornId || null, formaPagamento: forma, origem: 'compra', refId: compra.id });
      if (forma === 'Dinheiro' && typeof Caixa !== 'undefined') Caixa.add({ fluxo: 'saida', tipo: 'Compra de mercadoria', origem: 'Compra' + (fornNome ? ' — ' + fornNome : ''), categoria: 'Compra', valor: total, obs: this.compraItens.map(i => i.qtd + 'x ' + i.nome).join(', '), refId: compra.id });
      Toast.ok('Compra salva à vista (' + forma + ')! Estoque e custo médio atualizados.');
    }
    Modal.close(); App.go('compras');
  },

  /* ===================== USADOS (recebimento direto no estoque) ===================== */
  usados() {
    const list = DB.all('produtos').filter(p => p.condicao === 'usado').slice().sort((a, b) => new Date(b.criadoEm || 0) - new Date(a.criadoEm || 0));
    const canFin = App.canFinance();
    return `<div class="page-head"><div><h1>Receber Usado</h1><p>Cadastre um produto usado direto no estoque — sem etapa de avaliação</p></div>
      <div class="actions"><button class="btn-primary" onclick="Modules.usadoReceber()">+ Receber usado</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th class="num">Qtd</th>${canFin ? '<th class="num">Custo</th>' : ''}<th class="num">Preço</th><th>Local</th><th></th></tr></thead>
      <tbody>${list.map(p => `<tr>
        <td class="strong prod-link" style="cursor:pointer" onclick="ProdHist.open('${p.id}')">${esc(p.nome)} 🔎<div class="muted" style="font-size:11px">${p.sku}${p.serie ? ' · S/N ' + p.serie : ''}</div></td>
        <td>${esc(p.categoria)}<div class="muted" style="font-size:11px">${esc(p.marca || '')}</div></td>
        <td class="num strong">${p.qtd}</td>
        ${canFin ? `<td class="num">${Fmt.brl(p.custoMedio || p.custo || 0)}</td>` : ''}
        <td class="num strong">${Fmt.brl(p.preco || 0)}</td>
        <td>${esc(p.local || '—')}</td>
        <td class="num">${App.can('podeEditarProduto') ? `<button class="btn-icon" onclick="Modules.produtoForm('${p.id}')">✏️</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">Nenhum usado no estoque ainda.</td></tr>'}</tbody></table></div>`;
  },
  usadoReceber() {
    Modal.open({
      title: '🔄 Receber usado no estoque', wide: true,
      body: `<div class="form-grid">
        <div class="field full"><label>Produto recebido *</label><input id="u2-nome" placeholder="Ex: PlayStation 4 Pro 1TB"></div>
        <div class="field"><label>Categoria</label><select id="u2-cat">${DB.all('categorias').map(c => `<option>${c.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Marca</label><select id="u2-marca">${DB.all('marcas').map(m => `<option>${m.nome}</option>`).join('')}</select></div>
        <div class="field"><label>Modelo</label><input id="u2-modelo"></div>
        <div class="field"><label>Nº de série</label><input id="u2-serie"></div>
        <div class="field"><label>Quantidade</label><input id="u2-qtd" type="number" min="1" value="1"></div>
        <div class="field"><label>Custo (valor pago) (R$) *</label><input id="u2-custo" type="text" inputmode="decimal" placeholder="ex: 800,00"></div>
        <div class="field"><label>Preço de venda (R$)</label><input id="u2-preco" type="text" inputmode="decimal" placeholder="ex: 1.299,00"></div>
        <div class="field full"><label>Localização</label><input id="u2-local" value="Usados"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--txt-2)"><input type="checkbox" id="u2-fin" checked> Lançar a compra do usado no Financeiro (saída paga)</label>`,
      foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.usadoSalvar()">✅ Cadastrar no estoque</button>`
    });
  },
  usadoSalvar() {
    const nome = fval('u2-nome'), custo = moneyBR(fval('u2-custo'));
    if (!nome) return Toast.err('Informe o produto recebido.');
    if (isNaN(custo) || custo < 0) return Toast.err('Informe o custo (valor pago) do usado.');
    const qtd = parseInt(fval('u2-qtd')) || 1;
    const precoNum = moneyBR(fval('u2-preco')); const preco = isNaN(precoNum) ? Math.round(custo * 1.6) : precoNum;
    const novo = DB.insert('produtos', {
      nome, sku: 'USD-' + Date.now().toString(36).toUpperCase().slice(-5), barcode: '',
      categoria: fval('u2-cat'), marca: fval('u2-marca'), modelo: fval('u2-modelo'), condicao: 'usado',
      qtd, min: 1, custo, custoMedio: custo, preco, serie: fval('u2-serie'), local: fval('u2-local') || 'Usados',
      criadoEm: new Date().toISOString(), custoHist: [], precoHist: []
    });
    DB.logMov('usado', 'Usado recebido no estoque: ' + qtd + 'x ' + nome, { valor: custo * qtd, refId: novo.id });
    if (fchk('u2-fin')) DB.logFin({ tipo: 'saida', categoria: 'Compra de usado', descricao: 'Compra de usado: ' + nome, valor: custo * qtd, pago: custo * qtd, status: 'pago', origem: 'usado', refId: novo.id });
    Modal.close(); Toast.ok('Usado cadastrado no estoque.'); App.go('usados');
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
        ${['venda', 'compra', 'usado', 'troca', 'garantia', 'devolucao', 'ajuste'].map(t => `<option value="${t}">${t}</option>`).join('')}</select></div>
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
