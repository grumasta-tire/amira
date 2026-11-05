// Laporan (khusus admin): ringkasan pembayaran 12 bulan dari view monthly_billing + ekspor CSV
let rep = [];

async function loadReport() {
  $('rlist').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('monthly_billing').select('*')
    .order('month', { ascending: false }).order('student_name');
  if (error) { $('rlist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  rep = data;
  const by = {};
  data.forEach(r => {
    const m = by[r.month] ??= { fee: 0, paid: 0, rem: 0, n: 0, ok: 0 };
    m.fee += +r.monthly_fee; m.paid += +r.total_paid; m.rem += +r.remaining; m.n++;
    if (r.status === 'lunas') m.ok++;
  });
  const months = Object.keys(by).sort().reverse();
  if (!months.length) { $('rsum').innerHTML = ''; $('rlist').innerHTML = '<p class="msg">Belum ada data. Tambahkan siswa dan biaya bulanan dulu.</p>'; return; }
  const sum = k => rp.format(months.reduce((a, m) => a + by[m][k], 0));
  $('rsum').innerHTML = `<span>Terbayar 12 bulan<b>${sum('paid')}</b></span><span>Sisa tagihan<b>${sum('rem')}</b></span>`;
  $('rlist').innerHTML = months.map(k => {
    const m = by[k], pct = m.fee ? Math.min(100, m.paid / m.fee * 100) : 0;
    const lbl = new Date(k + 'T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return `<div class="row rrow"><span class="n">${lbl}</span><span class="t">${rp.format(m.paid)}</span>
      <span class="s">dari ${rp.format(m.fee)}, lunas ${m.ok} dari ${m.n} siswa</span>
      <span class="pbar"><i style="width:${pct}%"></i></span></div>`;
  }).join('');
}

// Unduh CSV (pemisah titik koma agar terbuka rapi di Excel berbahasa Indonesia)
$('rcsv').onclick = () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Bulan', 'Siswa', 'Biaya', 'Terbayar', 'Sisa', 'Status'],
    ...rep.map(r => [r.month.slice(0, 7), r.student_name, r.monthly_fee, r.total_paid, r.remaining, r.status])];
  const blob = new Blob(['\ufeff' + rows.map(a => a.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `pembayaran-${ymd(new Date())}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
};
