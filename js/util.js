/**
 * Utilitários gerais – Calixteca
 */
const Util = {
  qs: (sel) => document.querySelector(sel),
  qsa: (sel) => document.querySelectorAll(sel),

  escapeHTML: (str) => {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  },

  // Toast notification usando Bootstrap
  toast: (mensagem, tipo = 'info') => {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'position-fixed bottom-0 end-0 p-3';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
    }

    const id = 'toast-' + Date.now();
    const bgClass = {
      success: 'bg-success text-white',
      danger: 'bg-danger text-white',
      warning: 'bg-warning text-dark',
      info: 'bg-info text-dark'
    }[tipo] || 'bg-info text-dark';

    const html = `
      <div id="${id}" class="toast align-items-center border-0 ${bgClass}" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">${mensagem}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>
        </div>
      </div>`;

    container.insertAdjacentHTML('beforeend', html);
    const toastEl = document.getElementById(id);
    const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();
    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
  },

  formatDate: (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('pt-BR');
  },

  setPreference: (key, value) => localStorage.setItem(`leitura_${key}`, JSON.stringify(value)),
  getPreference: (key, def = null) => {
    const val = localStorage.getItem(`leitura_${key}`);
    return val ? JSON.parse(val) : def;
  },

  converterLinkDrive: function(url) {
    if (!url) return '';
    const regex = /\/file\/d\/([^/]+)\//;
    const match = url.match(regex);
    if (match && match[1]) {
      return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
    }
    return url;
  },

  // Extrai a cor média de uma imagem (capa de livro) desenhando ela num
  // canvas pequeno e tirando a média dos pixels — ignora quase-branco/
  // quase-preto (bordas/sombra) pra pegar uma cor mais representativa da
  // capa em si. Resolve com "r, g, b" (pra usar em rgba(...)) ou null se a
  // imagem não puder ser lida (ex.: sem CORS liberado pelo servidor da
  // imagem — falha silenciosa, não deve quebrar a tela).
  extrairCorMedia: function(urlImagem) {
    return new Promise((resolve) => {
      if (!urlImagem) { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const tamanho = 40;
          const canvas = document.createElement('canvas');
          canvas.width = tamanho;
          canvas.height = tamanho;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, tamanho, tamanho);
          const dados = ctx.getImageData(0, 0, tamanho, tamanho).data;

          let r = 0, g = 0, b = 0, total = 0;
          for (let i = 0; i < dados.length; i += 4) {
            if (dados[i + 3] < 100) continue; // ignora pixels transparentes
            const luminosidade = (dados[i] + dados[i + 1] + dados[i + 2]) / 3;
            if (luminosidade > 245 || luminosidade < 10) continue; // ignora quase-branco/quase-preto
            r += dados[i]; g += dados[i + 1]; b += dados[i + 2];
            total++;
          }
          if (total === 0) { resolve(null); return; }
          resolve(`${Math.round(r / total)}, ${Math.round(g / total)}, ${Math.round(b / total)}`);
        } catch (e) {
          resolve(null); // canvas "manchado" por CORS — desiste sem quebrar a tela
        }
      };
      img.onerror = () => resolve(null);
      img.src = urlImagem;
    });
  }
};

// Ripple effect global
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.btn');
  if (!btn) return;

  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);

  ripple.addEventListener('animationend', () => ripple.remove());
});
