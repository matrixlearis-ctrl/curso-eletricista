# Configuracao para o dominio learis.com.br

Sistema: Node.js + Express + **Supabase (Postgres)** + PagBank (Pix) + Resend.
As tabelas ficam no projeto Supabase `https://vvsyquozzttiivgsswfz.supabase.co` e sao criadas por `supabase/schema.sql`.

## 1. Variaveis de ambiente (producao)

Defina no painel do servidor/hospedagem. **Nunca salve valores secretos em arquivos versionados.**

| Variavel | Exemplo / observacao |
| --- | --- |
| `SUPABASE_URL` | `https://vvsyquozzttiivgsswfz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta do servidor (Settings > API Keys > service_role) |
| `PUBLIC_BASE_URL` | `https://learis.com.br` |
| `PAGBANK_TOKEN` | token da API PagBank (producao) |
| `PAGBANK_ENV` | `production` (use `sandbox` apenas nos testes) |
| `PAGBANK_WEBHOOK_URL` | opcional; padrao `https://learis.com.br/api/pagbank/webhook` |
| `RESEND_API_KEY` | chave da API do Resend |
| `EMAIL_FROM` | `Curso de Eletricista <no-reply@learis.com.br>` |
| `VALOR_ACESSO` | `16.9` (R$ 16,90) |
| `DESCRICAO_PAGAMENTO` | `Curso de Eletricista - Acesso completo` |
| `SESSAO_DIAS` | `30` |
| `NODE_ENV` | `production` |
| `PORT` | porta entregue pela hospedagem (ex.: `3000`) |

> **Nao use `ALLOW_DEV_PAYMENT` em producao.** Ele libera a simulacao de pagamento e so funciona com `NODE_ENV` diferente de `production`.

## 2. Frontend (`public/config-site.js`)

- `nome`: nome exibido
- `valorAcesso`: valor reserva (o valor real vem de `/api/config`)
- `descricaoPagamento`: descricao da cobranca
- `suporteWhatsapp` / `emailSuporte`: opcionais, para contato

## 3. PagBank (Pix) — unico meio de pagamento

- **Webhook**: `https://learis.com.br/api/pagbank/webhook`
  - Enviado automaticamente como `notification_urls` em cada `POST /orders`.
  - O dominio precisa estar publico com **HTTPS**. O PagBank recusa `http://localhost...`;
    em testes locais use um tunel HTTPS ou defina `PAGBANK_WEBHOOK_URL` com uma URL publica.
- O aluno informa o **CPF** na pagina de pagamento; o backend envia `customer.tax_id` (obrigatorio na API PagBank).
- `POST /orders` cria uma cobranca PIX de `VALOR_ACESSO` em centavos (`1690` = R$ 16,90),
  com `reference_id` = id do usuario. O QR Code vem em `charges[0].qr_code.text`
  e a imagem e buscada pelo link `QRCODE.BASE64`.
- O webhook valida a assinatura `x-authenticity-token` = `SHA256(token + "-" + corpo_bruto)`
  e filtra apenas `x-product-origin: ORDER` / `x-product-id: ORDE_...`.
- Antes de liberar, o backend consulta `GET /charges/{id}` e exige `status === "PAID"`
  e `reference_id` igual ao usuario da sessao.
- A liberacao e idempotente (tabela `pagamentos`, coluna `mp_id` reaproveitada para o `CHAR_...`).
- O QR Code e de uso unico e expira em `PAGBANK_EXPIRACAO_MINUTOS` (padrao 30).
- `PAGBANK_ENV=sandbox` usa `https://sandbox.api.pagseguro.com`; producao usa `https://api.pagseguro.com`.

## 4. E-mails (Resend)

- `RESEND_API_KEY` configurada em 17/11/2026 e validada com envio real (status `delivered`).
- Remetente final: `Curso de Eletricista <no-reply@learis.com.br>` (envio real confirmado como `delivered`).
- `learis.com.br` verificado no Resend em 17/11/2026 (id `a50954c1-a025-4861-a506-e86f7ff536bf`,
  regiao `sa-east-1`). Registros DNS na HostGator: TXT `resend._domainkey`, MX `send` (prioridade 10,
  `feedback-smtp.sa-east-1.amazonses.com`), TXT `send` (`v=spf1 include:amazonses.com ~all`) e
  CNAME `rsend` → `send.forge.rmta.net`.
- Sem `RESEND_API_KEY`, o sistema continua funcionando em modo local: o link de confirmacao/redefinicao aparece no console e na propria tela.
- Templates ja estao em portugues: confirmacao de cadastro, redefinicao de senha e acesso liberado.

## 5. Hospedagem (Vercel)

O projeto esta preparado para a Vercel (serverless):

- `api/index.js` exporta o app Express (sem abrir porta)
- `vercel.json` manda todas as rotas para a funcao e inclui `public/` e `private/`
- `.vercelignore` deixa de fora `.env`, `data/` e `node_modules/`

Passos:

1. <https://vercel.com/new> → importar o repositorio `matrixlearis-ctrl/curso-eletricista`
2. Framework Preset **Other**; build command e output vazios
3. Cadastrar as variaveis da secao 1 em **Environment Variables** (sem `ALLOW_DEV_PAYMENT`)
4. **Deploy** → testar na URL `*.vercel.app`
5. **Settings → Domains** → adicionar `learis.com.br` e `www.learis.com.br` e criar os DNS indicados
6. Gerar o token de producao no PagBank (**Vendas → Integrações → Gerar Token**) e definir `PAGBANK_TOKEN` + `PAGBANK_ENV=production` na Vercel

Observacoes:

- Nao existe disco local na Vercel: por isso o banco e o Supabase (nada de `data/app.db`)
- Funcao Hobby tem ~10s por requisicao — suficiente para este app
- Regiao padrao `iad1`; se o Supabase estiver no Brasil, use `"regions": ["gru1"]` no `vercel.json`
- Plano compartilhado da HostGator (PHP/cPanel) **nao executa Node.js**; VPS/Railway tambem funcionam,
  basta rodar `npm start`

## 6. Seguranca

- `PAGBANK_TOKEN` deve ser gerado no painel PagBank e ficar **somente** em `.env`/Vercel. Tokens antigos do Mercado Pago nao sao mais usados e devem ser revogados.
- Webhook validado por SHA256 com o proprio token; eventos sem assinatura valida sao descartados.
- Senhas sao armazenadas com `scrypt` + salt (nunca em texto puro).
- Sessao em cookie `HttpOnly` (`learis_sessao`), validade de 30 dias, `Secure` automatico quando `PUBLIC_BASE_URL` e HTTPS.
- `private/aulas.html` fica fora da pasta publica: o acesso so acontece pela rota `/aulas`, que exige login + liberacao.
- Limite simples de tentativas por IP nas rotas `/api/*`.

## 7. Checklist de validacao em producao

- [ ] `/api/auth/cadastro` cria usuario e envia e-mail
- [ ] Link de confirmacao abre `/confirmar-email.html` e confirma
- [ ] Login cria sessao e leva para `/pagamento.html`
- [ ] `/api/pagamento/pix` retorna QR Code e `chargeId`
- [ ] Webhook assinado aprova e libera o usuario
- [ ] `/aulas` abre somente para aluno liberado (e redireciona os demais)
- [ ] E-mail "acesso liberado" chega ao aluno
- [ ] Layout conferido no celular (a maioria dos alunos assiste pelo telefone)
