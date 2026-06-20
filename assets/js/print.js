/* ============ RICO GAMES ERP — Impressão de cupom (térmica / Elgin) ============ */
const Print = {
  cfg() {
    const c = (DB.all('config')[0] || {});
    return Object.assign({ papel: '80', modo: 'ask', corte: true, gaveta: false }, c.impressao || {});
  },
  formaStr(v) { return (v.pagamentos || []).map(p => p.tipo + (p.parcelas > 1 ? ' ' + p.parcelas + 'x' : '')).join(' + '); },

  receiptHtml(v, opts) {
    opts = opts || {};
    const printer = this.cfg();
    const mm = (opts.papel || printer.papel) === '58' ? 58 : 80;
    const fs = mm === 58 ? 10 : 11;
    const cup = (v && v.cupom && v.cupom.cfg) ? v.cupom.cfg : (typeof Cupom !== 'undefined' ? Cupom.get() : Cupom.defaults());
    const gar = (v && v.cupom && v.cupom.itens) ? v.cupom.itens : (typeof Cupom !== 'undefined' ? Cupom.snapshot(v).itens : []);
    const C = cup.campos || {};
    const num = String(v.id || '').slice(-6).toUpperCase();
    const d = new Date(v.data || Date.now());
    const dataStr = d.toLocaleDateString('pt-BR'), horaStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const hr = '<div class="hr"></div>';
    const totItens = (v.itens || []).reduce((s, i) => s + i.qtd, 0);

    const itens = (v.itens || []).map(i => `
      <div class="it"><div class="it-n">${esc(i.nome)}</div>
        ${i.precoOriginal != null && i.preco !== i.precoOriginal ? `<div style="font-size:${fs - 1}px">de ${Fmt.brl(i.precoOriginal)} por ${Fmt.brl(i.preco)}${i.precoMotivo && C.observacoes ? ' (' + esc(i.precoMotivo) + ')' : ''}</div>` : ''}
        <div class="row"><span>${i.qtd} x ${Fmt.brl(i.preco)}</span><span>${Fmt.brl(i.preco * i.qtd)}</span></div></div>`).join('');

    const pagLinhas = (v.pagamentos || []).map(p => {
      let s = p.tipo;
      if (C.parcelamento && p.tipo === 'Crédito' && p.parcelas > 1) s += ` ${p.parcelas}x de ${Fmt.brl((p.valor || 0) / p.parcelas)}`;
      if ((v.pagamentos || []).length > 1) s += ` — ${Fmt.brl(p.valor)}`;
      return `<div>${esc(s)}</div>`;
    }).join('');

    // garantia (por item, via snapshot/regras)
    const comGar = gar.filter(g => g.prazo > 0);
    const prazos = [...new Set(comGar.map(g => g.prazo + ' ' + g.unidade))];
    let garHtml = '';
    if (C.garantia && cup.garantiaAtiva) {
      let linhas;
      if (prazos.length === 1 && comGar.length === gar.length) linhas = `<div class="c b">Garantia: ${prazos[0]}</div>`;
      else linhas = gar.map(g => `<div class="row"><span>${esc(g.nome)}</span><span>${g.prazo > 0 ? g.prazo + ' ' + g.unidade : 'sem gar.'}</span></div>`).join('');
      const temUsado = gar.some(g => g.condicao === 'seminovo' || g.condicao === 'usado');
      garHtml = `${hr}<div class="sec">GARANTIA</div>${linhas}`;
      if (cup.modelo !== 'economico' && cup.garantiaTexto) garHtml += `<div class="c" style="margin-top:3px">${esc(cup.garantiaTexto.replace('{prazo}', prazos.join(' / ') || (cup.garantiaPrazo + ' ' + cup.garantiaUnidade)))}</div>`;
      if (temUsado && cup.txtSeminovo) garHtml += `<div class="c" style="margin-top:3px">${esc(cup.txtSeminovo)}</div>`;
      if (cup.garantiaAviso) garHtml += `<div class="c" style="margin-top:3px">${esc(cup.garantiaAviso)}</div>`;
      if (cup.modelo === 'detalhado' && cup.garantiaPolitica) garHtml += `<div style="margin-top:3px;font-size:${fs - 1}px">${esc(cup.garantiaPolitica)}</div>`;
    }

    const seriais = C.serie ? gar.map(g => g.serie).filter(Boolean) : [];
    const recebido = v.recebido != null ? v.recebido : v.total;
    const troco = v.troco != null ? v.troco : Math.max(0, recebido - v.total);
    const head = [];
    if (cup.logo) head.push(`<div class="c" style="font-size:${mm === 58 ? 20 : 24}px">${esc(cup.logo)}</div>`);
    head.push(`<div class="c store">${esc(cup.loja)}</div>`);
    if (C.telefone && cup.telefone) head.push(`<div class="c">Tel: ${esc(cup.telefone)}</div>`);
    if (C.whatsapp && cup.whatsapp) head.push(`<div class="c">WhatsApp: ${esc(cup.whatsapp)}</div>`);
    if (C.instagram && cup.instagram) head.push(`<div class="c">${esc(cup.instagram)}</div>`);
    if (C.endereco && cup.endereco) head.push(`<div class="c">${esc(cup.endereco)}</div>`);
    if (C.cnpj && cup.cnpj) head.push(`<div class="c">CNPJ: ${esc(cup.cnpj)}</div>`);

    const printScript = opts.noPrint ? '' : `<script>window.onload=function(){setTimeout(function(){window.print();},200);window.onafterprint=function(){setTimeout(function(){window.close();},300);};};<\/script>`;

    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cupom ${num}</title>
      <style>
        @page { size: ${mm}mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { width: ${mm}mm; margin: 0 auto; padding: 4px 6px 8px; font-family: 'Courier New', monospace; color: #000; font-size: ${fs}px; line-height: 1.25; }
        .c { text-align: center; } .b { font-weight: bold; }
        .store { font-size: ${mm === 58 ? 15 : 18}px; font-weight: bold; letter-spacing: 1px; }
        .sec { font-weight: bold; text-align: center; margin: 1px 0; }
        .hr { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        .it { margin-bottom: 3px; } .it-n { font-weight: bold; }
        .tot { font-size: ${mm === 58 ? 14 : 16}px; font-weight: bold; }
        .qr { text-align:center; margin-top:6px; } .qrbox { display:inline-block; border:1px solid #000; padding:6px 10px; font-weight:bold; letter-spacing:1px; }
      </style></head><body>
      ${head.join('')}
      ${cup.titulo ? `${hr}<div class="sec">${esc(cup.titulo)}</div>` : ''}
      <div class="row" style="margin-top:2px"><span>Data: ${dataStr}</span><span>Hora: ${horaStr}</span></div>
      <div class="row">${C.numeroVenda ? `<span>Venda Nº: ${num}</span>` : '<span></span>'}${C.operador ? `<span>Op: ${esc(v.usuario || 'Admin')}</span>` : ''}</div>
      ${hr}<div class="sec">ITENS</div>${hr}
      ${itens}
      <div class="row b" style="margin-top:2px"><span>Total de Itens:</span><span>${totItens}</span></div>
      ${hr}
      ${C.desconto && v.desconto ? `<div class="row"><span>Subtotal:</span><span>${Fmt.brl(v.bruto || v.total)}</span></div><div class="row"><span>Desconto:</span><span>- ${Fmt.brl(v.desconto)}</span></div>` : ''}
      ${v.usadoEntrada ? `<div class="row"><span>Usado na troca:</span><span>${esc(v.usadoEntrada)}</span></div><div class="row"><span></span><span>- ${Fmt.brl(v.usadoValor || 0)}</span></div>` : ''}
      <div class="row tot"><span>TOTAL:</span><span>${Fmt.brl(v.total)}</span></div>
      ${C.pagamento ? `${hr}<div class="sec">PAGAMENTO</div>${pagLinhas}<div class="row"><span>Valor pago:</span><span>${Fmt.brl(recebido)}</span></div>${troco > 0 ? `<div class="row"><span>Troco:</span><span>${Fmt.brl(troco)}</span></div>` : ''}` : ''}
      ${garHtml}
      ${seriais.length ? `${hr}${seriais.map(s => `<div>S/N: ${esc(s)}</div>`).join('')}` : ''}
      ${C.qrcode ? `<div class="qr"><div class="qrbox">COD: ${num}</div></div>` : ''}
      ${C.rodape && cup.agradecimento ? `${hr}<div class="c b">${esc(cup.agradecimento)}</div><div class="c b">${esc(cup.loja)}</div>` : ''}
      ${printScript}
      </body></html>`;
  },

  print(v) {
    const w = window.open('', '_blank', 'width=400,height=640');
    if (!w) { Toast.err('Permita pop-ups para imprimir o cupom.'); return; }
    w.document.write(this.receiptHtml(v));
    w.document.close();
  },

  maybeAfterSale(v) {
    const modo = this.cfg().modo;
    if (modo === 'auto') this.print(v);
    else if (modo === 'ask') {
      window.__lastVenda = v;
      Modal.open({
        title: '🧾 Imprimir cupom?',
        body: `<p style="color:var(--txt-2)">Venda concluída com sucesso. Deseja imprimir o comprovante?</p>`,
        foot: `<button class="btn-ghost" onclick="Modal.close()">Não</button><button class="btn-primary" onclick="Modal.close();Print.print(window.__lastVenda)">🖨️ Imprimir cupom</button>`
      });
    }
  },

  test() {
    this.print({
      id: 'TESTE0', data: new Date().toISOString(), usuario: (typeof App !== 'undefined' && App.user() && App.user().nome) || 'Admin',
      itens: [{ nome: 'Controle DualSense Branco', qtd: 1, preco: 399.90 }, { nome: 'God of War Ragnarök', qtd: 1, preco: 299.00 }],
      bruto: 698.90, desconto: 0, total: 698.90, recebido: 700, troco: 1.10, pagamentos: [{ tipo: 'Dinheiro', valor: 700 }]
    });
  }
};
