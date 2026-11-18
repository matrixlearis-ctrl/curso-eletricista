/**
 * Curso de Eletricista - backend (modelo LotoBot)
 * Node.js + Express + Supabase (Postgres via REST) + PagBank Pix + Resend
 *
 * Variaveis de ambiente: veja .env.example
 */
require('dotenv').config();

const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ---------------------------------------------------------------- config
const PORT = Number(process.env.PORT || 3000);
// PUBLIC_BASE_URL: em producao use https://learis.com.br.
// Na Vercel, se nao estiver definida, cai no dominio do deploy (preview funciona).
const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${PORT}`)
).replace(/\/+$/, '');
// PagBank (PagSeguro): Order API com Pix. Sandbox e producao usam bases diferentes.
const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN || '';
const PAGBANK_ENV = String(process.env.PAGBANK_ENV || 'production').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
const PAGBANK_API_BASE = PAGBANK_ENV === 'sandbox' ? 'https://sandbox.api.pagseguro.com' : 'https://api.pagseguro.com';
const PAGBANK_WEBHOOK_URL = String(process.env.PAGBANK_WEBHOOK_URL || `${PUBLIC_BASE_URL}/api/pagbank/webhook`);
const PAGBANK_EXPIRACAO_MINUTOS = Math.max(5, Number(process.env.PAGBANK_EXPIRACAO_MINUTOS || 30));
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Curso de Eletricista <no-reply@learis.com.br>';
const VALOR_ACESSO = Number(process.env.VALOR_ACESSO || 16.9);
const DESCRICAO_PAGAMENTO = process.env.DESCRICAO_PAGAMENTO || 'Curso de Eletricista - Acesso completo';
const SESSAO_DIAS = Number(process.env.SESSAO_DIAS || 30);
const COOKIE_NAME = 'learis_sessao';
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOW_DEV_PAYMENT = process.env.ALLOW_DEV_PAYMENT === '1' && !IS_PROD;

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://vvsyquozzttiivgsswfz.supabase.co').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BANCO_CONFIGURADO = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

// ---------------------------------------------------------------- util
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}
function novoTok() {
  return crypto.randomBytes(32).toString('hex');
}
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  return `scrypt$${hash}$${salt}`;
}
function verificarSenha(senha, armazenado) {
  try {
    const partes = String(armazenado).split('$');
    if (partes[0] !== 'scrypt') return false;
    const candidato = crypto.scryptSync(String(senha), partes[2], 64).toString('hex');
    const a = Buffer.from(partes[1], 'hex');
    const b = Buffer.from(candidato, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function emailValido(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || ''));
}
function seguroIgual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cpfValido(cpf) {
  const numeric = String(cpf || '').replace(/\D/g, '');
  if (numeric.length !== 11 || /^(\d)\1{10}$/.test(numeric)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(numeric[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    if (Number(numeric[tamanho]) !== (resto === 10 ? 0 : resto)) return false;
  }
  return true;
}
function ipDo(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim().replace(/^::ffff:/, '');
  if (fwd) return fwd;
  return String(req.ip || '').replace(/^::ffff:/, '') || 'desconhecido';
}
function lerCookies(req) {
  const bruto = String(req.headers.cookie || '');
  const out = {};
  bruto.split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i < 0) return;
    const k = par.slice(0, i).trim();
    const v = par.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}
function tokenDaRequisicao(req) {
  const header = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (header) return header;
  return lerCookies(req)[COOKIE_NAME] || '';
}
function definirCookieSessao(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PUBLIC_BASE_URL.startsWith('https://'),
    maxAge: SESSAO_DIAS * 24 * 3600 * 1000,
    path: '/'
  });
}
function limparCookieSessao(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}
function agoraISO() {
  return new Date().toISOString();
}

// Limite simples em memoria (anti forca bruta)
const tentativas = new Map();
function limitar(req, res, next) {
  const chave = ipDo(req);
  const agora = Date.now();
  const janela = 15 * 60 * 1000;
  const atual = tentativas.get(chave) || { inicio: agora, total: 0 };
  if (agora - atual.inicio > janela) {
    atual.inicio = agora;
    atual.total = 0;
  }
  atual.total += 1;
  tentativas.set(chave, atual);
  // 240/15min (~16/min) acomoda o polling de status sem bloquear o aluno.
  if (atual.total > 240) {
    return res.status(429).json({ success: false, message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  }
  next();
}

// ---------------------------------------------------------------- Supabase (PostgREST)
function sbHeaders(extra) {
  return Object.assign(
    {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    extra || {}
  );
}

async function sbFetch(caminho, opcoes = {}) {
  const url = `${SUPABASE_URL}/rest/v1${caminho}`;
  const metodo = opcoes.method || 'GET';
  const config = {
    method: metodo,
    headers: sbHeaders(opcoes.headers),
    body: opcoes.body === undefined ? undefined : JSON.stringify(opcoes.body)
  };

  // Retry curto para erros transitorios do gateway
  let ultimaResposta = null;
  let ultimoErro = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const resposta = await fetch(url, config);
      if (resposta.status < 500) return resposta;
      ultimaResposta = resposta;
      if (metodo !== 'GET') break;
    } catch (e) {
      ultimoErro = e;
    }
    await new Promise((r) => setTimeout(r, 250 * (tentativa + 1)));
  }
  if (ultimaResposta) return ultimaResposta;
  throw ultimoErro || new Error('Falha ao falar com o Supabase.');
}

async function sbJson(caminho, opcoes = {}) {
  const resposta = await sbFetch(caminho, opcoes);
  const texto = await resposta.text();
  let dados = null;
  if (texto) {
    try {
      dados = JSON.parse(texto);
    } catch {
      dados = null;
    }
  }
  if (!resposta.ok) {
    const detalhe = (dados && (dados.message || dados.hint || dados.details)) || `Supabase ${resposta.status}`;
    const erro = new Error(detalhe);
    erro.status = resposta.status;
    erro.codigo = dados && dados.code;
    throw erro;
  }
  return dados;
}

// select
function sbSelect(tabela, filtros, selecao = '*', limite = 1) {
  return sbJson(`/${tabela}?${filtros}&select=${encodeURIComponent(selecao)}&limit=${limite}`);
}
// insert (retorna as linhas inseridas)
function sbInsert(tabela, dados) {
  return sbJson(`/${tabela}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: dados
  });
}
// update
function sbUpdate(tabela, filtros, dados) {
  return sbJson(`/${tabela}?${filtros}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: dados
  });
}
// delete
function sbDelete(tabela, filtros) {
  return sbJson(`/${tabela}?${filtros}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
}

function bancoIndisponivel(res) {
  res.status(500).json({
    success: false,
    message: 'Banco de dados nao configurado. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env e reinicie o servidor.'
  });
}

// ---------------------------------------------------------------- usuarios
function usuarioPublico(u) {
  if (!u) return null;
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    confirmado: !!u.confirmado,
    liberado: !!u.liberado,
    liberado_em: u.liberado_em || null
  };
}
async function usuarioPorEmail(email) {
  const linhas = await sbSelect('usuarios', `email=eq.${encodeURIComponent(String(email).toLowerCase())}`, '*', 1);
  return (linhas && linhas[0]) || null;
}
async function usuarioPorId(id) {
  const linhas = await sbSelect('usuarios', `id=eq.${encodeURIComponent(id)}`, '*', 1);
  return (linhas && linhas[0]) || null;
}
async function usuarioDaRequisicao(req) {
  const token = tokenDaRequisicao(req);
  if (!token) return null;
  const sessoes = await sbSelect('sessoes', `token_hash=eq.${sha256(token)}`, 'user_id,expira_em', 1);
  if (!sessoes || !sessoes.length) return null;
  if (new Date(sessoes[0].expira_em) < new Date()) return null;
  return usuarioPorId(sessoes[0].user_id);
}
async function criarSessao(res, userId) {
  const token = novoTok();
  await sbInsert('sessoes', {
    token_hash: sha256(token),
    user_id: userId,
    expira_em: new Date(Date.now() + SESSAO_DIAS * 86400000).toISOString()
  });
  definirCookieSessao(res, token);
  return token;
}
async function criarEmailToken(userId, tipo, horas) {
  const token = novoTok();
  await sbInsert('email_tokens', {
    user_id: userId,
    tipo,
    token_hash: sha256(token),
    expira_em: new Date(Date.now() + horas * 3600000).toISOString()
  });
  return token;
}
async function buscarEmailToken(token, tipo) {
  const linhas = await sbSelect(
    'email_tokens',
    `token_hash=eq.${sha256(token)}&tipo=eq.${encodeURIComponent(tipo)}&usado=eq.false`,
    'id,user_id,expira_em,tipo,usado',
    1
  );
  const linha = linhas && linhas[0];
  if (!linha) return null;
  if (new Date(linha.expira_em) < new Date()) return null;
  return linha;
}
async function marcarEmailTokenUsado(id) {
  await sbUpdate('email_tokens', `id=eq.${encodeURIComponent(id)}`, { usado: true });
}
async function liberarUsuario(userId) {
  await sbUpdate('usuarios', `id=eq.${encodeURIComponent(userId)}`, {
    liberado: true,
    liberado_em: agoraISO()
  });
}

