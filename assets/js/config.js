/* ============ RICO GAMES ERP — Configurações: Taxas e Pagamentos ============ */
const Taxas = {
  all() { return DB.all('taxas'); },
  get(key) { return DB.all('taxas').find(t => t.key === key); },
  ativas() { return this.all().filter(t => t.ativo !== false); },
  keyFor(tipo, parcelas) {
    if (tipo === 'Crédito') return (!parcelas || parcelas <= 1) ? 'Crédito à vista' : 'Crédito ' + parcelas + 'x';
    return tipo;
  },
  feeByKey(key, valor) {
    const t = this.get(key);
    if (!t || t.ativo === false) return 0;
    return Math.round(((valor || 0) * ((t.percent || 0) / 100) + (t.fixo || 0)) * 100) / 100;
  },
  fee(pag) { return this.feeByKey(this.keyFor(pag.tipo, pag.parcelas), pag.valor || 0); },
  feeVenda(v) { return (v.pagamentos || []).reduce((s, p) => s + (p.taxa != null ? p.taxa : this.fee(p)), 0); }
};

const inStyle = 'background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:7px 10px';

Modules.cfgState = { tab: 'taxas' };
Modules.config = function () {
  const tabs = [['taxas', '💳 Taxas'], ['cupom', '🧾 Cupom e Garantia'], ['impressora', '🖨️ Impressora'], ['usuarios', '👤 Usuários'], ['permissoes', '🔒 Permissões'], ['nuvem', '☁️ Nuvem']];
  setTimeout(() => Modules.cfgRenderTab(), 20);
  return `
  <div class="page-head"><div><h1>Configurações</h1><p>Ajustes do sistema</p></div></div>
  <div class="tabs" id="cfg-subnav">${tabs.map(t => `<div class="tab ${this.cfgState.tab === t[0] ? 'active' : ''}" onclick="Modules.cfgSetTab('${t[0]}')">${t[1]}</div>`).join('')}</div>
  <div id="cfg-body"></div>`;
};
Modules.cfgSetTab = function (t) {
  this.cfgState.tab = t;
  const keys = ['taxas', 'cupom', 'impressora', 'usuarios', 'permissoes', 'nuvem'];
  document.querySelectorAll('#cfg-subnav .tab').forEach((el, i) => el.classList.toggle('active', keys[i] === t));
  this.cfgRenderTab();
};
Modules.cfgRenderTab = function () {
  const b = document.getElementById('cfg-body'); if (!b) return;
  const t = this.cfgState.tab;
  b.innerHTML = t === 'taxas' ? this.cfgTaxasCard() : t === 'cupom' ? this.cfgCupomArea() : t === 'impressora' ? this.cfgImpressoraCard() : t === 'usuarios' ? this.cfgUsuariosCard() : t === 'permissoes' ? this.cfgPermissoesCard() : this.cfgCloudCard();
  if (t === 'cupom') this.cfgPreview();
};
Modules.cfgTaxasCard = function () {
  const t = Taxas.all();
  return `<div class="card">
    <div class="section-title">💳 Taxas e Pagamentos <a onclick="Modules.cfgAdd()">+ Forma de pagamento</a></div>
    <div class="table-wrap" style="border:none"><table>
      <thead><tr><th>Forma de pagamento</th><th class="num">Taxa (%)</th><th class="num">Taxa fixa (R$)</th><th>Prazo de recebimento</th><th>Status</th><th></th></tr></thead>
      <tbody>${t.map(x => `<tr>
        <td class="strong">${esc(x.nome)}</td>
        <td class="num"><input type="number" step="0.01" value="${x.percent}" style="${inStyle};width:90px;text-align:right" onchange="Modules.cfgSet('${x.id}','percent',this.value)"></td>
        <td class="num"><input type="number" step="0.01" value="${x.fixo || 0}" style="${inStyle};width:90px;text-align:right" onchange="Modules.cfgSet('${x.id}','fixo',this.value)"></td>
        <td><input value="${esc(x.prazo || '')}" style="${inStyle};width:140px" onchange="Modules.cfgSet('${x.id}','prazo',this.value)"></td>
        <td><label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:12.5px;color:var(--txt-2)"><input type="checkbox" ${x.ativo !== false ? 'checked' : ''} onchange="Modules.cfgSet('${x.id}','ativo',this.checked)"> ${x.ativo !== false ? 'Ativo' : 'Inativo'}</label></td>
        <td class="num">${x.custom ? `<button class="btn-icon" onclick="Modules.cfgDel('${x.id}')">🗑️</button>` : ''}</td>
      </tr>`).join('')}</tbody></table></div>
    <p class="muted" style="margin-top:14px;font-size:12px;line-height:1.6">💡 Exemplo: Crédito 10x com 12% → numa venda de R$ 1.500, a taxa da maquininha é R$ 180, descontada do lucro automaticamente.</p>
  </div>`;
};

