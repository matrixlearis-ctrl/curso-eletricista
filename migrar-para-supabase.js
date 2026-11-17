/**
 * Copia os dados do banco antigo (SQLite, data/app.db) para o Supabase.
 * Use uma unica vez, depois de:
 *   1. executar supabase/schema.sql no SQL Editor do Supabase
 *   2. preencher SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Uso: node migrar-para-supabase.js
 */
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ARQUIVO_SQLITE = path.join(__dirname, 'data', 'app.db');

function headers() {
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json'
  };
}

async function enviar(tabela, linhas) {
  if (!linhas.length) return { tabela, enviadas: 0 };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?on_conflict=id`, {
    method: 'POST',
    headers: Object.assign(headers(), { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(linhas)
  });
  if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return { tabela, enviadas: linhas.length };
}

async function principal() {
  console.log('\n== Migracao SQLite -> Supabase ==\n');

  if (!SUPABASE_URL || !KEY) {
    console.log('[ERRO] Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env\n');
    process.exitCode = 1;
    return;
  }
  if (!fs.existsSync(ARQUIVO_SQLITE)) {
    console.log('[AVISO] Nao existe banco local em data/app.db - nada a migrar.\n');
    return;
  }

  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ARQUIVO_SQLITE);

  const usuarios = db.prepare('SELECT * FROM usuarios').all();
  const pagamentos = db.prepare('SELECT * FROM pagamentos').all();

  console.log(`Encontrados: ${usuarios.length} usuario(s), ${pagamentos.length} pagamento(s).\n`);

  await enviar(
    'usuarios',
    usuarios.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      senha_hash: u.senha_hash,
      confirmado: !!u.confirmado,
      liberado: !!u.liberado,
      liberado_em: u.liberado_em || null,
      criado_ip: u.criado_ip || null,
      criado_em: u.criado_em
    }))
  );
  console.log(`[ok] usuarios: ${usuarios.length}`);

  if (pagamentos.length) {
    await enviar(
      'pagamentos',
      pagamentos.map((p) => ({
        user_id: p.user_id,
        mp_id: p.mp_id,
        valor: p.valor,
        status: p.status,
        metodo: p.metodo,
        criado_em: p.criado_em
      }))
    );
    console.log(`[ok] pagamentos: ${pagamentos.length}`);
  }

  console.log('\nMigracao concluida. As senhas continuam valendo (o hash e o mesmo).\n');
}

principal().catch((e) => {
  console.error('\n[ERRO]', e.message, '\n');
  process.exitCode = 1;
});
