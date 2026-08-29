/**
 * Scanner de código de barras (ISBN) para o cadastro de livros.
 *
 * Usa Quagga2 (carregado via CDN no index.html) pra ler o código EAN-13
 * (que é o mesmo formato do ISBN-13) pela câmera, e depois busca os dados
 * do livro no Google Books / Open Library pra preencher o formulário.
 *
 * Duas causas conhecidas de "detecta mas vem com dígito errado" no Quagga2,
 * e como este módulo evita cada uma:
 *
 * 1) Um único frame de câmera pode ser mal decodificado (borrão, reflexo,
 *    má iluminação) e ainda assim "parecer" um código válido pro decoder.
 *    -> Toda leitura passa pela validação de checksum do EAN-13 antes de
 *       ser aceita. Isso sozinho já descarta a maioria dos erros de 1 dígito.
 *
 * 2) Mesmo com checksum correto, muito raramente uma leitura ruim pode
 *    "colar" por acidente (falso-positivo de checksum é raro, mas existe).
 *    -> Em vez de aceitar a primeira leitura válida, o módulo guarda as
 *       últimas leituras e só aceita um código quando ele se repete
 *       várias vezes seguidas (consenso), o que é o padrão recomendado
 *       pela própria documentação do Quagga2 pra uso em produção.
 */
