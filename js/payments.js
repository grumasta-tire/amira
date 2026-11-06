// Halaman Pembayaran (khusus admin): catat pembayaran bulanan per siswa
let bills = [], bCur = null;
const bMonth = () => $('bmonth').value + '-01';
const bLabel = () => new Date(bMonth() + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

function setupMonth() {
  const n = new Date(), ym = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  $('bmonth').max = ym(n);
  if (!$('bmonth').value) $('bmonth').value = ym(n);
}

async function loadPayments() {
  setupMonth();
  $('blist').innerHTML = '<p class="msg">Memuat…</p>';
  const m = bMonth();
  const [y, mo] = $('bmonth').value.split('-').map(Number), last = ymd(new Date(y, mo + 1, 0)), today = ymd(new Date());
  const [s, p, q, r] = await Promise.all([
    sb.from('students').select('id,name,is_active,created_at,student_fees(monthly_fee,monthly_quota)').order('name'),
    sb.from('payments').select('student_id,amount').eq('month', m),
    sb.from('sessions').select('student_id,session_date,status').gte('session_date', m).lte('session_date', last),
    sb.from('schedules').select('student_id,start_date')]);
  const er = s.error || p.error || q.error || r.error;
  if (er) { $('blist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(er.message)}</p>`; return; }
  const paid = {};
  p.data.forEach(x => paid[x.student_id] = (paid[x.student_id] || 0) + Number(x.amount));
  // Tampilkan siswa aktif yang sudah terdaftar pada bulan itu, atau siapa pun yang punya pembayaran bulan itu.
  // Sesi selesai = tanggal sudah lewat dan tidak batal
  // Siklus kuota mengikuti tanggal daftar: untuk bulan terpilih, siklus yang dimulai pada bulan itu.
  const regs = {};
  r.data.forEach(x => { if (!regs[x.student_id] || x.start_date < regs[x.student_id]) regs[x.student_id] = x.start_date; });
  const at = (yy, mm, d) => ymd(new Date(yy, mm, Math.min(d, new Date(yy, mm + 1, 0).getDate())));
  const rng = {}, done = {};
  Object.entries(regs).forEach(([id, rg]) => { const d = +rg.slice(8, 10); rng[id] = [at(y, mo - 1, d), at(y, mo, d)]; });
  q.data.forEach(x => { const c = rng[x.student_id];
    if (c && x.status !== 'batal' && x.session_date >= c[0] && x.session_date < c[1] && x.session_date < today)
      done[x.student_id] = (done[x.student_id] || 0) + 1; });
  bills = s.data.map(x => ({ student_id: x.id, name: x.name, done: done[x.id] || 0, cyc: rng[x.id] ? fmtCyc(rng[x.id]) : '', quota: [].concat(x.student_fees || [])[0]?.monthly_quota ?? 4, fee: Number([].concat(x.student_fees || [])[0]?.monthly_fee ?? 0),
      paid: paid[x.id] || 0, show: x.is_active && (regs[x.id] || x.created_at).slice(0, 7) + '-01' <= m }))
    .filter(b => b.paid > 0 || b.show);
  if (!bills.length) { $('bsum').innerHTML = ''; $('blist').innerHTML = '<p class="msg">Tidak ada siswa pada bulan ini.</p>'; return; }
  const n = bills.filter(b => b.paid > 0).length;
  $('bsum').innerHTML = `<span>Terbayar<b>${rp.format(bills.reduce((a, b) => a + b.paid, 0))}</b></span><span>Sudah bayar<b>${n} dari ${bills.length} siswa</b></span>`;
  $('blist').innerHTML = bills.map((b, i) => `<div class="bw"><button class="row srow" data-i="${i}">
      <span><span class="n">${esc(b.name)}</span><span class="s">Biaya ${rp.format(b.fee)}</span><span class="s">${b.done}/${b.quota} sesi${b.cyc ? ' (' + b.cyc + ')' : ''}</span></span>
      <span class="t">${b.paid > 0 ? rp.format(b.paid) : ''}</span>
      <span class="tag ${b.paid > 0 ? 'selesai' : 'pindah'}">${b.paid > 0 ? 'Sudah bayar' : 'Belum bayar'}</span></button>
      ${b.paid === 0 && b.fee > 0 ? `<button class="pri lun" data-i="${i}">Bayar penuh</button>` : ''}</div>`).join('');
}

async function loadHist() {
  const { data } = await sb.from('payments').select('id,amount,paid_date,notes')
    .eq('student_id', bCur.student_id).eq('month', bMonth()).order('paid_date');
  const d = x => new Date(x + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  $('bhist').innerHTML = (data || []).length ? '<h2>Riwayat bulan ini</h2>' + data.map(p =>
    `<div class="hrow"><span>${d(p.paid_date)}: ${rp.format(p.amount)}${p.notes ? ', ' + esc(p.notes) : ''}</span><button type="button" data-id="${p.id}">Hapus</button></div>`).join('') : '';
}

function openBill(b) {
  bCur = b;
  $('bd-title').textContent = b.name;
  $('binfo').textContent = `${bLabel()}, biaya bulanan ${rp.format(b.fee)}`;
  $('bamt').value = '';
  $('bdate').value = ymd(new Date());
  $('bnote').value = '';
  $('berr').textContent = '';
  $('bdlg').showModal();
  loadHist();
}

// "Bayar penuh": langsung mencatat pembayaran sebesar biaya bulanan (hari ini), setelah konfirmasi.
async function bayarPenuh(b) {
  if (!confirm(`Catat pembayaran ${b.name} sebesar ${rp.format(b.fee)} untuk ${bLabel()}?`)) return;
  const { error } = await sb.from('payments').insert({ student_id: b.student_id, month: bMonth(),
    amount: b.fee, paid_date: ymd(new Date()), notes: 'Pembayaran bulanan' });
  if (error) { alert('Gagal mencatat: ' + error.message); return; }
  loadPayments();
}

$('bmonth').onchange = loadPayments;
$('blist').onclick = e => {
  const l = e.target.closest('.lun');
  if (l) return bayarPenuh(bills[+l.dataset.i]);
  const b = e.target.closest('.row');
  if (b) openBill(bills[+b.dataset.i]);
};
$('bcancel').onclick = () => $('bdlg').close();

$('bform').onsubmit = async e => {
  e.preventDefault();
  const { error } = await sb.from('payments').insert({ student_id: bCur.student_id, month: bMonth(),
    amount: Number($('bamt').value), paid_date: $('bdate').value, notes: $('bnote').value.trim() || null });
  if (error) { $('berr').textContent = 'Gagal menyimpan: ' + error.message; return; }
  $('bdlg').close();
  loadPayments();
};

$('bhist').onclick = async e => {
  const b = e.target.closest('button');
  if (!b || !confirm('Hapus pembayaran ini?')) return;
  const { error } = await sb.from('payments').delete().eq('id', b.dataset.id);
  if (error) { $('berr').textContent = 'Gagal menghapus: ' + error.message; return; }
  $('bdlg').close();
  loadPayments();
};

function fmtCyc(c) {
  const f = d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const a = new Date(c[0] + 'T00:00:00'), b = new Date(c[1] + 'T00:00:00');
  b.setDate(b.getDate() - 1);
  return `${f(a)} - ${f(b)}`;
}
