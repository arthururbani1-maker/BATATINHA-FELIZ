/* ============ RICO GAMES ERP — Data Layer (offline / localStorage) ============ */
const DB = (function () {
  const KEY = 'ricogames_erp_v4';
  const COLLECTIONS = [
    'produtos', 'categorias', 'marcas', 'fornecedores', 'compras',
    'vendas', 'avaliacoes', 'trocas', 'movimentacoes', 'garantias',
    'financeiro', 'caixa', 'fechamentos', 'taxas', 'usuarios', 'modelosUsados', 'config'
  ];
  let state = null;

  function load() {
    try { state = JSON.parse(localStorage.getItem(KEY)); } catch (e) { state = null; }
    if (!state || !state.produtos) { state = seed(); save(); }
    COLLECTIONS.forEach(c => { if (!Array.isArray(state[c])) state[c] = []; });
    return state;
  }
  function persist() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function save() { persist(); if (typeof Cloud !== 'undefined' && Cloud.afterLocalSave) Cloud.afterLocalSave(); }
  function importState(obj) { if (!obj) return; state = obj; persist(); }
  function all(c) { return state[c] || []; }
  function get(c, id) { return (state[c] || []).find(x => x.id === id); }
  function uid(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function insert(c, obj) {
    if (!obj.id) obj.id = uid(c.slice(0, 3));
    obj.criadoEm = obj.criadoEm || new Date().toISOString();
    state[c].push(obj); save(); return obj;
  }
  function update(c, id, patch) {
    const i = state[c].findIndex(x => x.id === id);
    if (i >= 0) { state[c][i] = Object.assign({}, state[c][i], patch); save(); return state[c][i]; }
  }
  function remove(c, id) { state[c] = state[c].filter(x => x.id !== id); save(); }

  /* ---- Movimentações: registro central de rastreabilidade ---- */
  function logMov(tipo, descricao, extra) {
    const m = Object.assign({
      id: uid('mov'), tipo, descricao,
      data: new Date().toISOString(),
      usuario: 'Admin'
    }, extra || {});
    state.movimentacoes.unshift(m); save(); return m;
  }

  /* ---- Lançamento financeiro ---- */
  function logFin(o) {
    const f = Object.assign({
      id: uid('fin'), data: new Date().toISOString(),
      status: o.status || 'pago'
    }, o);
    state.financeiro.unshift(f); save(); return f;
  }

  function reset() { localStorage.removeItem(KEY); state = seed(); save(); }
  function exportJSON() { return JSON.stringify(state, null, 2); }

  /* ============ SEED ============ */
  function seed() {
    const now = new Date();
    const iso = d => d.toISOString();
    const daysAgo = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };

    const categorias = [
      { id: 'cat1', nome: 'Consoles' }, { id: 'cat2', nome: 'Jogos' },
      { id: 'cat3', nome: 'Acessórios' }, { id: 'cat4', nome: 'Controles' },
      { id: 'cat5', nome: 'Colecionáveis' }
    ];
    const marcas = [
      { id: 'mar1', nome: 'Sony' }, { id: 'mar2', nome: 'Microsoft' },
      { id: 'mar3', nome: 'Nintendo' }, { id: 'mar4', nome: 'Genérico' }
    ];

    let p = [];
    let _pid = 0;
    const mk = (o) => { o.id = o.id || 'prd_' + (++_pid); o.custoMedio = o.custoMedio || o.custo; o.criadoEm = iso(daysAgo(o._age || 30)); return o; };
    p = [
      mk({ sku: 'CON-PS5-STD', barcode: '7891000100015', nome: 'PlayStation 5 Slim 1TB', categoria: 'Consoles', marca: 'Sony', modelo: 'CFI-2014', condicao: 'novo', qtd: 6, custo: 2890, preco: 3799, min: 3, local: 'Vitrine A1', status: 'disponivel' }),
      mk({ sku: 'CON-XBX-SX', barcode: '7891000100022', nome: 'Xbox Series X 1TB', categoria: 'Consoles', marca: 'Microsoft', modelo: '1882', condicao: 'novo', qtd: 4, custo: 3100, preco: 3990, min: 2, local: 'Vitrine A2', status: 'disponivel' }),
      mk({ sku: 'CON-SW-OLED', barcode: '7891000100039', nome: 'Nintendo Switch OLED', categoria: 'Consoles', marca: 'Nintendo', modelo: 'HEG-001', condicao: 'novo', qtd: 5, custo: 1850, preco: 2499, min: 3, local: 'Vitrine A3', status: 'disponivel' }),
      mk({ sku: 'CON-PS4-USA', barcode: '7891000100046', nome: 'PlayStation 4 Pro 1TB (Seminovo)', categoria: 'Consoles', marca: 'Sony', modelo: 'CUH-7215', condicao: 'seminovo', qtd: 2, custo: 1100, preco: 1799, min: 1, serie: 'PS4P-8842-A', local: 'Usados U1', status: 'disponivel' }),
      mk({ sku: 'CON-PS3-USA', barcode: '7891000100053', nome: 'PlayStation 3 Super Slim (Usado)', categoria: 'Consoles', marca: 'Sony', modelo: 'CECH-4211', condicao: 'usado', qtd: 1, custo: 480, preco: 899, min: 1, serie: 'PS3SS-1190', local: 'Usados U2', status: 'disponivel' }),
      mk({ sku: 'JOG-GOW-RAG', barcode: '7891000200014', nome: 'God of War Ragnarök (PS5)', categoria: 'Jogos', marca: 'Sony', modelo: 'PS5', condicao: 'novo', qtd: 12, custo: 180, preco: 299, min: 5, local: 'Prateleira J1', status: 'disponivel' }),
      mk({ sku: 'JOG-EAFC25', barcode: '7891000200021', nome: 'EA Sports FC 25 (PS5)', categoria: 'Jogos', marca: 'Sony', modelo: 'PS5', condicao: 'novo', qtd: 2, custo: 210, preco: 349, min: 6, local: 'Prateleira J1', status: 'disponivel' }),
      mk({ sku: 'JOG-ZELDA-TOTK', barcode: '7891000200038', nome: 'Zelda: Tears of the Kingdom (Switch)', categoria: 'Jogos', marca: 'Nintendo', modelo: 'Switch', condicao: 'novo', qtd: 8, custo: 230, preco: 359, min: 4, local: 'Prateleira J2', status: 'disponivel' }),
      mk({ sku: 'JOG-MARIO-WON', barcode: '7891000200045', nome: 'Super Mario Bros. Wonder (Switch)', categoria: 'Jogos', marca: 'Nintendo', modelo: 'Switch', condicao: 'novo', qtd: 7, custo: 220, preco: 339, min: 4, local: 'Prateleira J2', status: 'disponivel' }),
      mk({ sku: 'JOG-FORZA-USA', barcode: '7891000200052', nome: 'Forza Horizon 5 (Xbox, Seminovo)', categoria: 'Jogos', marca: 'Microsoft', modelo: 'Xbox', condicao: 'seminovo', qtd: 3, custo: 120, preco: 219, min: 2, local: 'Usados U3', status: 'disponivel', _age: 60 }),
      mk({ sku: 'CTR-DS-WHT', barcode: '7891000300013', nome: 'Controle DualSense Branco', categoria: 'Controles', marca: 'Sony', modelo: 'CFI-ZCT1', condicao: 'novo', qtd: 10, custo: 320, preco: 499, min: 4, local: 'Balcão B1', status: 'disponivel' }),
      mk({ sku: 'CTR-XBX-BLK', barcode: '7891000300020', nome: 'Controle Xbox Series Preto', categoria: 'Controles', marca: 'Microsoft', modelo: 'QAT', condicao: 'novo', qtd: 1, custo: 290, preco: 449, min: 4, local: 'Balcão B1', status: 'disponivel' }),
      mk({ sku: 'CTR-PROCON', barcode: '7891000300037', nome: 'Nintendo Switch Pro Controller', categoria: 'Controles', marca: 'Nintendo', modelo: 'HAC-013', condicao: 'novo', qtd: 6, custo: 350, preco: 549, min: 3, local: 'Balcão B1', status: 'disponivel' }),
      mk({ sku: 'ACE-HS-PULSE', barcode: '7891000400012', nome: 'Headset Pulse 3D (PS5)', categoria: 'Acessórios', marca: 'Sony', modelo: 'CFI-ZWH1', condicao: 'novo', qtd: 5, custo: 420, preco: 699, min: 2, local: 'Balcão B2', status: 'disponivel' }),
      mk({ sku: 'ACE-CARGA', barcode: '7891000400029', nome: 'Base de Carga DualSense', categoria: 'Acessórios', marca: 'Genérico', modelo: 'GEN-CHG', condicao: 'novo', qtd: 14, custo: 75, preco: 149, min: 5, local: 'Balcão B2', status: 'disponivel' }),
      mk({ sku: 'ACE-CARTAO-1T', barcode: '7891000400036', nome: 'Cartão Expansão SSD 1TB (PS5)', categoria: 'Acessórios', marca: 'Genérico', modelo: 'NVMe', condicao: 'novo', qtd: 3, custo: 510, preco: 849, min: 2, local: 'Cofre C1', status: 'disponivel' }),
      mk({ sku: 'COL-AMIIBO-LK', barcode: '7891000500011', nome: 'Amiibo Link (Zelda)', categoria: 'Colecionáveis', marca: 'Nintendo', modelo: 'TOTK', condicao: 'novo', qtd: 9, custo: 90, preco: 179, min: 3, local: 'Vitrine D1', status: 'disponivel', _age: 120 }),
      mk({ sku: 'CON-XB360-USA', barcode: '7891000100060', nome: 'Xbox 360 Slim 250GB (Usado)', categoria: 'Consoles', marca: 'Microsoft', modelo: 'Trinity', condicao: 'usado', qtd: 1, custo: 380, preco: 749, min: 1, serie: 'X360-5521', local: 'Usados U2', status: 'disponivel', _age: 95 })
    ];

    const fornecedores = [
      { id: 'for1', nome: 'Distribuidora GameSul', cnpj: '12.345.678/0001-90', contato: 'Marcos', tel: '(51) 99888-1122', email: 'vendas@gamesul.com.br', cidade: 'Porto Alegre/RS' },
      { id: 'for2', nome: 'Nintendo Brasil Oficial', cnpj: '98.765.432/0001-10', contato: 'Central', tel: '(11) 4002-8922', email: 'b2b@nintendo.com.br', cidade: 'São Paulo/SP' },
      { id: 'for3', nome: 'Importados TechPlay', cnpj: '45.111.222/0001-33', contato: 'Juliana', tel: '(11) 97777-3344', email: 'compras@techplay.com', cidade: 'São Paulo/SP' }
    ];

    // Vendas históricas
    const vendas = [];
    const findP = sku => p.find(x => x.sku === sku);
    function fakeVenda(diasAtras, itens, pagamento, desc) {
      const its = itens.map(([sku, q]) => {
        const prod = findP(sku);
        return { produtoId: prod.id, sku: prod.sku, nome: prod.nome, qtd: q, preco: prod.preco, custo: prod.custoMedio };
      });
      const bruto = its.reduce((s, i) => s + i.preco * i.qtd, 0);
      const descV = desc || 0;
      const total = bruto - descV;
      const custoTot = its.reduce((s, i) => s + i.custo * i.qtd, 0);
      return {
        id: 'ven_' + (vendas.length + 1),
        data: iso(daysAgo(diasAtras)),
        itens: its, bruto, desconto: descV, total,
        custoTotal: custoTot, lucro: total - custoTot,
        pagamentos: pagamento, usadoEntrada: null, usuario: 'Admin'
      };
    }
    vendas.push(fakeVenda(0, [['JOG-GOW-RAG', 1], ['CTR-DS-WHT', 1]], [{ tipo: 'PIX', valor: 798 }]));
    vendas.push(fakeVenda(0, [['ACE-CARGA', 2]], [{ tipo: 'Dinheiro', valor: 298 }]));
    vendas.push(fakeVenda(0, [['JOG-ZELDA-TOTK', 1]], [{ tipo: 'Crédito', valor: 359, parcelas: 3 }]));
    vendas.push(fakeVenda(1, [['CON-PS5-STD', 1]], [{ tipo: 'Crédito', valor: 3799, parcelas: 10 }]));
    vendas.push(fakeVenda(2, [['JOG-MARIO-WON', 1], ['CTR-PROCON', 1]], [{ tipo: 'Débito', valor: 888 }]));
    vendas.push(fakeVenda(3, [['CON-SW-OLED', 1]], [{ tipo: 'PIX', valor: 2499 }]));
    vendas.push(fakeVenda(5, [['ACE-HS-PULSE', 1]], [{ tipo: 'Crédito', valor: 699, parcelas: 2 }]));
    vendas.push(fakeVenda(8, [['CON-XBX-SX', 1]], [{ tipo: 'PIX', valor: 3990 }]));
    vendas.push(fakeVenda(12, [['JOG-GOW-RAG', 2]], [{ tipo: 'Dinheiro', valor: 598 }]));
    vendas.push(fakeVenda(20, [['CON-PS5-STD', 1], ['JOG-EAFC25', 1]], [{ tipo: 'Crédito', valor: 4148, parcelas: 12 }]));
    vendas.push(fakeVenda(40, [['CON-SW-OLED', 1]], [{ tipo: 'PIX', valor: 2499 }]));

    // Compras
    const compras = [
      { id: 'cmp_1', data: iso(daysAgo(25)), fornecedorId: 'for1', nf: 'NF-12044', itens: [{ sku: 'CON-PS5-STD', nome: 'PlayStation 5 Slim 1TB', qtd: 6, custo: 2890 }], frete: 120, impostos: 340, subtotal: 17340, total: 17800, status: 'recebido' },
      { id: 'cmp_2', data: iso(daysAgo(18)), fornecedorId: 'for2', nf: 'NF-55821', itens: [{ sku: 'CON-SW-OLED', nome: 'Nintendo Switch OLED', qtd: 5, custo: 1850 }, { sku: 'JOG-ZELDA-TOTK', nome: 'Zelda TOTK', qtd: 8, custo: 230 }], frete: 90, impostos: 220, subtotal: 11090, total: 11400, status: 'recebido' }
    ];

    // Garantias
    const garantias = [
      { id: 'gar_1', produtoNome: 'PlayStation 5 Slim 1TB', sku: 'CON-PS5-STD', serie: 'PS5-99201-X', vendaId: 'ven_4', dataVenda: iso(daysAgo(1)), prazoDias: 365, defeito: '', status: 'ativa', custo: 0, ocorrencias: [] },
      { id: 'gar_2', produtoNome: 'Controle DualSense Branco', sku: 'CTR-DS-WHT', serie: 'DS-44120', vendaId: 'ven_1', dataVenda: iso(daysAgo(0)), prazoDias: 90, defeito: 'Drift no analógico esquerdo', status: 'em_atendimento', custo: 45, ocorrencias: [{ data: iso(daysAgo(0)), texto: 'Cliente relatou drift. Enviado para análise técnica.' }] }
    ];

    // Financeiro: lançamentos (contas a pagar / receber, com campos completos)
    const financeiro = [];
    const payTipo = v => (v.pagamentos[0] ? v.pagamentos[0].tipo : 'PIX');
    vendas.forEach(v => financeiro.push({
      id: 'fin_v_' + v.id, tipo: 'entrada', origem: 'venda', refId: v.id,
      descricao: 'Venda #' + v.id.replace('ven_', ''), categoria: 'Vendas', subcategoria: 'PDV',
      emissao: v.data, vencimento: v.data, data: v.data, valor: v.total, pago: v.total,
      status: 'recebido', formaPagamento: payTipo(v), conciliado: false, obs: ''
    }));
    compras.forEach(c => financeiro.push({
      id: 'fin_c_' + c.id, tipo: 'saida', origem: 'compra', refId: c.id,
      descricao: 'Compra ' + c.nf, categoria: 'Compras de mercadorias', subcategoria: 'Fornecedor',
      emissao: c.data, vencimento: c.data, data: c.data, valor: c.total, pago: c.total,
      status: 'pago', fornecedorId: c.fornecedorId, formaPagamento: 'Boleto', conciliado: true, obs: ''
    }));
    const desp = (id, dias, cat, desc, valor, forma) => financeiro.push({ id, tipo: 'saida', origem: 'manual', descricao: desc, categoria: cat, subcategoria: '', emissao: iso(daysAgo(dias + 3)), vencimento: iso(daysAgo(dias)), data: iso(daysAgo(dias)), valor, pago: valor, status: 'pago', formaPagamento: forma || 'Transferência', conciliado: true, obs: '' });
    desp('fin_aluguel', 5, 'Aluguel', 'Aluguel da loja', 3200, 'Transferência');
    desp('fin_energia', 4, 'Energia', 'Energia elétrica (CEEE)', 680, 'Débito automático');
    desp('fin_sal', 5, 'Funcionários', 'Folha de pagamento', 5400, 'Transferência');
    // Contas a PAGAR em aberto (vencimentos variados; dias>0 = no passado/vencido)
    const pagar = (id, venc, cat, desc, valor, fornId, pagoVal) => financeiro.push({ id, tipo: 'saida', origem: 'manual', descricao: desc, categoria: cat, subcategoria: '', emissao: iso(daysAgo(Math.abs(venc) + 8)), vencimento: iso(daysAgo(venc)), data: iso(daysAgo(venc)), valor, pago: pagoVal || 0, status: pagoVal ? 'parcial' : 'pendente', fornecedorId: fornId || null, formaPagamento: 'Boleto', conciliado: false, obs: '' });
    pagar('fin_p1', 4, 'Compras de mercadorias', 'Boleto Distribuidora GameSul', 8900, 'for1');
    pagar('fin_p2', 0, 'Internet', 'Internet + Telefone (Vivo)', 320, null);
    pagar('fin_p3', -3, 'Impostos', 'DAS — Simples Nacional', 1450, null);
    pagar('fin_p4', -6, 'Compras de mercadorias', 'Nintendo Brasil — pedido B2B', 11400, 'for2', 4000);
    pagar('fin_p5', -12, 'Marketing', 'Tráfego pago / anúncios', 600, null);
    pagar('fin_p6', -20, 'Contabilidade', 'Honorários contábeis', 890, null);
    pagar('fin_p7', 9, 'Água', 'Conta de água (CORSAN)', 140, null);
    // Contas a RECEBER em aberto
    const receber = (id, venc, orig, desc, valor, recebido, forma) => financeiro.push({ id, tipo: 'entrada', origem: 'manual', descricao: desc, categoria: 'Recebíveis', subcategoria: orig, emissao: iso(daysAgo(Math.abs(venc) + 12)), vencimento: iso(daysAgo(venc)), data: iso(daysAgo(venc)), valor, pago: recebido || 0, status: recebido ? 'parcial' : 'areceber', formaPagamento: forma || 'PIX', conciliado: false, obs: '' });
    receber('fin_r1', -5, 'Pedido #2548', 'Pedido #2548 — venda parcelada', 5000, 3000, 'Crédito');
    receber('fin_r2', 8, 'Crediário', 'Parcela cliente — crediário', 1240, 0, 'Boleto');
    receber('fin_r3', -15, 'Pedido #2561', 'Pedido #2561 — entrega futura', 2300, 0, 'PIX');
    receber('fin_r4', -2, 'Marketplace', 'Repasse de marketplace', 1850, 0, 'Transferência');

    // Avaliações de usados
    const avaliacoes = [
      { id: 'ava_1', data: iso(daysAgo(2)), produtoNome: 'PlayStation 4 Slim 500GB', categoria: 'Consoles', marca: 'Sony', modelo: 'CUH-2215', serie: 'PS4S-7781', estado: 'Bom', temCaixa: true, temAcessorios: true, valorMercado: 1300, valorAceito: 850, custoManutencao: 60, custoFinal: 910, precoSugerido: 1499, margem: 589, status: 'avaliado' }
    ];

    // ---- Caixa da Loja (dinheiro físico) ----
    const caixa = []; let _cid = 0; const cuid = () => 'cx_' + (++_cid);
    caixa.push({ id: cuid(), data: iso(daysAgo(15)), fluxo: 'entrada', tipo: 'Suprimento', origem: 'Fundo de caixa inicial', categoria: 'Suprimento', valor: 300, obs: 'Abertura do caixa', responsavel: 'Admin' });
    vendas.forEach(v => v.pagamentos.forEach(pg => {
      if (pg.tipo === 'Dinheiro') caixa.push({ id: cuid(), data: v.data, fluxo: 'entrada', tipo: 'Venda em dinheiro', origem: 'Venda em dinheiro', categoria: 'Venda', valor: pg.valor, obs: v.itens.map(i => i.nome).join(', '), responsavel: 'Admin', refId: v.id });
    }));
    caixa.push({ id: cuid(), data: iso(daysAgo(3)), fluxo: 'saida', tipo: 'Depósito bancário', origem: 'Depósito bancário', categoria: 'Depósito', valor: 500, obs: 'Depósito Banco do Brasil', responsavel: 'Admin' });
    caixa.push({ id: cuid(), data: iso(daysAgo(1)), fluxo: 'saida', tipo: 'Despesa pelo caixa', origem: 'Despesa paga pelo caixa', categoria: 'Limpeza', valor: 50, obs: 'Produtos de limpeza', responsavel: 'Admin' });

    // ---- Taxas das maquininhas / formas de pagamento ----
    const taxasPct = { 2: 4.5, 3: 5.0, 4: 5.8, 5: 7.2, 6: 8.0, 7: 9.0, 8: 10.0, 9: 11.0, 10: 12.0, 11: 13.0, 12: 14.0 };
    const taxas = [
      { id: 'tx_pix', key: 'PIX', nome: 'PIX', percent: 0, fixo: 0, prazo: 'Na hora', ativo: true },
      { id: 'tx_din', key: 'Dinheiro', nome: 'Dinheiro', percent: 0, fixo: 0, prazo: 'Na hora', ativo: true },
      { id: 'tx_deb', key: 'Débito', nome: 'Débito', percent: 1.80, fixo: 0, prazo: '1 dia útil', ativo: true },
      { id: 'tx_crv', key: 'Crédito à vista', nome: 'Crédito à vista', percent: 3.50, fixo: 0, prazo: '30 dias', ativo: true }
    ];
    Object.keys(taxasPct).forEach(n => taxas.push({ id: 'tx_cr' + n, key: 'Crédito ' + n + 'x', nome: 'Crédito ' + n + 'x', percent: taxasPct[n], fixo: 0, prazo: (n + ' meses'), ativo: true }));

    return {
      produtos: p, categorias, marcas, fornecedores, compras, vendas,
      avaliacoes, trocas: [], movimentacoes: seedMovs(vendas, compras, iso, daysAgo),
      garantias, financeiro, caixa, fechamentos: [], taxas,
      modelosUsados: ['PS4 Fat 500GB', 'PS4 Slim 500GB', 'PS4 Slim 1TB', 'PS4 Pro 1TB', 'PS5 Fat', 'PS5 Slim', 'Nintendo Switch V1', 'Nintendo Switch OLED', 'Xbox One', 'Xbox Series S'].map((n, i) => ({ id: 'mu_' + (i + 1), nome: n, categoria: 'Consoles' })),
      usuarios: [
        { id: 'u_admin', nome: 'Administrador', usuario: 'admin', senha: '1234', role: 'admin', ativo: true },
        { id: 'u_func', nome: 'Funcionário', usuario: 'funcionario', senha: '1234', role: 'funcionario', ativo: true }
      ],
      config: [{
        id: 'cfg', loja: 'Rico Games', cnpj: '00.000.000/0001-00', garantiaPadraoNovo: 365, garantiaPadraoUsado: 90,
        impressao: { papel: '80', modo: 'ask', corte: true, gaveta: false, telefone: '', whatsapp: '', endereco: '', loja: 'Rico Games' },
        permFuncionario: {
          modules: { dashboard: false, vendasDia: true, pdv: true, caixa: true, estoque: true, entrada: false, compras: false, fornecedores: false, usados: false, trocas: false, movimentacoes: false, garantias: false, financeiro: false, relatorios: false, config: false },
          verFinanceiro: false, podeCancelar: false, podeDesconto: true, podeEditarProduto: true, podeSangria: true, podeAlterarPreco: false
        }
      }]
    };
  }

  function seedMovs(vendas, compras, iso, daysAgo) {
    const m = [];
    vendas.slice(0, 6).forEach(v => m.push({
      id: 'mov_v_' + v.id, tipo: 'venda', descricao: 'Venda de ' + v.itens.map(i => i.nome).join(', '),
      data: v.data, valor: v.total, usuario: 'Admin', refId: v.id
    }));
    compras.forEach(c => m.push({
      id: 'mov_c_' + c.id, tipo: 'compra', descricao: 'Entrada de mercadoria — ' + c.nf,
      data: c.data, valor: c.total, usuario: 'Admin', refId: c.id
    }));
    m.push({ id: 'mov_aj', tipo: 'ajuste', descricao: 'Ajuste de inventário — contagem física', data: iso(daysAgo(6)), valor: 0, usuario: 'Admin' });
    m.push({ id: 'mov_gar', tipo: 'garantia', descricao: 'Abertura de garantia — Controle DualSense (drift)', data: iso(daysAgo(0)), valor: 45, usuario: 'Admin' });
    return m.sort((a, b) => new Date(b.data) - new Date(a.data));
  }

  return { load, save, all, get, insert, update, remove, logMov, logFin, reset, exportJSON, importState, uid, state: () => state };
})();
