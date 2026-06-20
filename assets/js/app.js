/* ============ RICO GAMES ERP — Tema (Dark / Light) ============ */
const Theme = {
  KEY: 'rg_theme',
  current() { return document.documentElement.getAttribute('data-theme') || 'dark'; },
  systemPref() { return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark'; },
  apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    const ico = document.getElementById('tt-ico'), lbl = document.getElementById('tt-label');
    if (ico) ico.textContent = t === 'light' ? '☀️' : '🌙';
    if (lbl) lbl.textContent = t === 'light' ? 'Claro' : 'Escuro';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#ffffff' : '#16181d');
  },
  init() {
    // 1ª utilização: segue o sistema operacional; depois respeita a escolha salva
    const saved = localStorage.getItem(this.KEY);
    this.apply(saved || this.systemPref());
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
        if (!localStorage.getItem(this.KEY)) this.apply(e.matches ? 'light' : 'dark');
      });
    }
  },
  toggle() {
    const t = this.current() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(this.KEY, t);
    this.apply(t);
    Toast.ok('Tema ' + (t === 'light' ? 'claro' : 'escuro') + ' ativado.');
  }
};

/* ============ RICO GAMES ERP — Permissões ============ */
const PERM_DEFAULT_FUNC = {
  modules: { dashboard: false, vendasDia: true, pdv: true, caixa: true, estoque: true, entrada: false, compras: false, fornecedores: false, usados: false, trocas: false, movimentacoes: false, garantias: false, financeiro: false, relatorios: false, config: false },
  verFinanceiro: false, podeCancelar: false, podeDesconto: true, podeEditarProduto: true, podeSangria: true, podeAlterarPreco: false
};

/* ============ RICO GAMES ERP — App / Router ============ */
const App = {
  titles: {
    dashboard: 'Dashboard', vendasDia: 'Vendas do Dia', pdv: 'PDV — Ponto de Venda', caixa: 'Caixa da Loja', estoque: 'Estoque', entrada: 'Entrada de Estoque',
    compras: 'Compras', fornecedores: 'Fornecedores', usados: 'Avaliação de Usados',
    trocas: 'Trocas e Usados', movimentacoes: 'Movimentações', garantias: 'Garantias',
    financeiro: 'Financeiro', relatorios: 'Relatórios', config: 'Configurações'
  },
  current: 'dashboard',

  init() {
    DB.load();
    Theme.init();
    if (typeof Cloud !== 'undefined' && Cloud.configured()) {
      Cloud.initialSync().then(() => { if (this.current) this.refresh(); });
      Cloud.start();
    }
    // login persistence (sessão)
    if (sessionStorage.getItem('rg_logged') === '1') this.showApp();
    document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') App.login(); });
    // nav binding
    document.querySelectorAll('.nav-item[data-route]').forEach(a => {
      a.addEventListener('click', () => App.go(a.dataset.route));
    });
  },

  login() {
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value.trim();
    const found = DB.all('usuarios').find(x => x.usuario.toLowerCase() === u.toLowerCase() && x.senha === p && x.ativo !== false);
    if (found) {
      sessionStorage.setItem('rg_logged', '1');
      sessionStorage.setItem('rg_user', JSON.stringify({ usuario: found.usuario, nome: found.nome, role: found.role }));
      this.showApp();
    } else Toast.err('Usuário ou senha incorretos.');
  },
  /* ---- Permissões ---- */
  user() { try { return JSON.parse(sessionStorage.getItem('rg_user')); } catch (e) { return null; } },
  isAdmin() { const u = this.user(); return !u || u.role === 'admin'; },
  perms() {
    if (this.isAdmin()) return null;
    const cfg = DB.all('config')[0] || {}, pf = cfg.permFuncionario || {};
    return Object.assign({}, PERM_DEFAULT_FUNC, pf, { modules: Object.assign({}, PERM_DEFAULT_FUNC.modules, pf.modules || {}) });
  },
  canModule(route) { if (this.isAdmin()) return true; const p = this.perms(); return !!(p.modules && p.modules[route]); },
  canFinance() { if (this.isAdmin()) return true; return !!this.perms().verFinanceiro; },
  can(action) { if (this.isAdmin()) return true; return !!this.perms()[action]; },
  firstRoute() { return this.isAdmin() ? 'dashboard' : (['pdv', 'vendasDia', 'caixa', 'estoque', 'compras', 'fornecedores', 'usados', 'trocas', 'movimentacoes', 'garantias', 'financeiro', 'relatorios'].find(r => this.canModule(r)) || 'pdv'); },
  applyAccess() {
    document.querySelectorAll('.nav-item[data-route]').forEach(a => { a.style.display = this.canModule(a.dataset.route) ? '' : 'none'; });
    const u = this.user() || { nome: 'Administrador', role: 'admin' };
    const av = document.querySelector('.user-chip .avatar'); if (av) av.textContent = (u.nome || 'A').charAt(0).toUpperCase();
    const nm = document.querySelector('.user-chip .only-desktop'); if (nm) nm.textContent = u.nome + (u.role === 'admin' ? '' : ' · Funcionário');
    const nv = document.querySelector('.topbar-actions .btn-ghost'); if (nv) nv.style.display = this.canModule('pdv') ? '' : 'none';
  },
  logout() {
    Modal.confirm('Deseja sair do sistema?', () => {
      sessionStorage.removeItem('rg_logged');
      sessionStorage.removeItem('rg_user');
      document.getElementById('app').classList.add('hidden');
      document.getElementById('login-screen').classList.remove('hidden');
    }, 'Sair');
  },
  showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    this.applyAccess();
    this.go(this.firstRoute());
  },

  go(route) {
    if (!this.canModule(route)) { Toast.err('Você não tem permissão para acessar esta área.'); route = this.firstRoute(); }
    this.current = route;
    document.getElementById('page-title').textContent = this.titles[route] || route;
    document.querySelectorAll('.nav-item[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    const view = document.getElementById('view');
    try {
      view.innerHTML = Modules[route] ? Modules[route]() : '<div class="empty-state"><div class="big">🚧</div>Módulo em construção.</div>';
    } catch (e) {
      view.innerHTML = '<div class="empty-state"><div class="big">⚠️</div>Erro ao carregar o módulo.<br><small>' + esc(e.message) + '</small></div>';
      console.error(e);
    }
    // post-render hooks
    if (route === 'vendasDia') Modules.vdRender();
    if (route === 'caixa') Modules.cxRender();
    if (route === 'estoque') Modules.renderEstoqueTable();
    if (route === 'entrada') Modules.entRender();
    if (route === 'pdv') { Modules.pdvSearch(); Modules.renderCart(); }
    if (route === 'movimentacoes') Modules.renderMovs();
    if (route === 'financeiro') Modules.finInit();
    if (route === 'relatorios') Modules.biInit();
    view.scrollTop = 0; window.scrollTo(0, 0);
    this.toggleSidebar(false);
  },

  toggleSidebar(open) {
    const sb = document.getElementById('sidebar'), ov = document.getElementById('sidebar-overlay');
    if (window.innerWidth > 860) return;
    sb.classList.toggle('open', open); ov.classList.toggle('open', open);
  },

  toggleTheme() { Theme.toggle(); },
  refresh() { const app = document.getElementById('app'); if (app && !app.classList.contains('hidden') && this.current) this.go(this.current); },

  globalSearch() {
    const q = document.getElementById('global-search').value.trim();
    if (!q) return;
    this.go('estoque');
    setTimeout(() => { const e = document.getElementById('est-search'); if (e) { e.value = q; Modules.renderEstoqueTable(); } }, 60);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
