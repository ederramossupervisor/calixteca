const API = (() => {
  const BASE_URL = 'https://script.google.com/macros/s/AKfycbxeC5orW_66rJp8nwCSvIFZZBMVwq867BVuhby-i5LWHd3qYgT4ghAgrcArUrji7mdvjA/exec';

  // Token de autorização enviado em toda chamada — precisa ser IDÊNTICO ao
  // valor gravado no Code.gs via PropertiesService (função definirTokenApp).
  // Troque o valor abaixo pela mesma senha longa e única usada lá.
  const APP_TOKEN = 'Ecr@supervisor';

  // Ações somente-leitura: seguras para reaproveitar respostas recentes em
  // memória. Qualquer ação fora desta lista é tratada como mutação e limpa
  // o cache inteiro após concluir com sucesso.
    const ACOES_CACHEAVEIS = new Set([
    'getConfigs',
    'listAllBooks',
    'listBooks',
    'listarLocais',
    'listNotes',
    'listQuotes',
    'listWishes',
    'listLoans',
    'dashboard',
    'timelineAtividades'
  ]);

  const CACHE_TTL_MS = 45000; // 45s
  const cache = new Map(); // chave -> { timestamp, promise }

  let pendentes = 0;

  function despacharStatus(status) {
    window.dispatchEvent(new CustomEvent('api:status', { detail: { status } }));
  }

  function chaveCache(dados) {
    return JSON.stringify(dados);
  }

  async function enviar(dados, timeoutMs = 15000) {
    const acao = dados && dados.acao;
    const cacheavel = ACOES_CACHEAVEIS.has(acao);
    const chave = cacheavel ? chaveCache(dados) : null;

    if (cacheavel) {
      const entrada = cache.get(chave);
      if (entrada && (Date.now() - entrada.timestamp) < CACHE_TTL_MS) {
        // Reaproveita a chamada em andamento ou já resolvida recentemente,
        // sem novo round-trip pro Apps Script.
        return entrada.promise;
      }
    }

    const promise = executar(dados, timeoutMs);

    if (cacheavel) {
      cache.set(chave, { timestamp: Date.now(), promise });
      // Se a chamada falhar, não deixa uma resposta ruim "presa" no cache
      // pro próximo TTL inteiro.
      promise.catch(() => cache.delete(chave));
    } else {
      // Mutação: qualquer leitura cacheada pode estar desatualizada agora.
      promise.then(() => cache.clear()).catch(() => {});
    }

    return promise;
  }

  async function executar(dados, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const dadosComToken = { ...dados, token: APP_TOKEN };
    const params = new URLSearchParams({ data: JSON.stringify(dadosComToken) });
    const url = `${BASE_URL}?${params.toString()}`;

    pendentes++;
    despacharStatus('salvando');

    try {
      const resp = await fetch(url, { method: 'GET', signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      pendentes = Math.max(0, pendentes - 1);
      if (pendentes === 0) despacharStatus('sincronizado');
      return json;
    } catch (e) {
      pendentes = Math.max(0, pendentes - 1);
      const isAbort = e.name === 'AbortError';
      const isRede = isAbort || e instanceof TypeError;
      despacharStatus(isRede ? 'offline' : 'erro');
      if (isAbort) throw new Error('Tempo esgotado ao contatar o servidor.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function testarConexao() {
    try {
      const resp = await fetch(BASE_URL);
      return await resp.json();
    } catch (e) {
      return { status: 'erro', message: 'Sem comunicação.' };
    }
  }

  return { enviar, testarConexao };
})();
