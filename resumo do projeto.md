# Resumo do Projeto — Curso de Eletricista (`https://learis.com.br`)

Ultima atualizacao: 18/11/2026 (modernizacao visual da pagina inicial, banner e preco R$ 16,90) — migração de pagamento para **PagBank** em andamento

## 1. Objetivo
Curso de Eletricista no dominio `https://learis.com.br`, com sistema **no modelo do LotoBot**:
cadastro/login proprio, confirmacao de e-mail, recuperacao de senha, pagamento **Pix via PagBank**
com liberacao automatica por webhook e area de aulas protegida. Tudo responsivo, priorizando celular.
O Mercado Pago foi removido do codigo; ele so aparece neste documento em registros historicos de testes.

- **Preco:** R$ 16,90 (`VALOR_ACESSO=16.9`) — alterado de R$ 19,90 em 18/11/2026
- **Banco:** Supabase (Postgres na nuvem)
- **Deploy:** Vercel (serverless)
- **Repositorio:** `https://github.com/matrixlearis-ctrl/curso-eletricista`

## 2. Conteudo do curso
- Origem dos videos: site publico de referencia `https://acessoeletrica.online/#aulas`
  (o projeto tambem ja usou `https://eletrica-para-todos.tinyhugs.online/`)
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
- Pagamento (somente PagBank):
  - `POST /api/pagamento/pix` — `POST /orders` com PIX (QR + copia e cola), usando CPF informado pelo aluno
  - `POST /api/pagamento/status` — consulta `GET /charges/{id}` e libera se `PAID`
  - `POST /api/pagbank/webhook` — valida assinatura SHA256, confirma a cobranca na API e libera; idempotente pela coluna `mp_id` (`CHAR_...`)
  - `POST /api/pagamento/simular` — **somente** com `ALLOW_DEV_PAYMENT=1` e fora de producao
- Infra:
  - `GET /api/config` — valor, descricao, `devPayment`, `pagamento: 'pagbank'`, qual banco esta ativo
  - `GET /api/health` — banco, Supabase, `pagBank`, `pagBankAmbiente`, e-mail e `tabelas: ok`
- E-mails (Resend): confirmacao de cadastro, redefinicao de senha e "acesso liberado".
  Sem `RESEND_API_KEY`, o link aparece no console do servidor e na propria tela (`linkDev`, fora de producao).
- Protecao da area de aulas: `/aulas` (`/aulas.html`, `/area-do-aluno`) exige login **e** `liberado`;
  o HTML fica em `private/`, fora de `public/`, e nunca e servido direto.

## 5. Frontend — `public/`

| Arquivo | O que e |
| --- | --- |
| `index.html` | login (visual modernizado com energia neon + banner) |
| `cadastro.html` | criar conta (+ reenviar confirmacao; em modo local mostra o botao "Confirmar meu e-mail agora") |
| `confirmar-email.html` | valida o link do e-mail |
| `recuperar-senha.html` / `redefinir-senha.html` | fluxo de nova senha |
| `pagamento.html` | valor (R$ 16,90), campo CPF, QR Code, copia e cola, "Ja paguei" (verifica a cada 5s), modo local |
| `404.html` | pagina nao encontrada |
| `auth.js` | helpers de sessao/fetch |
| `config-site.js` | config publica de reserva (valor 16.9, textos de suporte) |
| `css/estilo.css` | estilos compartilhados (mantidos originalmente) |
| `css/entrada.css` | estilos exclusivos da pagina inicial (energia/neon) |
| `js/energia.js` | cria as particulas do fundo da index (sem bibliotecas) |
| `image/banner.jpg` | banner exibido abaixo do rodape da index |

- Layout **mobile-first**: 1 coluna no celular, botoes de largura total, sem rolagem horizontal
- Cabecalho das aulas mostra o nome do aluno (via `/api/auth/me`) e botao "Sair"

### Pagina inicial (login) — modernizacao visual em 17/11/2026

- Identidade de energia eletrica: fundo azul-marinho/preto, azul eletrico como cor principal,
  detalhes em ciano/branco e brilhos neon discretos (alta legibilidade).
