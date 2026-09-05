const Dashboard = (() => {
  let currentLivroIndex = 0;
  let livrosLendoList = [];
  let livroAtualID = null;
  let containerCard = null;
  const skeletonIds = [
    'card-livros-mes', 'card-livros-ano', 'card-paginas-hoje',
    'card-paginas-semana', 'card-horas', 'card-sequencia',
    'livro-atual-titulo', 'livro-atual-progresso'
  ];

  async function init() {
    const dashPage = document.getElementById('page-dashboard');
    if (!dashPage || !dashPage.classList.contains('active')) return;

    console.log('📊 Carregando dashboard...');

    // Mostra o que já temos em cache local na hora (stale-while-revalidate),
    // sem esperar a rede pra pintar a tela — só cai no skeleton se não
    // houver nada salvo ainda.
    let temCacheLocal = false;
    try {
      const cached = await DB.obterDashboard();
      if (cached) {
        temCacheLocal = true;
        ocultarSkeletons();
        preencherCards(cached);
        } else {
        mostrarSkeletons();
      }
    } catch (e) {
      mostrarSkeletons();
    }

    try {
      const dados = await API.enviar({ acao: 'dashboard' });
      if (dados && !dados.erro) {
        ocultarSkeletons();
        preencherCards(dados);
        DB.salvarDashboard(dados).catch(e => console.warn('Cache dashboard falhou:', e));
      } else {
        throw new Error(dados?.erro || 'Dados inválidos');
      }
    } catch (e) {
      console.warn('Falha na API ao atualizar dashboard.');
      if (temCacheLocal) {
        Util.toast('Modo offline - dados do último acesso.', 'info');
      } else {
        ocultarSkeletons();
        Util.toast('Sem conexão e nenhum dado em cache.', 'danger');
      }
    }

    // Mini-heatmap dos últimos dias — busca à parte, sem atrasar/quebrar
    // o resto do Dashboard se falhar (mesmo padrão do Insights Avançados em
    // Estatísticas). Requer a ação 'heatmapRecente' no Code.gs.
    carregarMiniHeatmap();

    // Últimos livros lidos (capas) — busca à parte, mesmo padrão do
    // mini-heatmap: não atrasa nem quebra o resto do Dashboard se falhar.
    carregarUltimosLidos();
    // Timeline de atividades (scroll infinito) — módulo à parte (js/timeline.js),
    // não atrasa nem quebra o resto do Dashboard se falhar.
    if (typeof Timeline !== 'undefined') Timeline.init();
  }

  async function carregarUltimosLidos() {
    const container = document.getElementById('ultimos-lidos-container');
    if (!container) return;
    try {
      // 'listAllBooks' já é uma ação cacheável em API (TTL de 45s) — se a
      // Biblioteca já pediu a mesma lista há pouco, reaproveita sem nova
      // chamada de rede.
      const resp = await API.enviar({ acao: 'listAllBooks' });
      if (!Array.isArray(resp)) return;

      ultimosLidosTodos = resp
        .filter(l => l.Status === 'Finalizado' && l.DataTérmino)
        .sort((a, b) => new Date(b.DataTérmino) - new Date(a.DataTérmino));

      renderizarUltimosLidos();
    } catch (e) {
      console.warn('Falha ao carregar últimos livros lidos:', e);
    }
  }

  function renderizarUltimosLidos() {
    const container = document.getElementById('ultimos-lidos-container');
    if (!container) return;

    const total = ehMobile() ? ULTIMOS_LIDOS_MOBILE : ULTIMOS_LIDOS_DESKTOP;
    const livros = ultimosLidosTodos.slice(0, total);

    if (livros.length === 0) {
      container.innerHTML = '<div class="text-muted small" id="ultimos-lidos-vazio">Nenhum livro finalizado ainda.</div>';
      return;
    }

    // Grade (não tira com scroll): o número de colunas acompanha a
    // quantidade de livros a mostrar, pra ocupar exatamente a largura do
    // card, sem barra de rolagem e sem sobra de espaço em branco.
    const grade = document.createElement('div');
    grade.className = 'ultimos-lidos-grade';
    grade.style.gridTemplateColumns = `repeat(${livros.length}, 1fr)`;

    livros.forEach(livro => {
      const item = document.createElement('div');
      item.className = 'ultimos-lidos-item';
      item.dataset.id = livro.ID;

      const capa = document.createElement('div');
      capa.className = 'ultimos-lidos-capa';
      capa.innerHTML = livro.URLCapa
        ? `<img src="${livro.URLCapa}" alt="Capa de ${Util.escapeHTML(livro.Título || '')}" loading="lazy">`
        : '<i class="fas fa-book text-muted"></i>';
      item.appendChild(capa);

      const titulo = document.createElement('span');
      titulo.className = 'ultimos-lidos-titulo';
      titulo.textContent = livro.Título || 'Sem título';
      item.appendChild(titulo);

      item.title = livro.Título || 'Sem título';
      item.addEventListener('click', () => {
        // Leva pra Biblioteca, onde dá pra abrir os detalhes do livro
        // (o modal de detalhes depende do estado interno daquele módulo,
        // por isso não é aberto direto daqui).
        if (typeof activatePageGlobal === 'function') activatePageGlobal('biblioteca');
      });

      grade.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(grade);
  }

  // Recalcula quantas capas mostrar (5/10) ao cruzar o breakpoint mobile,
  // sem nova chamada de rede — só reaproveita a lista já buscada.
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (ultimosLidosTodos.length > 0) renderizarUltimosLidos();
    }, 200);
  });

  // No mobile a fileira única de 70 quadradinhos fica fina demais pra ser
  // útil (cada célula vira uma tira de poucos pixels). Em telas estreitas
  // pedimos só as últimas 2 semanas e desenhamos um grid de 7 colunas com
  // células bem maiores — igual ao desktop segue mostrando os ~70 dias
  // na fileira única, que ali tem espaço de sobra.
  const MOBILE_BREAKPOINT = 767;
  const DIAS_MOBILE = 14;
  const DIAS_DESKTOP = 70;

  function ehMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  // Últimos livros lidos: 5 capas no mobile, 15 no desktop.
  const ULTIMOS_LIDOS_MOBILE = 5;
  const ULTIMOS_LIDOS_DESKTOP = 15;
  let ultimosLidosTodos = []; // lista completa (já filtrada/ordenada) em cache local
  let resizeTimer = null;

  async function carregarMiniHeatmap() {
    const container = document.getElementById('mini-heatmap-container');
    if (!container) return;
    const totalDias = ehMobile() ? DIAS_MOBILE : DIAS_DESKTOP;
    try {
      const dias = await API.enviar({ acao: 'heatmapRecente', dias: totalDias });
      if (Array.isArray(dias)) renderizarMiniHeatmap(dias);
    } catch (e) {
      console.warn('Falha ao carregar mini-heatmap:', e);
    }
  }

  function renderizarMiniHeatmap(dias) {
    const container = document.getElementById('mini-heatmap-container');
    if (!container || !dias || !dias.length) return;
    container.innerHTML = '';

    // Modo compacto: grid de 7 colunas com células grandes e rótulo do dia
    // da semana — usado quando já pedimos um recorte curto (mobile).
    const modoCompacto = dias.length <= 14;

    const maxPag = Math.max(...dias.map(d => d.paginas), 1);
    const hojeISO = new Date().toISOString().split('T')[0];
    const diasSemana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    function formatarDataBrasileira(iso) {
      const partes = iso.split('-');
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    function temaEscuro() {
      return document.body.classList.contains('dark-mode');
    }
    function corCelula(intensidade) {
      if (temaEscuro()) {
        if (intensidade === 0) return '#2A2820';
        if (intensidade < 0.25) return '#3D4739';
        if (intensidade < 0.5) return '#526350';
        if (intensidade < 0.75) return '#6E8266';
        return '#9DAE96';
      }
      if (intensidade === 0) return '#EDEAE2';
      if (intensidade < 0.25) return '#C9D2C4';
      if (intensidade < 0.5) return '#9DAE96';
      if (intensidade < 0.75) return '#6E8266';
      return '#46543F';
    }

    const grid = document.createElement('div');
    grid.className = modoCompacto ? 'heatmap-grid heatmap-grid-compacta' : 'heatmap-grid';
    if (modoCompacto) {
      // 7 colunas fixas (uma por dia da semana); o próprio grid quebra em
      // duas fileiras quando são 14 dias.
      grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
    } else {
      // Uma única fileira: o número de colunas acompanha a quantidade de
      // dias, pra cada quadradinho ocupar uma fração igual da largura da
      // linha.
      grid.style.gridTemplateColumns = `repeat(${dias.length}, 1fr)`;
    }

    if (modoCompacto) {
      dias.forEach(dia => {
        const wrapper = document.createElement('div');
        wrapper.className = 'heatmap-celula-wrapper';

        const label = document.createElement('div');
        label.className = 'heatmap-dia-label';
        const dataObj = new Date(dia.data + 'T00:00:00');
        label.textContent = diasSemana[dataObj.getDay()];
        wrapper.appendChild(label);

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        const intensidade = dia.paginas / maxPag;
        cell.style.backgroundColor = corCelula(intensidade);
        cell.title = `${formatarDataBrasileira(dia.data)}: ${dia.paginas} página${dia.paginas === 1 ? '' : 's'}`;
        if (dia.paginas > 0) cell.textContent = dia.paginas;
        if (dia.data === hojeISO) cell.classList.add('heatmap-cell-hoje');
        wrapper.appendChild(cell);

        grid.appendChild(wrapper);
      });
      container.appendChild(grid);
      return;
    }

    dias.forEach(dia => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const intensidade = dia.paginas / maxPag;
      cell.style.backgroundColor = corCelula(intensidade);
      cell.title = `${formatarDataBrasileira(dia.data)}: ${dia.paginas} página${dia.paginas === 1 ? '' : 's'}`;
      grid.appendChild(cell);
    });

    container.appendChild(grid);
  }

  function mostrarSkeletons() {
    skeletonIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('skeleton-placeholder');
        if (id === 'livro-atual-titulo') el.textContent = 'Carregando...';
        if (id === 'livro-atual-progresso') el.textContent = '';
        if (id.startsWith('card-')) el.textContent = '...';
      }
    });
    const capa = document.getElementById('livro-atual-capa');
    if (capa) capa.innerHTML = '<div class="skeleton-placeholder" style="width:50px;height:70px;border-radius:4px;"></div>';
  }

  function ocultarSkeletons() {
    skeletonIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('skeleton-placeholder');
    });
    const capa = document.getElementById('livro-atual-capa');
    if (capa) capa.innerHTML = '';
  }

  function preencherCards(d) {
    containerCard = document.getElementById('livro-atual-card');
    if (!containerCard) return;

    livrosLendoList = d.livrosLendo || [];
    if (d.livroAtual && livrosLendoList.length > 0) {
      currentLivroIndex = livrosLendoList.findIndex(l => l.ID === d.livroAtual.ID);
      if (currentLivroIndex < 0) currentLivroIndex = 0;
    } else {
      currentLivroIndex = 0;
    }
    livroAtualID = d.livroAtual ? d.livroAtual.ID : null;

    renderizarLivroAtual();
    criarControlesNavegacao();
    adicionarSwipe();

    animarContador('card-livros-mes', d.livrosFinalizadosMes);
    animarContador('card-livros-ano', d.livrosFinalizadosAno);
    animarContador('card-paginas-hoje', d.paginasHoje);
    animarContador('card-paginas-semana', d.paginasSemana);
    animarContador('card-horas', d.horasTotal);
    animarContador('card-sequencia', d.sequenciaAtual);

    document.getElementById('meta-texto').textContent =
      `${d.livrosFinalizadosAno} de ${d.metaLivros} livros (${d.percentualMeta}%)`;
    const barra = document.getElementById('barra-meta');
    barra.style.width = d.percentualMeta + '%';
    barra.textContent = d.percentualMeta + '%';
    barra.setAttribute('aria-valuenow', d.percentualMeta);
  }

  function animarContador(id, valorFinal) {
    const el = document.getElementById(id);
    if (!el) return;
    const valorInicial = 0;
    const duracao = 800;
    const inicio = performance.now();
    const passo = (agora) => {
      const decorrido = agora - inicio;
      const progresso = Math.min(decorrido / duracao, 1);
      const valorAtual = Math.round(valorInicial + (valorFinal - valorInicial) * progresso);
      el.textContent = id === 'card-horas' ? valorAtual : valorAtual + (id === 'card-sequencia' ? ' dias' : '');
      if (progresso < 1) {
        requestAnimationFrame(passo);
      } else {
        el.textContent = id === 'card-horas' ? valorFinal : valorFinal + (id === 'card-sequencia' ? ' dias' : '');
      }
    };
    requestAnimationFrame(passo);
  }

  function renderizarLivroAtual() {
    if (!containerCard) return;
    const livro = livrosLendoList.length > 0 ? livrosLendoList[currentLivroIndex] : null;
    const tituloEl = document.getElementById('livro-atual-titulo');
    const progressoEl = document.getElementById('livro-atual-progresso');
    const capaEl = document.getElementById('livro-atual-capa');
    const previsaoEl = document.getElementById('livro-atual-previsao');
    const tempoRestEl = document.getElementById('livro-atual-tempo-restante');

    if (livro) {
      const progresso = livro.totalPag > 0 ? Math.round((livro.pagLidas / livro.totalPag) * 100) : 0;
      if (tituloEl) tituloEl.textContent = livro.titulo;
      if (progressoEl) progressoEl.textContent = `${livro.pagLidas || 0} de ${livro.totalPag} páginas (${progresso}%)`;
      if (capaEl) {
        capaEl.innerHTML = livro.urlCapa
          ? `<img src="${livro.urlCapa}" alt="Capa" class="img-fluid rounded" style="max-height:70px;">`
          : '';
      }

      // Cor dinâmica extraída da capa (ver Util.extrairCorMedia) — aplica no
      // card via CSS custom property; se a imagem não puder ser lida (ex.:
      // CORS), simplesmente não colore nada, sem quebrar a tela.
      if (livro.urlCapa) {
        Util.extrairCorMedia(livro.urlCapa).then(cor => {
          if (containerCard) {
            containerCard.style.setProperty('--capa-cor', cor ? `rgba(${cor}, 0.18)` : 'transparent');
          }
        });
      } else if (containerCard) {
        containerCard.style.setProperty('--capa-cor', 'transparent');
      }

      // Previsão de data (individual)
      if (previsaoEl) {
        if (livro.previsaoTermino) {
          const dataPrev = new Date(livro.previsaoTermino);
          const hoje = new Date();
          const diffDias = Math.ceil((dataPrev - hoje) / (1000 * 60 * 60 * 24));
          const dataFormatada = dataPrev.toLocaleDateString('pt-BR');
          let textoPrevisao = '';
          if (diffDias <= 0) {
            textoPrevisao = '<i class="fa-solid fa-hands-clapping"></i> Você deve terminar hoje!';
          } else if (diffDias === 1) {
            textoPrevisao = '<i class="fa-solid fa-calendar-days"></i> Previsão: amanhã';
          } else {
            textoPrevisao = `<i class="fa-solid fa-calendar-days"></i> Previsão: ${dataFormatada} (${diffDias} dias)`;
          }
          previsaoEl.innerHTML = textoPrevisao;
          previsaoEl.classList.remove('d-none');
        } else {
          previsaoEl.classList.add('d-none');
        }
      }

            // Tempo restante e velocidade (individual)
      if (tempoRestEl) {
        if (livro.tempoRestanteMinutos && livro.tempoRestanteMinutos > 0) {
          const horas = Math.floor(livro.tempoRestanteMinutos / 60);
          const minutos = livro.tempoRestanteMinutos % 60;
          let texto = '⏱️ ';
          if (horas > 0) texto += `${horas}h `;
          if (minutos > 0) texto += `${minutos}min`;
          texto += ' restantes';
          if (livro.velocidadeMedia) {
            texto += ` (${livro.velocidadeMedia} pág/h)`;
          }
          tempoRestEl.textContent = texto;
          tempoRestEl.classList.remove('d-none');
        } else {
          tempoRestEl.classList.add('d-none');
        }
      }
    } else {
      if (tituloEl) tituloEl.textContent = 'Nenhum livro em andamento';
      if (progressoEl) progressoEl.textContent = '';
      if (capaEl) capaEl.innerHTML = '';
      if (previsaoEl) previsaoEl.classList.add('d-none');
      if (tempoRestEl) tempoRestEl.classList.add('d-none');
      if (containerCard) containerCard.style.setProperty('--capa-cor', 'transparent');
    }
  }

  function criarControlesNavegacao() {
    const oldLeft = document.getElementById('livro-atual-seta-left');
    if (oldLeft) oldLeft.remove();
    const oldRight = document.getElementById('livro-atual-seta-right');
    if (oldRight) oldRight.remove();
    const oldInd = document.getElementById('livro-atual-indicador');
    if (oldInd) oldInd.remove();

    if (livrosLendoList.length <= 1) return;

    const btnLeft = document.createElement('button');
    btnLeft.id = 'livro-atual-seta-left';
    btnLeft.className = 'btn btn-link text-secondary position-absolute start-0 top-50 translate-middle-y px-2';
    btnLeft.innerHTML = '<i class="fas fa-chevron-left"></i>';
    btnLeft.style.opacity = '0.6';
    btnLeft.style.fontSize = '1.2rem';
    btnLeft.addEventListener('click', (e) => { e.stopPropagation(); mudarLivro(-1); });

    const btnRight = document.createElement('button');
    btnRight.id = 'livro-atual-seta-right';
    btnRight.className = 'btn btn-link text-secondary position-absolute end-0 top-50 translate-middle-y px-2';
    btnRight.innerHTML = '<i class="fas fa-chevron-right"></i>';
    btnRight.style.opacity = '0.6';
    btnRight.style.fontSize = '1.2rem';
    btnRight.addEventListener('click', (e) => { e.stopPropagation(); mudarLivro(1); });

    const indicador = document.createElement('small');
    indicador.id = 'livro-atual-indicador';
    indicador.className = 'text-muted ms-2';
    indicador.textContent = `${currentLivroIndex + 1}/${livrosLendoList.length}`;

    containerCard.style.position = 'relative';
    containerCard.appendChild(btnLeft);
    containerCard.appendChild(btnRight);

    const tituloEl = document.getElementById('livro-atual-titulo');
    if (tituloEl) tituloEl.parentNode.appendChild(indicador);
  }

  async function mudarLivro(delta) {
    if (livrosLendoList.length === 0) return;
    currentLivroIndex = (currentLivroIndex + delta + livrosLendoList.length) % livrosLendoList.length;
    const novoLivro = livrosLendoList[currentLivroIndex];
    if (novoLivro && novoLivro.ID !== livroAtualID) {
      renderizarLivroAtual();
      livroAtualID = novoLivro.ID;
      if (navigator.onLine) {
        await API.enviar({ acao: 'setLivroAtual', livroID: novoLivro.ID });
      } else {
        Util.toast('Modo offline - preferência será salva ao conectar.', 'info');
      }
    }
  }

  function adicionarSwipe() {
    if (!containerCard) return;
    let touchStartX = 0;
    containerCard.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    containerCard.addEventListener('touchend', (e) => {
      if (touchStartX === 0) return;
      const diff = e.changedTouches[0].screenX - touchStartX;
      if (Math.abs(diff) > 50) mudarLivro(diff > 0 ? -1 : 1);
      touchStartX = 0;
    });
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('page-dashboard')?.classList.contains('active')) {
      Dashboard.init();
    }
  });
} else {
  if (document.getElementById('page-dashboard')?.classList.contains('active')) {
    Dashboard.init();
  }
}


/* Timeline de atividades (js/timeline.js): feed vertical com marcadores por
   tipo de evento (sessão, livro, anotação, conquista) e scroll infinito. */
#timeline-container {
  position: relative;
  margin-top: 4px;
}
.timeline-item {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
}
.timeline-item:last-child {
  border-bottom: none;
}
.timeline-marcador {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  color: #fff;
  background: var(--secondary);
}
.timeline-marcador-sessao { background: var(--primary); }
.timeline-marcador-livro { background: var(--secondary); }
.timeline-marcador-anotacao { background: var(--text-secondary); }
.timeline-marcador-conquista { background: var(--accent); }
.timeline-corpo {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.timeline-capa {
  width: 34px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  flex: 0 0 auto;
}
.timeline-texto {
  min-width: 0;
  flex: 1;
}
.timeline-titulo {
  font-weight: 600;
  font-size: 0.92rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.timeline-detalhe {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.timeline-data {
  font-size: 0.72rem;
  margin-top: 2px;
}
