/* Utilidades de sessao usadas pelas paginas do Curso de Eletricista. */

async function api(caminho, opcoes = {}) {
  const config = {
    method: opcoes.method || (opcoes.body ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }
  };
  if (opcoes.body !== undefined) config.body = JSON.stringify(opcoes.body);

  let resposta;
  try {
    resposta = await fetch(caminho, config);
  } catch (e) {
    return { ok: false, status: 0, dados: { success: false, message: 'Sem conexao com o servidor. Verifique sua internet e tente novamente.' } };
  }

  let dados = {};
  try {
    dados = await resposta.json();
  } catch (e) {
    dados = { success: false, message: 'Resposta inesperada do servidor.' };
  }
  return { ok: resposta.ok, status: resposta.status, dados };
}

async function usuarioAtual() {
  const r = await api('/api/auth/me');
  return r.ok && r.dados.user ? r.dados.user : null;
}

async function sair() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  window.location.href = '/index.html';
}

function mostrarAviso(el, tipo, html) {
  if (!el) return;
  el.className = 'aviso visivel ' + tipo;
  el.innerHTML = html;
}
function esconderAviso(el) {
  if (el) el.className = 'aviso';
}
function ocupado(botao, texto) {
  if (!botao) return;
  botao.dataset.textoOriginal = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = `<span class="carregando"></span> ${texto || 'Aguarde...'}`;
}
function liberarBotao(botao) {
  if (!botao) return;
  botao.disabled = false;
  if (botao.dataset.textoOriginal) botao.innerHTML = botao.dataset.textoOriginal;
}

function escaparHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