- Efeitos implementados (CSS para animacoes; JavaScript apenas para criar as particulas):
  1. **Energia no fundo** — malha de engenharia, brilhos que respiram, 4 feixes de luz que
     surgem/desaparecem e pontinhos subindo (6 no celular, 14 no desktop).
  2. **Iluminacao acendendo** — o cartao entra com brilho e halo pulsante; o foco nos campos
     acende um glow azul ao redor do elemento.
  3. **Simbolo ⚡ preservado** — ganhou neon azul pulsante e uma pequena faisca animada.
  4. **Botao Entrar** — gradiente azul eletrico, brilho externo, varredura de luz, hover no
     desktop e pulso sempre ativo no celular (sem depender de hover). Funcao original intacta.
  5. **Formulario** — campos com icones SVG inline (envelope/cadeado), borda e iluminacao
     ciano no foco, fundo moderno e placeholders legiveis. Validacao nao foi alterada.
- Botao **Criar conta** em verde claro adicionado logo abaixo de Entrar, com link para
  `/cadastro.html` (o link de texto original da linha de links foi mantido).
- `css/entrada.css` e `js/energia.js` sao carregados **somente** pela `index.html`:
  `estilo.css` e todas as outras paginas ficaram intactos.
- Sem bibliotecas, sem video de fundo e sem imagens pesadas; `prefers-reduced-motion`
  desliga as animacoes e esconde particulas/feixes.
- `image/banner.jpg` (1280x853, 337 KB, `loading="lazy"`) aparece **abaixo** do texto
  "Curso de Eletricista • learis.com.br", com borda ciano e sombra suave.

## 6. Deploy — Vercel

**Publicado em 17/11/2026 e apontado para o dominio final.**

| Item | Estado |
| --- | --- |
| URL publica | `https://learis.com.br` (e `www.learis.com.br`) |
| Alias Vercel | `https://curso-eletricista.vercel.app` |
| Projeto Vercel | `curso-eletricista` — id `prj_KlVm7uMSmYTpFJ2bxSfQpM9RP5Vv` |
| Conta Vercel | `matrixlearis@gmail.com` (Hobby) |
| Repo conectado | `matrixlearis-ctrl/curso-eletricista`, branch `main`, deploy automatico |
| DNS HostGator | A `@` → `76.76.21.21`; CNAME `www` → `cname.vercel-dns.com` |
| HTTPS | certificado emitido e valido nos dois dominios |
| Variaveis | Supabase, valor 16.9, NODE_ENV=production, Resend, etc.; `MP_ACCESS_TOKEN` removida e `PAGBANK_TOKEN` pendente de configuracao |
| Teste em producao | cadastro → login → `/aulas` (30 aulas) OK; Pix de R$ 19,90 no MP (teste historico); e-mail entregue |

Em 17/11/2026 foram configurados `MP_ACCESS_TOKEN` (hoje removido) e `RESEND_API_KEY`
(chave do Resend do LotoBot, validada com envio real). Apos a migracao, `/api/health`
passa a reportar `pagBank: true` somente quando `PAGBANK_TOKEN` estiver preenchido na Vercel.
O codigo PagBank-only ainda nao foi publicado: o push depende do token para nao deixar o site sem pagamento.
Dominio `learis.com.br` verificado no Resend em 17/11/2026 (DKIM, MX, TXT e CNAME conferidos
no DNS e validados pela API). Remetente final: `Curso de Eletricista <no-reply@learis.com.br>`,
com envio real confirmado (`de=no-reply@learis.com.br`, `last_event: delivered`).

**Mudanca de preco em 18/11/2026:** R$ 19,90 → **R$ 16,90**. O valor e definido pela variavel
`VALOR_ACESSO` (fonte unica, usada por `/api/config` e pela criacao da cobranca Pix); o fallback
do servidor, o `.env`, o `.env.example`, `public/config-site.js` e o fallback de `pagamento.html`
foram atualizados para `16.9`. A variavel da Vercel tambem foi alterada e o projeto redeployado.
Os testes de Pix anteriores (R$ 19,90) permanecem no documento apenas como registro historico.

