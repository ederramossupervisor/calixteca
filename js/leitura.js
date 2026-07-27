const Leitura = (() => {
  const form = document.getElementById('session-form');
  const livroInput = document.getElementById('livro-select-input');
  const livroDatalist = document.getElementById('livros-datalist');
  const livroInfo = document.getElementById('livro-info');
  const refreshBtn = document.getElementById('refresh-books-btn');
  const dataInput = document.getElementById('data-sessao');
  const horaInicio = document.getElementById('hora-inicio');
  const horaFim = document.getElementById('hora-fim');
  const pagInicial = document.getElementById('pagina-inicial');
  const pagFinal = document.getElementById('pagina-final');
  const tempoCalculadoDiv = document.getElementById('tempo-calculado');
  const tempoMinSpan = document.getElementById('tempo-minutos');
  const pagLidasDiv = document.getElementById('paginas-calculadas');
  const pagLidasSpan = document.getElementById('paginas-lidas');
  const historicoContainer = document.getElementById('historico-sessoes');

  const display = document.getElementById('cronometro-display');
  const btnIniciar = document.getElementById('btn-iniciar');
  const btnPausar = document.getElementById('btn-pausar');
  const btnRetomar = document.getElementById('btn-retomar');
  const btnFinalizar = document.getElementById('btn-finalizar');

  let livrosCache = [];
  let editandoSessaoID = null;
  let livroMap = {};
  // Novas variáveis do cronômetro
  let cronometroAtivo = false;
  let inicioCronometro = null; // timestamp (ms) de quando iniciou/retomou
  let tempoAcumulado = 0;      // ms acumulados antes da última pausa
  let animFrameId = null;
  let recognition = null;
  let targetInput = null;

  // Container e template para múltiplas anotações
  let containerAnotacoes = null;
  let templateAnotacao = null;

  function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition não suportado neste navegador.');
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;

    recognition.addEventListener('result', (e) => {
      const transcript = e.results[0][0].transcript;
      if (targetInput) {
        targetInput.value += (targetInput.value ? ' ' : '') + transcript;
      }
    });

    recognition.addEventListener('end', () => {
      const btn = document.querySelector('.btn-recording');
      if (btn) {
        btn.classList.remove('btn-recording', 'btn-danger');
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
      }
      targetInput = null;
    });

    recognition.addEventListener('error', () => {
      const btn = document.querySelector('.btn-recording');
      if (btn) {
        btn.classList.remove('btn-recording', 'btn-danger');
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
      }
      targetInput = null;
    });
  }

  function formatarHora(input) {
    let valor = input.value.replace(/\D/g, '');
    if (valor.length > 4) valor = valor.slice(0, 4);
    if (valor.length > 2) valor = valor.slice(0, 2) + ':' + valor.slice(2);
    input.value = valor;
  }

  function sanitizarHora(valor) {
    if (!valor) return '';
    const match = valor.match(/(\d{2}):(\d{2})/);
    return match ? match[1] + ':' + match[2] : '';
  }

  function init() {
    if (!form) return;

    initSpeech();
    const hoje = new Date();
    const dia = String(hoje.getDate()).padStart(2, '0');
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const ano = hoje.getFullYear();
    dataInput.value = `${ano}-${mes}-${dia}`;

    horaInicio.addEventListener('input', () => formatarHora(horaInicio));
    horaFim.addEventListener('input', () => formatarHora(horaFim));

    horaInicio.addEventListener('blur', () => {
      if (horaInicio.value && !horaInicio.value.includes(':')) {
        horaInicio.value = horaInicio.value.padEnd(2, '0') + ':00';
        if (horaInicio.value.length > 5) horaInicio.value = horaInicio.value.slice(0, 5);
      }
      calcularTempo();
    });

    horaFim.addEventListener('blur', () => {
      if (horaFim.value && !horaFim.value.includes(':')) {
        horaFim.value = horaFim.value.padEnd(2, '0') + ':00';
        if (horaFim.value.length > 5) horaFim.value = horaFim.value.slice(0, 5);
      }
      calcularTempo();
    });

    livroInput.addEventListener('change', () => {
      const texto = livroInput.value.trim();
      const id = livroMap[texto];
      if (id) {
        const livro = livrosCache.find(l => l.ID === id);
        if (livro) {
          livroInfo.innerHTML = `
            <strong>${livro.Título}</strong> | ${livro.Autor}<br>
            Páginas totais: ${livro.NúmeroPáginas || '?'} | Status: ${livro.Status} | Lidas: ${livro.PáginasLidasAcumuladas || 0}
          `;
          atualizarMediaSession(livro); // Atualiza os metadados para a tela de bloqueio
        }
      } else {
        livroInfo.innerHTML = '';
      }
    });

    [pagInicial, pagFinal].forEach(el => el.addEventListener('input', calcularPaginas));
    refreshBtn.addEventListener('click', carregarLivros);
    form.addEventListener('submit', salvarSessao);
    document.getElementById('clear-session-btn')?.addEventListener('click', limparFormulario);

    btnIniciar.addEventListener('click', iniciarCronometro);
    btnPausar.addEventListener('click', pausarCronometro);
    btnRetomar.addEventListener('click', retomarCronometro);
    btnFinalizar.addEventListener('click', finalizarCronometro);

    // Configura múltiplas anotações
    containerAnotacoes = document.getElementById('anotacoes-sessao-container');
    templateAnotacao = document.getElementById('template-anotacao-item');
    adicionarItemAnotacao();
    document.getElementById('btn-adicionar-anotacao')?.addEventListener('click', () => {
      adicionarItemAnotacao();
    });

    // Sobrescreve limparFormulario para limpar itens extras
    const limparOriginal = limparFormulario;
    limparFormulario = function() {
      limparOriginal();
      if (containerAnotacoes) {
        containerAnotacoes.innerHTML = '';
        adicionarItemAnotacao();
      }
    };

    // Localização: preenche sugestões de locais já conhecidos e liga o botão de GPS
    carregarLocaisConhecidos();
    document.getElementById('btn-local-gps')?.addEventListener('click', usarLocalizacaoAtual);

    // Configurar Media Session para controles na tela de bloqueio
    configurarMediaSession();

    // Fallback defensivo: garante que o áudio fantasma continue tocando
    // mesmo se o loop nativo falhar em algum navegador/situação de fundo.
    const audioFantasma = document.getElementById('audio-fantasma');
    if (audioFantasma) {
      audioFantasma.addEventListener('ended', () => {
        if (cronometroAtivo) {
          audioFantasma.currentTime = 0;
          audioFantasma.play().catch(() => {});
        }
      });
    }

    // Listener de visibilidade para atualizar o display ao retornar
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && cronometroAtivo) {
        // Força atualização imediata
        const agora = Date.now();
        const totalMs = tempoAcumulado + (agora - inicioCronometro);
        const totalSeg = Math.floor(totalMs / 1000);
        const mins = Math.floor(totalSeg / 60);
        const secs = totalSeg % 60;
        display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        if (!animFrameId) atualizarDisplayLoop();
      }
    });

    carregarLivros();
    carregarHistorico();
    console.log('✅ Módulo Leitura pronto.');
  }

  function configurarMediaSession() {
  if (!('mediaSession' in navigator)) return;
  // Apenas configura os action handlers – não inicia áudio ainda.
  const actionHandlers = [
    ['play', () => { if (!cronometroAtivo) iniciarCronometro(); }],
    ['pause', () => { if (cronometroAtivo) pausarCronometro(); }],
    ['stop', () => { finalizarCronometro(); }]
  ];
  for (const [action, handler] of actionHandlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      console.log(`Media Session action ${action} not supported`);
    }
  }
}

  function atualizarMediaSession(livro) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: livro?.Título || 'Leitura',
      artist: livro?.Autor || 'Calixteca',
      artwork: [
        { src: livro?.URLCapa || 'img/icons/logo.png', sizes: '96x96', type: 'image/png' }
      ]
    });
  }

  // Garante que a metadata reflita o livro selecionado no momento em que o
  // cronômetro realmente inicia/retoma — antes ela só era setada no evento
  // "change" do datalist, então iniciar sem reselecionar deixava a metadata
  // vazia/desatualizada e o Android/iOS podem se recusar a mostrar os
  // controles na tela de bloqueio sem uma metadata válida.
  function atualizarMediaSessionAtual() {
    const texto = livroInput.value.trim();
    const id = livroMap[texto];
    const livro = livrosCache.find(l => l.ID === id);
    atualizarMediaSession(livro);
  }

  function adicionarItemAnotacao() {
    if (!templateAnotacao || !containerAnotacoes) return;

    const clone = templateAnotacao.content.cloneNode(true);
    const item = clone.querySelector('.anotacao-item');

    // Botão remover
    const btnRemover = item.querySelector('.btn-remover-anotacao');
    btnRemover.addEventListener('click', () => {
      if (containerAnotacoes.children.length > 1) {
        item.remove();
      } else {
        Util.toast('É necessário pelo menos um campo de anotação.', 'warning');
      }
    });

    // Configurar botão de voz para este item
    const btnVoz = item.querySelector('.btn-voz-obs');
    const textarea = item.querySelector('.texto-obs');
    btnVoz.addEventListener('click', () => {
      if (!recognition) {
        Util.toast('Reconhecimento de voz não suportado.', 'warning');
        return;
      }
      if (targetInput === textarea) {
        recognition.stop();
        return;
      }
      if (targetInput) recognition.stop();
      targetInput = textarea;
      btnVoz.innerHTML = '<i class="fas fa-stop"></i>';
      recognition.start();
    });

    // Configurar botão de OCR para este item
    const btnOcr = item.querySelector('.btn-ocr-obs');
    btnOcr.addEventListener('click', () => {
      if (typeof OCR !== 'undefined' && OCR.capturarECapturarTexto) {
        OCR.capturarECapturarTexto(textarea);
      } else {
        Util.toast('Funcionalidade de OCR não carregada.', 'warning');
      }
    });

    containerAnotacoes.appendChild(item);
  }

  function atualizarDisplayLoop() {
    if (!cronometroAtivo) return;
    const agora = Date.now();
    const totalMs = tempoAcumulado + (inicioCronometro ? agora - inicioCronometro : 0);
    const totalSeg = Math.floor(totalMs / 1000);
    const mins = Math.floor(totalSeg / 60);
    const secs = totalSeg % 60;
    display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    animFrameId = requestAnimationFrame(atualizarDisplayLoop);
  }

      function iniciarCronometro() {
    if (cronometroAtivo) return;
    if (tempoAcumulado === 0) {
      horaInicio.value = new Date().toTimeString().slice(0, 5);
    }
    inicioCronometro = Date.now();
    cronometroAtivo = true;
    display.classList.add('pulsando');
    btnIniciar.classList.add('d-none');
    btnPausar.classList.remove('d-none');
    btnRetomar.classList.add('d-none');
    btnFinalizar.classList.remove('d-none');
    horaInicio.disabled = true;
    horaFim.disabled = true;
    atualizarDisplayLoop();

    // Metadata precisa estar setada ANTES/junto do play() para o SO aceitar
    // o áudio como uma sessão de mídia válida e mostrar os controles.
    atualizarMediaSessionAtual();

    // Áudio fantasma: inicia e força loop (arquivo com duração real — ver silencio.wav)
    const audio = document.getElementById('audio-fantasma');
    if (audio) {
      audio.loop = true;
      audio.play().catch(() => {});
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  }

    function pausarCronometro() {
    if (!cronometroAtivo) return;
    cronometroAtivo = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    tempoAcumulado += Date.now() - inicioCronometro;
    inicioCronometro = null;
    display.classList.remove('pulsando');
    btnPausar.classList.add('d-none');
    btnRetomar.classList.remove('d-none');
    horaInicio.disabled = false;
    horaFim.disabled = false;

    const audio = document.getElementById('audio-fantasma');
    if (audio) audio.pause();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }

    function retomarCronometro() {
    if (cronometroAtivo) return;
    inicioCronometro = Date.now();
    cronometroAtivo = true;
    display.classList.add('pulsando');
    btnRetomar.classList.add('d-none');
    btnPausar.classList.remove('d-none');
    horaInicio.disabled = true;
    horaFim.disabled = true;
    atualizarDisplayLoop();

    atualizarMediaSessionAtual();

    const audio = document.getElementById('audio-fantasma');
    if (audio) {
      audio.loop = true;
      audio.play().catch(() => {});
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  }
  
    function finalizarCronometro() {
    if (cronometroAtivo) {
      cronometroAtivo = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      tempoAcumulado += Date.now() - inicioCronometro;
      inicioCronometro = null;
    }
    display.classList.remove('pulsando');
    const totalMs = tempoAcumulado;
    const totalSeg = Math.floor(totalMs / 1000);
    const mins = Math.floor(totalSeg / 60);
    const secs = totalSeg % 60;
    display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    horaFim.value = new Date().toTimeString().slice(0, 5);
    calcularTempo();
    btnIniciar.classList.remove('d-none');
    btnPausar.classList.add('d-none');
    btnRetomar.classList.add('d-none');
    btnFinalizar.classList.add('d-none');
    horaInicio.disabled = false;
    horaFim.disabled = false;

    const audio = document.getElementById('audio-fantasma');
    if (audio) audio.pause();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  }
  
    function resetarCronometro() {
    if (cronometroAtivo) {
      cronometroAtivo = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
    }
    tempoAcumulado = 0;
    inicioCronometro = null;
    display.textContent = '00:00';
    display.classList.remove('pulsando');
    btnIniciar.classList.remove('d-none');
    btnPausar.classList.add('d-none');
    btnRetomar.classList.add('d-none');
    btnFinalizar.classList.add('d-none');
    horaInicio.disabled = false;
    horaFim.disabled = false;
    horaInicio.value = '';
    horaFim.value = '';

    const audio = document.getElementById('audio-fantasma');
    if (audio) audio.pause();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
    }
  }
  
  async function carregarLivros() {
    try {
      livroInput.value = '';
      livroDatalist.innerHTML = '';
      const resp = await API.enviar({ acao: 'listBooks' });
      if (resp && Array.isArray(resp)) {
        livrosCache = resp;
        renderizarDatalist();
      }
    } catch (e) {
      Util.toast('Erro ao carregar livros', 'danger');
    }
  }

  function renderizarDatalist() {
    livroDatalist.innerHTML = '';
    livroMap = {};
    livrosCache.forEach(livro => {
      const option = document.createElement('option');
      const texto = `${livro.Título} - ${livro.Autor} (${livro.Status})`;
      option.value = texto;
      livroMap[texto] = livro.ID;
      livroDatalist.appendChild(option);
    });
  }

  function calcularTempo() {
    if (horaInicio.value && horaFim.value) {
      const [hi, mi] = horaInicio.value.split(':').map(Number);
      const [hf, mf] = horaFim.value.split(':').map(Number);
      if (!isNaN(hi) && !isNaN(mi) && !isNaN(hf) && !isNaN(mf)) {
        let minutos = (hf * 60 + mf) - (hi * 60 + mi);
        if (minutos < 0) minutos += 1440;
        tempoMinSpan.textContent = minutos;
        tempoCalculadoDiv.classList.remove('d-none');
      }
    }
  }

  function calcularPaginas() {
    const pi = parseInt(pagInicial.value) || 0;
    const pf = parseInt(pagFinal.value) || 0;
    if (pf > pi) {
      let lidas = pf - pi;
      if (pi > 0) lidas += 1;
      pagLidasSpan.textContent = Math.max(0, lidas);
      pagLidasDiv.classList.remove('d-none');
    }
  }

  // Preenche o datalist do campo Local com os nomes de locais que já têm
  // coordenadas salvas, para facilitar reaproveitar um local já cadastrado.
  async function carregarLocaisConhecidos() {
    try {
      const configs = await API.enviar({ acao: 'getConfigs' });
      const datalist = document.getElementById('locais-conhecidos-datalist');
      if (!datalist || !configs) return;
      datalist.innerHTML = '';
      Object.keys(configs)
        .filter(chave => chave.startsWith('local_coord_'))
        .forEach(chave => {
          const nome = chave.replace('local_coord_', '').replace(/_/g, ' ');
          const option = document.createElement('option');
          option.value = nome;
          datalist.appendChild(option);
        });
    } catch (e) {
      console.error('Erro ao carregar locais conhecidos:', e);
    }
  }

  // Captura a localização atual pelo GPS/rede do dispositivo e salva a
  // coordenada para o nome de local informado, sem precisar ir em
  // Configurações nem procurar as coordenadas manualmente.
  async function usarLocalizacaoAtual() {
    const inputLocal = document.getElementById('local-sessao');
    const status = document.getElementById('local-gps-status');
    const btn = document.getElementById('btn-local-gps');
    const nomeLocal = inputLocal.value.trim();

    if (!nomeLocal) {
      Util.toast('Digite o nome do local antes de usar a localização atual.', 'warning');
      inputLocal.focus();
      return;
    }

    if (!navigator.geolocation) {
      Util.toast('Seu navegador não suporta geolocalização.', 'danger');
      return;
    }

    const iconeOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    if (status) status.textContent = 'Obtendo localização...';

    navigator.geolocation.getCurrentPosition(
      async (posicao) => {
        try {
          const lat = posicao.coords.latitude.toFixed(6);
          const lng = posicao.coords.longitude.toFixed(6);
          const coordenada = `${lat},${lng}`;

          // Se o local já tem coordenada salva e é diferente, confirma antes de sobrescrever
          const configs = await API.enviar({ acao: 'getConfigs' });
          const chave = `local_coord_${nomeLocal.replace(/\s+/g, '_')}`;
          const existente = configs && configs[chave];
          if (existente && existente !== coordenada) {
            const confirmar = confirm(`"${nomeLocal}" já tem uma coordenada salva (${existente}). Substituir pela localização atual (${coordenada})?`);
            if (!confirmar) {
              if (status) status.textContent = '';
              return;
            }
          }

          const resp = await API.enviar({ acao: 'salvarCoordenadaLocal', local: nomeLocal, coordenada });
          if (resp && resp.status === 'ok') {
            Util.toast(`Localização "${nomeLocal}" registrada! Já vai aparecer no mapa.`, 'success');
            if (status) status.textContent = `📍 ${coordenada}`;
            carregarLocaisConhecidos();
          } else {
            Util.toast('Não foi possível salvar a localização.', 'danger');
          }
        } catch (e) {
          console.error('Erro ao salvar coordenada:', e);
          Util.toast('Erro ao salvar a localização.', 'danger');
        } finally {
          btn.disabled = false;
          btn.innerHTML = iconeOriginal;
        }
      },
      (erro) => {
        btn.disabled = false;
        btn.innerHTML = iconeOriginal;
        if (status) status.textContent = '';
        let msg = 'Não foi possível obter sua localização.';
        if (erro.code === erro.PERMISSION_DENIED) {
          msg = 'Permissão de localização negada. Habilite o acesso à localização para este site.';
        } else if (erro.code === erro.TIMEOUT) {
          msg = 'Tempo esgotado ao tentar obter sua localização.';
        }
        Util.toast(msg, 'danger');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function coletarAnotacoesDoForm(livroID) {
    const anotacoes = [];
    const itens = containerAnotacoes.querySelectorAll('.anotacao-item');
    itens.forEach(item => {
      const tipo = item.querySelector('.tipo-obs').value;
      const texto = item.querySelector('.texto-obs').value.trim();
      if (tipo && texto) {
        anotacoes.push({
          livroID,
          capitulo: item.querySelector('.capitulo-obs').value || '',
          pagina: item.querySelector('.pagina-obs').value || '',
          categoria: tipo,
          resumo: '',
          trecho: '',
          comentario: texto,
          imagem: ''
        });
      }
    });
    return anotacoes;
  }

  async function salvarSessao(e) {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      Util.toast('Preencha os campos obrigatórios.', 'warning');
      return;
    }

    // Edição de sessão existente offline continua bloqueada — sincronizar uma
    // atualização exige mais cuidado (a sessão original já pode ter mudado
    // no servidor nesse meio tempo), então por segurança só sessões NOVAS
    // entram na fila offline.
    if (!navigator.onLine && editandoSessaoID) {
      Util.toast('Você está offline. Conecte-se para editar uma sessão existente.', 'warning');
      return;
    }

    const textoSelecionado = livroInput.value.trim();
    const livroID = livroMap[textoSelecionado] || '';
    if (!livroID) {
      Util.toast('Selecione um livro.', 'warning');
      return;
    }

    const sessao = {
      livroID,
      data: dataInput.value,
      horaInicio: sanitizarHora(horaInicio.value),
      horaFim: sanitizarHora(horaFim.value),
      paginaInicial: pagInicial.value,
      paginaFinal: pagFinal.value,
      local: document.getElementById('local-sessao').value,
      humor: document.getElementById('humor').value,
      clima: document.getElementById('clima').value,
      distracoes: '',
      observacoes: '' // será ignorado, pois agora usamos múltiplas anotações
    };

    const btnSubmit = form.querySelector('button[type="submit"]');

    // Sem conexão e é uma sessão nova: em vez de recusar, guarda tudo
    // localmente numa fila e envia sozinho assim que a internet voltar.
    if (!navigator.onLine && !editandoSessaoID) {
      const anotacoesPendentes = coletarAnotacoesDoForm(livroID);
      await FilaOffline.adicionarSessaoPendente(sessao, anotacoesPendentes);
      Util.toast('Sem conexão — sessão salva no aparelho e será enviada automaticamente quando a internet voltar.', 'info');
      limparFormulario();
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Salvando...';

    try {
      let resposta;
      if (editandoSessaoID) {
        resposta = await API.enviar({ acao: 'updateSession', id: editandoSessaoID, sessao });
      } else {
        resposta = await API.enviar({ acao: 'addSession', sessao });
      }

      if (resposta && resposta.status === 'ok') {
        // Salva múltiplas anotações
        const anotacoesForm = coletarAnotacoesDoForm(livroID);
        for (const anot of anotacoesForm) {
          await API.enviar({ acao: 'addNote', anotacao: anot });
        }

        Util.toast(editandoSessaoID ? 'Sessão atualizada!' : 'Sessão registrada!', 'success');
        limparFormulario();
        editandoSessaoID = null;
        carregarHistorico();
        carregarLivros();
      } else {
        throw new Error(resposta?.erro || 'Falha no servidor');
      }
    } catch (erro) {
      // Se a chamada falhou por causa da rede (não um erro do servidor) e é
      // uma sessão nova, não perde o que a pessoa preencheu — guarda na fila
      // do mesmo jeito que faria se já tivesse detectado offline de início.
      const pareceFalhaDeRede = !navigator.onLine || erro instanceof TypeError;
      if (pareceFalhaDeRede && !editandoSessaoID) {
        const anotacoesPendentes = coletarAnotacoesDoForm(livroID);
        await FilaOffline.adicionarSessaoPendente(sessao, anotacoesPendentes);
        Util.toast('Falha de conexão — sessão salva no aparelho e será enviada automaticamente mais tarde.', 'info');
        limparFormulario();
      } else {
        Util.toast('Erro ao salvar: ' + erro.message, 'danger');
      }
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i class="fas fa-save me-1"></i> ' + (editandoSessaoID ? 'Atualizar Sessão' : 'Registrar Sessão');
    }
  }

  function limparFormulario() {
    form.reset();
    form.classList.remove('was-validated');
    const hojeLimpa = new Date();
    const diaLimpa = String(hojeLimpa.getDate()).padStart(2, '0');
    const mesLimpa = String(hojeLimpa.getMonth() + 1).padStart(2, '0');
    const anoLimpa = hojeLimpa.getFullYear();
    dataInput.value = `${anoLimpa}-${mesLimpa}-${diaLimpa}`;
    tempoCalculadoDiv.classList.add('d-none');
    pagLidasDiv.classList.add('d-none');
    livroInfo.innerHTML = '';
    editandoSessaoID = null;
    resetarCronometro();
    // Limpa anotações extras e adiciona um item vazio
    if (containerAnotacoes) {
      containerAnotacoes.innerHTML = '';
      adicionarItemAnotacao();
    }
  }

  async function carregarHistorico() {
    if (!historicoContainer) return;
    let sessoes = [];
    try {
      const resp = await API.enviar({ acao: 'listRecentSessions' });
      if (Array.isArray(resp)) {
        sessoes = resp;
        DB.salvarSessoes(resp).catch(e => console.warn('Cache sessões falhou:', e));
      }
    } catch (e) {
      console.warn('Falha na API, tentando cache offline...');
      sessoes = await DB.obterSessoes();
      if (sessoes.length > 0) {
        Util.toast('Modo offline - dados do último acesso.', 'info');
      }
    }

    if (sessoes.length > 0) {
      historicoContainer.innerHTML = '';
      const mapaTitulos = {};
      livrosCache.forEach(l => mapaTitulos[l.ID] = l.Título || 'Sem título');

      sessoes.slice(0, 20).forEach(sess => {
        const dataFormatada = sess.Data ? new Date(sess.Data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '?';
        const pi = sess.PáginaInicial || '?';
        const pf = sess.PáginaFinal || '?';
        const pagLidas = sess.PáginasLidas || 0;
        const tempo = sess.Tempo ? `${sess.Tempo} min` : '';
        const nomeLivro = mapaTitulos[sess.LivroID] || 'Desconhecido';

        const div = document.createElement('div');
        div.className = 'd-flex justify-content-between align-items-center p-2 border-bottom';
        div.innerHTML = `
          <div>
            <strong>${nomeLivro}</strong><br>
            <small>${dataFormatada} - Pág. ${pi}-${pf} (${pagLidas} pág) ${tempo}</small>
            ${sess.Local ? `<br><small class="text-muted">Local: ${sess.Local}</small>` : ''}
          </div>
          <div>
            <button class="btn btn-sm btn-outline-secondary btn-editar-sessao" data-id="${sess.ID}"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger btn-excluir-sessao" data-id="${sess.ID}"><i class="fas fa-trash"></i></button>
          </div>`;
        historicoContainer.appendChild(div);
      });

      document.querySelectorAll('.btn-editar-sessao').forEach(btn => btn.addEventListener('click', () => editarSessao(btn.dataset.id, sessoes)));
      document.querySelectorAll('.btn-excluir-sessao').forEach(btn => btn.addEventListener('click', () => excluirSessao(btn.dataset.id)));
    }
  }

  function editarSessao(id, lista) {
    const sess = lista.find(s => s.ID === id);
    if (!sess) return;
    editandoSessaoID = id;
    const livroEdit = livrosCache.find(l => l.ID === sess.LivroID);
    if (livroEdit) {
      livroInput.value = `${livroEdit.Título} - ${livroEdit.Autor} (${livroEdit.Status})`;
      atualizarMediaSession(livroEdit);
    }
    dataInput.value = sess.Data;
    horaInicio.value = sess.HoraInício || '';
    horaFim.value = sess.HoraFim || '';
    pagInicial.value = sess.PáginaInicial;
    pagFinal.value = sess.PáginaFinal;
    document.getElementById('local-sessao').value = sess.Local || '';
    document.getElementById('humor').value = sess.Humor || '';
    document.getElementById('clima').value = sess.Clima || '';

    // Limpa e adiciona um campo de anotação vazio (edição de anotações não é suportada nessa versão)
    if (containerAnotacoes) {
      containerAnotacoes.innerHTML = '';
      adicionarItemAnotacao();
    }

    calcularTempo();
    calcularPaginas();
    form.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save me-1"></i> Atualizar Sessão';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function excluirSessao(id) {
    if (!navigator.onLine) {
      Util.toast('Você está offline. Conecte-se para excluir sessões.', 'warning');
      return;
    }
    if (confirm('Excluir esta sessão?')) {
      try {
        await API.enviar({ acao: 'deleteSession', id });
        carregarHistorico();
        carregarLivros();
        Util.toast('Sessão excluída', 'info');
      } catch (e) {
        Util.toast('Erro ao excluir: ' + e.message, 'danger');
      }
    }
  }

  return { init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Leitura.init);
} else {
  Leitura.init();
}
