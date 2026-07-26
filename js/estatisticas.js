const Estatisticas = (() => {
  const graficos = {};

  // Cores dos gráficos conforme o tema ativo (claro/escuro) — o Chart.js não
  // acompanha as variáveis CSS sozinho, então lemos a classe 'dark-mode' do
  // body e ajustamos os defaults antes de criar/recriar os gráficos.
  function temaEscuro() {
    return document.body.classList.contains('dark-mode');
  }
  function corTextoGrafico() {
    return temaEscuro() ? '#EDE7DA' : '#2B2721';
  }
  function corGradeGrafico() {
    return temaEscuro() ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  }
  function aplicarTemaGraficos() {
    Chart.defaults.color = corTextoGrafico();
    Chart.defaults.borderColor = corGradeGrafico();
  }

  async function init() {
    const page = document.getElementById('page-estatisticas');
    if (!page || !page.classList.contains('active')) return;

    console.log('📊 Carregando estatísticas...');
    try {
      const dados = await API.enviar({ acao: 'stats' });
      if (dados && !dados.erro) {
        // Salva no cache offline
        DB.salvarEstatisticas(dados).catch(e => console.warn('Cache stats falhou:', e));
        processarDados(dados);
      } else {
        throw new Error(dados?.erro || 'Dados inválidos');
      }
    } catch (e) {
      console.warn('Falha na API, tentando cache offline...');
      const cached = await DB.obterEstatisticas();
      if (cached) {
        processarDados(cached);
        Util.toast('Modo offline - dados do último acesso.', 'info');
      } else {
        Util.toast('Sem conexão e nenhum dado em cache.', 'danger');
      }
    }
  }

  function processarDados(dados) {
    preencherResumo(dados);
    criarInsights(dados.insights);

    // Prepara containers e cria gráficos
    setTimeout(() => {
      aplicarTemaGraficos();
      prepararContainers();
      try { criarGraficoFinalizadosMes(dados.finalizadosPorMes); } catch(e) { console.warn(e); }
      try { criarGraficoPaginasDia(dados.paginasPorDia); } catch(e) { console.warn(e); }
      try { criarGraficoGeneros(dados.generos); } catch(e) { console.warn(e); }
      try { criarGraficoDiaSemana(dados.tempoPorDiaSemana); } catch(e) { console.warn(e); }
      try { criarHeatmap(dados.heatmap); } catch(e) { console.warn(e); }
      if (dados.velocidadeMensal) {
        try { criarGraficoVelocidadeMensal(dados.velocidadeMensal); } catch(e) { console.warn(e); }
      }
    
      // Inicializa o Calendário de Leitura
      if (typeof CalendarioLeitura !== 'undefined' && CalendarioLeitura.init) {
        const hoje = new Date();
        CalendarioLeitura.init(hoje.getFullYear(), hoje.getMonth() + 1);
      }
    
      // Inicializa o mapa de locais
      if (typeof MapaLeitura !== 'undefined' && MapaLeitura.init) {
        MapaLeitura.init();
      }
    }, 100);
    preencherTopAutores(dados.topAutores);
    preencherTopEditoras(dados.topEditoras);

    console.log('✅ Módulo Estatísticas pronto (com calendário).');
  }

  function prepararContainers() {
    document.querySelectorAll('#page-estatisticas .card-body').forEach(cardBody => {
      if (cardBody.querySelector('canvas')) {
        cardBody.style.minHeight = '350px';
        cardBody.style.padding = '1rem';
      }
    });

    const ids = [
      'grafico-finalizados-mes',
      'grafico-paginas-dia',
      'grafico-generos',
      'grafico-dia-semana',
      'grafico-velocidade-mensal'
    ];
    ids.forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const parentWidth = canvas.parentElement.clientWidth || 400;
        canvas.setAttribute('width', parentWidth);
        canvas.setAttribute('height', '250');
        canvas.style.width = '100%';
        canvas.style.height = '250px';
      }
    });
  }

  function criarGraficoFinalizadosMes(dados) {
    const canvas = document.getElementById('grafico-finalizados-mes');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (graficos.finalizadosMes) graficos.finalizadosMes.destroy();
    graficos.finalizadosMes = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dados.labels,
        datasets: [{
          label: 'Livros finalizados',
          data: dados.valores,
          backgroundColor: 'rgba(92, 107, 90, 0.75)',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, color: corTextoGrafico() }, grid: { color: corGradeGrafico() } },
          x: { ticks: { color: corTextoGrafico() }, grid: { color: corGradeGrafico() } }
        }
      }
    });
  }

  function criarGraficoPaginasDia(dados) {
    const canvas = document.getElementById('grafico-paginas-dia');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (graficos.paginasDia) graficos.paginasDia.destroy();
    graficos.paginasDia = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dados.labels,
        datasets: [{
          label: 'Páginas',
          data: dados.valores,
          borderColor: '#5C6B5A',
          tension: 0.3,
          fill: true,
          backgroundColor: 'rgba(92,107,90,0.12)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { color: corTextoGrafico() }, grid: { color: corGradeGrafico() } },
          x: { ticks: { color: corTextoGrafico() }, grid: { color: corGradeGrafico() } }
        }
      }
    });
  }

  function criarGraficoGeneros(generos) {
    const canvas = document.getElementById('grafico-generos');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (graficos.generos) graficos.generos.destroy();
    if (!generos || generos.length === 0) return;
    graficos.generos = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: generos.map(g => g.genero),
        datasets: [{
          data: generos.map(g => g.count),
          backgroundColor: ['#5C6B5A','#8B7D6B','#B79C6B','#46543F','#A9A08C','#8B4A3D']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: corTextoGrafico() } } }
      }
    });
  }

  function criarGraficoDiaSemana(dados) {
    const canvas = document.getElementById('grafico-dia-semana');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (graficos.diaSemana) graficos.diaSemana.destroy();
    graficos.diaSemana = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dados.labels,
        datasets: [{
          label: 'Minutos',
          data: dados.valores,
          backgroundColor: 'rgba(139, 125, 107, 0.75)',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { color: corTextoGrafico() }, grid: { color: corGradeGrafico() } },
          x: { ticks: { color: corTextoGrafico() }, grid: { color: corGradeGrafico() } }
        }
      }
    });
  }

  function criarGraficoVelocidadeMensal(dados) {
    const canvas = document.getElementById('grafico-velocidade-mensal');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (graficos.velocidadeMensal) graficos.velocidadeMensal.destroy();
    graficos.velocidadeMensal = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dados.labels,
        datasets: [{
          label: 'Páginas/hora',
          data: dados.valores,
          borderColor: '#8B4A3D',
          backgroundColor: 'rgba(139, 74, 61, 0.12)',
          tension: 0.3,
          fill: true,
          pointRadius: 5,
          pointHoverRadius: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Páginas por hora', color: corTextoGrafico() },
            ticks: { color: corTextoGrafico() },
            grid: { color: corGradeGrafico() }
          },
          x: {
            ticks: { color: corTextoGrafico() },
            grid: { color: corGradeGrafico() }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.parsed.y + ' pág/h';
              }
            }
          }
        }
      }
    });
  }

  function criarHeatmap(heatmapData) {
    const container = document.getElementById('heatmap-container');
    if (!container) return;
    container.innerHTML = '';

    const diasExibir = heatmapData.slice(0, 84).reverse();
    const maxPag = Math.max(...diasExibir.map(d => d.paginas), 1);

    function formatarDataBrasileira(iso) {
      const partes = iso.split('-');
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    diasExibir.forEach(dia => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const intensidade = dia.paginas / maxPag;
      cell.style.backgroundColor = getHeatColor(intensidade);
      cell.title = `${formatarDataBrasileira(dia.data)}: ${dia.paginas} páginas`;
      container.appendChild(cell);
    });
  }

  function getHeatColor(intensidade) {
    if (temaEscuro()) {
      if (intensidade === 0) return '#2A2820';   // fundo escuro, sem leitura
      if (intensidade < 0.25) return '#3D4739';
      if (intensidade < 0.5) return '#526350';
      if (intensidade < 0.75) return '#6E8266';
      return '#9DAE96';                          // dia mais intenso, bem visível no escuro
    }
    if (intensidade === 0) return '#EDEAE2';   // papel, sem leitura
    if (intensidade < 0.25) return '#C9D2C4';  // musgo bem claro
    if (intensidade < 0.5) return '#9DAE96';   // musgo claro
    if (intensidade < 0.75) return '#6E8266';  // musgo médio
    return '#46543F';                          // musgo profundo (dia mais intenso)
  }
  function preencherTopAutores(autores) {
    const ul = document.getElementById('top-autores');
    if (!ul) return;
    ul.innerHTML = '';
    if (autores && autores.length) {
      autores.forEach(a => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `${Util.escapeHTML(a.nome)} <span class="badge bg-primary rounded-pill">${a.livros}</span>`;
        ul.appendChild(li);
      });
    } else {
      ul.innerHTML = '<li class="list-group-item text-muted">Nenhum dado</li>';
    }
  }

  function preencherTopEditoras(editoras) {
    const ul = document.getElementById('top-editoras');
    if (!ul) return;
    ul.innerHTML = '';
    if (editoras && editoras.length) {
      editoras.forEach(e => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `${Util.escapeHTML(e.nome)} <span class="badge bg-secondary rounded-pill">${e.livros}</span>`;
        ul.appendChild(li);
      });
    } else {
      ul.innerHTML = '<li class="list-group-item text-muted">Nenhum dado</li>';
    }
  }

  function preencherResumo(d) {
    setText('stat-total-livros', d.totalLivros);
    setText('stat-total-paginas', d.totalPaginas);
    setText('stat-total-horas', d.totalHoras);
    setText('stat-velocidade', d.velocidadeMedia);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function criarInsights(lista) {
    const ul = document.getElementById('insights-list');
    if (!ul) return;
    ul.innerHTML = '';
    if (lista && lista.length) {
      lista.forEach(texto => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = `<i class="fas fa-check-circle text-success me-2"></i>${Util.escapeHTML(texto)}`;
        ul.appendChild(li);
      });
    } else {
      ul.innerHTML = '<li class="list-group-item text-muted">Nenhum insight disponível.</li>';
    }
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Estatisticas.init());
} else {
  Estatisticas.init();
}