**Migracao para PagBank (18/11/2026):** codigo preparado para ser o unico meio de pagamento:
`POST /orders` com PIX, CPF do pagador, valor em centavos, `notification_urls` apontando para
`/api/pagbank/webhook`, validacao SHA256 da assinatura, consulta `GET /charges/{id}` antes de
liberar e resposta compativel com o front (`chargeId`, `qr_code`, `qr_code_base64`).
A coluna `pagamentos.mp_id` continua armazenando o id da cobranca (agora `CHAR_...`) para evitar
migracao de schema. `MP_ACCESS_TOKEN` saiu do codigo, do `.env` e dos documentos.
O deploy ainda nao foi feito porque depende do `PAGBANK_TOKEN` (sandbox para validar e producao para o ar).

Arquivos criados para o deploy:

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
6. PagBank → gerar token em **Vendas → Integrações → Gerar Token** e definir
   `PAGBANK_TOKEN` + `PAGBANK_ENV=production`. O backend envia
   `notification_urls: ["https://learis.com.br/api/pagbank/webhook"]` em cada pedido;
   nao e necessario cadastrar webhook no painel.

Observacoes:

- Nao existe disco local: por isso o banco e o Supabase (nada de `data/app.db`)
- Funcao Hobby tem ~10s por requisicao — suficiente para este app
- Regiao padrao `iad1`; se o Supabase estiver no Brasil, adicionar `"regions": ["gru1"]` no `vercel.json`
- Em producao **nao existe** botao de simulacao: para testar o fluxo pago e preciso o `PAGBANK_TOKEN` real
- O empacotamento de `public/` e a parte mais sensivel: se alguma pagina der 404 apos o deploy, revisar o `vercel.json`

## 7. Repositorio GitHub

- `https://github.com/matrixlearis-ctrl/curso-eletricista` (publico)
- Branch `main`; commits principais:
  - `8c0bd83` — primeiro commit do projeto completo
  - `fbf2068` — envio inicial pelo usuario
  - `b807ce6` — preco R$ 19,90 + preparacao para Vercel
  - `d3997b9` — painel das aulas reformulado
  - `abf68a6` — e-mail de suporte `learisgrup@gmail.com`
  - `4ceea16` — link do grupo de WhatsApp no suporte
  - `71f80f6` — correcao para 4 modulos e videos trocados pelos corretos
  - `2137f6b` — modernizacao visual da pagina inicial (energia neon)
  - `6d6bfa2` — banner abaixo do rodape da pagina inicial
  - `b980ae1` — botao "Criar conta" verde claro na index
  - `5d8b05e` — restaura a pasta `public/image` apagada no GitHub
  - `1e19198` — preco alterado para R$ 16,90 (codigo, docs e variavel da Vercel)
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
| `VALOR_ACESSO` | `16.9` |
| `DESCRICAO_PAGAMENTO` | `Curso de Eletricista - Acesso completo` |
| `SESSAO_DIAS` | `30` |
| `PAGBANK_TOKEN` | token da API PagBank (unico meio de pagamento) |
| `PAGBANK_ENV` | `sandbox` local / `production` producao |
| `PAGBANK_WEBHOOK_URL` | opcional; padrao `PUBLIC_BASE_URL/api/pagbank/webhook` |
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
- Testes sem criar cobranca real: `.env` com `ALLOW_DEV_PAYMENT=1` → botao
  "Simular pagamento (modo local)" na pagina de pagamento
- Para testar o Pix real em sandbox: `PAGBANK_ENV=sandbox` + token do Portal do Desenvolvedor;
  a conta precisa ter uma chave Pix ativa

## 10. Testes realizados

- **Supabase**: `verificar-supabase.js` com as 4 tabelas `[ok]`; `/api/health` retorna
  `banco: supabase` e `tabelas: ok`
- **Migracao**: 2 usuarios + 1 pagamento copiados do SQLite, hashes preservados
- **Fluxo completo por API** (conta temporaria, removida depois):
  cadastro → link de confirmacao → confirmar e-mail → login → cookie de sessao →
  `/api/auth/me` → `/aulas` bloqueado (302 para `/pagamento.html`) → pagamento simulado →
  `/aulas` 200 com **30 aulas** → logout → `/aulas` volta a bloquear