async function limparExpirados() {
  if (!BANCO_CONFIGURADO) return;
  const agora = encodeURIComponent(agoraISO());
  try {
    await sbDelete('sessoes', `expira_em=lt.${agora}`);
    await sbDelete('email_tokens', `expira_em=lt.${agora}`);
  } catch (e) {
    console.warn('[LIMPEZA]', e.message);
  }
}
// Na Vercel (serverless) o processo dorme entre requisicoes, entao essa limpeza
// periodica so roda em servidor tradicional. As consultas ja ignoram expirados.
if (!process.env.VERCEL) {
  setTimeout(limparExpirados, 5000).unref?.();
  setInterval(limparExpirados, 6 * 3600 * 1000).unref?.();
}

// ---------------------------------------------------------------- e-mail
async function enviarEmail(para, assunto, html) {
  if (!RESEND_API_KEY) {
    console.warn(`[EMAIL] RESEND_API_KEY nao configurada - e-mail NAO enviado para ${para} | ${assunto}`);
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [para], subject: assunto, html })
    });
    if (!r.ok) {
      console.warn('[EMAIL] Resend erro', r.status, (await r.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[EMAIL] Falha no Resend:', e.message);
    return false;
  }
}

const marca = (texto) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
     <h2 style="color:#16a34a;margin:0 0 8px">${esc(texto)}</h2>`;
function botao(link, texto) {
  return `<p style="margin:24px 0"><a href="${link}" style="background:#16a34a;color:#fff;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">${esc(texto)}</a></p>
          <p style="color:#64748b;font-size:13px;word-break:break-all">Se o botao nao funcionar, copie e cole este link no navegador:<br>${link}</p>`;
}
function htmlConfirmacao(link, nome) {
  return `${marca('Confirme seu cadastro')}
    <p>Ola, <b>${esc(nome)}</b>!</p>
    <p>Recebemos seu cadastro no <b>Curso de Eletricista</b>. Confirme seu e-mail para liberar o acesso:</p>
    ${botao(link, 'Confirmar meu e-mail')}
    <p style="color:#94a3b8;font-size:13px">Este link vale por 24 horas. Se voce nao fez este cadastro, ignore este e-mail.</p>
  </div>`;
}
function htmlRecuperacao(link) {
  return `${marca('Redefinir sua senha')}
    <p>Recebemos um pedido para redefinir a senha da sua conta no <b>Curso de Eletricista</b>.</p>
    ${botao(link, 'Criar nova senha')}
    <p style="color:#94a3b8;font-size:13px">O link vale por 1 hora. Se voce nao pediu, ignore este e-mail.</p>
  </div>`;
}
function htmlLiberado(link, nome) {
  return `${marca('Acesso liberado!')}
    <p>Ola, <b>${esc(nome || '')}</b>!</p>
    <p>Seu pagamento foi confirmado e o acesso ao <b>Curso de Eletricista</b> esta liberado.</p>
    ${botao(link, 'Entrar e assistir as aulas')}
  </div>`;
}

// ---------------------------------------------------------------- pagamento (PagBank)
function pagbankHeaders() {
  // O PagBank responde 406 em GET /charges quando recebe Accept: application/json.
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${PAGBANK_TOKEN}` };
}

