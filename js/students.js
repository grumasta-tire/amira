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
  const [s, info] = await Promise.all([
    sb.from('students').select('id,name,contact,grade,notes,registration_date,student_fees(monthly_fee,package,monthly_quota),schedules(day_of_week,start_time,location)').order('name'),
    payInfo()]);
  if (s.error) { $('slist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(s.error.message)}</p>`; return; }
  const rg = d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const lab = { terbayar: ['Terbayar', 'selesai'], habis: ['Paket habis', 'pindah'], belum: ['Belum bayar', 'pindah'] };
  studs = s.data.map(x => { const f = [].concat(x.student_fees || [])[0] || {}; return { ...x, fee: f.monthly_fee ?? '', pkg: f.package, inf: info[x.id] }; });
  if (!studs.length) { $('slist').innerHTML = '<p class="msg">Belum ada siswa. Klik Tambah siswa.</p>'; return; }
  $('slist').innerHTML = studs.map((x, i) => {
    const j = [].concat(x.schedules || [])[0], c = x.inf?.cur, [t, cls] = lab[x.inf?.status || 'belum'];
    return `<button class="row srow" data-i="${i}">
    <span><span class="n">${esc(x.name)}</span>
      <span class="s">${esc([x.fee === '' ? '' : rp.format(x.fee), x.grade, x.contact].filter(Boolean).join(', '))}</span>
      <span class="s">Daftar ${tgl(x.registration_date)}</span>
      <span class="s">${j ? esc(`Jadwal: ${HARI[j.day_of_week - 1]}${j.start_time ? ' ' + j.start_time.slice(0, 5) : ''}${j.location ? ', ' + j.location : ''}`) : 'Belum ada jadwal'}</span>
      <span class="s">${c ? `Paket ke-${c.no}: ${c.done}/${c.quota} sesi${c.first ? ` (${rg(c.first)} - ${rg(c.last)})` : ''}` : 'Belum ada paket'}</span></span>
    <span class="t">${esc(PAKET[x.pkg]?.label || x.pkg || '-')}</span>
    <span class="tag ${cls}">${t}</span></button>`; }).join('');
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
  if (!r.error) r = await sb.rpc('generate_sessions', { days_ahead: 30 });
  if (r.error) { $('serr').textContent = 'Gagal menyimpan: ' + r.error.message; return; }
  $('sdlg').close();
  loadStudents();
};

// Status pembayaran tiap siswa, dihitung dari paket (pembayaran valid) dan sesinya.
// terbayar = ada paket yang masih berjalan; habis = semua paket selesai; belum = belum ada paket valid.
async function payInfo() {
  try {
    const [pay, ses] = await Promise.all([
      pageAll(() => sb.from('payments').select('id,student_id,quota,paid_date,created_at').not('quota', 'is', null)),
      pageAll(() => sb.from('sessions').select('payment_id,session_date,status'))]);
    const today = ymd(new Date()), pk = {}, by = {};
    ses.forEach(x => {
      if (!x.payment_id || x.status === 'batal') return;
      const o = pk[x.payment_id] ??= { done: 0, first: x.session_date, last: x.session_date };
      if (x.session_date < today) o.done++;
      if (x.session_date < o.first) o.first = x.session_date;
      if (x.session_date > o.last) o.last = x.session_date;
    });
    pay.sort((a, b) => (a.paid_date + a.created_at).localeCompare(b.paid_date + b.created_at)).forEach(p => {
      (by[p.student_id] ??= { pays: [] }).pays.push({ ...p, done: 0, ...(pk[p.id] || {}) });
    });
    Object.values(by).forEach(o => {
      const i = o.pays.findIndex(p => p.done < p.quota), p = o.pays[i < 0 ? o.pays.length - 1 : i];
      o.status = i < 0 ? 'habis' : 'terbayar';
      o.cur = { no: i < 0 ? o.pays.length : i + 1, done: p.done, quota: p.quota, first: p.first, last: p.last };
    });
    return by;
  } catch (e) { return {}; }
}

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
