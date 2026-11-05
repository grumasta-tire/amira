// Halaman Pembayaran (khusus admin): tagihan bulanan per siswa, dari view monthly_billing
const BSTAT = { lunas: ['Lunas', 'selesai'], sebagian: ['Sebagian', 'pindah'], belum_lunas: ['Belum lunas', 'batal'] };
let bills = [], bCur = null;
const bMonth = () => $('bmonth').value + '-01';
const bLabel = () => new Date(bMonth() + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

function setupMonth() {
  const n = new Date(), ym = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  $('bmonth').max = ym(n);
  $('bmonth').min = ym(new Date(n.getFullYear(), n.getMonth() - 11, 1)); // view menampilkan 12 bulan terakhir
  if (!$('bmonth').value) $('bmonth').value = ym(n);
}

async function loadPayments() {
  setupMonth();
  $('blist').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('monthly_billing').select('*').eq('month', bMonth()).order('student_name');
  if (error) { $('blist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  bills = data;
  if (!bills.length) { $('bsum').innerHTML = ''; $('blist').innerHTML = '<p class="msg">Belum ada siswa aktif dengan biaya bulanan.</p>'; return; }
  const sum = k => rp.format(bills.reduce((a, b) => a + Number(b[k]), 0));
  $('bsum').innerHTML = `<span>Tagihan<b>${sum('monthly_fee')}</b></span><span>Terbayar<b>${sum('total_paid')}</b></span><span>Sisa<b>${sum('remaining')}</b></span>`;
  $('blist').innerHTML = bills.map((b, i) => {
    const [t, c] = BSTAT[b.status];
    return `<div class="bw"><button class="row srow" data-i="${i}">
      <span><span class="n">${esc(b.student_name)}</span><span class="s">Biaya ${rp.format(b.monthly_fee)}, terbayar ${rp.format(b.total_paid)}</span></span>
      <span class="t">${b.remaining > 0 ? 'Sisa ' + rp.format(b.remaining) : ''}</span><span class="tag ${c}">${t}</span></button>${b.remaining > 0 ? `<button class="pri lun" data-i="${i}">Lunasi</button>` : ''}</div>`;
  }).join('');
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
  const left = Math.max(0, Number(b.remaining));
  $('bd-title').textContent = b.student_name;
  $('binfo').textContent = `${bLabel()}, sisa ${rp.format(left)}`;
  $('bamt').value = left || '';
  $('bdate').value = ymd(new Date());
  $('bnote').value = '';
  $('berr').textContent = '';
  $('bdlg').showModal();
  loadHist();
}
$('bmonth').onchange = loadPayments;
// Tombol "Lunasi": langsung mencatat pembayaran sebesar sisa tagihan (hari ini), setelah konfirmasi.
async function lunasi(b) {
  const sisa = Number(b.remaining);
  if (!confirm(`Lunasi ${b.student_name} sebesar ${rp.format(sisa)} untuk ${bLabel()}?`)) return;
  const { error } = await sb.from('payments').insert({ student_id: b.student_id, month: bMonth(),
    amount: sisa, paid_date: ymd(new Date()), notes: 'Pelunasan' });
  if (error) { alert('Gagal mencatat: ' + error.message); return; }
  loadPayments();
}
$('blist').onclick = e => {
  const l = e.target.closest('.lun');
  if (l) return lunasi(bills[+l.dataset.i]);
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
