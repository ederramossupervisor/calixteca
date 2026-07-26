const Metas = (() => {
  async function init() {
    const page = document.getElementById('page-metas');
    if (!page || !page.classList.contains('active')) return;

    console.log('🎯 Carregando metas...');
    configurarForm();
    await carregarMetas();
    await carregarConquistas();
    console.log('✅ Módulo Metas pronto.');
  }

  function configurarForm() {
    const form = document.getElementById('metas-form');
    document.getElementById('meta-ano').value = new Date().getFullYear();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!navigator.onLine) {
        Util.toast('Você está offline. Conecte-se para salvar metas.', 'warning');
        return;
      }
      const meta = {
        ano: Number(document.getElementById('meta-ano').value) || new Date().getFullYear(),
        metaLivros: Number(document.getElementById('meta-livros').value) || 0,
        metaPaginas: Number(document.getElementById('meta-paginas').value) || 0,
        metaMensal: Number(document.getElementById('meta-mensal').value) || 0,
        metaSemanal: Number(document.getElementById('meta-semanal').value) || 0,
        metaDiaria: Number(document.getElementById('meta-diaria').value) || 0,
        metaSequenciaDias: Number(document.getElementById('meta-sequencia').value) || 0
      };
      try {
        const resp = await API.enviar({ acao: 'saveGoal', meta });
        if (resp && resp.status === 'ok') {
          Util.toast('Metas salvas!', 'success');
          carregarMetas();
        }
      } catch (err) {
        Util.toast('Erro ao salvar metas: ' + err.message, 'danger');
      }
    });
  }

  async function carregarMetas() {
    try {
      const resp = await API.enviar({ acao: 'getGoals' });
      if (resp && resp.progresso) {
        DB.salvarMetas(resp.meta).catch(e => console.warn('Cache metas falhou:', e));
        exibirProgresso(resp.meta, resp.progresso);
      }
    } catch (e) {
      console.warn('Falha na API, tentando cache offline...');
      const ano = new Date().getFullYear();
      const cached = await DB.obterMetas(ano);
      if (cached) {
        // Simula um progresso mínimo para exibição
        const progresso = {
          livrosFinalizados: 0,
          paginasLidasAno: 0,
          paginasLidasMes: 0,
          percentualLivros: 0,
          percentualPaginas: 0,
          paginasParaMetaMensal: cached.metaMensal || 0,
          paginasPorDiaNecessarias: 0,
          sequenciaAtual: 0,
          maiorSequencia: 0,
          percentualSequencia: 0
        };
        exibirProgresso(cached, progresso);
        Util.toast('Modo offline - metas do último acesso.', 'info');
      }
    }
  }

  function exibirProgresso(meta, prog) {
    document.getElementById('meta-ano').value = meta.ano;
    document.getElementById('meta-livros').value = meta.metaLivros || 0;
    document.getElementById('meta-paginas').value = meta.metaPaginas || 0;
    document.getElementById('meta-mensal').value = meta.metaMensal || 0;
    document.getElementById('meta-semanal').value = meta.metaSemanal || 0;
    document.getElementById('meta-diaria').value = meta.metaDiaria || 0;
    document.getElementById('meta-sequencia').value = meta.metaSequenciaDias || 0;

    const progLivros = document.getElementById('prog-livros');
    progLivros.style.width = prog.percentualLivros + '%';
    progLivros.textContent = prog.percentualLivros + '%';
    document.getElementById('texto-prog-livros').textContent =
      `${prog.livrosFinalizados} de ${meta.metaLivros} livros`;

    const progPaginas = document.getElementById('prog-paginas');
    progPaginas.style.width = prog.percentualPaginas + '%';
    progPaginas.textContent = prog.percentualPaginas + '%';
    document.getElementById('texto-prog-paginas').textContent =
      `${prog.paginasLidasAno.toLocaleString('pt-BR')} de ${meta.metaPaginas.toLocaleString('pt-BR')} páginas`;

    document.getElementById('info-meta-mensal').textContent =
      `Faltam ${prog.paginasParaMetaMensal.toLocaleString('pt-BR')} páginas para bater a meta mensal. ` +
      (prog.paginasPorDiaNecessarias > 0
        ? `Leia ${prog.paginasPorDiaNecessarias} páginas por dia.`
        : 'Meta mensal já batida!');

    const cardSequencia = document.getElementById('card-prog-sequencia');
    if (meta.metaSequenciaDias > 0 && prog.maiorSequencia !== undefined) {
      cardSequencia.style.display = '';
      const progSeq = document.getElementById('prog-sequencia');
      const pct = prog.percentualSequencia || 0;
      progSeq.style.width = pct + '%';
      progSeq.textContent = pct + '%';
      document.getElementById('texto-prog-sequencia').textContent =
        `${prog.maiorSequencia} de ${meta.metaSequenciaDias} dias (recorde)`;
      document.getElementById('texto-sequencia-atual').textContent =
        `Sequência atual: ${prog.sequenciaAtual} dia${prog.sequenciaAtual === 1 ? '' : 's'}`;
    } else {
      cardSequencia.style.display = 'none';
    }
  }

  async function carregarConquistas() {
    let conquistas = [];
    try {
      const resp = await API.enviar({ acao: 'listAchievements' });
      if (Array.isArray(resp)) {
        conquistas = resp;
        DB.salvarConquistas(resp).catch(e => console.warn('Cache conquistas falhou:', e));
      }
    } catch (e) {
      console.warn('Falha na API, tentando cache offline...');
      conquistas = await DB.obterConquistas();
      if (conquistas.length > 0) {
        Util.toast('Modo offline - conquistas do último acesso.', 'info');
      }
    }

    const grid = document.getElementById('conquistas-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const icones = {
      'Primeiro livro': 'fa-book',
      'Leitor iniciante': 'fa-book-open',
      'Leitor dedicado': 'fa-award',
      'Devorador de livros': 'fa-fire',
      'Página 1000': 'fa-file-alt',
      'Página 5000': 'fa-copy',
      'Maratona de 7 dias': 'fa-calendar-check',
      'Maratona de 30 dias': 'fa-calendar-alt',
      'Livro gigante': 'fa-weight-hanging',
      'Favorito': 'fa-star',
      'Leitor global': 'fa-globe-americas',
      'Leitor noturno': 'fa-moon',
      'Colecionador de clássicos': 'fa-landmark',
      'Diversidade literária': 'fa-rainbow',
      'Anotador': 'fa-pen',
      'Viajante literário': 'fa-map-marked-alt'
    };

    const nomesObtidos = conquistas.map(c => c.Nome);

    Object.keys(icones).forEach(nome => {
      const obtida = nomesObtidos.includes(nome);
      const col = document.createElement('div');
      col.className = 'col-6 col-md-4 col-lg-3 col-xl-2';
      col.innerHTML = `
        <div class="conquista-card ${obtida ? 'conquistada' : ''}">
          <div class="conquista-badge mx-auto mb-2"><i class="fas ${icones[nome]} fa-2x"></i></div>
          <strong>${nome}</strong>
          ${obtida ? '<span class="badge bg-success d-block mt-1">Conquistada</span>' : '<span class="badge bg-light text-muted d-block mt-1">Bloqueada</span>'}
        </div>`;
      grid.appendChild(col);
    });

    document.getElementById('verificar-conquistas-btn').onclick = async () => {
      if (!navigator.onLine) {
        Util.toast('Você está offline. Conecte-se para verificar conquistas.', 'warning');
        return;
      }
      const novas = await API.enviar({ acao: 'checkAchievements' });
      if (Array.isArray(novas) && novas.length > 0) {
        Util.toast(`${novas.length} nova(s) conquista(s)!`, 'success');
        carregarConquistas();
      } else {
        Util.toast('Nenhuma conquista nova.', 'info');
      }
    };
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Metas.init());
} else {
  Metas.init();
}
