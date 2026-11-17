/**
 * Testa a conexao com o Supabase usando as variaveis do .env.
 * Uso: node verificar-supabase.js
 */
require('dotenv').config();

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

async function principal() {
  console.log('\n== Verificacao do Supabase ==\n');
  console.log('URL:', URL_BASE || '(nao definida)');

  if (!URL_BASE) {
    console.log('\n[ERRO] SUPABASE_URL nao esta no .env\n');
    process.exitCode = 1;
    return;
  }
  if (!KEY) {
    console.log('\n[ERRO] SUPABASE_SERVICE_ROLE_KEY nao esta no .env');
    console.log('       Supabase > Project Settings > API > service_role (secret)\n');
    process.exitCode = 1;
    return;
  }
  console.log('Chave:', KEY.slice(0, 12) + '...' + KEY.slice(-6), `(${KEY.length} caracteres)`);

  const tabelas = ['usuarios', 'sessoes', 'email_tokens', 'pagamentos'];
  let problemas = 0;

  for (const tabela of tabelas) {
    try {
      const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?select=*&limit=1`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }
      });
      if (r.ok) {
        console.log(`  [ok]    ${tabela}`);
      } else {
        const txt = await r.text();
        problemas++;
        console.log(`  [erro]  ${tabela} -> HTTP ${r.status}: ${txt.slice(0, 160)}`);
      }
    } catch (e) {
      problemas++;
      console.log(`  [erro]  ${tabela} -> ${e.message}`);
    }
  }

  if (problemas === 0) {
    console.log('\nTudo certo! Banco pronto para uso.\n');
  } else {
    console.log('\nVerifique se o arquivo supabase/schema.sql foi executado no SQL Editor.\n');
    process.exitCode = 1;
  }
}

principal();