function pagbankErro(dados, status) {
  const msg = dados && dados.error_messages && dados.error_messages[0] && dados.error_messages[0].description;
  return new Error(msg || (dados && dados.message) || `PagBank respondeu ${status}`);
}

function pagbankStatusLocal(status) {
  if (status === 'PAID') return 'approved';
  if (status === 'CANCELED' || status === 'DECLINED') return 'canceled';
  return 'pending';
}

async function pagbankConsultarCharge(chargeId) {
  if (!PAGBANK_TOKEN || !chargeId) return null;
  const resposta = await fetch(`${PAGBANK_API_BASE}/charges/${encodeURIComponent(chargeId)}`, {
    headers: pagbankHeaders()
  });
  if (!resposta.ok) return null;
  return resposta.json().catch(() => ({}));
}

async function pagbankImagemQr(charge) {
  const link = (charge.links || []).find((l) => l.rel === 'QRCODE.BASE64' && l.href);
  if (!link) return null;
  try {
    const resposta = await fetch(link.href, { headers: pagbankHeaders() });
    if (!resposta.ok) return null;
    let texto = (await resposta.text()).trim();
    if (texto.startsWith('{')) {
      try {
        const obj = JSON.parse(texto);
        texto = obj.base64 || obj.qr_code_base64 || '';
      } catch { texto = ''; }
    }
    texto = String(texto).replace(/^data:image\/png;base64,/i, '').replace(/\s/g, '');
    return texto || null;
  } catch {
    return null;
  }
}

