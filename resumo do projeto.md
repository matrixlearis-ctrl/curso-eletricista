# Resumo do Projeto — Curso de Eletricista (`https://learis.com.br`)

Última atualização: 20/11/2026 — fluxo de pagamento alterado para **Pix fixo com liberação manual**, área **admin** para liberação de alunos e **cadastro sem confirmação de e-mail**

## 1. Objetivo e estado atual

Curso de Eletricista no domínio `https://learis.com.br`, com sistema no modelo do LotoBot:
cadastro/login próprio, recuperação de senha, pagamento e área de aulas protegida. Tudo responsivo, priorizando celular.

- **Preço:** R$ 16,90 (`VALOR_ACESSO=16.9`)
- **Banco:** Supabase (Postgres na nuvem)
- **Deploy:** Vercel (serverless)
- **Repositório:** `https://github.com/matrixlearis-ctrl/curso-eletricista`

### Estado atual do pagamento e acesso
- **Pagamento ativo:** **Pix fixo (copia e cola/QR estático)** com **liberação manual**.
  - O aluno paga via QR Code/copia e cola fixo e envia o comprovante ao administrador pelo WhatsApp.
  - O administrador libera o acesso manualmente em `/admin.html`.
  - Não há confirmação automática de pagamento no fluxo atual.
- **Cadastro/login:** o aluno cria a conta e já pode fazer login (sem etapa de confirmação de e-mail). Após login, se não estiver liberado, é direcionado para `/pagamento.html`.
- **PagBank (Orders API, automático):** o código de integração automática (geração de Pix por pedido, webhook, consulta de cobrança) permanece no projeto, mas **não é o fluxo ativo**. Em produção, a criação de Pix via API retornou `whitelist access required` (conta/integração não liberada para Pix via API); por isso adotou-se o Pix fixo manual como solução atual.

## 2. Conteúdo do curso

- **30 aulas** em `private/aulas.html`, servidas apenas pela rota protegida `/aulas`
- 29 vídeos do YouTube + 1 do Vimeo (Aula 30: `vimeo.com/1123237183`)
- Painel no estilo do site de referência, com 4 módulos, navegação, marcação de aula assistida e progresso em `localStorage` (`learis_progresso_v2`)
- Módulos:
  1. Fundamentos da Elétrica — aulas 1–7
  2. Segurança, Proteção e Ferramentas — aulas 8–13
  3. Instalações Elétricas na Prática — aulas 14–23
  4. Aterramento e Quadros de Distribuição — aulas 24–30

## 3. Banco de dados — Supabase

- Projeto: `https://vvsyquozzttiivgsswfz.supabase.co`
- Acesso pelo servidor via PostgREST com `SUPABASE_SERVICE_ROLE_KEY`
- Tabelas (`supabase/schema.sql`):

| Tabela | Chave | Para que serve |
| --- | --- | --- |
| `usuarios` | `id` (uuid) | nome, email único, `senha_hash`, `confirmado`, `liberado`, `liberado_em`, `criado_ip` |
| `sessoes` | `token_hash` | sessões ativas (`user_id`, `expira_em`) |
| `email_tokens` | `id` (uuid) | tokens de e-mail (ex.: recuperação de senha), com validade e `usado` |
| `pagamentos` | `id` (uuid) | `mp_id` único (id interno da cobrança/registro), valor, status, método |

- **RLS ligado e sem políticas:** somente a `service_role` (servidor) lê/escreve.
- `usuarios.confirmado` existe no schema; no fluxo atual o cadastro já define `confirmado: true`.
- Pagamentos manuais registrados pelo admin usam método como `pix-manual-fixo`.

## 4. Backend — `server.js`

- Node.js 22 + Express 4 + `dotenv`
- Senhas com `scrypt` + salt; sessões com token aleatório (hash no banco)
- Sessão do aluno em cookie HttpOnly `learis_sessao` (30 dias) + `Authorization: Bearer`
- Sessão admin em cookie HttpOnly `learis_admin` (protegida por `ADMIN_SENHA`, HMAC com expiração)
- Exporta o app para serverless (`api/index.js`) e só chama `app.listen` quando executado direto

### Rotas principais
- **Autenticação:**
  - `POST /api/auth/cadastro` — cria conta já confirmada (sem e-mail de confirmação)
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
  - `POST /api/auth/solicitar-recuperacao`, `POST /api/auth/redefinir-senha`
  - `GET /api/auth/confirmar-email` e `POST /api/auth/reenviar-confirmacao` — mantidos por compatibilidade (confirmação não é mais exigida no fluxo)
