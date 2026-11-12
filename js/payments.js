// Menu Bayar: 1 pembayaran = 1 paket pertemuan (dibayar penuh). Cicilan sementara dinonaktifkan.
let bills = [], bCur = null;
const bStat = { terbayar: ['Terbayar', 'selesai'], habis: ['Paket habis', 'pindah'], belum: ['Belum bayar', 'pindah'] };

async function loadPayments() {
  $('blist').innerHTML = '<p class="msg">Memuat…</p>';
  try {
    const [s, info] = await Promise.all([
      sb.from('students').select('id,name,student_fees(monthly_fee,monthly_quota,package)').order('name'), payInfo()]);
    if (s.error) throw s.error;
    bills = s.data.map(x => { const f = [].concat(x.student_fees || [])[0] || {};
      return { id: x.id, name: x.name, fee: Number(f.monthly_fee ?? 0), quota: f.monthly_quota ?? 4, pkg: f.package, inf: info[x.id] }; });
    if (!bills.length) { $('blist').innerHTML = '<p class="msg">Belum ada siswa.</p>'; return; }
    $('blist').innerHTML = bills.map((b, i) => { const [t, c] = bStat[b.inf?.status || 'belum'];
      return `<button class="row srow" data-i="${i}"><span><span class="n">${esc(b.name)}</span>
        <span class="s">${esc(PAKET[b.pkg]?.label || '-')}, ${b.quota}x pertemuan</span>
        ${b.inf ? `<span class="s">Paket ke-${b.inf.cur.no}: ${b.inf.cur.done}/${b.inf.cur.quota} sesi</span>` : ''}</span>
        <span class="t">${rp.format(b.fee)}</span><span class="tag ${c}">${t}</span></button>`; }).join('');
  } catch (e) { $('blist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(e.message)}</p>`; }
}

// Tanggal mulai paket berikutnya: tanggal bayar, tetapi tidak lebih awal dari sehari setelah sesi terakhir paket sebelumnya.
async function suggestStart() {
  const { data } = await sb.from('sessions').select('session_date').eq('student_id', bCur.id)
    .neq('status', 'batal').order('session_date', { ascending: false }).limit(1);
  const last = data?.[0]?.session_date; let s = $('bdate').value;
  if (last) { const n = new Date(last + 'T00:00:00'); n.setDate(n.getDate() + 1); if (ymd(n) > s) s = ymd(n); }
  $('bstart').value = s;
  $('bstarth').textContent = last ? 'Disarankan menyambung setelah sesi terakhir paket sebelumnya. Bisa diubah.' : 'Bisa diubah.';
}

async function openBill(b) {
  bCur = b;
  $('bd-title').textContent = b.name;
  $('binfo').textContent = `${PAKET[b.pkg]?.label || '-'}: ${b.quota}x pertemuan, ${rp.format(b.fee)} (dibayar penuh)`;
  $('bdate').value = ymd(new Date()); $('bnote').value = ''; $('berr').textContent = '';
  $('bstartw').hidden = !b.inf; // paket pertama dimulai dari Tanggal aktif di menu Jadwal
  $('bhist').innerHTML = '';
  $('bdlg').showModal();
  if (b.inf) await suggestStart();
  loadHist();
}

async function loadHist() {
  const { data } = await sb.from('payments').select('id,amount,paid_date,notes,quota').eq('student_id', bCur.id).order('paid_date');
  const d = x => new Date(x + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  $('bhist').innerHTML = (data || []).length ? '<h2>Riwayat pembayaran</h2>' + data.map(p =>
    `<div class="hrow"><span>${d(p.paid_date)}: ${rp.format(p.amount)}, ${p.quota ? p.quota + ' sesi' : '<b>perlu ditinjau</b>'}${p.notes ? ', ' + esc(p.notes) : ''}</span><button type="button" data-id="${p.id}">Hapus</button></div>`).join('') : '';
}

$('blist').onclick = e => { const b = e.target.closest('.row'); if (b) openBill(bills[+b.dataset.i]); };
$('bcancel').onclick = () => $('bdlg').close();
$('bdate').onchange = () => { if (!$('bstartw').hidden) suggestStart(); };

$('bform').onsubmit = async e => {
  e.preventDefault();
  const pd = $('bdate').value, first = $('bstartw').hidden;
  const { error } = await sb.from('payments').insert({ student_id: bCur.id, month: pd.slice(0, 7) + '-01', amount: bCur.fee, paid_date: pd,
    quota: bCur.quota, start_date: first ? null : ($('bstart').value || pd), notes: $('bnote').value.trim() || null });
  if (error) { $('berr').textContent = 'Gagal menyimpan: ' + error.message; return; }
  await sb.rpc('generate_sessions', { days_ahead: 30 });
  $('bdlg').close();
  loadPayments();
};

// Pembayaran hanya bisa dihapus jika sesinya sudah tidak ada (hapus jadwal dulu di menu Jadwal).
$('bhist').onclick = async e => {
  const b = e.target.closest('button');
  if (!b || !confirm('Hapus pembayaran ini?')) return;
  const { error } = await sb.from('payments').delete().eq('id', b.dataset.id);
  if (error) { $('berr').textContent = error.code === '23503' ? 'Pembayaran ini masih punya sesi. Hapus jadwal siswa ini dulu di menu Jadwal.' : 'Gagal menghapus: ' + error.message; return; }
  $('bdlg').close();
  loadPayments();
};