async function pagbankCriarPix({ userId, nome, email, cpf, valor, descricao }) {
  if (!/^https:\/\//i.test(PAGBANK_WEBHOOK_URL)) {
    throw new Error('PAGBANK_WEBHOOK_URL precisa ser uma URL HTTPS publica (ex.: https://learis.com.br/api/pagbank/webhook).');
  }
  const valorCentavos = Math.round(Number(valor) * 100);
  if (!(valorCentavos > 0)) throw new Error('Valor invalido para gerar o Pix.');
  const expiraEm = new Date(Date.now() + PAGBANK_EXPIRACAO_MINUTOS * 60000).toISOString();

  const resposta = await fetch(`${PAGBANK_API_BASE}/orders`, {
    method: 'POST',
    headers: Object.assign({}, pagbankHeaders(), { 'X-Idempotency-Key': crypto.randomUUID() }),
    body: JSON.stringify({
      reference_id: userId,
      customer: { name: nome, email, tax_id: cpf },
      items: [{ reference_id: userId, name: descricao, quantity: 1, unit_amount: valorCentavos }],
      charges: [{
        reference_id: userId,
        description: descricao,
        amount: { value: valorCentavos, currency: 'BRL' },
        payment_method: { type: 'PIX', pix: { expiration_date: expiraEm } }
      }],
      notification_urls: [PAGBANK_WEBHOOK_URL]
    })
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw pagbankErro(dados, resposta.status);

  const charge = (dados.charges && dados.charges[0]) || {};
  if (charge.status === 'DECLINED') throw new Error('O PagBank nao autorizou a geracao do Pix. Tente novamente.');
  const chargeId = String(charge.id || '');
  if (!chargeId) throw new Error('O PagBank nao devolveu o identificador da cobranca.');

  return {
    chargeId,
    pedidoId: String(dados.id || ''),
    status: pagbankStatusLocal(charge.status || 'WAITING'),
    qrCode: (charge.qr_code && charge.qr_code.text) || null,
    qrCodeBase64: await pagbankImagemQr(charge)
  };
}

// ---------------------------------------------------------------- middlewares
const api = express.Router();
// Guarda o corpo bruto para validar a assinatura SHA256 dos webhooks do PagBank.
app.use('/api', limitar, express.json({
  limit: '200kb',
  verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); }
}), api);

async function requireAuth(req, res, next) {
  if (!BANCO_CONFIGURADO) return bancoIndisponivel(res);
  try {
    const u = await usuarioDaRequisicao(req);
    if (!u) return res.status(401).json({ success: false, message: 'Sessao invalida ou expirada. Entre novamente.' });
    req.usuario = u;
    next();
  } catch (e) {
    console.error('[AUTH]', e.message);
    res.status(500).json({ success: false, message: 'Erro ao validar a sessao.' });
  }
}

