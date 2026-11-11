// Sesi: kalender bulanan. Ketuk tanggal untuk melihat detail sesi hari itu.
let calMonth = new Date(); calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
let selDay = ymd(new Date());
const WD = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

// Sesi 'terjadwal' yang tanggalnya sudah lewat dianggap selesai.
function label(s) {
  if (s.status === 'batal') return ['Batal', 'batal'];
  if (s.status === 'pindah') return ['Pindah', 'pindah'];
  return s.session_date < ymd(new Date()) ? ['Selesai', 'selesai'] : ['Terjadwal', 'terjadwal'];
}

// Warna tanggal: batal (merah) > pindah (kuning) > selesai (hijau) / terjadwal (biru)
function dayClass(list, key) {
  if (!list) return '';
  if (list.some(s => s.status === 'batal')) return 'c-batal';
  if (list.some(s => s.status === 'pindah')) return 'c-pindah';
  return key < ymd(new Date()) ? 'c-selesai' : 'c-terjadwal';
}

async function load() {
  const a = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1), b = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  $('ctitle').textContent = a.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const ym = ymd(a).slice(0, 7), today = ymd(new Date());
  if (selDay.slice(0, 7) !== ym) selDay = today.slice(0, 7) === ym ? today : ymd(a);
  $('list').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('sessions')
    .select('id,schedule_id,session_date,start_time,end_time,status,notes,students(name),schedules(subject,location)')
    .gte('session_date', ymd(a)).lte('session_date', ymd(b))
    .order('session_date').order('start_time');
  if (error) { $('list').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  rows = data;
  drawCal();
  showDay(selDay);
}

function drawCal() {
  const y = calMonth.getFullYear(), m = calMonth.getMonth(), n = new Date(y, m + 1, 0).getDate();
  const by = {};
  rows.forEach(s => (by[s.session_date] ||= []).push(s));
  const today = ymd(new Date());
  let h = WD.map(d => `<div class="wd">${d}</div>`).join('') + '<span></span>'.repeat((new Date(y, m, 1).getDay() + 6) % 7);
  for (let d = 1; d <= n; d++) {
    const key = `${y}-${pad(m + 1)}-${pad(d)}`, c = dayClass(by[key], key);
    h += `<button class="cd ${c ? 'f ' + c : ''} ${key === today ? 'today' : ''} ${key === selDay ? 'sel' : ''}" data-d="${key}">${d}</button>`;
  }
  $('cgrid').innerHTML = h;
}

function showDay(key) {
  let h = '';
  rows.forEach((s, i) => {
    if (s.session_date !== key) return;
    const [txt, cls] = label(s);
    const sub = [s.schedules?.subject, s.schedules?.location].filter(Boolean).join(', ');
    h += `<button class="row" data-i="${i}">
      <span class="t">${s.start_time ? s.start_time.slice(0, 5) : '--:--'}</span>
      <span><span class="n">${esc(s.students?.name || '-')}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</span>
      <span class="tag ${cls}">${txt}</span></button>`;
  });
  $('list').innerHTML = `<h2>${dayFmt.format(new Date(key + 'T00:00:00'))}</h2>` + (h || '<p class="msg">Tidak ada sesi pada tanggal ini.</p>');
}

$('list').onclick = e => {
  const b = e.target.closest('.row'); if (!b) return;
  cur = rows[+b.dataset.i];
  $('dname').textContent = cur.students?.name || '-';
  $('dt').value = cur.session_date;
  $('st').value = cur.start_time ? cur.start_time.slice(0, 5) : '';
  $('en').value = cur.end_time ? cur.end_time.slice(0, 5) : '';
  $('sts').value = cur.status;
  $('nt').value = cur.notes || '';
  $('fut').checked = false;
  $('futl').hidden = !cur.schedule_id;
  $('derr').textContent = '';
  $('dlg').showModal();
};
$('cancel').onclick = () => $('dlg').close();

$('f').onsubmit = async e => {
  e.preventDefault();
  const st = $('st').value || null, en = $('en').value || null;
  let r = await sb.from('sessions').update({
    session_date: $('dt').value, start_time: st, end_time: en,
    status: $('sts').value, notes: $('nt').value.trim() || null, is_modified: true
  }).eq('id', cur.id);
  // Terapkan ke jadwal induk dan sesi berikutnya yang belum pernah diubah manual.
  if (!r.error && $('fut').checked && cur.schedule_id) {
    r = await sb.from('schedules').update({ start_time: st, end_time: en }).eq('id', cur.schedule_id);
    if (!r.error) r = await sb.from('sessions').update({ start_time: st, end_time: en })
      .eq('schedule_id', cur.schedule_id).eq('is_modified', false)
      .eq('status', 'terjadwal').gt('session_date', cur.session_date);
  }
  if (r.error) {
    $('derr').textContent = r.error.code === '23505'
      ? 'Sudah ada sesi lain pada tanggal itu.' : 'Gagal menyimpan: ' + r.error.message;
    return;
  }
  await sb.rpc('generate_sessions', { days_ahead: 30 }); // sesi batal diganti sesi pengganti
  $('dlg').close();
  load();
};

$('cgrid').onclick = e => {
  const b = e.target.closest('.cd'); if (!b) return;
  selDay = b.dataset.d; drawCal(); showDay(selDay);
};
const moveMonth = k => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + k, 1); load(); };
$('cprev').onclick = () => moveMonth(-1);
$('cnext').onclick = () => moveMonth(1);
$('ctoday').onclick = () => { const n = new Date(); calMonth = new Date(n.getFullYear(), n.getMonth(), 1); selDay = ymd(n); load(); };