- **Aula 28**: confirmado que a pagina usa `JyQPFWzNz5Y` e nao repete a Aula 24
- **Preco**: `/api/config` retorna `valor: 16.9` (exibido como R$ 16,90)
- **Serverless**: `require('./api/index.js')` devolve a funcao do Express sem abrir porta
- **Pagina de aulas em HTTP** (`localhost`): 30 cards, sem erros no console
  → o erro 153 do YouTube era causado por abrir via `file://`
- **Mobile** (viewport 390x844): sem overflow horizontal em aulas, login e pagamento
- **Visual da index modernizado (17/11/2026)**: testado em 320, 360, 375, 390, 430, 768 e 1280 px
  no navegador, sem rolagem horizontal nem elementos cortados; campos e botao com 50-52 px de altura;
  6 particulas no celular e 14 no desktop; `prefers-reduced-motion` desliga animacoes e particulas.
  Login validado nos tres cenarios: campos vazios, senha errada e login correto → redirecionou para
  `/aulas`. `cadastro.html` e `recuperar-senha.html` continuaram com o estilo verde original.
  Publicado com o commit `2137f6b` e verificado em producao.
- **Banner na index (17/11/2026)**: imagem 1280x853 carregando corretamente abaixo do rodape em
  todas as larguras testadas (320 a 1280 px), sem overflow; `loading="lazy"`. Commit `6d6bfa2`,
  HTTP 200 em producao.
- **Painel das aulas reformulado** em 18/11/2026 no estilo do site de referencia: navy profundo +
  faixa de seguranca amarela, fontes Chakra Petch/Inter, hero, 3 indicadores, **4 modulos** em cards,
  lista de aulas, player com Anterior/Assistida/Proxima, menu lateral no celular e progresso em
  `localStorage` (`learis_progresso_v2`). Visual adaptado com a identidade do Curso de Eletricista,
  sem copiar textos/imagens do modelo.
- **Modulos e aulas conferidos com o aluno (18/11/2026):**
  1. Fundamentos da Eletrica — aulas 1-7 (7)
  2. Seguranca, Protecao e Ferramentas — aulas 8-13 (6)
  3. Instalacoes Eletricas na Pratica — aulas 14-23 (10)
  4. Aterramento e Quadros de Distribuicao — aulas 24-30 (7)
  Total: 30 aulas. Os IDs de video foram corrigidos a partir do site de referencia
  (`acessoeletrica.online`); antes estavam trocados (ex.: a "Aula 1" abria o video de "Tomadas").
  Todos os 29 videos do YouTube foram validados pelo titulo real via oEmbed; a Aula 30 e a do Vimeo.
  A chave de progresso passou de `v1` para `v2` para nao manter marcacoes do mapeamento antigo.
  Validado no navegador: 30 aulas, navegacao, player, marcacao, progresso, suporte e viewport 390x844.
- **Producao (Vercel + `learis.com.br`)**: `/api/health` e `/api/config` OK; cadastro → login →
  `/aulas` entregou as 30 aulas, Aula 28 e Aula 30 corretas; sem cookie `/aulas` redireciona (302);
  DNS A/CNAME e HTTPS validados em `learis.com.br` e `www.learis.com.br`
- **Pix real em producao (HISTORICO — Mercado Pago, preco antigo)**: `/api/health` com
  `mercadoPago: true`; conta de teste gerou cobranca de R$ 19,90 no MP (`status: pending`,
  `mpId`, QR Code e `ticket_url`), conta removida depois; endpoint antigo respondeu
  `200 {"received":true}`. Esse provedor nao e mais usado; o teste equivalente com PagBank esta pendente.
- **E-mail real em producao**: `/api/health` com `email: true`; teste pelo proprio site gerou o token
  de confirmacao, o Resend registrou o envio com `last_event: delivered`, e a conta de teste foi removida

## 11. Seguranca