// ---------------------------------------------------------------- auth
api.post('/auth/cadastro', async (req, res) => {
  if (!BANCO_CONFIGURADO) return bancoIndisponivel(res);

  const nome = String((req.body || {}).nome || '').trim();
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const senha = String((req.body || {}).senha || '');
  const ip = ipDo(req);

  if (!nome) return res.status(400).json({ success: false, message: 'Informe seu nome.' });
  if (!emailValido(email)) return res.status(400).json({ success: false, message: 'E-mail invalido.' });
  if (senha.length < 6) return res.status(400).json({ success: false, message: 'A senha precisa ter no minimo 6 caracteres.' });

  try {
    if (await usuarioPorEmail(email)) {
      return res.status(409).json({ success: false, message: 'Ja existe uma conta com este e-mail. Faca login ou recupere sua senha.' });
    }

    const inseridos = await sbInsert('usuarios', {
      nome,
      email,
      senha_hash: hashSenha(senha),
      confirmado: false,
      liberado: false,
      criado_ip: ip
    });
    const usuario = inseridos && inseridos[0];
    if (!usuario) return res.status(500).json({ success: false, message: 'Nao foi possivel criar a conta agora.' });

    const token = await criarEmailToken(usuario.id, 'confirmar', 24);
    const link = `${PUBLIC_BASE_URL}/confirmar-email.html?t=${token}`;
    await enviarEmail(email, 'Confirme seu cadastro - Curso de Eletricista', htmlConfirmacao(link, nome));

    const resposta = {
      success: true,
      message: 'Cadastro criado! Enviamos um e-mail de confirmacao (confira tambem o spam).'
    };
    if (!IS_PROD) resposta.linkDev = link;
    res.json(resposta);
  } catch (e) {
    console.error('[CADASTRO]', e.message);
    if (e.codigo === '23505') {
      return res.status(409).json({ success: false, message: 'Ja existe uma conta com este e-mail.' });
    }
    res.status(500).json({ success: false, message: 'Erro interno ao criar a conta.' });
  }
});

api.get('/auth/confirmar-email', async (req, res) => {
  if (!BANCO_CONFIGURADO) return bancoIndisponivel(res);
  const t = String(req.query.t || '');
  if (!t) return res.status(400).json({ success: false, message: 'Link invalido.' });
  try {
    const linha = await buscarEmailToken(t, 'confirmar');
    if (!linha) return res.status(400).json({ success: false, message: 'Link invalido, expirado ou ja utilizado.' });
    await sbUpdate('usuarios', `id=eq.${encodeURIComponent(linha.user_id)}`, { confirmado: true });
    await marcarEmailTokenUsado(linha.id);
    res.json({ success: true, message: 'E-mail confirmado! Agora faca login para continuar.' });
  } catch (e) {
    console.error('[CONFIRMAR]', e.message);
    res.status(500).json({ success: false, message: 'Erro ao confirmar o e-mail.' });
  }
});

api.post('/auth/reenviar-confirmacao', async (req, res) => {
  if (!BANCO_CONFIGURADO) return bancoIndisponivel(res);
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!emailValido(email)) return res.status(400).json({ success: false, message: 'E-mail invalido.' });
  const generico = { success: true, message: 'Se existir uma conta pendente com este e-mail, reenviamos o link de confirmacao.' };
  try {
    const u = await usuarioPorEmail(email);
    if (!u) return res.json(generico);
    if (u.confirmado) return res.json({ success: true, message: 'Este e-mail ja esta confirmado. Faca login para continuar.' });
    const token = await criarEmailToken(u.id, 'confirmar', 24);
    const link = `${PUBLIC_BASE_URL}/confirmar-email.html?t=${token}`;
    await enviarEmail(u.email, 'Confirme seu cadastro - Curso de Eletricista', htmlConfirmacao(link, u.nome));
    if (!IS_PROD) generico.linkDev = link;
    res.json(generico);
  } catch (e) {
    console.error('[REENVIAR]', e.message);
    res.json(generico);
  }
});

api.post('/auth/login', async (req, res) => {
  if (!BANCO_CONFIGURADO) return bancoIndisponivel(res);
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const senha = String((req.body || {}).senha || '');
  if (!email || !senha) return res.status(400).json({ success: false, message: 'Informe e-mail e senha.' });
  try {
    const u = await usuarioPorEmail(email);
    if (!u || !verificarSenha(senha, u.senha_hash)) {
      return res.status(401).json({ success: false, message: 'E-mail ou senha incorretos.' });
    }
    if (!u.confirmado) {
      return res.status(403).json({ success: false, message: 'Confirme seu e-mail antes de entrar.', precisaConfirmar: true });
    }
    const token = await criarSessao(res, u.id);
    res.json({ success: true, token, user: usuarioPublico(u) });
  } catch (e) {
    console.error('[LOGIN]', e.message);
    res.status(500).json({ success: false, message: 'Erro interno ao entrar.' });
  }
});

api.post('/auth/logout', async (req, res) => {
  const token = tokenDaRequisicao(req);
  if (token && BANCO_CONFIGURADO) {
    try {
      await sbDelete('sessoes', `token_hash=eq.${sha256(token)}`);
    } catch (e) {
      console.warn('[LOGOUT]', e.message);
    }
  }
  limparCookieSessao(res);
  res.json({ success: true });
});

