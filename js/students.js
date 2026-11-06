// Halaman Siswa (khusus admin): data siswa + biaya bulanan
const rp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
let studs = [], sCur = null;
const PAKET = { reguler: { label: 'Reguler', quota: 4, fee: 250000 }, promo: { label: 'Promo', quota: 8, fee: 200000 } };
$('sf').innerHTML = Object.entries(PAKET).map(([k, v]) => `<option value="${k}">${v.label}: ${v.quota}x pertemuan, ${rp.format(v.fee)}</option>`).join('');

$('nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  [...$('nav').children].forEach(x => x.setAttribute('aria-pressed', x === b));
  $('v-sesi').hidden = b.dataset.v !== 'sesi';
  $('v-siswa').hidden = b.dataset.v !== 'siswa';
  $('v-jadwal').hidden = b.dataset.v !== 'jadwal';
  $('v-bayar').hidden = b.dataset.v !== 'bayar';
  $('v-laporan').hidden = b.dataset.v !== 'laporan';
  if (b.dataset.v === 'siswa') loadStudents();
  if (b.dataset.v === 'jadwal') loadSchedules();
  if (b.dataset.v === 'bayar') loadPayments();
  if (b.dataset.v === 'laporan') loadReport();
};

async function loadStudents() {
  $('slist').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('students')
    .select('id,name,contact,grade,notes,is_active,student_fees(monthly_fee,package)').order('name');
  if (error) { $('slist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  studs = data.map(s => { const f = [].concat(s.student_fees || [])[0] || {}; return { ...s, fee: f.monthly_fee ?? '', pkg: f.package || 'reguler' }; });
  if (!studs.length) { $('slist').innerHTML = '<p class="msg">Belum ada siswa. Klik Tambah siswa.</p>'; return; }
  $('slist').innerHTML = studs.map((s, i) => `<button class="row srow ${s.is_active ? '' : 'off'}" data-i="${i}">
    <span><span class="n">${esc(s.name)}</span><span class="s">${esc([PAKET[s.pkg].label, s.grade, s.contact].filter(Boolean).join(', '))}</span></span>
    <span class="t">${s.fee === '' ? '-' : rp.format(s.fee)}</span>
    <span class="tag ${s.is_active ? 'selesai' : 'pindah'}">${s.is_active ? 'Aktif' : 'Nonaktif'}</span></button>`).join('');
}

function openStudent(s) {
  sCur = s;
  $('sd-title').textContent = s ? 'Ubah siswa' : 'Tambah siswa';
  $('sn').value = s?.name || ''; $('sc').value = s?.contact || ''; $('sg').value = s?.grade || '';
  $('sf').value = s?.pkg || 'reguler'; $('sx').value = s?.notes || '';
  $('sa').checked = s ? s.is_active : true;
  $('serr').textContent = '';
  $('sdlg').showModal();
  loadDel(s);
}
$('sadd').onclick = () => openStudent(null);
$('slist').onclick = e => { const b = e.target.closest('.srow'); if (b) openStudent(studs[+b.dataset.i]); };
$('scancel').onclick = () => $('sdlg').close();

$('sform').onsubmit = async e => {
  e.preventDefault();
  const row = { name: $('sn').value.trim(), contact: $('sc').value.trim() || null, grade: $('sg').value.trim() || null,
                notes: $('sx').value.trim() || null, is_active: $('sa').checked };
  let r, id = sCur?.id;
  if (sCur) r = await sb.from('students').update(row).eq('id', id);
  else { r = await sb.from('students').insert(row).select('id').single(); id = r.data?.id; }
  if (!r.error) { const k = PAKET[$('sf').value]; r = await sb.from('student_fees').upsert({ student_id: id, package: $('sf').value, monthly_fee: k.fee, monthly_quota: k.quota }); }
  if (!r.error) r = await sb.rpc('generate_sessions', { days_ahead: 30 });
  if (r.error) { $('serr').textContent = 'Gagal menyimpan: ' + r.error.message; return; }
  $('sdlg').close();
  loadStudents();
};

// Hapus siswa: diblokir jika punya pembayaran; selain itu perlu mengetik nama untuk konfirmasi.
async function loadDel(s) {
  $('sdel').hidden = !s;
  if (!s) return;
  $('sdform').hidden = true; $('sdname').value = ''; $('sdbtn').disabled = true;
  $('sdinfo').textContent = 'Memeriksa data terkait…';
  const cnt = t => sb.from(t).select('id', { count: 'exact', head: true }).eq('student_id', s.id);
  const [p, j, q] = await Promise.all([cnt('payments'), cnt('schedules'), cnt('sessions')]);
  if (sCur !== s) return;
  if (p.error || j.error || q.error) { $('sdinfo').textContent = 'Gagal memeriksa data terkait.'; return; }
  if (p.count > 0) {
    $('sdinfo').textContent = `Siswa ini punya ${p.count} catatan pembayaran, jadi tidak bisa dihapus. Nonaktifkan saja dengan menghilangkan centang "Siswa aktif".`;
    return;
  }
  $('sdinfo').textContent = `Ikut terhapus permanen: ${j.count} jadwal dan ${q.count} sesi.`;
  $('sdform').hidden = false;
}
$('sdname').oninput = () => { $('sdbtn').disabled = $('sdname').value.trim().toLowerCase() !== (sCur?.name || '').toLowerCase(); };
$('sdname').onkeydown = e => { if (e.key === 'Enter') e.preventDefault(); };
$('sdbtn').onclick = async () => {
  const { error } = await sb.from('students').delete().eq('id', sCur.id);
  if (error) { $('serr').textContent = 'Gagal menghapus: ' + error.message; return; }
  $('sdlg').close();
  loadStudents();
};
