/* ============ RICO GAMES ERP — Cupom & Garantia ============ */
const Cupom = {
  defaults() {
    return {
      loja: 'Rico Games', logo: '', telefone: '', whatsapp: '', instagram: '', endereco: '', cnpj: '',
      agradecimento: 'Obrigado pela preferência! Volte sempre.',
      titulo: 'COMPROVANTE DE VENDA',
      garantiaAtiva: true, garantiaPrazo: 90, garantiaUnidade: 'dias',
      garantiaTexto: 'Garantia válida por {prazo} mediante apresentação deste comprovante.',
      garantiaAviso: 'Guarde este comprovante. Necessário para atendimento em garantia.',
      garantiaPolitica: 'Não cobrimos danos por mau uso, quedas, líquidos, violação de lacre ou modificações no produto.',
      txtSeminovo: 'Produto seminovo revisado e testado antes da venda.',
      regras: [
        { categoria: 'Consoles', condicao: 'novo', prazo: 12, unidade: 'meses' },
        { categoria: 'Consoles', condicao: 'seminovo', prazo: 90, unidade: 'dias' },
        { categoria: 'Consoles', condicao: 'usado', prazo: 30, unidade: 'dias' },
        { categoria: 'Controles', condicao: 'novo', prazo: 90, unidade: 'dias' },
        { categoria: 'Controles', condicao: 'seminovo', prazo: 30, unidade: 'dias' },
        { categoria: 'Acessórios', condicao: '', prazo: 30, unidade: 'dias' },
        { categoria: 'Jogos', condicao: '', prazo: 0, unidade: 'dias' }
      ],
      campos: { telefone: true, whatsapp: true, instagram: false, endereco: false, cnpj: false, numeroVenda: true, operador: true, pagamento: true, parcelamento: true, desconto: true, garantia: true, serie: true, observacoes: true, rodape: true, qrcode: false },
      modelo: 'padrao'
    };
  },
  get() {
    const root = DB.all('config')[0] || {}, imp = root.impressao || {}, cup = root.cupom || {}, d = this.defaults();
    d.loja = root.loja || d.loja;
    d.telefone = imp.telefone || d.telefone; d.whatsapp = imp.whatsapp || d.whatsapp; d.endereco = imp.endereco || d.endereco;
    const m = Object.assign(d, cup);
    m.campos = Object.assign({}, d.campos, cup.campos || {});
    m.regras = (cup.regras && cup.regras.length) ? cup.regras : d.regras;
    return m;
  },
  set(patch) { const c = DB.all('config')[0]; DB.update('config', c.id, { cupom: Object.assign({}, c.cupom || this.get(), patch) }); },
  setCampo(k, v) { const cur = this.get(); this.set({ campos: Object.assign({}, cur.campos, { [k]: v }) }); },
  applyModelo(m) {
    const presets = {
      economico: { telefone: false, whatsapp: false, instagram: false, endereco: false, cnpj: false, numeroVenda: true, operador: false, pagamento: true, parcelamento: true, desconto: true, garantia: true, serie: false, observacoes: false, rodape: true, qrcode: false },
      padrao: { telefone: true, whatsapp: true, instagram: false, endereco: false, cnpj: false, numeroVenda: true, operador: true, pagamento: true, parcelamento: true, desconto: true, garantia: true, serie: true, observacoes: false, rodape: true, qrcode: false },
      detalhado: { telefone: true, whatsapp: true, instagram: true, endereco: true, cnpj: true, numeroVenda: true, operador: true, pagamento: true, parcelamento: true, desconto: true, garantia: true, serie: true, observacoes: true, rodape: true, qrcode: true }
    };
    this.set({ modelo: m, campos: presets[m] || presets.padrao });
  },
  garantiaItem(categoria, condicao) {
    const c = this.get(); if (!c.garantiaAtiva) return { prazo: 0, unidade: 'dias' };
    let r = c.regras.find(x => x.categoria === categoria && x.condicao === condicao);
    if (!r) r = c.regras.find(x => x.categoria === categoria && !x.condicao);
    if (!r) return { prazo: c.garantiaPrazo, unidade: c.garantiaUnidade };
    return { prazo: r.prazo, unidade: r.unidade };
  },
  prazoStr(g) { return g.prazo > 0 ? (g.prazo + ' ' + g.unidade) : 'sem garantia'; },
  snapshot(venda) {
    const c = this.get();
    const itens = (venda.itens || []).map(i => { const g = this.garantiaItem(i.categoria, i.condicao); return { nome: i.nome, serie: (DB.get('produtos', i.produtoId) || {}).serie || '', condicao: i.condicao, prazo: g.prazo, unidade: g.unidade }; });
    return { cfg: c, itens };
  }
};