- **Pagamento (fluxo atual — Pix fixo/manual):**
  - `POST /api/pagamento/pix` — retorna dados do Pix fixo (copia e cola, chave, valor)
  - `POST /api/pagamento/status` — retorna se o usuário está liberado (liberação manual)
  - `POST /api/pagamento/simular` — somente com `ALLOW_DEV_PAYMENT=1` e fora de produção
- **Admin (liberação manual):**
  - `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me`
  - `GET /api/admin/usuarios` — lista/busca usuários
  - `POST /api/admin/liberar` — libera acesso do usuário, registra pagamento manual e envia e-mail de acesso liberado
- **PagBank automático (legado/alternativo, não ativo):**
  - Endpoints e webhook (`/api/pagbank/webhook`) permanecem implementados; dependem de liberação/whitelist da conta para Pix via API em produção.
- **Infra:**
  - `GET /api/config` — valor, descrição, `pagamento: "pix-fixo-manual"`, `pixCopiaECola`, `pixChave`, `whatsappAdminUrl`, `devPayment`, banco
  - `GET /api/health` — status de banco/Supabase/tabelas, flags de PagBank/e-mail
- **E-mails (Resend):** recuperação de senha e “acesso liberado” (confirmação de cadastro removida do fluxo). Sem `RESEND_API_KEY`, links de recuperação podem aparecer no console (fora de produção).
- **Proteção de aulas:** `/aulas` (`/aulas.html`, `/area-do-aluno`) exige login e `liberado`; HTML em `private/`, fora de `public/`.

## 5. Frontend — `public/`

| Arquivo | O que é |
| --- | --- |
| `index.html` | Login; exibe mensagem pós-cadastro e redireciona para `/pagamento.html` ou `/aulas` |
| `cadastro.html` | Criar conta (sem confirmação de e-mail) e redireciona para login |
| `pagamento.html` | Pix fixo (QR + copia e cola), valor R$ 16,90, aviso para enviar comprovante no WhatsApp, verificação de liberação manual |
| `admin.html` | Área administrativa (senha) para buscar usuários e liberar acesso |
| `confirmar-email.html` | Página de confirmação (compatibilidade; fluxo de cadastro não depende mais dela) |
| `recuperar-senha.html` / `redefinir-senha.html` | Fluxo de nova senha |
| `404.html` | Página não encontrada |
| `auth.js` | Helpers de sessão/fetch/UI |
| `config-site.js` | Config pública de reserva (valor, suporte do painel de aulas) |
| `css/` | `estilo.css` (compartilhado), `entrada.css` (index) |
| `js/energia.js` | Efeitos visuais da index |
| `image/banner.jpg` | Banner da index |

- Suporte no painel de aulas (`config-site.js`): WhatsApp (grupo) e e-mail `learisgrup@gmail.com`.
- WhatsApp para envio de comprovante de pagamento: configurado via `WHATSAPP_ADMIN_URL` (produção).

## 6. Deploy — Vercel

- **URL pública:** `https://learis.com.br` (e `www.learis.com.br`)
- **Projeto:** `curso-eletricista` — `prj_KlVm7uMSmYTpFJ2bxSfQpM9RP5Vv` (team `team_K38yXqOMgBv9rVeEHfwukmPt`)
- **Repo conectado:** `matrixlearis-ctrl/curso-eletricista`, branch `main`, deploy automático
- **Produção atualizada** com commits até `60374cd` (Pix fixo/manual, admin, cadastro sem confirmação de e-mail)
- **Variáveis relevantes em produção:** Supabase, `PUBLIC_BASE_URL`, `VALOR_ACESSO`, `NODE_ENV`, Resend, PagBank (`PAGBANK_ENV`, `PAGBANK_WEBHOOK_URL`, `PAGBANK_TOKEN` configurado), `ADMIN_SENHA`, `WHATSAPP_ADMIN_URL` (entre outras). `MP_ACCESS_TOKEN` removido anteriormente.

Arquivos de deploy: `api/index.js`, `vercel.json`, `.vercelignore`.

## 7. Repositório GitHub

- `https://github.com/matrixlearis-ctrl/curso-eletricista` (branch `main`)
- Commits recentes (além do histórico anterior do projeto):
  - `9af091b` — Migra pagamento para PagBank e remove Mercado Pago
  - `9057284` — Corrige consulta de charge e valida URL HTTPS do webhook PagBank
  - `6c4c19a` — Registra testes sandbox do PagBank no resumo
  - `7bd3446` — Usa Pix fixo com liberação manual e área admin
  - `60374cd` — Remove confirmação de e-mail no cadastro