Modules.cfgImpressoraCard = function () {
  const p = (typeof Print !== 'undefined') ? Print.cfg() : { papel: '80', modo: 'ask', corte: true, gaveta: false, telefone: '', endereco: '', loja: 'Rico Games' };
  const opt = (v, val, lbl) => `<option value="${v}" ${val === v ? 'selected' : ''}>${lbl}</option>`;
  return `<div class="card">
    <div class="section-title">🖨️ Impressora <span class="muted" style="font-weight:500;font-size:12px">Cupom térmico (Elgin e compatíveis)</span></div>
    <p class="muted" style="margin-bottom:12px;font-size:12px">Os dados da loja e os campos do cupom ficam na aba <b>Cupom e Garantia</b>.</p>
    <div class="form-grid">
      <div class="field"><label>Largura do papel</label><select onchange="Modules.cfgPrintSet('papel',this.value)">${opt('80', p.papel, '80 mm (padrão)')}${opt('58', p.papel, '58 mm (compacta)')}</select></div>
      <div class="field"><label>Quando imprimir</label><select onchange="Modules.cfgPrintSet('modo',this.value)">${opt('auto', p.modo, 'Imprimir automaticamente após a venda')}${opt('ask', p.modo, 'Perguntar antes de imprimir')}${opt('off', p.modo, 'Não imprimir automaticamente')}</select></div>
      <div class="field"><label>Corte automático</label><label style="display:inline-flex;align-items:center;gap:8px;padding-top:8px;font-size:13px;color:var(--txt-2)"><input type="checkbox" ${p.corte ? 'checked' : ''} onchange="Modules.cfgPrintSet('corte',this.checked)"> Cortar papel ao final</label></div>
      <div class="field"><label>Gaveta de dinheiro</label><label style="display:inline-flex;align-items:center;gap:8px;padding-top:8px;font-size:13px;color:var(--txt-2)"><input type="checkbox" ${p.gaveta ? 'checked' : ''} onchange="Modules.cfgPrintSet('gaveta',this.checked)"> Abrir gaveta automaticamente</label></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-primary" onclick="Print.test()">🖨️ Testar impressão</button>
    </div>
    <p class="muted" style="margin-top:12px;font-size:12px;line-height:1.6">O cupom abre na janela de impressão do navegador — escolha a impressora <b>Elgin</b> (instalada no Windows/Mac) e marque para lembrar como padrão. Dica: nas opções do navegador, ajuste margens para "Nenhuma" e desmarque cabeçalho/rodapé para o cupom sair limpo. Corte e gaveta automáticos dependem do driver da Elgin instalado no computador.</p>
  </div>`;
};
Modules.cfgPrintSet = function (field, value) {
  const cfg = DB.all('config')[0];
  const imp = Object.assign({}, cfg.impressao || {});
  imp[field] = value;
  DB.update('config', cfg.id, { impressao: imp });
  Toast.ok('Configuração salva.');
};

