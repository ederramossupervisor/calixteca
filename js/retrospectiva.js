// Retrospectiva do ano — reaproveita os endpoints 'dashboard' e 'stats' que já
// existem, sem precisar de nenhuma mudança no backend.
const Retrospectiva = (() => {
  function init() {
    const btn = document.getElementById('btn-ver-retrospectiva');
    if (!btn) return;
    btn.addEventListener('click', abrir);
    console.log('✅ Módulo Retrospectiva pronto.');
  }

  async function abrir() {
    const modalEl = document.getElementById('modal-retrospectiva');
    if (!modalEl || typeof bootstrap === 'undefined') return;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    const corpo = document.getElementById('retrospectiva-corpo');
    corpo.innerHTML = '<div class="text-center py-5"><span class="spinner-border" role="status"></span></div>';

    try {
      const [dashboard, stats] = await Promise.all([
        API.enviar({ acao: 'dashboard' }),
        API.enviar({ acao: 'stats' })
      ]);
      if (!dashboard || dashboard.erro || !stats || stats.erro) {
        throw new Error('Resposta inválida da API');
      }
      renderizar(dashboard, stats);
    } catch (e) {
      console.warn('Falha ao montar retrospectiva:', e);
      corpo.innerHTML = '<p class="text-danger text-center py-4">Não foi possível montar sua retrospectiva agora. Verifique sua conexão e tente de novo.</p>';
    }
  }

  function renderizar(dashboard, stats) {
    const ano = new Date().getFullYear();
    const corpo = document.getElementById('retrospectiva-corpo');

    const generosOrdenados = [...(stats.generos || [])].sort((a, b) => b.count - a.count);
    const generoTop = generosOrdenados[0];
    const autorTop = (stats.topAutores || [])[0];

    corpo.innerHTML = `
      <div id="retrospectiva-cartao" class="retrospectiva-cartao">
        <div class="retrospectiva-ano">${ano}</div>
        <h3 class="retrospectiva-titulo">Sua retrospectiva de leitura</h3>
        <div class="retrospectiva-grid">
          <div class="retrospectiva-item">
            <div class="retrospectiva-numero">${dashboard.livrosFinalizadosAno || 0}</div>
            <div class="retrospectiva-label">livros finalizados</div>
          </div>
          <div class="retrospectiva-item">
            <div class="retrospectiva-numero">${(dashboard.paginasAno || 0).toLocaleString('pt-BR')}</div>
            <div class="retrospectiva-label">páginas lidas</div>
          </div>
          <div class="retrospectiva-item">
            <div class="retrospectiva-numero">${dashboard.horasTotal || 0}h</div>
            <div class="retrospectiva-label">de leitura (total)</div>
          </div>
          <div class="retrospectiva-item">
            <div class="retrospectiva-numero">${dashboard.maiorSequencia || 0}</div>
            <div class="retrospectiva-label">dias seguidos (recorde)</div>
          </div>
        </div>
        ${generoTop ? `<p class="retrospectiva-destaque">Gênero favorito: <strong>${Util.escapeHTML(generoTop.genero)}</strong></p>` : ''}
        ${autorTop ? `<p class="retrospectiva-destaque">Autor mais lido: <strong>${Util.escapeHTML(autorTop.nome)}</strong> (${autorTop.livros} livro${autorTop.livros === 1 ? '' : 's'})</p>` : ''}
        <p class="retrospectiva-destaque">Velocidade média: <strong>${stats.velocidadeMedia || 0} pág/h</strong></p>
        <div class="retrospectiva-marca">
          <img src="img/icons/icon-128x128.png" alt="Ícone" style="height: 2.2em; vertical-align: middle; margin-right: 0.3em;">
          Calixteca
        </div>
      </div>`;

    const btnBaixar = document.getElementById('btn-baixar-retrospectiva');
    if (btnBaixar) {
      btnBaixar.onclick = () => baixarImagem(btnBaixar, ano);
    }
  }

  async function baixarImagem(botao, ano) {
    if (typeof html2canvas === 'undefined') {
      Util.toast('Biblioteca de imagem não carregada. Tente recarregar a página.', 'warning');
      return;
    }
    const textoOriginal = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Gerando...';

    try {
      const cartao = document.getElementById('retrospectiva-cartao');
      const canvas = await html2canvas(cartao, { backgroundColor: null, scale: 2, useCORS: true, allowTaint: true });
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `retrospectiva-leitura-${ano}.png`;
        a.click();
        URL.revokeObjectURL(url);
        Util.toast('Imagem baixada!', 'success');
      }, 'image/png');
    } catch (e) {
      console.error(e);
      Util.toast('Erro ao gerar imagem.', 'danger');
    } finally {
      botao.disabled = false;
      botao.innerHTML = textoOriginal;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