const Scanner = (() => {
  const TAMANHO_BUFFER = 5;
  const MINIMO_CONSENSO = 4; // de 5 leituras, pelo menos 4 iguais

  let buffer = [];
  let scannerAtivo = false;
  let modalScanner = null;
  let onSucessoCallback = null;

  function init() {
    const btnEscanear = document.getElementById('btn-escanear-isbn');
    const btnFechar = document.getElementById('btn-fechar-scanner');
    const modalEl = document.getElementById('modal-scanner-isbn');
    if (!btnEscanear || !modalEl) return; // página sem scanner (não é a de Adicionar Livro)

    if (btnEscanear.dataset.scannerLigado) return; // evita registrar o listener duas vezes
    btnEscanear.dataset.scannerLigado = '1';

    modalScanner = new bootstrap.Modal(modalEl, { backdrop: 'static' });

    btnEscanear.addEventListener('click', () => abrir(async (isbn) => {
      document.getElementById('isbn').value = isbn;
      atualizarStatus('Código lido: ' + isbn + '. Buscando dados do livro...');
      const dados = await buscarDadosPorISBN(isbn);
      fecharModal();
      if (dados) {
        if (typeof Livros !== 'undefined' && Livros.preencherViaScanner) {
          Livros.preencherViaScanner(dados);
        }
        Util.toast('Livro encontrado! Confira os dados antes de salvar.', 'success');
      } else {
        Util.toast('Código lido (' + isbn + '), mas não encontrei os dados do livro. Preencha manualmente.', 'warning');
      }
    }));

    modalEl.addEventListener('hidden.bs.modal', pararScanner);
    btnFechar.addEventListener('click', fecharModal);

    console.log('✅ Módulo Scanner pronto.');
  }

  /* ========== ABERTURA / FECHAMENTO DO MODAL ========== */

  function abrir(callback) {
    onSucessoCallback = callback;
    buffer = [];
    atualizarStatus('Aponte a câmera para o código de barras (parte de trás do livro).');
    modalScanner.show();

    // Só inicia a câmera depois que o modal terminou a animação de abertura
    // (senão o container ainda tem largura/altura 0 e a câmera falha em
    // iniciar de forma silenciosa em vários navegadores).
    const modalEl = document.getElementById('modal-scanner-isbn');
    const iniciarUmaVez = () => {
      modalEl.removeEventListener('shown.bs.modal', iniciarUmaVez);
      iniciarScanner();
    };
    modalEl.addEventListener('shown.bs.modal', iniciarUmaVez);
  }

  function fecharModal() {
    modalScanner.hide(); // dispara 'hidden.bs.modal' -> pararScanner()
  }

  function atualizarStatus(texto) {
    const status = document.getElementById('scanner-status');
    if (status) status.textContent = texto;
  }

  /* ========== QUAGGA2 ========== */

  function iniciarScanner() {
    if (typeof Quagga === 'undefined') {
      atualizarStatus('Não foi possível carregar o leitor de código de barras. Verifique sua conexão.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      atualizarStatus('Este navegador não permite acesso à câmera aqui (verifique se o app está em HTTPS).');
      return;
    }

    const viewport = document.getElementById('scanner-viewport');
    viewport.innerHTML = ''; // limpa qualquer <video>/<canvas> de uma sessão anterior

    Quagga.init({
      inputStream: {
        type: 'LiveStream',
        target: viewport,
        constraints: {
          facingMode: 'environment', // câmera traseira no celular
          width: { min: 640, ideal: 1280 },
          height: { min: 480, ideal: 720 }
        },
        // Restringe a leitura a uma faixa central: melhora a taxa de acerto
        // porque ignora ruído nas bordas da imagem (outros textos/objetos).
        area: { top: '25%', right: '5%', left: '5%', bottom: '25%' }
      },
      locator: {
        patchSize: 'medium',
        halfSample: true
      },
      numOfWorkers: navigator.hardwareConcurrency ? Math.min(navigator.hardwareConcurrency, 4) : 2,
      frequency: 10,
      decoder: {
        // Só ISBN (EAN-13) — não tenta outros formatos, o que reduz
        // confusão e falso-positivo de outros tipos de código de barras.
        readers: ['ean_reader']
      },
      locate: true
    }, (erro) => {
      if (erro) {
        console.error('Erro ao iniciar o Quagga:', erro);
        atualizarStatus('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
        return;
      }
      Quagga.start();
      scannerAtivo = true;
      Quagga.onDetected(aoDetectar);
    });
  }

  function pararScanner() {
    if (!scannerAtivo) return;
    try {
      Quagga.offDetected(aoDetectar);
      Quagga.stop();
    } catch (e) {
      // já pode ter sido parado; sem problema
    }
    scannerAtivo = false;
    buffer = [];
  }

  function aoDetectar(resultado) {
    const codigo = resultado?.codeResult?.code;
    if (!codigo || !pareceISBN13(codigo)) return; // descarta leituras com checksum inválido

    buffer.push(codigo);
    if (buffer.length > TAMANHO_BUFFER) buffer.shift();

    // Conta qual código mais se repetiu no buffer recente
    const contagem = {};
    buffer.forEach((c) => { contagem[c] = (contagem[c] || 0) + 1; });
    const [codigoMaisFrequente, vezes] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];

    atualizarStatus('Lendo... (' + vezes + '/' + MINIMO_CONSENSO + ' confirmações)');

    if (vezes >= MINIMO_CONSENSO) {
      pararScanner();
      if (onSucessoCallback) onSucessoCallback(codigoMaisFrequente);
    }
  }

  /* ========== VALIDAÇÃO DO CÓDIGO ========== */

  // Confere o dígito verificador do EAN-13 — é isso que barra a grande
  // maioria dos erros de leitura antes mesmo de chegar no buffer de consenso.
  function validarChecksumEAN13(codigo) {
    if (!/^\d{13}$/.test(codigo)) return false;
    const digitos = codigo.split('').map(Number);
    const soma = digitos.slice(0, 12).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    const digitoVerificador = (10 - (soma % 10)) % 10;
    return digitoVerificador === digitos[12];
  }

  function pareceISBN13(codigo) {
    return validarChecksumEAN13(codigo) && (codigo.startsWith('978') || codigo.startsWith('979'));
  }

  /* ========== BUSCA DE DADOS DO LIVRO ========== */

  async function buscarDadosPorISBN(isbn) {
    const viaGoogle = await buscarNoGoogleBooks(isbn);
    if (viaGoogle) return viaGoogle;
    return buscarNaOpenLibrary(isbn);
  }

  async function buscarNoGoogleBooks(isbn) {
    try {
      const resp = await fetch('https://www.googleapis.com/books/v1/volumes?q=isbn:' + isbn);
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.totalItems || !data.items || !data.items.length) return null;

      const info = data.items[0].volumeInfo || {};
      let capa = '';
      if (info.imageLinks) {
        capa = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || '';
        capa = capa.replace('http://', 'https://').replace('zoom=1', 'zoom=2');
      }
      return {
        isbn,
        titulo: info.title || '',
        subtitulo: info.subtitle || '',
        autor: (info.authors || []).join(', '),
        editora: info.publisher || '',
        ano: info.publishedDate ? info.publishedDate.substring(0, 4) : '',
        numeroPaginas: info.pageCount || '',
        idioma: mapearIdioma(info.language),
        urlCapa: capa
      };
    } catch (e) {
      console.warn('Google Books indisponível:', e);
      return null;
    }
  }

  async function buscarNaOpenLibrary(isbn) {
    try {
      const resp = await fetch('https://openlibrary.org/api/books?bibkeys=ISBN:' + isbn + '&format=json&jscmd=data');
      if (!resp.ok) return null;
      const data = await resp.json();
      const info = data['ISBN:' + isbn];
      if (!info) return null;

      const anoMatch = info.publish_date ? info.publish_date.match(/\d{4}/) : null;
      return {
        isbn,
        titulo: info.title || '',
        subtitulo: info.subtitle || '',
        autor: (info.authors || []).map((a) => a.name).join(', '),
        editora: (info.publishers || []).map((p) => p.name).join(', '),
        ano: anoMatch ? anoMatch[0] : '',
        numeroPaginas: info.number_of_pages || '',
        idioma: '',
        urlCapa: info.cover ? (info.cover.large || info.cover.medium || info.cover.small || '') : ''
      };
    } catch (e) {
      console.warn('Open Library indisponível:', e);
      return null;
    }
  }

  function mapearIdioma(codigo) {
    const mapa = { pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês', de: 'Alemão', it: 'Italiano', ru: 'Russo', ja: 'Japonês' };
    return mapa[codigo] || '';
  }

  // Inicialização
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, abrir };
})();