/* ---------------- UI: aba Cupom e Garantia ---------------- */
const inS = 'background:var(--bg-2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:8px 10px;width:100%';
Modules.cfgCupomArea = function () {
  setTimeout(() => Modules.cfgPreview(), 30);
  const c = Cupom.get();
  const sw = (k, lbl) => `<label style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;cursor:pointer;font-size:13px"><input type="checkbox" ${c.campos[k] ? 'checked' : ''} onchange="Cupom.setCampo('${k}',this.checked);Modules.cfgPreview()"> ${lbl}</label>`;
  const cats = DB.all('categorias').map(x => x.nome);
  return `
  <div class="grid" style="grid-template-columns:1fr 360px;gap:18px;align-items:start">
    <div>
      <div class="card" style="margin-bottom:16px"><div class="section-title">🏪 Dados da loja no cupom</div>
        <div class="form-grid">
          <div class="field"><label>Nome da loja</label><input value="${esc(c.loja)}" onchange="Cupom.set({loja:this.value});Modules.cfgPreview()"></div>
          <div class="field"><label>Logo (texto/emoji, opcional)</label><input value="${esc(c.logo || '')}" placeholder="Ex: 🎮 ou RG" onchange="Cupom.set({logo:this.value});Modules.cfgPreview()"></div>
          <div class="field"><label>Telefone</label><input value="${esc(c.telefone)}" onchange="Cupom.set({telefone:this.value});Modules.cfgPreview()"></div>
          <div class="field"><label>WhatsApp</label><input value="${esc(c.whatsapp)}" onchange="Cupom.set({whatsapp:this.value});Modules.cfgPreview()"></div>
          <div class="field"><label>Instagram</label><input value="${esc(c.instagram)}" placeholder="@ricogames" onchange="Cupom.set({instagram:this.value});Modules.cfgPreview()"></div>
          <div class="field"><label>CNPJ</label><input value="${esc(c.cnpj)}" onchange="Cupom.set({cnpj:this.value});Modules.cfgPreview()"></div>
          <div class="field full"><label>Endereço</label><input value="${esc(c.endereco)}" onchange="Cupom.set({endereco:this.value});Modules.cfgPreview()"></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px"><div class="section-title">🛡️ Garantia padrão da loja</div>
        <div class="form-grid">
          <div class="field"><label>Garantia ativa por padrão</label><label style="display:inline-flex;align-items:center;gap:8px;padding-top:8px;font-size:13px;color:var(--txt-2)"><input type="checkbox" ${c.garantiaAtiva ? 'checked' : ''} onchange="Cupom.set({garantiaAtiva:this.checked});Modules.cfgPreview()"> Ativada</label></div>
          <div class="field"><label>Prazo padrão</label><div style="display:flex;gap:8px"><input type="number" value="${c.garantiaPrazo}" style="${inS}" onchange="Cupom.set({garantiaPrazo:parseInt(this.value)||0});Modules.cfgPreview()"><select style="${inS};width:auto" onchange="Cupom.set({garantiaUnidade:this.value});Modules.cfgPreview()"><option ${c.garantiaUnidade === 'dias' ? 'selected' : ''}>dias</option><option ${c.garantiaUnidade === 'meses' ? 'selected' : ''}>meses</option></select></div></div>
          <div class="field full"><label>Texto da garantia no cupom <span class="muted">(use {prazo})</span></label><input value="${esc(c.garantiaTexto)}" onchange="Cupom.set({garantiaTexto:this.value});Modules.cfgPreview()"></div>
          <div class="field full"><label>Aviso para guardar o cupom</label><input value="${esc(c.garantiaAviso)}" onchange="Cupom.set({garantiaAviso:this.value});Modules.cfgPreview()"></div>
          <div class="field full"><label>Política resumida de garantia</label><textarea onchange="Cupom.set({garantiaPolitica:this.value});Modules.cfgPreview()">${esc(c.garantiaPolitica)}</textarea></div>
          <div class="field full"><label>Texto para seminovos/usados</label><input value="${esc(c.txtSeminovo)}" onchange="Cupom.set({txtSeminovo:this.value});Modules.cfgPreview()"></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px"><div class="section-title">📋 Garantia por categoria / condição <a onclick="Modules.cfgRegraAdd()">+ Nova regra</a></div>
        <div class="table-wrap" style="border:none"><table><thead><tr><th>Categoria</th><th>Condição</th><th class="num">Prazo</th><th>Unidade</th><th></th></tr></thead>
        <tbody>${c.regras.map((r, i) => `<tr>
          <td><select style="${inS}" onchange="Modules.cfgRegraSet(${i},'categoria',this.value)">${cats.map(x => `<option ${r.categoria === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
          <td><select style="${inS}" onchange="Modules.cfgRegraSet(${i},'condicao',this.value)"><option value="" ${!r.condicao ? 'selected' : ''}>Todas</option><option ${r.condicao === 'novo' ? 'selected' : ''}>novo</option><option ${r.condicao === 'seminovo' ? 'selected' : ''}>seminovo</option><option ${r.condicao === 'usado' ? 'selected' : ''}>usado</option></select></td>
          <td class="num"><input type="number" value="${r.prazo}" style="${inS};width:80px;text-align:right" onchange="Modules.cfgRegraSet(${i},'prazo',this.value)"></td>
          <td><select style="${inS}" onchange="Modules.cfgRegraSet(${i},'unidade',this.value)"><option ${r.unidade === 'dias' ? 'selected' : ''}>dias</option><option ${r.unidade === 'meses' ? 'selected' : ''}>meses</option></select></td>
          <td class="num"><button class="btn-icon" onclick="Modules.cfgRegraDel(${i})">🗑️</button></td></tr>`).join('')}</tbody></table></div>
        <p class="muted" style="font-size:12px;margin-top:8px">Aplicada automaticamente na venda pela categoria + condição. "Todas" vale para qualquer condição.</p>
      </div>

      <div class="card" style="margin-bottom:16px"><div class="section-title">🧩 Modelo do cupom</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">
          ${[['economico', 'Econômico'], ['padrao', 'Padrão'], ['detalhado', 'Garantia detalhada']].map(m => `<button class="${c.modelo === m[0] ? 'btn-primary' : 'btn-ghost'}" onclick="Cupom.applyModelo('${m[0]}');App.go('config')">${m[1]}</button>`).join('')}
        </div>
        <p class="muted" style="font-size:12px">Escolher um modelo ajusta automaticamente os campos abaixo. Depois você pode ligar/desligar item a item.</p>
      </div>

      <div class="card" style="margin-bottom:16px"><div class="section-title">🔘 Campos exibidos no cupom</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">
          ${sw('telefone', 'Telefone')}${sw('whatsapp', 'WhatsApp')}${sw('instagram', 'Instagram')}${sw('endereco', 'Endereço')}${sw('cnpj', 'CNPJ')}
          ${sw('numeroVenda', 'Número da venda')}${sw('operador', 'Operador')}${sw('pagamento', 'Forma de pagamento')}${sw('parcelamento', 'Parcelamento')}${sw('desconto', 'Desconto')}
          ${sw('garantia', 'Garantia')}${sw('serie', 'Número de série')}${sw('observacoes', 'Observações')}${sw('rodape', 'Mensagem de rodapé')}${sw('qrcode', 'Código da venda')}
        </div>
      </div>

      <div class="card"><div class="section-title">✏️ Textos editáveis</div>
        <div class="form-grid">
          <div class="field full"><label>Título do cupom</label><input value="${esc(c.titulo)}" onchange="Cupom.set({titulo:this.value});Modules.cfgPreview()"></div>
          <div class="field full"><label>Mensagem de rodapé / agradecimento</label><input value="${esc(c.agradecimento)}" onchange="Cupom.set({agradecimento:this.value});Modules.cfgPreview()"></div>
        </div>
      </div>
    </div>

    <div class="card" style="position:sticky;top:80px">
      <div class="section-title" style="align-items:center">👁️ Pré-visualização
        <div class="period-tabs"><button id="prev-80" class="active" onclick="Modules.cfgPreviewSet('80')">80mm</button><button id="prev-58" onclick="Modules.cfgPreviewSet('58')">58mm</button></div>
      </div>
      <div id="cfg-preview" style="display:flex;justify-content:center;background:#e9edf3;border-radius:10px;padding:14px;overflow:auto;max-height:70vh"></div>
      <p class="muted" style="font-size:11.5px;margin-top:8px">Prévia real do cupom impresso. Mudanças aparecem na hora.</p>
    </div>
  </div>`;
};
Modules.cfgPrevPapel = '80';
Modules.cfgPreviewSet = function (p) { this.cfgPrevPapel = p; document.getElementById('prev-80').classList.toggle('active', p === '80'); document.getElementById('prev-58').classList.toggle('active', p === '58'); this.cfgPreview(); };
Modules.cfgPreview = function () {
  const box = document.getElementById('cfg-preview'); if (!box) return;
  const sample = {
    id: 'PREVIEW1234', data: new Date().toISOString(), usuario: 'Admin',
    itens: [
      { produtoId: 'prd_1', nome: 'PS5 Slim Digital', qtd: 1, preco: 3499.90, precoOriginal: 3699.90, precoMotivo: 'Promoção', categoria: 'Consoles', condicao: 'novo' },
      { produtoId: 'prd_4', nome: 'Controle DualSense', qtd: 2, preco: 399.90, categoria: 'Controles', condicao: 'seminovo' }
    ],
    bruto: 4499.70, desconto: 200, total: 4299.70, recebido: 4300, troco: 0.30,
    pagamentos: [{ tipo: 'Crédito', valor: 4299.70, parcelas: 10, taxa: 0 }]
  };
  const mm = this.cfgPrevPapel === '58' ? 58 : 80, px = Math.round(mm * 3.78);
  const html = Print.receiptHtml(sample, { papel: this.cfgPrevPapel, noPrint: true });
  box.innerHTML = `<iframe style="width:${px}px;min-height:560px;border:none;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15)" srcdoc="${esc(html)}"></iframe>`;
};
Modules.cfgRegraSet = function (i, f, v) { const c = Cupom.get(); const regras = c.regras.slice(); regras[i] = Object.assign({}, regras[i], { [f]: f === 'prazo' ? (parseInt(v) || 0) : v }); Cupom.set({ regras }); this.cfgPreview(); };
Modules.cfgRegraAdd = function () { const c = Cupom.get(); const regras = c.regras.slice(); regras.push({ categoria: (DB.all('categorias')[0] || {}).nome || 'Consoles', condicao: '', prazo: 30, unidade: 'dias' }); Cupom.set({ regras }); App.go('config'); };
Modules.cfgRegraDel = function (i) { const c = Cupom.get(); const regras = c.regras.slice(); regras.splice(i, 1); Cupom.set({ regras }); App.go('config'); };
