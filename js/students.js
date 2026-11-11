// Halaman Siswa (khusus admin): data siswa + biaya bulanan
const rp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
let studs = [], sCur = null;
const PAKET = { reguler1: { label: 'Reguler 1', quota: 4, fee: 200000 }, reguler2: { label: 'Reguler 2', quota: 8, fee: 400000 }, promo1: { label: 'Promo 1', quota: 8, fee: 300000 } };
const tgl = d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
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
  if (b.dataset.v === 'sesi') load();
};

async function loadStudents() {
  $('slist').innerHTML = '<p class="msg">Memuat…</p>';
  const m = ymd(new Date()).slice(0, 7) + '-01';
  const [s, p] = await Promise.all([
    sb.from('students').select('id,name,contact,grade,notes,registration_date,student_fees(monthly_fee,package)').order('name'),
    sb.from('payments').select('student_id').eq('month', m)]);
  if (s.error || p.error) { $('slist').innerHTML = `<p class="msg err">Gagal memuat: ${esc((s.error || p.error).message)}</p>`; return; }
  // Status aktif = sudah ada pembayaran tercatat pada bulan ini
  const paid = new Set(p.data.map(x => x.student_id));
  studs = s.data.map(x => { const f = [].concat(x.student_fees || [])[0] || {}; return { ...x, fee: f.monthly_fee ?? '', pkg: f.package, aktif: paid.has(x.id) }; });
  if (!studs.length) { $('slist').innerHTML = '<p class="msg">Belum ada siswa. Klik Tambah siswa.</p>'; return; }
  $('slist').innerHTML = studs.map((x, i) => `<button class="row srow" data-i="${i}">
    <span><span class="n">${esc(x.name)}</span><span class="s">${esc([PAKET[x.pkg]?.label || x.pkg, x.grade, x.contact].filter(Boolean).join(', '))}</span><span class="s">Daftar ${tgl(x.registration_date)}</span></span>
    <span class="t">${x.fee === '' ? '-' : rp.format(x.fee)}</span>
    <span class="tag ${x.aktif ? 'selesai' : 'pindah'}">${x.aktif ? 'Aktif' : 'Belum aktif'}</span></button>`).join('');
}

function openStudent(s) {
  sCur = s;
  $('sd-title').textContent = s ? 'Ubah siswa' : 'Tambah siswa';
  $('sn').value = s?.name || ''; $('sc').value = s?.contact || ''; $('sg').value = s?.grade || '';
  $('sf').value = PAKET[s?.pkg] ? s.pkg : 'reguler1'; $('sr').value = s?.registration_date || ''; $('sx').value = s?.notes || '';
  $('serr').textContent = '';
  $('sdlg').showModal();
  loadDel(s);
}
$('sadd').onclick = () => openStudent(null);
$('slist').onclick = e => { const b = e.target.closest('.srow'); if (b) openStudent(studs[+b.dataset.i]); };
$('scancel').onclick = () => $('sdlg').close();

$('sform').onsubmit = async e => {
  e.preventDefault();
  const k = PAKET[$('sf').value], reg = $('sr').value;
  const row = { name: $('sn').value.trim(), contact: $('sc').value.trim() || null, grade: $('sg').value.trim() || null,
                notes: $('sx').value.trim() || null, registration_date: reg };
  let r, id = sCur?.id;
  if (sCur) r = await sb.from('students').update(row).eq('id', id);
  else { r = await sb.from('students').insert(row).select('id').single(); id = r.data?.id; }
  if (!r.error) r = await sb.from('student_fees').upsert({ student_id: id, package: $('sf').value, monthly_fee: k.fee, monthly_quota: k.quota });
  // Tanggal pendaftaran berubah: samakan tanggal mulai jadwal siswa ini, lalu buat ulang sesi mendatang yang belum diubah manual.
  if (!r.error && sCur && sCur.registration_date !== reg) {
    r = await sb.from('schedules').update({ start_date: reg }).eq('student_id', id);
    if (!r.error) r = await sb.from('sessions').delete().eq('student_id', id)
      .eq('is_modified', false).eq('status', 'terjadwal').gte('session_date', ymd(new Date()));
  }
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
