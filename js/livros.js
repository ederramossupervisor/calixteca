const Livros = (() => {
  const form = document.getElementById('book-form');
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const resultsDiv = document.getElementById('search-results');
  const searchList = document.getElementById('search-list');
  const coverPreview = document.getElementById('cover-preview');
  const urlCapa = document.getElementById('urlCapa');
  const loadCoverBtn = document.getElementById('load-cover-btn');

  let searchResults = [];
  let editandoLivroID = null;
  let notaSelecionada = 0; // valor da nota em estrelas (0 a 5)

  function init() {
    if (!form) {
      console.warn('⚠️ Formulário de livro não encontrado no DOM.');
      return;
    }

    prepararEstrelasFormulario();

    searchBtn.addEventListener('click', buscarLivro);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') buscarLivro();
    });

    loadCoverBtn.addEventListener('click', () => {
      const urlConvertida = Util.converterLinkDrive(urlCapa.value);
      mostrarCapa(urlConvertida);
    });

    urlCapa.addEventListener('change', () => {
      const urlConvertida = Util.converterLinkDrive(urlCapa.value);
      mostrarCapa(urlConvertida);
    });

    form.addEventListener('submit', salvarLivro);
    document.getElementById('clear-form-btn')?.addEventListener('click', limparFormulario);

    searchList.addEventListener('click', (e) => {
      const item = e.target.closest('.list-group-item');
      if (!item) return;
      const index = parseInt(item.dataset.index, 10);
      if (!isNaN(index) && searchResults[index]) {
        preencherFormulario(searchResults[index]);
        resultsDiv.classList.add('d-none');
      }
    });

    const scanBtn = document.getElementById('scan-isbn-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', escanearISBN);
    }

    criarBotaoCancelarEdicao();
    console.log('✅ Módulo Livros pronto.');
  }

  /* ========== ESTRELAS NO FORMULÁRIO ========== */
  function prepararEstrelasFormulario() {
    const notaInput = document.getElementById('nota');
    if (!notaInput) return;
    // Esconde o input original (agora não será mais usado diretamente)
    notaInput.type = 'hidden';
    notaInput.id = 'nota-hidden';
    // Cria container visual de estrelas
    const container = document.createElement('div');
    container.id = 'nota-estrelas-container';
    container.className = 'd-flex align-items-center gap-1 mt-1';
    container.innerHTML = gerarEstrelasHTML(0, true);
    notaInput.parentNode.insertBefore(container, notaInput.nextSibling);

    container.addEventListener('click', (e) => {
      const star = e.target.closest('.estrela-editavel');
      if (!star) return;
      const valor = parseInt(star.dataset.valor);
      notaSelecionada = valor;
      atualizarEstrelasVisual(container, valor);
    });
  }

  function gerarEstrelasHTML(valor, editavel = false) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      const preenchida = i <= valor;
      const classe = preenchida ? 'fas fa-star' : 'far fa-star';
      if (editavel) {
        html += `<i class="${classe} estrela-editavel" data-valor="${i}" style="cursor:pointer; color:#B8934B; font-size:1.2rem;"></i>`;
      } else {
        html += `<i class="${classe}" style="color:#B8934B; font-size:1.2rem;"></i>`;
      }
    }
    return html;
  }

  function atualizarEstrelasVisual(container, valor) {
    const estrelas = container.querySelectorAll('.estrela-editavel');
    estrelas.forEach((estrela, index) => {
      const i = index + 1;
      if (i <= valor) {
        estrela.className = 'fas fa-star estrela-editavel';
      } else {
        estrela.className = 'far fa-star estrela-editavel';
      }
      estrela.style.color = '#B8934B';
      estrela.style.cursor = 'pointer';
      estrela.style.fontSize = '1.2rem';
    });
    const hidden = document.getElementById('nota-hidden');
    if (hidden) hidden.value = valor;
  }

  /* ========== FUNÇÕES DE BUSCA (INALTERADAS) ========== */
  async function buscarLivro() {
    const query = searchInput.value.trim();
    if (!query) {
      Util.toast('Digite um título ou ISBN', 'warning');
      return;
    }

    console.log(`🔎 Buscando: "${query}"`);
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Buscando...';
    searchResults = [];
    searchList.innerHTML = '';
    resultsDiv.classList.add('d-none');

    try {
      const isbn = query.replace(/[-\s]/g, '');
      if (/^\d{10,13}$/.test(isbn)) {
        console.log('→ Buscando como ISBN...');
        const book = await buscarPorISBN(isbn);
        if (book) searchResults.push(book);
      } else {
        console.log('→ Buscando por título/autor...');
        const results = await Promise.allSettled([
          buscarOpenLibrary(query),
          buscarGoogleBooks(query)
        ]);
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value) searchResults.push(r.value);
        });
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      Util.toast('Erro ao buscar. Tente novamente.', 'danger');
    }

    console.log(`📚 ${searchResults.length} resultado(s) encontrado(s).`);
    exibirResultados();
    searchBtn.disabled = false;
    searchBtn.innerHTML = '<i class="fas fa-search"></i> Buscar';
  }

  async function buscarOpenLibrary(query) {
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=5`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.docs || data.docs.length === 0) return null;

    const doc = data.docs[0];
    return {
      titulo: doc.title || '',
      subtitulo: doc.subtitle || '',
      autor: doc.author_name ? doc.author_name.join(', ') : '',
      editora: doc.publisher ? doc.publisher[0] : '',
      ano: doc.first_publish_year || '',
      isbn: doc.isbn ? doc.isbn[0] : '',
      numeroPaginas: doc.number_of_pages_median || '',
      idioma: doc.language ? doc.language[0] : '',
      urlCapa: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '',
      fonte: 'Open Library'
    };
  }

  async function buscarGoogleBooks(query) {
    const API_KEY = '';
    if (!API_KEY) {
      console.log('→ Google Books ignorado (sem chave API).');
      return null;
    }
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&key=${API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.items) return null;
    const vol = data.items[0].volumeInfo;

    return {
      titulo: vol.title || '',
      subtitulo: vol.subtitle || '',
      autor: vol.authors ? vol.authors.join(', ') : '',
      editora: vol.publisher || '',
      ano: vol.publishedDate ? vol.publishedDate.substring(0,4) : '',
      isbn: vol.industryIdentifiers ? vol.industryIdentifiers[0].identifier : '',
      numeroPaginas: vol.pageCount || '',
      idioma: vol.language || '',
      urlCapa: vol.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
      fonte: 'Google Books'
    };
  }

  async function buscarPorISBN(isbn) {
    let resp = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    if (resp.ok) {
      const data = await resp.json();
      return {
        titulo: data.title || '',
        subtitulo: data.subtitle || '',
        autor: data.authors ? data.authors.map(a => a.name).join(', ') : '',
        editora: data.publishers ? data.publishers[0] : '',
        ano: data.publish_date || '',
        isbn: isbn,
        numeroPaginas: data.number_of_pages || '',
        idioma: data.languages ? data.languages[0] : '',
        urlCapa: data.covers ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg` : '',
        fonte: 'Open Library (ISBN)'
      };
    }
    return await buscarGoogleBooks(`isbn:${isbn}`);
  }

  function exibirResultados() {
    searchList.innerHTML = '';
    if (searchResults.length === 0) {
      searchList.innerHTML = '<div class="text-muted p-2">Nenhum resultado encontrado.</div>';
    } else {
      searchResults.forEach((book, i) => {
        const item = document.createElement('div');
        item.className = 'list-group-item d-flex align-items-center';
        item.dataset.index = i;
        item.innerHTML = `
          <div class="me-3" style="width:40px; height:60px; background:var(--bg-secondary); overflow:hidden; border-radius:4px;">
            ${book.urlCapa ? `<img src="${book.urlCapa}" alt="Capa" style="width:100%; height:100%; object-fit:cover;">` : '<i class="fas fa-book fa-2x text-muted d-flex align-items-center justify-content-center h-100"></i>'}
          </div>
          <div>
            <strong>${Util.escapeHTML(book.titulo)}</strong><br>
            <small>${Util.escapeHTML(book.autor) || 'Autor desconhecido'} (${book.ano || '?'})</small>
            <span class="badge bg-secondary ms-2">${Util.escapeHTML(book.fonte)}</span>
          </div>`;
        searchList.appendChild(item);
      });
    }
    resultsDiv.classList.remove('d-none');
  }

  /* ========== PREENCHIMENTO DO FORMULÁRIO ========== */
  function preencherFormulario(book) {
    document.getElementById('titulo').value = book.titulo || '';
    document.getElementById('subtitulo').value = book.subtitulo || '';
    document.getElementById('autor').value = book.autor || '';
    document.getElementById('editora').value = book.editora || '';
    document.getElementById('ano').value = book.ano || '';
    document.getElementById('isbn').value = book.isbn || '';
    document.getElementById('idioma').value = book.idioma || 'Português';
    document.getElementById('nacionalidadeAutor').value = book.nacionalidadeAutor || '';
    document.getElementById('numeroPaginas').value = book.numeroPaginas || '';
    if (book.urlCapa) {
      urlCapa.value = book.urlCapa;
      mostrarCapa(book.urlCapa);
    }
    notaSelecionada = 0;
    const container = document.getElementById('nota-estrelas-container');
    if (container) atualizarEstrelasVisual(container, 0);
    Util.toast('Livro preenchido! Complete os campos pessoais.', 'success');
  }

  function preencherFormularioCompleto(livro) {
    document.getElementById('titulo').value = livro.Título || '';
    document.getElementById('subtitulo').value = livro.Subtítulo || '';
    document.getElementById('autor').value = livro.Autor || '';
    document.getElementById('editora').value = livro.Editora || '';
    document.getElementById('ano').value = livro.Ano || '';
    document.getElementById('edicao').value = livro.Edição || '';
    document.getElementById('isbn').value = livro.ISBN || '';
    document.getElementById('idioma').value = livro.Idioma || '';
    document.getElementById('classico').checked = livro.Clássico === 'true' || livro.Clássico === true;
    document.getElementById('nacionalidadeAutor').value = livro.NacionalidadeAutor || '';
    document.getElementById('numeroPaginas').value = livro.NúmeroPáginas || '';
    document.getElementById('formato').value = livro.Formato || 'Físico';
    document.getElementById('genero').value = livro.Gênero || '';
    document.getElementById('subgenero').value = livro.Subgênero || '';
    document.getElementById('status').value = livro.Status || 'Quero ler';
    // Nota antiga (0-10) é convertida para 0-5 (divisão por 2 e arredondamento para baixo)
    const notaOriginal = Number(livro.Nota) || 0;
    notaSelecionada = Math.min(5, Math.max(0, Math.floor(notaOriginal / 2)));
    const container = document.getElementById('nota-estrelas-container');
    if (container) atualizarEstrelasVisual(container, notaSelecionada);
    document.getElementById('preco').value = livro.Preço || '';
    document.getElementById('tags').value = livro.Tags || '';
    document.getElementById('observacoes').value = livro.Observações || '';
    document.getElementById('urlCapa').value = livro.URLCapa || livro.ImagemCapa || '';
    document.getElementById('paginasLidas').value = livro.PáginasLidas || 0;
    document.getElementById('paginasAnosAnteriores').value = livro.PaginasAnosAnteriores || 0;
    document.getElementById('favorito').checked = livro.Favorito === 'true' || livro.Favorito === true;
    if (livro.URLCapa || livro.ImagemCapa) {
      mostrarCapa(livro.URLCapa || livro.ImagemCapa);
    }
    document.getElementById('data-inicio').value = livro.DataInício || '';
    document.getElementById('data-termino').value = livro.DataTérmino || '';
  }

  function mostrarCapa(url) {
    coverPreview.innerHTML = url
      ? `<img src="${url}" alt="Capa do livro" class="img-fluid" onerror="this.parentElement.innerHTML='<span class=\'text-danger\'>Imagem inválida</span>'">`
      : '<span class="text-muted">Pré-visualização</span>';
  }

  /* ========== SALVAR / EDITAR / EXCLUIR ========== */
  async function salvarLivro(e) {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      Util.toast('Preencha os campos obrigatórios (Título e Autor).', 'warning');
      return;
    }

    const book = {
      titulo: document.getElementById('titulo').value,
      subtitulo: document.getElementById('subtitulo').value,
      autor: document.getElementById('autor').value,
      editora: document.getElementById('editora').value,
      classico: document.getElementById('classico').checked,
      ano: document.getElementById('ano').value,
      edicao: document.getElementById('edicao').value,
      isbn: document.getElementById('isbn').value,
      idioma: document.getElementById('idioma').value,
      nacionalidadeAutor: document.getElementById('nacionalidadeAutor').value,
      numeroPaginas: document.getElementById('numeroPaginas').value,
      formato: document.getElementById('formato').value,
      genero: document.getElementById('genero').value,
      subgenero: document.getElementById('subgenero').value,
      status: document.getElementById('status').value,
      nota: notaSelecionada,   // valor de 0 a 5
      favorito: document.getElementById('favorito').checked,
      preco: document.getElementById('preco').value,
      tags: document.getElementById('tags').value,
      observacoes: document.getElementById('observacoes').value,
      urlCapa: Util.converterLinkDrive(urlCapa.value),
      paginasLidas: Number(document.getElementById('paginasLidas').value) || 0,
      dataInicio: document.getElementById('data-inicio').value,
      paginasAnosAnteriores: Number(document.getElementById('paginasAnosAnteriores').value) || 0,
      dataTermino: document.getElementById('data-termino').value
    };

    const btnSubmit = form.querySelector('button[type="submit"]');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Salvando...';

    try {
      const isEdicao = !!editandoLivroID;
      let resposta;
      if (editandoLivroID) {
        resposta = await API.enviar({ acao: 'updateBook', id: editandoLivroID, book });
      } else {
        resposta = await API.enviar({ acao: 'addBook', book });
      }

      if (resposta && resposta.status === 'ok') {
        Util.toast(isEdicao ? 'Livro atualizado!' : 'Livro adicionado!', 'success');
        limparFormulario();
        cancelarEdicao();
        if (isEdicao) voltarParaBiblioteca();
      } else {
        throw new Error(resposta?.mensagem || resposta?.erro || 'Falha no servidor');
      }
    } catch (erro) {
      Util.toast('Erro ao salvar: ' + erro.message, 'danger');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = editandoLivroID
        ? '<i class="fas fa-save me-1"></i> Atualizar Livro'
        : '<i class="fas fa-save me-1"></i> Salvar Livro';
    }
  }

  function limparFormulario() {
    form.reset();
    form.classList.remove('was-validated');
    coverPreview.innerHTML = '<span class="text-muted">Pré-visualização</span>';
    searchResults = [];
    resultsDiv.classList.add('d-none');
    notaSelecionada = 0;
    const container = document.getElementById('nota-estrelas-container');
    if (container) atualizarEstrelasVisual(container, 0);
  }

  function cancelarEdicao() {
    editandoLivroID = null;
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.add('d-none');
    const btnSubmit = form.querySelector('button[type="submit"]');
    if (btnSubmit) btnSubmit.innerHTML = '<i class="fas fa-save me-1"></i> Salvar Livro';
    limparFormulario();
  }

  function voltarParaBiblioteca() {
    const link = document.querySelector('.nav-link[data-page="biblioteca"]');
    if (link) link.click();
    else {
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      const pageBiblioteca = document.getElementById('page-biblioteca');
      if (pageBiblioteca) {
        pageBiblioteca.classList.add('active');
        if (typeof Biblioteca !== 'undefined' && Biblioteca.init) Biblioteca.init();
      }
    }
  }

  function editarLivro(livro) {
    const formEl = document.getElementById('book-form');
    if (!formEl) {
      Util.toast('Erro: formulário de livro não encontrado.', 'danger');
      return;
    }
    if (!document.getElementById('cancel-edit-btn')) {
      criarBotaoCancelarEdicao();
    }
    preencherFormularioCompleto(livro);
    editandoLivroID = livro.ID;
    const btnSubmit = formEl.querySelector('button[type="submit"]');
    if (btnSubmit) btnSubmit.innerHTML = '<i class="fas fa-save me-1"></i> Atualizar Livro';
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.remove('d-none');
    document.querySelectorAll('.nav-link[data-page="adicionar"]').forEach(l => l.click());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function criarBotaoCancelarEdicao() {
    if (!document.getElementById('cancel-edit-btn')) {
      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.id = 'cancel-edit-btn';
      btnCancel.className = 'btn btn-outline-warning ms-2 d-none';
      btnCancel.textContent = 'Cancelar Edição';
      btnCancel.addEventListener('click', cancelarEdicao);
      const botoesDiv = document.querySelector('#book-form .d-flex');
      if (botoesDiv) {
        botoesDiv.prepend(btnCancel);
      }
    }
  }

  /* ========== ESCANEAMENTO DE ISBN (inalterado) ========== */
  async function escanearISBN() {
    if (typeof Quagga === 'undefined') {
      Util.toast('Biblioteca de escaneamento não carregada. Tente recarregar a página.', 'warning');
      return;
    }

    let modal = document.createElement('div');
    modal.className = 'scanner-modal position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-dark bg-opacity-75';
    modal.style.zIndex = '10000';
    modal.innerHTML = `
      <div id="scanner-container" style="max-width: 90%; max-height: 60vh; border-radius: 12px; overflow: hidden; position: relative;"></div>
      <p class="text-white mt-2">Aponte para o código de barras do livro</p>
      <button id="scanner-close" class="btn btn-light mt-2">Cancelar</button>
    `;
    document.body.appendChild(modal);

    document.getElementById('scanner-close').addEventListener('click', () => {
      Quagga.offDetected(aoDetectarCodigo);
      Quagga.stop();
      modal.remove();
    });

    Quagga.init({
      inputStream: {
        name: 'Live',
        type: 'LiveStream',
        target: document.getElementById('scanner-container'),
        constraints: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      },
      decoder: { readers: ['ean_reader', 'ean_8_reader'] }
    }, (err) => {
      if (err) {
        console.error('Erro ao iniciar Quagga:', err);
        Util.toast('Não foi possível acessar a câmera.', 'danger');
        modal.remove();
        return;
      }
      Quagga.start();
    });

    Quagga.onDetected(aoDetectarCodigo);
  }

  function aoDetectarCodigo(result) {
    if (result && result.codeResult && result.codeResult.code) {
      const isbn = result.codeResult.code;
      Quagga.offDetected(aoDetectarCodigo);
      Quagga.stop();
      document.querySelector('.scanner-modal')?.remove();
      searchInput.value = isbn;
      buscarLivro();
    }
  }

  // Inicialização
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, editarLivro, cancelarEdicao };
})();
