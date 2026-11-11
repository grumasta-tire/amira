// Halaman Jadwal (khusus admin): jadwal mingguan berulang per siswa
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
let jads = [], jCur = null, jStuds = [];
const MAPEL = ['Bahasa Inggris I', 'Bahasa Inggris II', 'Bahasa Inggris III', 'Matematika I', 'Matematika II', 'Matematika III', 'Bahasa Arab', 'CaLisTung'];
const LOKASI = ['Teacher Visit', 'Home Visit'];
// Isi pilihan; nilai lama yang tidak ada di daftar tetap dipertahankan agar tidak hilang.
function fillSel(id, list, cur, ph) {
  const l = cur && !list.includes(cur) ? [...list, cur] : list;
  $(id).innerHTML = `<option value="">${ph}</option>` + l.map(v => `<option>${esc(v)}</option>`).join('');
  $(id).value = cur || '';
}
// Hari jadwal otomatis mengikuti tanggal aktif (1 = Senin ... 7 = Minggu).
const dow = d => { const n = new Date(d + 'T00:00:00').getDay(); return n === 0 ? 7 : n; };
// Siswa berkuota 8x yang hanya punya satu jadwal otomatis dapat hari kedua (3 hari sesudahnya).
function showHari() {
  const d = $('jreg').value;
  if (!d) { $('jhari').textContent = ''; return; }
  const n = dow(d), sid = $('jsd').value || jCur?.student_id, st = jStuds.find(x => x.id === sid);
  const q = [].concat(st?.student_fees || [])[0]?.monthly_quota ?? 4;
  const alone = !jads.some(x => x.student_id === sid && x.id !== jCur?.id && x.is_active);
  $('jhari').textContent = q >= 8 && alone ? `Berulang tiap hari ${HARI[n - 1]} dan ${HARI[(n + 2) % 7]} (2x seminggu, ${q}x per siklus)` : `Berulang tiap hari ${HARI[n - 1]}`;
}
$('jsd').onchange = showHari;
$('jreg').onchange = showHari;

async function loadSchedules() {
  $('jlist').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('schedules')
    .select('id,student_id,subject,day_of_week,start_time,end_time,location,is_active,start_date,students(name,student_fees(monthly_quota))')
    .order('day_of_week').order('start_time');
  if (error) { $('jlist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  jads = data;
  if (!jads.length) { $('jlist').innerHTML = '<p class="msg">Belum ada jadwal. Klik Tambah jadwal.</p>'; return; }
  let html = '', last = 0;
  jads.forEach((j, i) => {
    if (j.day_of_week !== last) { last = j.day_of_week; html += `<h2>${HARI[j.day_of_week - 1]}</h2>`; }
    const q = [].concat(j.students?.student_fees || [])[0]?.monthly_quota ?? 4;
    const d2 = q >= 8 && jads.filter(x => x.student_id === j.student_id && x.is_active).length === 1 ? HARI[(j.day_of_week + 2) % 7] : '';
    const sub = [j.subject, j.location, d2 && 'juga ' + d2].filter(Boolean).join(', ');
    html += `<button class="row" data-i="${i}">
      <span class="t">${j.start_time ? j.start_time.slice(0, 5) : '--:--'}</span>
      <span><span class="n">${esc(j.students?.name || '-')}</span><span class="s">${esc(sub)}</span></span>
      <span class="tag terjadwal">Sejak ${tgl(j.start_date)}</span></button>`;
  });
  $('jlist').innerHTML = html;
}

async function openSchedule(j) {
  jCur = j;
  $('jd-title').textContent = j ? 'Ubah jadwal' : 'Tambah jadwal';
  $('jerr').textContent = '';
  const { data } = await sb.from('students').select('id,name,is_active,registration_date,student_fees(monthly_quota)').order('name');
  jStuds = data || [];
  $('jsd').innerHTML = (data || []).filter(s => s.is_active || s.id === j?.student_id)
    .map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (j) $('jsd').value = j.student_id;
  $('jsd').disabled = !!j;
  fillSel('jsub', MAPEL, j?.subject, 'Pilih mata pelajaran');
  $('jreg').value = j?.start_date || ymd(new Date());
  showHari();
  $('jst').value = j?.start_time ? j.start_time.slice(0, 5) : '';
  $('jen').value = j?.end_time ? j.end_time.slice(0, 5) : '';
  fillSel('jloc', LOKASI, j?.location, 'Pilih lokasi');
  $('jhint').hidden = !j;
  $('jdlg').showModal();
}
$('jadd').onclick = () => openSchedule(null);
$('jlist').onclick = e => { const b = e.target.closest('.row'); if (b) openSchedule(jads[+b.dataset.i]); };
$('jcancel').onclick = () => $('jdlg').close();

$('jform').onsubmit = async e => {
  e.preventDefault();
  const row = { subject: $('jsub').value, start_date: $('jreg').value, day_of_week: dow($('jreg').value), start_time: $('jst').value || null,
                end_time: $('jen').value || null, location: $('jloc').value || null };
  let r;
  if (jCur) r = await sb.from('schedules').update(row).eq('id', jCur.id);
  else r = await sb.from('schedules').insert({ ...row, student_id: $('jsd').value });
  // Saat mengubah: hapus sesi mendatang yang belum pernah diubah manual, lalu dibuat ulang dari jadwal baru.
  if (!r.error && jCur) r = await sb.from('sessions').delete().eq('schedule_id', jCur.id)
    .eq('is_modified', false).eq('status', 'terjadwal').gte('session_date', ymd(new Date()));
  if (!r.error) r = await sb.rpc('generate_sessions', { days_ahead: 30 });
  if (r.error) { $('jerr').textContent = 'Gagal menyimpan: ' + r.error.message; return; }
  $('jdlg').close();
  loadSchedules();
};