api.get('/auth/me', requireAuth, (req, res) => {
  res.json({ success: true, user: usuarioPublico(req.usuario) });
});

api.post('/auth/solicitar-recuperacao', async (req, res) => {
  if (!BANCO_CONFIGURADO) return bancoIndisponivel(res);
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const generico = { success: true, message: 'Se existir uma conta com este e-mail, enviamos um link de recuperacao.' };
  if (!emailValido(email)) return res.json(generico);
  try {
    const u = await usuarioPorEmail(email);
    if (u) {
      const token = await criarEmailToken(u.id, 'recuperar', 1);
      const link = `${PUBLIC_BASE_URL}/redefinir-senha.html?t=${token}`;
      await enviarEmail(u.email, 'Redefinir sua senha - Curso de Eletricista', htmlRecuperacao(link));
      if (!IS_PROD) generico.linkDev = link;
    }
    res.json(generico);
  } catch (e) {
    console.error('[RECUPERAR]', e.message);
    res.json(generico);
  }
});

api.post('/auth/redefinir-senha', async (req, res) => {
  if (!BANCO_CONFIGURADO) return bancoIndisponivel(res);
  const t = String((req.body || {}).t || '');
  const senha = String((req.body || {}).senha || '');
  if (!t) return res.status(400).json({ success: false, message: 'Link invalido.' });
  if (senha.length < 6) return res.status(400).json({ success: false, message: 'A senha precisa ter no minimo 6 caracteres.' });
  try {
    const linha = await buscarEmailToken(t, 'recuperar');
    if (!linha) return res.status(400).json({ success: false, message: 'Link invalido, expirado ou ja utilizado.' });
    await sbUpdate('usuarios', `id=eq.${encodeURIComponent(linha.user_id)}`, { senha_hash: hashSenha(senha) });
    await marcarEmailTokenUsado(linha.id);
    await sbDelete('sessoes', `user_id=eq.${encodeURIComponent(linha.user_id)}`);
    res.json({ success: true, message: 'Senha alterada! Faca login novamente.' });
  } catch (e) {
    console.error('[REDEFINIR]', e.message);
    res.status(500).json({ success: false, message: 'Erro ao redefinir a senha.' });
  }
});

// ---------------------------------------------------------------- pix
api.get('/config', (req, res) => {
  res.json({
    success: true,
    valor: VALOR_ACESSO,
    descricao: DESCRICAO_PAGAMENTO,
    site: 'Curso de Eletricista',
    baseUrl: PUBLIC_BASE_URL,
    devPayment: ALLOW_DEV_PAYMENT,
    pagamento: 'pagbank',
    banco: BANCO_CONFIGURADO ? 'supabase' : 'nao-configurado'
  });
});

api.get('/health', async (req, res) => {
  const info = {
    success: true,
    banco: BANCO_CONFIGURADO ? 'supabase' : 'nao-configurado',
    supabaseUrl: SUPABASE_URL,
    pagBank: Boolean(PAGBANK_TOKEN),
    pagBankAmbiente: PAGBANK_ENV,
    email: Boolean(RESEND_API_KEY)
  };
  if (!BANCO_CONFIGURADO) return res.status(500).json(Object.assign(info, { success: false, message: 'Falta SUPABASE_SERVICE_ROLE_KEY no .env' }));
  try {
    await sbSelect('usuarios', 'select=id', 'id', 1);
    info.tabelas = 'ok';
    res.json(info);
  } catch (e) {
    res.status(500).json(Object.assign(info, { success: false, tabelas: 'erro', message: e.message }));
  }
});

// Libera o aluno e envia o aviso uma unica vez (webhook e polling podem competir).
async function liberarComAviso(userId) {
  const u = await usuarioPorId(userId);
  if (!u || u.liberado) return false;
  await liberarUsuario(userId);
  if (u.email) {
    await enviarEmail(u.email, 'Acesso liberado - Curso de Eletricista', htmlLiberado(`${PUBLIC_BASE_URL}/aulas`, u.nome));
  }
  return true;
}

