// Controlador principal da aplicação
document.addEventListener('DOMContentLoaded', () => {
  const splash = document.getElementById('splash-screen');
  const inicioSplash = Date.now();

  // Tempo mínimo pra splash não "piscar" em conexões rápidas, e máximo de
  // segurança pra não deixar o usuário preso na splash se a rede estiver
  // muito lenta (o carregamento do dashboard costuma terminar bem antes disso).
  const TEMPO_MINIMO_SPLASH = 800;
  const TEMPO_MAXIMO_SPLASH = 5000;
  let splashEscondida = false;

  function esconderSplash() {
    if (splashEscondida) return;
    splashEscondida = true;
    const decorrido = Date.now() - inicioSplash;
    const espera = Math.max(0, TEMPO_MINIMO_SPLASH - decorrido);
    setTimeout(() => {
      document.body.classList.add('app-loaded');
      setTimeout(() => { if (splash) splash.remove(); }, 500);
    }, espera);
  }

  // Rede muito lenta ou travada: esconde mesmo assim depois do tempo máximo.
  setTimeout(esconderSplash, TEMPO_MAXIMO_SPLASH);

  // Inicializa módulos básicos (independente da splash)
  Auth.init();
  initNavegacao();
  initTema();

  // Lembrete de leitura (só se o usuário tiver ativado em Configurações e
  // concedido permissão de notificação)
  if (typeof Lembretes !== 'undefined') {
    Lembretes.verificarLembreteLeitura().catch(() => {});
  }

  // Carrega a página inicial ativa (dashboard) e só então esconde a splash —
  // assim ela some assim que os dados essenciais já estiverem na tela, em vez
  // de sempre esperar um tempo fixo (mais rápido em conexões boas).
  const activePage = document.querySelector('.page.active');
  let carregamentoInicial = Promise.resolve();
  if (activePage && activePage.id === 'page-dashboard') {
    if (typeof Dashboard !== 'undefined' && Dashboard.init) {
      carregamentoInicial = Promise.resolve(Dashboard.init());
    }
  }
  carregamentoInicial.catch(() => {}).finally(esconderSplash);

  // Atalhos de página (ex.: ?page=leitura)
  const urlParams = new URLSearchParams(window.location.search);
  const shortcutPage = urlParams.get('page');
  if (shortcutPage) {
    setTimeout(() => activatePageGlobal(shortcutPage), 400);
  }
});