- Senhas com `scrypt` + salt (nunca em texto puro)
- Sessoes: token aleatorio de 32 bytes, so o hash SHA-256 fica no banco
- Cookie `HttpOnly` + `SameSite=Lax`; `Secure` automatico quando `PUBLIC_BASE_URL` e HTTPS
- `private/aulas.html` fora de `public/`: acesso so pela rota `/aulas` com login + liberacao
- Webhook do PagBank valida `x-authenticity-token` (`SHA256(token + "-" + corpo)`) e confirma
  `GET /charges/{id}` antes de liberar; so aceita `PAID` e `reference_id` do aluno
- RLS no Supabase sem politicas (apenas `service_role`)
- Limite de tentativas por IP nas rotas `/api/*`
- **Segredos que passaram por conversa e devem ser rotacionados:**
  - `SUPABASE_SERVICE_ROLE_KEY` (colar no `.env`/Vercel e apagar a antiga no painel)
  - Token do GitHub (`github_pat_...`) — revogar em Settings > Developer settings
  - Token da Vercel (`vcp_...`) — revogar em Vercel > Settings > Tokens
  - `MP_ACCESS_TOKEN` — revogar no Mercado Pago (nao e mais usado; o valor apareceu em conversa/doc)
  - `PAGBANK_TOKEN` — nunca compartilhar; se aparecer em conversa, gerar outro no painel PagBank
  - `RESEND_API_KEY` — criar nova chave no Resend e revogar a antiga (tambem divulgada em conversa/doc)

## 12. Pendencias

1. **Token PagBank**: obter token de sandbox, testar Order Pix + webhook assinado; depois gerar token de producao e configurar na Vercel antes de fazer push
2. **Rotacionar os segredos** listados na secao 11 (Vercel, GitHub, Supabase, Resend e o antigo token MP)
3. Confirmar se `Capturar.JPG` (print enviado ao repo) nao expoe dados sensiveis
4. Opcional: pagina de vendas publica (o painel do aluno com progresso e marcacao ja esta pronto)

Itens ja concluidos e que nao sao mais pendencia: links de suporte (WhatsApp e e-mail) preenchidos
em `public/config-site.js` e no painel `/aulas`; modernizacao visual da index e banner publicados.

Suporte configurado no painel `/aulas` via `config-site.js` (e com os mesmos valores como reserva
no proprio painel):
- **WhatsApp (grupo):** `https://chat.whatsapp.com/IEwdw1vFAUz7bWxBZnRwYf?s=sh&p=a&iam=2`
  (`suporteWhatsapp`; o painel aceita numero `wa.me` ou link completo)
- **E-mail:** `learisgrup@gmail.com` (`emailSuporte`)

## 13. Checklist de validacao em producao

- [x] `/api/health` retorna `banco: supabase` e `tabelas: ok` (validado em producao)
- [x] `/api/auth/cadastro` cria usuario e o e-mail de confirmacao e entregue (teste real no Resend)
- [ ] Link de confirmacao abre `/confirmar-email.html` e confirma
- [ ] Login leva para `/pagamento.html` (usuario sem pagamento)
- [x] `/api/pagamento/pix` retorna QR Code, copia e cola e `mpId` de R$ 19,90 (teste historico com Mercado Pago e preco antigo)
- [ ] `/api/pagamento/pix` retorna QR Code, copia e cola e `chargeId` via PagBank (R$ 16,90)
- [ ] Webhook assinado do PagBank aprova e libera o usuario automaticamente
- [x] `/aulas` abre com as 30 aulas so para aluno liberado (validado em producao)
- [ ] E-mail "acesso liberado" chega ao aluno
- [x] Layout conferido no celular (viewport 390x844, sem overflow; menu lateral e cards testados)
- [x] Pagina inicial modernizada (energia neon) e responsiva em 320-1280 px (validado em producao)
- [x] Banner exibido abaixo do rodape da index (validado em producao)
- [x] Botao "Criar conta" verde claro abaixo de Entrar, linkando para `/cadastro.html`
- [x] Login da index preservado: campos vazios, senha errada e login valido redirecionando para `/aulas`
- [x] Outras paginas inalteradas pelo visual novo (estilo verde original conferido)
- [x] Preco atualizado para R$ 16,90 em todo o projeto e na Vercel (`/api/config` → `valor: 16.9`)
