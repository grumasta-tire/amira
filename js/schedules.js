// Menu Jadwal: satu jadwal per siswa. Jadwal hanya bisa dibuat jika status pembayaran siswa Terbayar (hijau).
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const MAPEL = ['Bahasa Inggris I', 'Bahasa Inggris II', 'Bahasa Inggris III', 'Matematika I', 'Matematika II', 'Matematika III', 'Bahasa Arab', 'CaLisTung'];
const LOKASI = ['Teacher Visit', 'Home Visit'];
const SLAB = { terbayar: ['Terbayar', 'selesai'], habis: ['Paket habis', 'pindah'], belum: ['Belum bayar', 'pindah'] };
let jads = [], jCur = null, jInfo = {};

function fillSel(id, list, cur, ph) {
  const l = cur && !list.includes(cur) ? [...list, cur] : list;
  $(id).innerHTML = `<option value="">${ph}</option>` + l.map(v => `<option>${esc(v)}</option>`).join('');
  $(id).value = cur || '';
}
const dow = d => { const n = new Date(d + 'T00:00:00').getDay(); return n === 0 ? 7 : n; };
function showHari() { const d = $('jreg').value; $('jhari').textContent = d ? `Berulang tiap hari ${HARI[dow(d) - 1]}, 1x seminggu sampai paket habis` : ''; }
$('jreg').onchange = showHari;

async function loadSchedules() {
  $('jlist').innerHTML = '<p class="msg">Memuat…</p>';
  try {
    const [r, info] = await Promise.all([sb.from('schedules')
      .select('id,student_id,subject,day_of_week,start_time,end_time,location,start_date,students(name)')
      .order('day_of_week').order('start_time'), payInfo()]);
    if (r.error) throw r.error;
    jads = r.data; jInfo = info;
    if (!jads.length) { $('jlist').innerHTML = '<p class="msg">Belum ada jadwal. Klik Tambah jadwal.</p>'; return; }
    let html = '', last = 0;
    jads.forEach((j, i) => {
      if (j.day_of_week !== last) { last = j.day_of_week; html += `<h2>${HARI[j.day_of_week - 1]}</h2>`; }
      const [t, c] = SLAB[jInfo[j.student_id]?.status || 'belum'];
      const sub = [j.subject, j.location, 'sejak ' + tgl(j.start_date)].filter(Boolean).join(', ');
      html += `<button class="row" data-i="${i}"><span class="t">${j.start_time ? j.start_time.slice(0, 5) : '--:--'}</span>
        <span><span class="n">${esc(j.students?.name || '-')}</span><span class="s">${esc(sub)}</span></span><span class="tag ${c}">${t}</span></button>`;
    });
    $('jlist').innerHTML = html;
  } catch (e) { $('jlist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(e.message)}</p>`; }
}

// Status pembayaran siswa terpilih; jadwal baru hanya bisa disimpan jika Terbayar (hijau).
function checkStat() {
  const sid = $('jsd').value, st = jInfo[sid]?.status || 'belum', [t, c] = SLAB[st];
  $('jstat').textContent = sid ? `Status pembayaran: ${t}` : 'Semua siswa sudah punya jadwal.';
  $('jstat').style.color = `var(--${c})`;
  const blocked = !jCur && st !== 'terbayar';
  $('jsave').disabled = blocked;
  $('jerr').textContent = blocked && sid ? 'Jadwal hanya bisa dibuat setelah siswa membayar. Catat pembayarannya di menu Bayar.' : '';
}
$('jsd').onchange = checkStat;

async function openSchedule(j) {
  jCur = j;
  $('jd-title').textContent = j ? 'Ubah jadwal' : 'Tambah jadwal';
  const { data } = await sb.from('students').select('id,name').order('name');
  const used = new Set(jads.map(x => x.student_id));
  $('jsd').innerHTML = (data || []).filter(s => j ? s.id === j.student_id : !used.has(s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (j) $('jsd').value = j.student_id;
  $('jsd').disabled = $('jreg').disabled = !!j; // hari dan tanggal aktif tidak diubah; hapus lalu buat ulang jika perlu
  $('jreg').value = j?.start_date || ymd(new Date());
  fillSel('jsub', MAPEL, j?.subject, 'Pilih mata pelajaran');
  $('jst').value = j?.start_time ? j.start_time.slice(0, 5) : '';
  $('jen').value = j?.end_time ? j.end_time.slice(0, 5) : '';
  fillSel('jloc', LOKASI, j?.location, 'Pilih lokasi');
  $('jdel').hidden = !j;
  showHari();
  checkStat();
  $('jdlg').showModal();
}
$('jadd').onclick = () => openSchedule(null);
$('jlist').onclick = e => { const b = e.target.closest('.row'); if (b) openSchedule(jads[+b.dataset.i]); };
$('jcancel').onclick = () => $('jdlg').close();

$('jform').onsubmit = async e => {
  e.preventDefault();
  const c = { subject: $('jsub').value, start_time: $('jst').value || null, end_time: $('jen').value || null, location: $('jloc').value || null };
  let r;
  if (jCur) {
    r = await sb.from('schedules').update(c).eq('id', jCur.id);
    // Jam baru berlaku untuk sesi mendatang yang belum pernah diubah manual.
    if (!r.error) r = await sb.from('sessions').update({ start_time: c.start_time, end_time: c.end_time })
      .eq('schedule_id', jCur.id).eq('is_modified', false).eq('status', 'terjadwal').gte('session_date', ymd(new Date()));
  } else {
    r = await sb.from('schedules').insert({ ...c, student_id: $('jsd').value, start_date: $('jreg').value, day_of_week: dow($('jreg').value) });
    if (!r.error) r = await sb.rpc('generate_sessions', { days_ahead: 30 });
  }
  if (r.error) { $('jerr').textContent = 'Gagal menyimpan: ' + r.error.message; return; }
  $('jdlg').close();
  loadSchedules();
};

$('jdel').onclick = async () => {
  if (!confirm('Hapus jadwal ini beserta semua sesinya? Data pembayaran tidak ikut terhapus.')) return;
  let r = await sb.from('sessions').delete().eq('schedule_id', jCur.id);
  if (!r.error) r = await sb.from('schedules').delete().eq('id', jCur.id);
  if (r.error) { $('jerr').textContent = 'Gagal menghapus: ' + r.error.message; return; }
  $('jdlg').close();
  loadSchedules();
};