Modules.cfgCloudCard = function () {
  const c = (typeof Cloud !== 'undefined' && Cloud.cfg()) || {};
  const on = (typeof Cloud !== 'undefined' && Cloud.configured());
  return `<div class="card" style="margin-top:18px">
    <div class="section-title">☁️ Sincronização na nuvem ${on ? '<span class="badge b-green">Conectado</span>' : '<span class="badge b-gray">Desconectado</span>'}</div>
    <p class="muted" style="margin-bottom:14px;line-height:1.6">Conecte um banco gratuito (Supabase) para que tudo o que o funcionário lançar apareça para você de qualquer lugar, em tempo real. Siga o arquivo <b>GUIA-NUVEM</b> para criar a conta e a tabela — leva uns 10 minutos.</p>
    <div class="form-grid">
      <div class="field full"><label>URL do projeto Supabase</label><input id="cl-url" value="${esc(c.url || '')}" placeholder="https://xxxxxxxx.supabase.co"></div>
      <div class="field full"><label>Chave pública (anon key)</label><input id="cl-key" value="${esc(c.key || '')}" placeholder="eyJhbGciOi..."></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      <button class="btn-primary" onclick="Modules.cfgCloudSave()">${on ? 'Reconectar / testar' : 'Conectar e testar'}</button>
      ${on ? '<button class="btn-ghost" onclick="Modules.cfgCloudPush()">⬆️ Enviar dados agora</button><button class="btn-ghost" onclick="Modules.cfgCloudPull()">⬇️ Baixar da nuvem</button><button class="btn-danger" onclick="Modules.cfgCloudDisconnect()">Desconectar</button>' : ''}
    </div>
    <p class="muted" style="margin-top:12px;font-size:12px">⚠️ Conecte primeiro o computador principal (com seus dados) e só depois os outros aparelhos, para não sobrescrever nada.</p>
  </div>`;
};
Modules.cfgCloudSave = async function () {
  const url = fval('cl-url'), key = fval('cl-key');
  if (!url || !key) return Toast.err('Cole a URL e a chave do Supabase.');
  Cloud.setCfg(url, key);
  Toast.ok('Testando conexão…');
  const ok = await Cloud.test();
  if (!ok) { Toast.err('Não consegui conectar. Confira a URL, a chave e se a tabela "erp_state" foi criada (veja o GUIA-NUVEM).'); return; }
  await Cloud.initialSync(); Cloud.start();
  Toast.ok('Conectado à nuvem! Sincronização ativa.'); App.go('config');
};
Modules.cfgCloudDisconnect = function () {
  Modal.confirm('Desconectar da nuvem? O sistema volta a salvar apenas neste computador.', () => { Cloud.clear(); Toast.ok('Desconectado.'); App.go('config'); }, 'Desconectar');
};
Modules.cfgCloudPush = async function () { await Cloud.doPush(); Toast.ok('Dados enviados para a nuvem.'); };
Modules.cfgCloudPull = async function () { await Cloud.initialSync(); if (App.refresh) App.refresh(); Toast.ok('Dados baixados da nuvem.'); };