// Função pública para ativar uma página (usada por atalhos e navegação)
function activatePageGlobal(pageName) {
  // Atualiza links ativos
  const navItems = document.querySelectorAll('.nav-link, .bottom-nav .nav-item');
  navItems.forEach(link => {
    link.classList.remove('active');
    if (link.dataset.page === pageName) {
      link.classList.add('active');
    }
  });

  // Mostra/oculta páginas
  const pages = document.querySelectorAll('.page');
  pages.forEach(page => {
    page.classList.remove('active');
    if (page.id === `page-${pageName}`) {
      page.classList.add('active');
    }
  });

  // Inicializa módulos específicos
  switch (pageName) {
    case 'dashboard':
      if (typeof Dashboard !== 'undefined' && Dashboard.init) Dashboard.init();
      break;
    case 'leitura':
      if (typeof Leitura !== 'undefined' && Leitura.init) Leitura.init();
      break;
    case 'leitor':
      if (typeof Leitor !== 'undefined' && Leitor.init) Leitor.init();
      break;
    case 'adicionar':
      if (typeof Livros !== 'undefined' && Livros.init) Livros.init();
      break;
    case 'biblioteca':
      if (typeof Biblioteca !== 'undefined' && Biblioteca.init) Biblioteca.init();
      break;
    case 'estatisticas':
      if (typeof Estatisticas !== 'undefined' && Estatisticas.init) Estatisticas.init();
      break;
    case 'metas':
      if (typeof Metas !== 'undefined' && Metas.init) Metas.init();
      break;
    case 'anotacoes':
      if (typeof Anotacoes !== 'undefined' && Anotacoes.init) Anotacoes.init();
      break;
    case 'desejos':
      if (typeof DesejosEmprestimos !== 'undefined' && DesejosEmprestimos.init) DesejosEmprestimos.init();
      break;
    case 'exportar':
      if (typeof Exportar !== 'undefined' && Exportar.init) Exportar.init();
      break;
    case 'configuracoes':
      if (typeof Configuracoes !== 'undefined' && Configuracoes.init) Configuracoes.init();
      break;
  }
  // Fecha o offcanvas mobile se estiver aberto
  try {
    const offcanvasEl = document.getElementById('mobileMenu');
    if (offcanvasEl) {
      const offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
      if (offcanvas) offcanvas.hide();
    }
  } catch (e) { /* ignora */ }

  // ÍCONES NOS TÍTULOS DAS PÁGINAS (USANDO FONT AWESOME)
  // "dashboard" fica de fora: o h1 do Início agora é o título "Calixteca"
  // (estilo marca, com subtítulo), não um rótulo de página como as demais.
  const iconesPaginas = {
    biblioteca: 'fa-books',
    adicionar: 'fa-plus-circle',
    leitura: 'fa-clock',
    estatisticas: 'fa-chart-bar',
    metas: 'fa-bullseye',
    anotacoes: 'fa-sticky-note',
    desejos: 'fa-heart',
    exportar: 'fa-download',
    configuracoes: 'fa-cog'
  };

  const h1 = document.querySelector(`#page-${pageName} h1`);
  if (h1 && iconesPaginas[pageName]) {
    if (!h1.querySelector('.fa')) {
      h1.innerHTML = `<i class="fas ${iconesPaginas[pageName]} me-2"></i>${h1.textContent}`;
    }
  }
}  

// Gerencia a navegação entre páginas
function initNavegacao() {
  const navItems = document.querySelectorAll('.nav-link, .bottom-nav .nav-item');

  navItems.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const pageName = link.dataset.page;
      if (pageName) activatePageGlobal(pageName);
    });
  });
}

// Modo escuro / claro
function initTema() {
  const body = document.body;
  const toggleDesktop = document.getElementById('theme-toggle');
  const toggleMobileOffcanvas = document.getElementById('theme-toggle-mobile');
  const toggleMobileTop = document.getElementById('theme-toggle-mobile-top');

  const saved = Util.getPreference('darkMode', false);
  if (saved) body.classList.add('dark-mode');

  // Se o usuário desligou a cor automática por horário, aplica a cor
  // manual salva já no carregamento (senão TemaSazonal.js sobrescreveria).
  const corAutomatica = Util.getPreference('corAutomatica', true);
  if (!corAutomatica) {
    const corSalva = Util.getPreference('corPrimaria', null);
    if (corSalva) document.documentElement.style.setProperty('--primary', corSalva);
  }

  function atualizarBotao(btn) {
    if (!btn) return;
    const isDark = body.classList.contains('dark-mode');
    btn.innerHTML = isDark
      ? '<i class="fas fa-sun"></i> <span class="ms-1">Modo claro</span>'
      : '<i class="fas fa-moon"></i> <span class="ms-1">Modo escuro</span>';
    btn.title = isDark ? 'Modo claro' : 'Modo escuro';
  }

  function atualizarTodos() {
    [toggleDesktop, toggleMobileOffcanvas, toggleMobileTop].forEach(atualizarBotao);
  }

  atualizarTodos();

  [toggleDesktop, toggleMobileOffcanvas, toggleMobileTop].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        body.classList.toggle('dark-mode');
        Util.setPreference('darkMode', body.classList.contains('dark-mode'));
        atualizarTodos();
        window.dispatchEvent(new CustomEvent('calixteca:tema-alterado', {
          detail: { escuro: body.classList.contains('dark-mode') }
        }));
      });
    }
  });
}
