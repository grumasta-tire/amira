// Laporan (khusus admin): total pembayaran per bulan, langsung dari tabel payments + ekspor CSV
let rep = [];

async function loadReport() {
  $('rlist').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('payments').select('month,amount,paid_date,notes,student_id,students(name)')
    .order('month', { ascending: false }).order('paid_date');
  if (error) { $('rlist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  rep = data;
  const by = {};
  data.forEach(r => {
    const m = by[r.month] ??= { paid: 0, ids: new Set() };
    m.paid += +r.amount; m.ids.add(r.student_id);
  });
  const months = Object.keys(by).sort().reverse();
  if (!months.length) { $('rsum').innerHTML = ''; $('rlist').innerHTML = '<p class="msg">Belum ada pembayaran tercatat.</p>'; return; }
  $('rsum').innerHTML = `<span>Total pembayaran<b>${rp.format(months.reduce((a, k) => a + by[k].paid, 0))}</b></span><span>Bulan tercatat<b>${months.length}</b></span>`;
  $('rlist').innerHTML = months.map(k => {
    const lbl = new Date(k + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return `<div class="row rrow"><span class="n">${lbl}</span><span class="t">${rp.format(by[k].paid)}</span>
      <span class="s">${by[k].ids.size} siswa membayar</span></div>`;
  }).join('');
}

// Unduh CSV (pemisah titik koma agar terbuka rapi di Excel berbahasa Indonesia)
$('rcsv').onclick = () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Bulan', 'Siswa', 'Jumlah', 'Tanggal bayar', 'Catatan'],
    ...rep.map(r => [r.month.slice(0, 7), r.students?.name, r.amount, r.paid_date, r.notes])];
  const blob = new Blob(['\ufeff' + rows.map(a => a.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `pembayaran-${ymd(new Date())}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
};
