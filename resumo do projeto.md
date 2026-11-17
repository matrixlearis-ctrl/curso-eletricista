# Resumo do Projeto — Curso de Eletricista (`https://learis.com.br`)

## 1. Objetivo
Curso de Eletricista no dominio `https://learis.com.br`, com sistema **no modelo do LotoBot**:
cadastro/login proprio, confirmacao de e-mail, recuperacao de senha, pagamento **Pix (Mercado Pago)**
com liberacao automatica por webhook e area de aulas protegida. Tudo responsivo, priorizando celular.

## 2. Conteudo do curso
- Origem dos videos: `https://eletrica-para-todos.tinyhugs.online/` (site publico)
- **30 aulas** em `private/aulas.html`, com player incorporado e botao "Assistir" em cada uma
- Aulas 9, 24 e 30 corrigidas com os links informados pelo usuario
- **Pendencia:** a Aula 28 ainda usa o mesmo video da Aula 24 (`IK0KOXY0v60`) — confirmar o link correto

## 3. Estado atual (funcionando)

### 3.1 Backend — `server.js`
- Node.js + Express
- Banco **Supabase** (Postgres via REST) — projeto `https://vvsyquozzttiivgsswfz.supabase.co`
  - Tabelas em `supabase/schema.sql`: `usuarios`, `sessoes`, `email_tokens`, `pagamentos`
  - RLS ligado sem politicas: so a `service_role` (servidor) acessa
  - Scripts de apoio: `verificar-supabase.js` (teste de conexao) e `migrar-para-supabase.js` (copia o banco SQLite antigo)
- Senhas com `scrypt` + salt; sessoes com token aleatorio (hash no banco)
- Sessao em cookie **HttpOnly** `learis_sessao` (30 dias) + suporte a `Authorization: Bearer`
- Rotas de autenticacao:
  - `POST /api/auth/cadastro`, `GET /api/auth/confirmar-email`, `POST /api/auth/reenviar-confirmacao`
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
  - `POST /api/auth/solicitar-recuperacao`, `POST /api/auth/redefinir-senha`
- Pagamento:
  - `POST /api/pagamento/pix` (cria cobranca Pix no Mercado Pago)
  - `POST /api/pagamento/status` (consulta e libera se aprovado)
  - `POST /api/mercadopago/webhook` (confirma o pagamento na API do MP antes de liberar; idempotente)
  - `POST /api/pagamento/simular` — **somente** com `ALLOW_DEV_PAYMENT=1` fora de producao
- E-mails via Resend (confirmacao, recuperacao, acesso liberado). Sem chave, os links aparecem no console e na tela.
- Protecao da area de aulas: `/aulas` exige login **e** `liberado=1`; o HTML fica em `private/` (fora de `public/`).

### 3.2 Frontend — `public/`
- `index.html` — login
- `cadastro.html` — criar conta (+ reenviar confirmacao)
- `confirmar-email.html` — valida o link do e-mail
- `recuperar-senha.html` / `redefinir-senha.html` — fluxo de nova senha
- `pagamento.html` — valor, QR Code, copia e cola, "Ja paguei" (verifica a cada 5s), modo local
- `404.html`, `auth.js` (helpers), `config-site.js` (config publica), `css/estilo.css`
- Layout mobile-first: 1 coluna no celular, botoes de largura total, sem rolagem horizontal

### 3.3 Arquivos de apoio
- `package.json` (express + dotenv), `iniciar.bat` (abre servidor + navegador)
- `supabase/schema.sql` (tabelas do Supabase), `verificar-supabase.js`, `migrar-para-supabase.js`
- `.env.example` (modelo, sem segredos) e `.env` local (nao versionar)
- `README.md` (como rodar) e `configuracao-learis.md` (dominio, webhook, e-mail, deploy)
- `.gitignore` (node_modules, .env, data, logs)
- `data/app.db` — banco SQLite antigo, mantido apenas como backup

## 4. Testes ja realizados
- Pagina de aulas aberta em **HTTP** (`localhost`): 30 cards, 29 YouTube + 1 Vimeo, sem erros no console
  → confirmado que o **erro 153** era causado por abrir o arquivo via `file://`
- Fluxo completo validado pela API e no Chrome:
  cadastro → link de confirmacao → confirmacao → login → pagamento → **simulacao** → `/aulas` com as 30 aulas
- Sem sessao, `/aulas` redireciona para o login; logado sem pagamento, redireciona para `/pagamento.html`
- Layout conferido em viewport mobile (390x844): sem overflow horizontal em aulas, login e pagamento

## 5. Como rodar
```powershell
# na pasta do projeto
npm start        # ou clique duas vezes em iniciar.bat
```
Abrir `http://localhost:3000`.

Para testes locais sem Mercado Pago, o `.env` tem `ALLOW_DEV_PAYMENT=1`
(botao "Simular pagamento (modo local)" na pagina de pagamento).

## 6. Configuracoes necessarias antes de publicar
1. `SUPABASE_SERVICE_ROLE_KEY` no ambiente (chave secreta do servidor)
   - Rodar `supabase/schema.sql` no SQL Editor do Supabase antes
2. `MP_ACCESS_TOKEN` do Mercado Pago no ambiente (nunca no codigo)
   - O token foi compartilhado em conversa: **rotacionar/gerar novo** antes de producao
3. `RESEND_API_KEY` + dominio remetente verificado
4. `PUBLIC_BASE_URL=https://learis.com.br`
5. `NODE_ENV=production` (desativa o modo de simulacao)
6. Webhook `https://learis.com.br/api/mercadopago/webhook` acessivel por HTTPS
7. Hospedagem: **Vercel** (ja configurada via `api/index.js` + `vercel.json` + `.vercelignore`)
   - Plano compartilhado da HostGator nao executa Node; VPS/Railway tambem funcionam
8. Preco definido: **R$ 19,90** (`VALOR_ACESSO=19.9`)

## 7. Proximos passos
1. Confirmar o link correto da **Aula 28**
2. Definir preco e textos finais (nome do curso, garantia, suporte)
3. Configurar Mercado Pago + Resend e testar um pagamento real de ponta a ponta
4. Publicar no ambiente com Node e testar no celular
5. Opcional: pagina de vendas publica, painel do aluno com progresso, marcação de aulas assistidas