- Histórico anterior inclui: criação do projeto, deploy Vercel, modernização da index, painel de aulas, ajustes de preço para R$ 16,90 etc.
- `.env`, `data/`, `node_modules/` e segredos não versionados.

## 8. Variáveis de ambiente

Modelo em `.env.example` (local em `.env`, produção na Vercel).

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Banco Supabase (obrigatórias) |
| `PUBLIC_BASE_URL` | Base pública do site |
| `VALOR_ACESSO`, `DESCRICAO_PAGAMENTO`, `SESSAO_DIAS` | Produto/sessão |
| `PIX_CHAVE_FIXA` | Chave Pix usada no QR/copia e cola fixo (padrão: chave configurada no projeto) |
| `PIX_RECEBEDOR_NOME`, `PIX_RECEBEDOR_CIDADE` | Dados do recebedor no BR Code estático |
| `WHATSAPP_ADMIN_URL` | Link do WhatsApp para envio de comprovante (botão na página de pagamento) |
| `ADMIN_SENHA` | Senha da área administrativa `/admin.html` |
| `RESEND_API_KEY`, `EMAIL_FROM` | E-mails transacionais (recuperação, acesso liberado) |
| `PAGBANK_ENV`, `PAGBANK_TOKEN`, `PAGBANK_WEBHOOK_URL`, `PAGBANK_EXPIRACAO_MINUTOS` | Integração PagBank automática (legado/opcional) |
| `NODE_ENV`, `ALLOW_DEV_PAYMENT` | Ambiente e simulação local |

## 9. Como rodar localmente

```powershell
npm install
npm start
```

Abrir `http://localhost:3000`.

- Sem `RESEND_API_KEY`, e-mails não são enviados (links de recuperação podem aparecer no console em dev).
- `ALLOW_DEV_PAYMENT=1` (fora de produção) libera simulação de pagamento.
- Para usar admin localmente, definir `ADMIN_SENHA` no `.env`.

## 10. Fluxo validado (estado atual)

- **Produção (20/11/2026):** deploy `60374cd` ativo; `/api/config` retorna `pagamento: "pix-fixo-manual"`, valor `16.9`, Pix fixo e `whatsappAdminUrl`.
- **Cadastro → login → pagamento:** cadastro sem confirmação de e-mail, login direto e redirecionamento para `/pagamento.html` quando não liberado.
- **Pagamento:** página exibe QR/copia e cola fixo, instruções e botão para WhatsApp; liberação depende de ação manual.
- **Admin:** `/admin.html` disponível para login e liberação manual de usuários (com registro de pagamento manual e e-mail de acesso liberado).
- **Aulas:** `/aulas` protegido (login + liberado), conteúdo em `private/aulas.html`.
- **Histórico:** testes anteriores de Pix automático (Mercado Pago e PagBank sandbox) e confirmação de e-mail via Resend permanecem registrados em commits/histórico; não representam o fluxo ativo atual.

## 11. Segurança

- Senhas com `scrypt` + salt; tokens de sessão com hash
- Cookies HttpOnly + SameSite=Lax; Secure em HTTPS
- `private/aulas.html` fora de `public/`
- RLS no Supabase sem políticas (apenas `service_role`)
- Área admin protegida por senha (`ADMIN_SENHA`) com sessão HMAC em cookie HttpOnly
- Webhook PagBank (quando usado) valida assinatura e confirma cobrança na API
- **Recomendação:** rotacionar segredos que tenham sido expostos em conversas/logs (token Vercel, GitHub, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, tokens PagBank/Mercado Pago antigos) e evitar compartilhar senhas em texto.

## 12. Pendências / próximos passos

1. **Operação manual:** validar na prática o recebimento dos comprovantes pelo WhatsApp e a liberação via `/admin.html` (e conferir entrega do e-mail “acesso liberado”, se Resend ativo).
2. **Segredos:** rotacionar credenciais expostas anteriormente (Vercel, GitHub, Supabase, Resend, PagBank/MP conforme aplicável).
3. **PagBank automático (opcional):** solicitar ao PagBank a liberação (whitelist) para criar cobranças Pix via API (`POST /orders` com `qr_codes`) em produção, caso queira voltar à confirmação/liberação automática.
4. **Conteúdo/UX (opcional):** página de vendas pública, ajustes de textos e eventual personalização adicional do nome exibido no recebedor Pix conforme permissões da conta PagBank.
