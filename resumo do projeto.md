# Resumo do Projeto — Curso de Eletricista (`https://learis.com.br`)

Ultima atualizacao: 17/11/2026

## 1. Objetivo
Curso de Eletricista no dominio `https://learis.com.br`, com sistema **no modelo do LotoBot**:
cadastro/login proprio, confirmacao de e-mail, recuperacao de senha, pagamento **Pix (Mercado Pago)**
com liberacao automatica por webhook e area de aulas protegida. Tudo responsivo, priorizando celular.

- **Preco:** R$ 19,90 (`VALOR_ACESSO=19.9`)
- **Banco:** Supabase (Postgres na nuvem)
- **Deploy:** Vercel (serverless)
- **Repositorio:** `https://github.com/matrixlearis-ctrl/curso-eletricista`

## 2. Conteudo do curso
- Origem dos videos: `https://eletrica-para-todos.tinyhugs.online/` (site publico)
- **30 aulas** em `private/aulas.html`, player incorporado + botao "Assistir no YouTube" em cada card
- 29 videos do YouTube + 1 do Vimeo (Aula 30: `vimeo.com/1123237183`)
- Links corrigidos ao longo do projeto:
  - Aula 9 → `Ba1ryYzhUg8`
  - Aula 24 → `IK0KOXY0v60`
  - **Aula 28 → `JyQPFWzNz5Y`** (antes repetia o video da Aula 24)
  - Aula 30 → Vimeo `1123237183` (embed `player.vimeo.com/video/1123237183`)
- Todos os iframes usam `referrerpolicy="strict-origin-when-cross-origin"` e `loading="lazy"`

## 3. Banco de dados — Supabase

- Projeto: `https://vvsyquozzttiivgsswfz.supabase.co`
- Acesso pelo servidor via **PostgREST** com `SUPABASE_SERVICE_ROLE_KEY`
  (helpers `sbSelect` / `sbInsert` / `sbUpdate` / `sbDelete`, com retry curto em erros 5xx)
- Tabelas criadas por `supabase/schema.sql` (executado no SQL Editor do painel):

| Tabela | Chave | Para que serve |
| --- | --- | --- |
| `usuarios` | `id` (uuid) | nome, email unico, `senha_hash`, `confirmado`, `liberado`, `liberado_em`, `criado_ip` |
| `sessoes` | `token_hash` | sessoes ativas (`user_id`, `expira_em`) |
| `email_tokens` | `id` (uuid) | links de confirmacao (`confirmar`) e nova senha (`recuperar`), com validade e `usado` |
| `pagamentos` | `id` (uuid) | `mp_id` **unico** (idempotencia do webhook), valor, status, metodo |

- **RLS ligado e sem politicas**: somente a `service_role` (servidor) le/escreve.
  A chave `anon`/`publishable` nao acessa nada.
- Scripts de apoio:
  - `verificar-supabase.js` — testa a conexao e as 4 tabelas
  - `conferir-dados.js` — mostra quantas contas/pagamentos existem
  - `migrar-para-supabase.js` — copia os dados do SQLite antigo (mantem os hashes scrypt)
- **Migracao ja realizada**: 2 usuarios + 1 pagamento copiados de `data/app.db`
  - `uniddigital@gmail.com` (James Ribeiro) — confirmado e liberado
  - `ribeirojames30@gmail.com` (JAMES SILVA) — pendente de confirmacao
- `data/app.db` fica apenas como backup historico (nao e mais usado; esta no `.gitignore`)

## 4. Backend — `server.js`

- Node.js 22 + Express 4 + `dotenv`
- Senhas com `scrypt` + salt; sessoes com token aleatorio (guarda so o hash)
- Sessao em cookie **HttpOnly** `learis_sessao` (30 dias, `Secure` automatico em HTTPS) + `Authorization: Bearer`
- Limite simples de tentativas por IP nas rotas `/api/*` (em memoria)
- **Preparado para serverless**: exporta o app (`module.exports = app`) e so chama
  `app.listen` quando executado direto (`require.main === module`); a limpeza periodica
  de sessoes/tokens fica desativada na Vercel (`process.env.VERCEL`)

### Rotas
- Autenticacao:
  - `POST /api/auth/cadastro` — cria conta e envia link de confirmacao
  - `GET /api/auth/confirmar-email?t=...` — confirma o e-mail
  - `POST /api/auth/reenviar-confirmacao`
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
  - `POST /api/auth/solicitar-recuperacao`, `POST /api/auth/redefinir-senha`