api.post('/pagamento/pix', requireAuth, async (req, res) => {
  const u = req.usuario;
  if (u.liberado) return res.status(400).json({ success: false, message: 'Seu acesso ja esta liberado.', liberado: true });
  if (!PAGBANK_TOKEN) {
    return res.status(500).json({ success: false, message: 'Pagamento indisponivel agora: PAGBANK_TOKEN nao configurado no servidor.' });
  }

  const cpf = String((req.body || {}).cpf || '').replace(/\D/g, '');
  if (!cpfValido(cpf)) {
    return res.status(400).json({ success: false, message: 'Informe um CPF valido para gerar o Pix.' });
  }

  try {
    const valor = Number((req.body || {}).valor) > 0 ? Number(req.body.valor) : VALOR_ACESSO;
    const pix = await pagbankCriarPix({
      userId: u.id,
      nome: u.nome,
      email: u.email,
      cpf,
      valor,
      descricao: DESCRICAO_PAGAMENTO
    });

    // A coluna mp_id continua sendo a chave interna da cobranca (agora, do PagBank).
    await sbInsert('pagamentos', {
      user_id: u.id,
      mp_id: pix.chargeId,
      valor,
      status: pix.status || 'pending',
      metodo: 'pix-pagbank'
    });

    res.json({
      success: true,
      chargeId: pix.chargeId,
      pedidoId: pix.pedidoId,
      status: pix.status,
      qr_code: pix.qrCode,
      qr_code_base64: pix.qrCodeBase64,
      valor
    });
  } catch (e) {
    console.error('[PIX]', e.message);
    res.status(400).json({ success: false, message: e.message || 'Nao foi possivel gerar o Pix agora.' });
  }
});

api.post('/pagamento/status', requireAuth, async (req, res) => {
  const u = req.usuario;
  if (u.liberado) return res.json({ success: true, status: 'approved', liberado: true });
  const chargeId = String((req.body || {}).chargeId || '');
  if (!chargeId) return res.status(400).json({ success: false, message: 'chargeId obrigatorio.' });

  try {
    const registros = await sbSelect(
      'pagamentos',
      `mp_id=eq.${encodeURIComponent(chargeId)}&user_id=eq.${encodeURIComponent(u.id)}`,
      'id,status',
      1
    );
    const registro = registros && registros[0];
    let status = registro ? registro.status : 'pending';
    let liberado = status === 'approved';

    if (!liberado && PAGBANK_TOKEN) {
      const charge = await pagbankConsultarCharge(chargeId);
      if (charge && charge.status === 'PAID' && String(charge.reference_id || '') === u.id && registro) {
        status = 'approved';
        await sbUpdate('pagamentos', `id=eq.${encodeURIComponent(registro.id)}`, { status: 'approved' });
        await liberarComAviso(u.id);
        liberado = true;
      } else if (charge && charge.status) {
        status = pagbankStatusLocal(charge.status);
      }
    }
    res.json({ success: true, status, liberado });
  } catch (e) {
    console.error('[STATUS]', e.message);
    res.status(400).json({ success: false, message: e.message });
  }
});

// Webhook do PagBank (Order/PIX). So libera quando a cobranca esta PAID.
async function processarWebhookPagbank(payload) {
  const charges = Array.isArray(payload.charges) ? payload.charges : [];
  const charge = charges.find((c) => c && c.status === 'PAID');
  if (!charge) return { ignorado: true, motivo: 'sem cobranca paga' };

  const chargeId = String(charge.id || '');
  const userId = String(charge.reference_id || payload.reference_id || '');
  if (!chargeId || !UUID_RE.test(userId)) return { ignorado: true, motivo: 'referencia invalida' };

  // Confere o status direto na API para nao confiar apenas no corpo da notificacao.
  const confirmada = await pagbankConsultarCharge(chargeId);
  if (!confirmada || confirmada.status !== 'PAID' || String(confirmada.reference_id || '') !== userId) {
    return { ignorado: true, motivo: 'cobranca nao confirmada' };
  }

  const valor = Number(confirmada.amount && confirmada.amount.value) / 100 || VALOR_ACESSO;
  const existentes = await sbSelect('pagamentos', `mp_id=eq.${encodeURIComponent(chargeId)}`, 'id,user_id,status', 1);
  if (existentes && existentes.length) {
    if (String(existentes[0].user_id) !== userId) return { ignorado: true, motivo: 'cobranca de outro usuario' };
    if (existentes[0].status !== 'approved') {
      await sbUpdate('pagamentos', `id=eq.${encodeURIComponent(existentes[0].id)}`, { status: 'approved' });
    }
    await liberarComAviso(userId);
    return { duplicado: true };
  }

  await sbInsert('pagamentos', {
    user_id: userId,
    mp_id: chargeId,
    valor,
    status: 'approved',
    metodo: 'pix-pagbank'
  });
  await liberarComAviso(userId);
  console.log(`[WEBHOOK] Cobranca ${chargeId} paga. Usuario ${userId} liberado.`);
  return { liberado: true };
}

