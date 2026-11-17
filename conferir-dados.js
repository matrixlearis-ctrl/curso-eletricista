require('dotenv').config();

const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function contar(tabela) {
  const r = await fetch(`${URL_BASE}/rest/v1/${tabela}?select=*`, {
    headers: Object.assign({}, h, { Prefer: 'count=exact', Range: '0-0' })
  });
  const faixa = r.headers.get('content-range') || '?';
  return `${tabela}: ${faixa.split('/')[1] || '?'} registro(s)`;
}

async function principal() {
  console.log('\n== Dados no Supabase ==\n');
  for (const t of ['usuarios', 'sessoes', 'email_tokens', 'pagamentos']) {
    console.log('  ' + (await contar(t)));
  }

  const r = await fetch(
    `${URL_BASE}/rest/v1/usuarios?select=nome,email,confirmado,liberado,criado_em&order=criado_em.asc`,
    { headers: h }
  );
  const usuarios = await r.json();
  console.log('\n== Contas ==');
  for (const u of usuarios) {
    console.log(`  ${u.email} | ${u.nome} | confirmado=${u.confirmado} | liberado=${u.liberado}`);
  }

  const rp = await fetch(`${URL_BASE}/rest/v1/pagamentos?select=valor,status,metodo,criado_em`, { headers: h });
  console.log('\n== Pagamentos ==');
  for (const p of await rp.json()) {
    console.log(`  R$ ${p.valor} | ${p.status} | ${p.metodo} | ${p.criado_em}`);
  }
  console.log('');
}

principal().catch((e) => {
  console.error('[ERRO]', e.message);
  process.exitCode = 1;
});
