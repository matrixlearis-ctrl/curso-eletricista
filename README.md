# Curso de Eletricista — learis.com.br

Area de aulas com login proprio e pagamento Pix (Mercado Pago), no modelo do LotoBot.
Banco de dados: **Supabase** (Postgres).

## Configuracao inicial (uma vez)

1. **Criar as tabelas no Supabase**
   - Abra o painel do projeto `vvsyquozzttiivgsswfz`
   - Menu **SQL Editor** → **New query**
   - Cole todo o conteudo de `supabase/schema.sql` e clique em **Run**

2. **Preencher a chave secreta no `.env`**
   - No Supabase: **Project Settings → API Keys → service_role** (secret)
   - Abra o arquivo `.env` e cole em `SUPABASE_SERVICE_ROLE_KEY=`
   - Nunca coloque essa chave em pagina, codigo ou repositorio

3. **Testar a conexao**
   ```powershell
   node verificar-supabase.js
   ```

## Como rodar

Duplo clique em **`iniciar.bat`** (abre o navegador e liga o servidor), ou:

```powershell
npm start
```

Acesse `http://localhost:3000`. A janela preta precisa ficar aberta: ela e o servidor.

## Paginas

| Endereco | O que e |
| --- | --- |
| `/` | Redireciona para login, pagamento ou aulas conforme a sessao |
| `/index.html` | Login |
| `/cadastro.html` | Criar conta |
| `/confirmar-email.html?t=...` | Confirmacao de e-mail (link do e-mail) |
| `/recuperar-senha.html` | Pedir link de nova senha |
| `/redefinir-senha.html?t=...` | Criar nova senha |
| `/pagamento.html` | Gerar Pix, copiar codigo, verificar pagamento |
| `/aulas` | **Area protegida** com as 30 aulas (so para aluno liberado) |

## Estrutura

```
server.js                    Backend (Express + Supabase + Mercado Pago + Resend)
supabase/schema.sql          Tabelas que devem ser criadas no Supabase
verificar-supabase.js        Testa a conexao com o Supabase
conferir-dados.js            Mostra quantas contas/pagamentos existem no Supabase
migrar-para-supabase.js      Copia dados do banco antigo (SQLite) para o Supabase
public/                      Paginas publicas (login, cadastro, pagamento...)
private/aulas.html           Area de aulas (nunca servida direto; passa pelo login)
data/app.db                  Banco SQLite antigo (backup, nao e mais usado)
```

## Variaveis de ambiente (`.env`)

- `SUPABASE_URL` — `https://vvsyquozzttiivgsswfz.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — chave secreta do servidor
- `PUBLIC_BASE_URL` — `http://localhost:3000` local, `https://learis.com.br` em producao
- `MP_ACCESS_TOKEN` — Access Token do Mercado Pago (Pix)
- `RESEND_API_KEY` — envio de e-mails (sem ela, os links aparecem no console e na tela)
- `VALOR_ACESSO` — preco do curso (padrao 149)
- `ALLOW_DEV_PAYMENT=1` — mostra o botao "Simular pagamento" apenas fora de producao

**Nunca** coloque o `.env` em repositorio ou em pasta publica.

## Modo local (sem Mercado Pago)

Com `ALLOW_DEV_PAYMENT=1` e `NODE_ENV=development`, a pagina de pagamento mostra
o botao **Simular pagamento (modo local)**, que libera o acesso para testar as aulas.
Em producao esse botao nao existe.

## Publicacao

Precisa de um ambiente com **Node.js** (VPS, plano Node, Railway, Render...).
Plano compartilhado tradicional da HostGator normalmente nao executa Node.

1. Enviar o projeto (sem `node_modules` e sem `.env`)
2. Rodar `npm install --omit=dev`
3. Configurar as variaveis de ambiente no painel
4. Iniciar com `npm start` (ou PM2)
5. Apontar `learis.com.br` para o servidor e ativar HTTPS
6. Cadastrar o webhook `https://learis.com.br/api/mercadopago/webhook` no Mercado Pago
