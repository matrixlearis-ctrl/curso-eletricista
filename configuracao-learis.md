# Configuracao para o dominio learis.com.br

Sistema: Node.js + Express + **Supabase (Postgres)** + Mercado Pago (Pix) + Resend.
As tabelas ficam no projeto Supabase `https://vvsyquozzttiivgsswfz.supabase.co` e sao criadas por `supabase/schema.sql`.

## 1. Variaveis de ambiente (producao)

Defina no painel do servidor/hospedagem. **Nunca salve valores secretos em arquivos versionados.**

| Variavel | Exemplo / observacao |
| --- | --- |
| `SUPABASE_URL` | `https://vvsyquozzttiivgsswfz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave secreta do servidor (Settings > API Keys > service_role) |
| `PUBLIC_BASE_URL` | `https://learis.com.br` |
| `MP_ACCESS_TOKEN` | Access Token do Mercado Pago (producao) |
| `RESEND_API_KEY` | chave da API do Resend |
| `EMAIL_FROM` | `Curso de Eletricista <no-reply@learis.com.br>` |
| `VALOR_ACESSO` | `149` (ou o preco definido) |
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

## 3. Mercado Pago (Pix)

- **Webhook**: `https://learis.com.br/api/mercadopago/webhook`
  - Gerado automaticamente a partir de `PUBLIC_BASE_URL` ao criar a cobranca.
  - Aceita notificacoes `payment` (JSON) e tambem `?type=payment&data.id=...`.
- O backend **sempre consulta** `GET /v1/payments/{id}` antes de liberar o aluno (nao confia apenas no corpo do webhook).
- A liberacao e idempotente (tabela `pagamentos`, `mp_id` unico).
- O dominio precisa estar publico com **HTTPS** para receber as notificacoes.
- Se a mesma conta Mercado Pago atender mais de um projeto, confira se cada webhook aponta para o projeto correto (`external_reference` = id do usuario do curso).

## 4. E-mails (Resend)

- Verifique o dominio remetente (ex.: `learis.com.br`) no Resend e use um `EMAIL_FROM` desse dominio.
- Sem `RESEND_API_KEY`, o sistema continua funcionando em modo local: o link de confirmacao/redefinicao aparece no console e na propria tela.
- Templates ja estao em portugues: confirmacao de cadastro, redefinicao de senha e acesso liberado.

## 5. Hospedagem

- Plano compartilhado tradicional da HostGator (PHP/cPanel) **nao executa Node.js**.
- Opcoes compativeis: VPS, plano com suporte a Node da HostGator, ou plataformas como Railway/Render.
- Passos: enviar o projeto sem `node_modules` e sem `.env` → `npm install --omit=dev` → definir variaveis → `npm start` (ou PM2) → apontar o dominio e ativar SSL.
- O arquivo `data/app.db` precisa ficar em disco persistente (nao use ambiente serverless com filesystem efemero).

## 6. Seguranca

- O `MP_ACCESS_TOKEN` foi compartilhado em conversa: **rotacione/revogue e gere um novo** no painel do Mercado Pago antes de ir para producao.
- Senhas sao armazenadas com `scrypt` + salt (nunca em texto puro).
- Sessao em cookie `HttpOnly` (`learis_sessao`), validade de 30 dias, `Secure` automatico quando `PUBLIC_BASE_URL` e HTTPS.
- `private/aulas.html` fica fora da pasta publica: o acesso so acontece pela rota `/aulas`, que exige login + liberacao.
- Limite simples de tentativas por IP nas rotas `/api/*`.

## 7. Checklist de validacao em producao

- [ ] `/api/auth/cadastro` cria usuario e envia e-mail
- [ ] Link de confirmacao abre `/confirmar-email.html` e confirma
- [ ] Login cria sessao e leva para `/pagamento.html`
- [ ] `/api/pagamento/pix` retorna QR Code e `mpId`
- [ ] Webhook aprova e libera o usuario
- [ ] `/aulas` abre somente para aluno liberado (e redireciona os demais)
- [ ] E-mail "acesso liberado" chega ao aluno
- [ ] Layout conferido no celular (a maioria dos alunos assiste pelo telefone)
