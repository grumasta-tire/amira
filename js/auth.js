// --- Login / sesi ---
async function enter() {
  $('login').hidden = true; $('app').hidden = false;
  await sb.rpc('generate_sessions', { days_ahead: 30 }); // buat sesi otomatis 30 hari ke depan
  const { data: { user } } = await sb.auth.getUser();
  const { data: p } = await sb.from('profiles').select('full_name,role').eq('id', user.id).single();
  if (p) $('who').textContent = `${p.full_name || ''} (${p.role})`;
  $('nav-siswa').hidden = $('nav-jadwal').hidden = $('nav-bayar').hidden = $('nav-laporan').hidden = !(p && p.role === 'admin');
  load();
}
function leave() { $('app').hidden = true; $('login').hidden = false; document.querySelector('#nav [data-v="sesi"]').click(); }

$('lf').onsubmit = async e => {
  e.preventDefault();
  $('lerr').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
  if (error) { $('lerr').textContent = 'Gagal masuk: ' + error.message; return; }
  $('pw').value = '';
  enter();
};
$('out').onclick = async () => { await sb.auth.signOut(); leave(); };

sb.auth.getSession().then(({ data: { session } }) => session ? enter() : leave());