app.post('/api/pagbank/webhook', async (req, res) => {
  // PagBank espera 200 mesmo para eventos ignorados; erros internos tambem nao devem gerar retry infinito.
  try {
    if (!BANCO_CONFIGURADO || !PAGBANK_TOKEN) {
      console.warn('[WEBHOOK] Ignorado: servidor sem banco/token PagBank.');
      return res.json({ received: true, ignorado: true });
    }

    const assinatura = String(req.get('x-authenticity-token') || '').toLowerCase();
    const esperado = sha256(`${PAGBANK_TOKEN}-${req.rawBody || ''}`);
    if (!assinatura || !seguroIgual(assinatura, esperado)) {
      console.warn('[WEBHOOK] Assinatura invalida; notificacao descartada.');
      return res.json({ received: true, ignorado: true });
    }

    const origem = String(req.get('x-product-origin') || '').toUpperCase();
    const produto = String(req.get('x-product-id') || '');
    if ((origem && origem !== 'ORDER') || (produto && !produto.startsWith('ORDE_'))) {
      return res.json({ received: true, ignorado: true, motivo: 'produto nao ORDER' });
    }

    const payload = req.body || {};
    const resultado = await processarWebhookPagbank(payload);
    return res.json(Object.assign({ received: true }, resultado));
  } catch (e) {
    console.error('[WEBHOOK]', e.message);
    res.json({ received: true, ignorado: true });
  }
});

// Simulacao local de pagamento (somente com ALLOW_DEV_PAYMENT=1 e fora de producao)
api.post('/pagamento/simular', requireAuth, async (req, res) => {
  if (!ALLOW_DEV_PAYMENT) return res.status(404).json({ success: false, message: 'Nao disponivel.' });
  try {
    await sbInsert('pagamentos', {
      user_id: req.usuario.id,
      mp_id: `dev-${Date.now()}`,
      valor: VALOR_ACESSO,
      status: 'approved',
      metodo: 'pix-dev'
    });
    await liberarUsuario(req.usuario.id);
    res.json({ success: true, message: 'Pagamento simulado. Acesso liberado.' });
  } catch (e) {
    console.error('[SIMULAR]', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ---------------------------------------------------------------- arquivos
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Area de aulas protegida (arquivo fora de /public)
app.get(['/aulas', '/aulas.html', '/area-do-aluno'], async (req, res) => {
  let usuario = null;
  if (BANCO_CONFIGURADO) {
    try {
      usuario = await usuarioDaRequisicao(req);
    } catch (e) {
      console.warn('[AULAS]', e.message);
    }
  }
  if (!usuario) return res.redirect('/index.html?proximo=%2Faulas');
  if (!usuario.liberado) return res.redirect('/pagamento.html');
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'private', 'aulas.html'));
});

app.get('/', async (req, res) => {
  let usuario = null;
  if (BANCO_CONFIGURADO) {
    try {
      usuario = await usuarioDaRequisicao(req);
    } catch (e) {
      console.warn('[HOME]', e.message);
    }
  }
  if (usuario && usuario.liberado) return res.redirect('/aulas');
  if (usuario) return res.redirect('/pagamento.html');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
    if (err) res.status(404).type('text/plain').send('Pagina nao encontrada');
  });
});

// ---------------------------------------------------------------- execucao
// Em servidor tradicional (npm start) sobe o HTTP.
// Na Vercel o arquivo e importado por api/index.js, que exporta o app.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  Curso de Eletricista rodando em http://localhost:${PORT}`);
    console.log(`  Base publica: ${PUBLIC_BASE_URL}`);
    console.log(`  Banco: ${BANCO_CONFIGURADO ? SUPABASE_URL : 'NAO configurado (falta SUPABASE_SERVICE_ROLE_KEY no .env)'}`);
    console.log(`  PagBank: ${PAGBANK_TOKEN ? `configurado (${PAGBANK_ENV})` : 'NAO configurado (PAGBANK_TOKEN vazio)'}`);
    console.log(`  E-mail: ${RESEND_API_KEY ? 'configurado' : 'NAO configurado (links aparecem no console)'}`);
    if (ALLOW_DEV_PAYMENT) console.log('  Modo local: simulacao de pagamento ATIVADA');
    console.log('');
  });
}

module.exports = app;
