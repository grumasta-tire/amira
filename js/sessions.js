function range() {
  const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
  if (filter === 'today') return [t, t];
  if (filter === 'week') {
    const m = new Date(t); m.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const e = new Date(m); e.setDate(m.getDate() + 6);
    return [m, e];
  }
  return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 0)];
}

// Sesi 'terjadwal' yang tanggalnya sudah lewat dianggap selesai.
function label(s) {
  if (s.status === 'batal') return ['Batal', 'batal'];
  if (s.status === 'pindah') return ['Pindah', 'pindah'];
  return s.session_date < ymd(new Date()) ? ['Selesai', 'selesai'] : ['Terjadwal', 'terjadwal'];
}

async function load() {
  const [a, b] = range();
  $('list').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('sessions')
    .select('id,schedule_id,session_date,start_time,end_time,status,notes,students(name),schedules(subject,location)')
    .gte('session_date', ymd(a)).lte('session_date', ymd(b))
    .order('session_date').order('start_time');
  if (error) { $('list').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  rows = data;
  render();
}

function render() {
  if (!rows.length) { $('list').innerHTML = '<p class="msg">Tidak ada sesi pada rentang ini.</p>'; return; }
  let html = '', last = '';
  rows.forEach((s, i) => {
    if (s.session_date !== last) {
      last = s.session_date;
      html += `<h2>${dayFmt.format(new Date(s.session_date + 'T00:00:00'))}</h2>`;
    }
    const [txt, cls] = label(s);
    const sub = [s.schedules?.subject, s.schedules?.location].filter(Boolean).join(', ');
    html += `<button class="row" data-i="${i}">
      <span class="t">${s.start_time ? s.start_time.slice(0, 5) : '--:--'}</span>
      <span><span class="n">${esc(s.students?.name || '-')}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ''}</span>
      <span class="tag ${cls}">${txt}</span></button>`;
  });
  $('list').innerHTML = html;
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
  $('dlg').close();
  load();
};

$('tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  filter = b.dataset.f;
  [...$('tabs').children].forEach(x => x.setAttribute('aria-pressed', x === b));
  load();
};
