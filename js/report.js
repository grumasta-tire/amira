// Laporan (khusus admin): filter periode + siswa -> pendapatan dan jumlah sesi
// Pendapatan dihitung dari tanggal bayar; sesi dihitung dari tanggal sesi.
let rrows = [], rStuds = [];

function rPreset(p) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const r = { bulan: [new Date(y, m, 1), new Date(y, m + 1, 0)], lalu: [new Date(y, m - 1, 1), new Date(y, m, 0)],
              '3bln': [new Date(y, m - 2, 1), new Date(y, m + 1, 0)], tahun: [new Date(y, 0, 1), new Date(y, 11, 31)] }[p];
  $('rfrom').value = ymd(r[0]); $('rto').value = ymd(r[1]);
  [...$('rchips').children].forEach(b => b.setAttribute('aria-pressed', b.dataset.p === p));
}

// Ambil semua baris (Supabase membatasi 1000 baris per permintaan)
async function pageAll(build) {
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await build().order('id').range(from, from + 999);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < 1000) return all;
    from += 1000;
  }
}

async function loadReport() {
  if (!$('rfrom').value) rPreset('bulan');
  const cur = $('rsis').value;
  const st = await sb.from('students').select('id,name').order('name');
  if (st.error) { $('rlist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(st.error.message)}</p>`; return; }
  rStuds = st.data;
  $('rsis').innerHTML = '<option value="">Semua siswa</option>' + rStuds.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('rsis').value = cur;
  runReport();
}

async function runReport() {
  const from = $('rfrom').value, to = $('rto').value, sid = $('rsis').value;
  if (!from || !to || from > to) { $('rsum').innerHTML = ''; $('rlist').innerHTML = '<p class="msg err">Periode tidak valid. Tanggal Dari tidak boleh melebihi Sampai.</p>'; return; }
  $('rlist').innerHTML = '<p class="msg">Memuat…</p>';
  try {
    const filt = q => sid ? q.eq('student_id', sid) : q;
    const [pay, ses] = await Promise.all([
      pageAll(() => filt(sb.from('payments').select('student_id,amount').gte('paid_date', from).lte('paid_date', to))),
      pageAll(() => filt(sb.from('sessions').select('student_id,session_date,status').gte('session_date', from).lte('session_date', to)))]);
    const today = ymd(new Date()), by = {};
    const get = id => by[id] ??= { rp: 0, done: 0, next: 0, off: 0 };
    pay.forEach(x => { get(x.student_id).rp += +x.amount; });
    ses.forEach(x => { const b = get(x.student_id); if (x.status === 'batal') b.off++; else if (x.session_date < today) b.done++; else b.next++; });
    const names = Object.fromEntries(rStuds.map(s => [s.id, s.name]));
    rrows = Object.entries(by).map(([id, b]) => ({ name: names[id] || '-', ...b })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
    const sum = k => rrows.reduce((a, b) => a + b[k], 0);
    $('rsum').innerHTML = `<span>Pendapatan<b>${rp.format(sum('rp'))}</b></span><span>Total sesi<b>${sum('done') + sum('next')}</b></span><span>Selesai<b>${sum('done')}</b></span><span>Akan datang<b>${sum('next')}</b></span>`;
    $('rlist').innerHTML = rrows.length ? rrows.map(r => `<div class="row rrow"><span class="n">${esc(r.name)}</span><span class="t">${rp.format(r.rp)}</span>
      <span class="s">${r.done + r.next} sesi (${r.done} selesai${r.off ? ', ' + r.off + ' batal tidak dihitung' : ''})</span></div>`).join('')
      : '<p class="msg">Tidak ada data pada periode ini.</p>';
  } catch (e) { $('rlist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(e.message)}</p>`; }
}

$('rchips').onclick = e => { const b = e.target.closest('button'); if (!b) return; rPreset(b.dataset.p); runReport(); };
['rfrom', 'rto'].forEach(id => { $(id).onchange = () => { [...$('rchips').children].forEach(b => b.setAttribute('aria-pressed', 'false')); runReport(); }; });
$('rsis').onchange = runReport;

// Unduh CSV (pemisah titik koma agar terbuka rapi di Excel berbahasa Indonesia)
$('rcsv').onclick = () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Siswa', 'Pendapatan', 'Total sesi', 'Sesi selesai', 'Sesi batal'],
    ...rrows.map(r => [r.name, r.rp, r.done + r.next, r.done, r.off])];
  const blob = new Blob(['\ufeff' + rows.map(a => a.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `laporan-${$('rfrom').value}_${$('rto').value}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
};

// Unduh PDF: isi mengikuti filter periode dan siswa yang sedang dipilih
$('rpdf').onclick = () => {
  if (!window.jspdf) { alert('Pustaka PDF belum termuat. Periksa koneksi internet lalu muat ulang halaman.'); return; }
  if (!rrows.length) { alert('Tidak ada data pada filter ini untuk diunduh.'); return; }
  const doc = new window.jspdf.jsPDF();
  const m = n => rp.format(n).replace(/\u00a0/g, ' ');
  const d = x => new Date(x + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const sid = $('rsis').value, who = sid ? (rStuds.find(s => s.id === sid)?.name || '-') : 'Semua siswa';
  const sum = k => rrows.reduce((a, b) => a + b[k], 0);
  doc.setFontSize(16); doc.text('Laporan Les Privat', 14, 18);
  doc.setFontSize(10);
  doc.text(`Periode: ${d($('rfrom').value)} - ${d($('rto').value)}`, 14, 26);
  doc.text(`Siswa: ${who}`, 14, 32);
  doc.text(`Pendapatan: ${m(sum('rp'))}   |   Total sesi: ${sum('done') + sum('next')}   |   Selesai: ${sum('done')}   |   Akan datang: ${sum('next')}`, 14, 40);
  doc.autoTable({
    startY: 46,
    head: [['Siswa', 'Pendapatan', 'Total sesi', 'Selesai', 'Batal']],
    body: rrows.map(r => [r.name, m(r.rp), r.done + r.next, r.done, r.off]),
    foot: [['Total', m(sum('rp')), sum('done') + sum('next'), sum('done'), sum('off')]],
    headStyles: { fillColor: [14, 107, 99] }, footStyles: { fillColor: [230, 238, 240], textColor: 20 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' } },
  });
  doc.setFontSize(8);
  doc.text(`Dicetak ${d(ymd(new Date()))}. Sesi batal tidak dihitung dalam Total sesi.`, 14, doc.internal.pageSize.getHeight() - 10);
  doc.save(`laporan-${$('rfrom').value}_${$('rto').value}.pdf`);
};