- Pagamento:
  - `POST /api/pagamento/pix` — cria cobranca Pix no Mercado Pago (QR + copia e cola)
  - `POST /api/pagamento/status` — consulta o MP e libera se aprovado
  - `POST /api/mercadopago/webhook` — **sempre** confirma na API do MP antes de liberar; idempotente por `mp_id`
  - `POST /api/pagamento/simular` — **somente** com `ALLOW_DEV_PAYMENT=1` e fora de producao
- Infra:
  - `GET /api/config` — valor, descricao, `devPayment`, qual banco esta ativo
  - `GET /api/health` — banco, Supabase, Mercado Pago, e-mail e `tabelas: ok`
- E-mails (Resend): confirmacao de cadastro, redefinicao de senha e "acesso liberado".
  Sem `RESEND_API_KEY`, o link aparece no console do servidor e na propria tela (`linkDev`, fora de producao).
- Protecao da area de aulas: `/aulas` (`/aulas.html`, `/area-do-aluno`) exige login **e** `liberado`;
  o HTML fica em `private/`, fora de `public/`, e nunca e servido direto.

## 5. Frontend — `public/`

| Arquivo | O que e |
| --- | --- |
| `index.html` | login |
| `cadastro.html` | criar conta (+ reenviar confirmacao; em modo local mostra o botao "Confirmar meu e-mail agora") |
| `confirmar-email.html` | valida o link do e-mail |
| `recuperar-senha.html` / `redefinir-senha.html` | fluxo de nova senha |
| `pagamento.html` | valor (R$ 19,90), QR Code, copia e cola, "Ja paguei" (verifica a cada 5s), modo local |
| `404.html` | pagina nao encontrada |
| `auth.js` | helpers de sessao/fetch |
| `config-site.js` | config publica de reserva (valor 19.9, textos de suporte) |
| `css/estilo.css` | estilos |
| `image/banner.jpg` | banner |

- Layout **mobile-first**: 1 coluna no celular, botoes de largura total, sem rolagem horizontal
- Cabecalho das aulas mostra o nome do aluno (via `/api/auth/me`) e botao "Sair"

## 6. Deploy — Vercel

Arquivos criados para isso:

| Arquivo | Funcao |
| --- | --- |
| `api/index.js` | entrada serverless: `module.exports = require('../server')` (sem abrir porta) |
| `vercel.json` | `builds` do `@vercel/node` com `includeFiles: public/**, private/**` + rewrite `/(.*)` |
| `.vercelignore` | nao envia `.env`, `data/`, `node_modules`, `*.log`, `Capturar.JPG` |
| `package.json` | `engines.node = "22.x"` |

Passos para publicar:

1. <https://vercel.com/new> → importar `matrixlearis-ctrl/curso-eletricista`
2. Framework Preset **Other**; Build Command e Output Directory vazios
3. Cadastrar as variaveis de ambiente (secao 8)
4. **Deploy** → testar na URL `*.vercel.app`
5. **Settings → Domains** → `learis.com.br` + `www.learis.com.br` e criar os DNS indicados
6. Mercado Pago → webhook `https://learis.com.br/api/mercadopago/webhook`

Observacoes:

- Nao existe disco local: por isso o banco e o Supabase (nada de `data/app.db`)
- Funcao Hobby tem ~10s por requisicao — suficiente para este app
- Regiao padrao `iad1`; se o Supabase estiver no Brasil, adicionar `"regions": ["gru1"]` no `vercel.json`
- Em producao **nao existe** botao de simulacao: para testar o fluxo pago e preciso o `MP_ACCESS_TOKEN` real
- O empacotamento de `public/` e a parte mais sensivel: se alguma pagina der 404 apos o deploy, revisar o `vercel.json`

## 7. Repositorio GitHub

- `https://github.com/matrixlearis-ctrl/curso-eletricista` (publico)
- Branch `main`; commits principais:
  - `8c0bd83` — primeiro commit do projeto completo
  - `fbf2068` — envio inicial pelo usuario
  - `b807ce6` — preco R$ 19,90 + preparacao para Vercel
- `.gitignore`: `node_modules/`, `.env`, `data/`, `*.log`
- `.gitattributes`: `.bat`/`.cmd` sempre com CRLF (para o `iniciar.bat` nao quebrar)
- **Nunca** entra no repositorio: `.env` (segredos), `data/app.db`, `node_modules/`

## 8. Variaveis de ambiente

Modelo em `.env.example`; local em `.env` (nao versionado); producao no painel da Vercel.