Modules.cfgUsuariosCard = function () {
  const us = DB.all('usuarios');
  return `<div class="card" style="margin-top:18px">
    <div class="section-title">👤 Usuários <a onclick="Modules.cfgUserAdd()">+ Novo usuário</a></div>
    <div class="table-wrap" style="border:none"><table><thead><tr><th>Nome</th><th>Usuário (login)</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
    <tbody>${us.map(u => `<tr>
      <td class="strong">${esc(u.nome)}</td><td>${esc(u.usuario)}</td>
      <td>${u.role === 'admin' ? '<span class="badge b-purple">Dono / Admin</span>' : '<span class="badge b-blue">Funcionário</span>'}</td>
      <td><label style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-size:12.5px;color:var(--txt-2)"><input type="checkbox" ${u.ativo !== false ? 'checked' : ''} onchange="Modules.cfgUserToggle('${u.id}',this.checked)"> ${u.ativo !== false ? 'Ativo' : 'Inativo'}</label></td>
      <td class="num"><button class="btn-ghost btn-sm" onclick="Modules.cfgUserPass('${u.id}')">🔑 Senha</button> ${u.id !== 'u_admin' ? `<button class="btn-icon" onclick="Modules.cfgUserDel('${u.id}')">🗑️</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>
    <p class="muted" style="margin-top:10px;font-size:12px">O funcionário entra com o login dele e vê apenas o que estiver liberado abaixo.</p>
  </div>`;
};
Modules.cfgPermissoesCard = function () {
  const cfg = DB.all('config')[0] || {};
  const pf = Object.assign({}, PERM_DEFAULT_FUNC, cfg.permFuncionario || {}, { modules: Object.assign({}, PERM_DEFAULT_FUNC.modules, (cfg.permFuncionario || {}).modules || {}) });
  const mods = [['pdv', 'PDV — Venda'], ['caixa', 'Caixa da Loja'], ['estoque', 'Estoque'], ['entrada', 'Entrada de Estoque'], ['vendasDia', 'Vendas do Dia'], ['dashboard', 'Dashboard'], ['compras', 'Compras'], ['fornecedores', 'Fornecedores'], ['usados', 'Avaliação de Usados'], ['trocas', 'Trocas'], ['movimentacoes', 'Movimentações'], ['garantias', 'Garantias'], ['financeiro', 'Financeiro'], ['relatorios', 'Relatórios'], ['config', 'Configurações']];
  const flags = [['verFinanceiro', 'Ver custo, lucro e margem'], ['podeCancelar', 'Cancelar vendas'], ['podeDesconto', 'Dar desconto no PDV'], ['podeAlterarPreco', 'Alterar preço no PDV'], ['podeEditarProduto', 'Editar / excluir produtos'], ['podeSangria', 'Sangria / retirada do caixa']];
  const chk = (k, v, isMod) => `<label style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;cursor:pointer;font-size:13px"><input type="checkbox" ${v ? 'checked' : ''} onchange="Modules.cfgPermSet('${k}',this.checked,${isMod})"> ${k}</label>`;
  return `<div class="card" style="margin-top:18px">
    <div class="section-title">🔒 Permissões do Funcionário</div>
    <p class="muted" style="margin-bottom:12px">Marque o que o perfil <b>Funcionário</b> pode acessar e fazer. As mudanças valem no próximo login dele.</p>
    <div style="font-size:12.5px;font-weight:700;color:var(--txt-2);margin-bottom:8px">Áreas visíveis no menu</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:18px">
      ${mods.map(m => `<label style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;cursor:pointer;font-size:13px"><input type="checkbox" ${pf.modules[m[0]] ? 'checked' : ''} onchange="Modules.cfgPermSet('${m[0]}',this.checked,true)"> ${m[1]}</label>`).join('')}
    </div>
    <div style="font-size:12.5px;font-weight:700;color:var(--txt-2);margin-bottom:8px">Permissões e dados sensíveis</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
      ${flags.map(f => `<label style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;cursor:pointer;font-size:13px"><input type="checkbox" ${pf[f[0]] ? 'checked' : ''} onchange="Modules.cfgPermSet('${f[0]}',this.checked,false)"> ${f[1]}</label>`).join('')}
    </div>
  </div>`;
};
Modules.cfgPermSet = function (key, value, isModule) {
  const cfg = DB.all('config')[0];
  const pf = Object.assign({ modules: {} }, cfg.permFuncionario || {});
  pf.modules = Object.assign({}, (cfg.permFuncionario || {}).modules || {});
  if (isModule) pf.modules[key] = value; else pf[key] = value;
  DB.update('config', cfg.id, { permFuncionario: pf });
  Toast.ok('Permissão atualizada.');
};
Modules.cfgUserAdd = function () {
  Modal.open({
    title: '+ Novo usuário',
    body: `<div class="form-grid">
      <div class="field full"><label>Nome *</label><input id="us-nome"></div>
      <div class="field"><label>Usuário (login) *</label><input id="us-user" autocomplete="off"></div>
      <div class="field"><label>Senha *</label><input id="us-pass"></div>
      <div class="field full"><label>Perfil</label><select id="us-role"><option value="funcionario">Funcionário (acesso restrito)</option><option value="admin">Dono / Admin (acesso total)</option></select></div>
    </div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cfgUserSaveNew()">Criar usuário</button>`
  });
};
Modules.cfgUserSaveNew = function () {
  const nome = fval('us-nome'), usuario = fval('us-user'), senha = fval('us-pass');
  if (!nome || !usuario || !senha) return Toast.err('Preencha nome, usuário e senha.');
  if (DB.all('usuarios').some(u => u.usuario.toLowerCase() === usuario.toLowerCase())) return Toast.err('Já existe um usuário com esse login.');
  DB.insert('usuarios', { nome, usuario, senha, role: fval('us-role'), ativo: true });
  Modal.close(); Toast.ok('Usuário criado.'); App.go('config');
};
Modules.cfgUserPass = function (id) {
  const u = DB.get('usuarios', id);
  Modal.open({
    title: '🔑 Senha de ' + esc(u.nome),
    body: `<div class="field"><label>Nova senha</label><input id="us-newpass" value="${esc(u.senha)}"></div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cfgUserSavePass('${id}')">Salvar</button>`
  });
};
Modules.cfgUserSavePass = function (id) {
  const s = fval('us-newpass'); if (!s) return Toast.err('Informe a senha.');
  DB.update('usuarios', id, { senha: s }); Modal.close(); Toast.ok('Senha atualizada.');
};
Modules.cfgUserToggle = function (id, ativo) {
  if (id === 'u_admin' && !ativo) return Toast.err('Não é possível desativar o administrador principal.');
  DB.update('usuarios', id, { ativo }); Toast.ok('Status atualizado.');
};
Modules.cfgUserDel = function (id) {
  Modal.confirm('Remover este usuário?', () => { DB.remove('usuarios', id); App.go('config'); Toast.ok('Usuário removido.'); }, 'Remover');
};
Modules.cfgSet = function (id, field, value) {
  const patch = {};
  if (field === 'percent' || field === 'fixo') patch[field] = parseFloat(String(value).replace(',', '.')) || 0;
  else if (field === 'ativo') patch.ativo = value;
  else patch[field] = value;
  DB.update('taxas', id, patch);
  Toast.ok('Taxa atualizada.');
  if (field === 'ativo') App.go('config');
};
Modules.cfgAdd = function () {
  Modal.open({
    title: '+ Nova forma de pagamento',
    body: `<div class="form-grid">
      <div class="field full"><label>Nome *</label><input id="cfg-nome" placeholder="Ex: Voucher / Cartão da loja"></div>
      <div class="field"><label>Taxa (%)</label><input id="cfg-pct" type="number" step="0.01" value="0"></div>
      <div class="field"><label>Taxa fixa (R$)</label><input id="cfg-fixo" type="number" step="0.01" value="0"></div>
      <div class="field full"><label>Prazo de recebimento</label><input id="cfg-prazo" placeholder="Ex: 30 dias"></div>
    </div>`,
    foot: `<button class="btn-ghost" onclick="Modal.close()">Cancelar</button><button class="btn-primary" onclick="Modules.cfgSaveNew()">Adicionar</button>`
  });
};
Modules.cfgSaveNew = function () {
  const nome = fval('cfg-nome'); if (!nome) return Toast.err('Informe o nome.');
  DB.insert('taxas', { key: nome, nome, percent: fnum('cfg-pct'), fixo: fnum('cfg-fixo'), prazo: fval('cfg-prazo'), ativo: true, custom: true });
  Modal.close(); Toast.ok('Forma de pagamento adicionada.'); App.go('config');
};
Modules.cfgDel = function (id) {
  Modal.confirm('Remover esta forma de pagamento?', () => { DB.remove('taxas', id); App.go('config'); Toast.ok('Removida.'); }, 'Remover');
};
