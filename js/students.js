// Halaman Siswa (khusus admin): data siswa + biaya bulanan
const rp = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
let studs = [], sCur = null;

$('nav').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  [...$('nav').children].forEach(x => x.setAttribute('aria-pressed', x === b));
  $('v-sesi').hidden = b.dataset.v !== 'sesi';
  $('v-siswa').hidden = b.dataset.v !== 'siswa';
  if (b.dataset.v === 'siswa') loadStudents();
};

async function loadStudents() {
  $('slist').innerHTML = '<p class="msg">Memuat…</p>';
  const { data, error } = await sb.from('students')
    .select('id,name,contact,grade,notes,is_active,student_fees(monthly_fee)').order('name');
  if (error) { $('slist').innerHTML = `<p class="msg err">Gagal memuat: ${esc(error.message)}</p>`; return; }
  studs = data.map(s => ({ ...s, fee: [].concat(s.student_fees || [])[0]?.monthly_fee ?? '' }));
  if (!studs.length) { $('slist').innerHTML = '<p class="msg">Belum ada siswa. Klik Tambah siswa.</p>'; return; }
  $('slist').innerHTML = studs.map((s, i) => `<button class="row srow ${s.is_active ? '' : 'off'}" data-i="${i}">
    <span><span class="n">${esc(s.name)}</span><span class="s">${esc([s.grade, s.contact].filter(Boolean).join(', '))}</span></span>
    <span class="t">${s.fee === '' ? '-' : rp.format(s.fee)}</span>
    <span class="tag ${s.is_active ? 'selesai' : 'pindah'}">${s.is_active ? 'Aktif' : 'Nonaktif'}</span></button>`).join('');
}

function openStudent(s) {
  sCur = s;
  $('sd-title').textContent = s ? 'Ubah siswa' : 'Tambah siswa';
  $('sn').value = s?.name || ''; $('sc').value = s?.contact || ''; $('sg').value = s?.grade || '';
  $('sf').value = s?.fee ?? ''; $('sx').value = s?.notes || '';
  $('sa').checked = s ? s.is_active : true;
  $('serr').textContent = '';
  $('sdlg').showModal();
}
$('sadd').onclick = () => openStudent(null);
$('slist').onclick = e => { const b = e.target.closest('.srow'); if (b) openStudent(studs[+b.dataset.i]); };
$('scancel').onclick = () => $('sdlg').close();

$('sform').onsubmit = async e => {
  e.preventDefault();
  const row = { name: $('sn').value.trim(), contact: $('sc').value.trim() || null, grade: $('sg').value.trim() || null,
                notes: $('sx').value.trim() || null, is_active: $('sa').checked };
  let r, id = sCur?.id;
  if (sCur) r = await sb.from('students').update(row).eq('id', id);
  else { r = await sb.from('students').insert(row).select('id').single(); id = r.data?.id; }
  if (!r.error) r = await sb.from('student_fees').upsert({ student_id: id, monthly_fee: Number($('sf').value || 0) });
  if (r.error) { $('serr').textContent = 'Gagal menyimpan: ' + r.error.message; return; }
  $('sdlg').close();
  loadStudents();
};