| Variavel | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://vvsyquozzttiivgsswfz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta do Supabase (Settings > API Keys) |
| `PUBLIC_BASE_URL` | `http://localhost:3000` local / `https://learis.com.br` producao |
| `VALOR_ACESSO` | `19.9` |
| `DESCRICAO_PAGAMENTO` | `Curso de Eletricista - Acesso completo` |
| `SESSAO_DIAS` | `30` |
| `MP_ACCESS_TOKEN` | token do Mercado Pago (Pix) |
| `RESEND_API_KEY` | chave do Resend (opcional em dev) |
| `EMAIL_FROM` | `Curso de Eletricista <no-reply@learis.com.br>` |
| `NODE_ENV` | `development` local / `production` producao |
| `ALLOW_DEV_PAYMENT` | `1` **so** no local (libera o botao de simulacao) |

## 9. Como rodar localmente

```powershell
npm start          # ou clique duas vezes em iniciar.bat
```

Abrir `http://localhost:3000`. A janela do terminal precisa ficar aberta (e o servidor).

- `iniciar.bat`: instala dependencias se faltar, avisa se o Node nao existe, e se a porta 3000
  ja estiver em uso apenas abre o navegador (nao abre servidor duplicado)
- Testes sem Mercado Pago: `.env` com `ALLOW_DEV_PAYMENT=1` → botao
  "Simular pagamento (modo local)" na pagina de pagamento

## 10. Testes realizados

- **Supabase**: `verificar-supabase.js` com as 4 tabelas `[ok]`; `/api/health` retorna
  `banco: supabase` e `tabelas: ok`
- **Migracao**: 2 usuarios + 1 pagamento copiados do SQLite, hashes preservados
- **Fluxo completo por API** (conta temporaria, removida depois):
  cadastro → link de confirmacao → confirmar e-mail → login → cookie de sessao →
  `/api/auth/me` → `/aulas` bloqueado (302 para `/pagamento.html`) → pagamento simulado →
  `/aulas` 200 com **30 aulas** → logout → `/aulas` volta a bloquear
- **Aula 28**: confirmado que a pagina usa `JyQPFWzNz5Y` e nao repete a Aula 24
- **Preco**: `/api/config` retorna `valor: 19.9` (exibido como R$ 19,90)
- **Serverless**: `require('./api/index.js')` devolve a funcao do Express sem abrir porta
- **Pagina de aulas em HTTP** (`localhost`): 30 cards, sem erros no console
  → o erro 153 do YouTube era causado por abrir via `file://`
- **Mobile** (viewport 390x844): sem overflow horizontal em aulas, login e pagamento

## 11. Seguranca

- Senhas com `scrypt` + salt (nunca em texto puro)
- Sessoes: token aleatorio de 32 bytes, so o hash SHA-256 fica no banco
- Cookie `HttpOnly` + `SameSite=Lax`; `Secure` automatico quando `PUBLIC_BASE_URL` e HTTPS
- `private/aulas.html` fora de `public/`: acesso so pela rota `/aulas` com login + liberacao
- Webhook do Mercado Pago nunca confia no corpo: consulta `GET /v1/payments/{id}` antes de liberar
- RLS no Supabase sem politicas (apenas `service_role`)
- Limite de tentativas por IP nas rotas `/api/*`
- **Segredos que passaram por conversa e devem ser rotacionados:**
  - `SUPABASE_SERVICE_ROLE_KEY` (colar no `.env`/Vercel e apagar a antiga no painel)
  - Token do GitHub (`github_pat_...`) — revogar em Settings > Developer settings
  - `MP_ACCESS_TOKEN` — gerar um novo no painel do Mercado Pago

## 12. Pendencias

1. **`MP_ACCESS_TOKEN` real** — sem ele o Pix nao funciona (so a simulacao local)
2. **`RESEND_API_KEY`** + dominio `learis.com.br` verificado no Resend
3. **Deploy na Vercel** — importar o repo, cadastrar as variaveis e apontar o dominio
4. **Webhook** `https://learis.com.br/api/mercadopago/webhook` cadastrado no Mercado Pago
5. **Rotacionar os segredos** listados na secao 11
6. Confirmar se `Capturar.JPG` (print enviado ao repo) nao expoe dados sensiveis
7. Opcional: pagina de vendas publica, painel do aluno com progresso, marcacao de aulas assistidas

## 13. Checklist de validacao em producao

- [ ] `/api/health` retorna `banco: supabase` e `tabelas: ok`
- [ ] `/api/auth/cadastro` cria usuario e o e-mail chega
- [ ] Link de confirmacao abre `/confirmar-email.html` e confirma
- [ ] Login leva para `/pagamento.html` (usuario sem pagamento)
- [ ] `/api/pagamento/pix` retorna QR Code, copia e cola e `mpId` de R$ 19,90
- [ ] Webhook aprova e libera o usuario automaticamente
- [ ] `/aulas` abre com as 30 aulas so para aluno liberado
- [ ] E-mail "acesso liberado" chega ao aluno
- [ ] Layout conferido no celular (a maioria dos alunos assiste pelo telefone)
