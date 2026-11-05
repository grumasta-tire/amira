// Halaman Jadwal (khusus admin): jadwal mingguan berulang per siswa
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
let jads = [], jCur = null;

async function loadSchedules() {
  $('jlist').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('schedules')
    .select('id,student_id,subject,day_of_week,start_time,end_time,location,is_active,students(name)')
    .order('day_of_week').order('start_time');
  if (error) { $('jlist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  jads = data;
  if (!jads.length) { $('jlist').innerHTML = '<p class="msg">Belum ada jadwal. Klik Tambah jadwal.</p>'; return; }
  let html = '', last = 0;
  jads.forEach((j, i) => {
    if (j.day_of_week !== last) { last = j.day_of_week; html += `<h2>${HARI[j.day_of_week - 1]}</h2>`; }
    const sub = [j.subject, j.location].filter(Boolean).join(', ');
    html += `<button class="row ${j.is_active ? '' : 'off'}" data-i="${i}">
      <span class="t">${j.start_time ? j.start_time.slice(0, 5) : '--:--'}</span>
      <span><span class="n">${esc(j.students?.name || '-')}</span><span class="s">${esc(sub)}</span></span>
      <span class="tag ${j.is_active ? 'selesai' : 'pindah'}">${j.is_active ? 'Aktif' : 'Nonaktif'}</span></button>`;
  });
  $('jlist').innerHTML = html;
}

async function openSchedule(j) {
  jCur = j;
  $('jd-title').textContent = j ? 'Ubah jadwal' : 'Tambah jadwal';
  $('jerr').textContent = '';
  const { data } = await sb.from('students').select('id,name,is_active').order('name');
  $('jsd').innerHTML = (data || []).filter(s => s.is_active || s.id === j?.student_id)
    .map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (j) $('jsd').value = j.student_id;
  $('jsd').disabled = !!j;
  $('jsub').value = j?.subject || '';
  $('jday').value = j?.day_of_week || 1;
  $('jst').value = j?.start_time ? j.start_time.slice(0, 5) : '';
  $('jen').value = j?.end_time ? j.end_time.slice(0, 5) : '';
  $('jloc').value = j?.location || '';
  $('jact').checked = j ? j.is_active : true;
  $('jhint').hidden = !j;
  $('jdlg').showModal();
}
$('jadd').onclick = () => openSchedule(null);
$('jlist').onclick = e => { const b = e.target.closest('.row'); if (b) openSchedule(jads[+b.dataset.i]); };
$('jcancel').onclick = () => $('jdlg').close();

$('jform').onsubmit = async e => {
  e.preventDefault();
  const row = { subject: $('jsub').value.trim(), day_of_week: +$('jday').value, start_time: $('jst').value || null,
                end_time: $('jen').value || null, location: $('jloc').value.trim() || null, is_active: $('jact').checked };
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
