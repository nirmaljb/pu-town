const $ = selector => document.querySelector(selector);
let library, catalogue, current, order = [], dirty = false, previewVersion = 0;
let sprite, seatedSprite;
const canvases = [];
const status = message => { $('#status').textContent = message; };
async function api(path, data) {
  const response = await fetch('/api/' + path, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function action(fn) { return async () => { try { await fn(); } catch (error) { status(error.message); } }; }
async function refresh() {
  const data = await api('library'); library = data.drafts; catalogue = data.catalogue;
  return data;
}
function renderLibrary() {
  $('#library').replaceChildren();
  for (const draft of library) {
    const li = document.createElement('li');
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = order.includes(draft.id);
    check.setAttribute('aria-label', 'Include ' + draft.name + ' in publication');
    check.onchange = () => { order = check.checked ? [...order, draft.id] : order.filter(id => id !== draft.id); renderCollection(); };
    const open = document.createElement('button'); open.textContent = draft.name; open.setAttribute('aria-current', String(draft.id === current?.id));
    open.onclick = () => { if (canDiscard()) openDraft(draft); };
    li.append(check, open); $('#library').append(li);
  }
  renderCollection();
}
function renderCollection() {
  $('#collection').replaceChildren();
  order.forEach((id, index) => {
    const li = document.createElement('li'); const name = library.find(draft => draft.id === id)?.name ?? id + ' (draft missing)';
    li.append(document.createTextNode(name + ' '));
    for (const [label, offset] of [['↑', -1], ['↓', 1]]) {
      const button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-label', `Move ${name} ${offset < 0 ? 'up' : 'down'}`);
      button.disabled = index + offset < 0 || index + offset >= order.length;
      button.onclick = () => { [order[index], order[index + offset]] = [order[index + offset], order[index]]; renderCollection(); };
      li.append(button);
    }
    const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove ' + name);
    remove.onclick = () => { order = order.filter(value => value !== id); renderLibrary(); }; li.append(remove);
    $('#collection').append(li);
  });
  $('#count').textContent = `${order.length} / 10 saved designs selected`;
}
function canDiscard() { return !dirty || confirm('Discard unsaved changes to this draft?'); }
function openDraft(draft) {
  current = structuredClone(draft); dirty = false; $('#name').value = current.name;
  $('#duplicate').disabled = !current.id; $('#delete').disabled = !current.id;
  renderParts(); renderLibrary(); status(''); void preview();
}
function renderParts() {
  $('#parts').replaceChildren();
  for (const [slot, parts] of Object.entries(catalogue.slots)) {
    const label = document.createElement('label'); label.textContent = slot[0].toUpperCase() + slot.slice(1);
    const partSelect = document.createElement('select');
    // The wrapping label names both controls at once, so each select names itself.
    partSelect.setAttribute('aria-label', slot + ' part');
    for (const [id, part] of Object.entries(parts)) {
      // Restrict clothing to the current body's compatible proportions.
      const body = current.parts.body.part.split('/').at(-1);
      const expected = body === 'male' ? 'male' : slot === 'top' ? 'female' : 'thin';
      if (['top', 'bottom', 'footwear'].includes(slot) && id.split('/').at(-1) !== expected) continue;
      partSelect.add(new Option(id.startsWith('hair/') ? id.split('/')[1].replaceAll('_', ' ') : part.label, id));
    }
    if (![...partSelect.options].some(option => option.value === current.parts[slot]?.part)) {
      current.parts[slot] = { part: partSelect.options[0].value, colour: current.parts[slot]?.colour };
    }
    partSelect.value = current.parts[slot].part;
    const colour = document.createElement('select'); colour.setAttribute('aria-label', slot + ' colour');
    for (const value of Object.keys(parts[partSelect.value].colours)) colour.add(new Option(value, value));
    if (![...colour.options].some(option => option.value === current.parts[slot].colour)) current.parts[slot].colour = colour.options[0].value;
    colour.value = current.parts[slot].colour;
    partSelect.onchange = () => { current.parts[slot].part = partSelect.value; dirty = true; renderParts(); void preview(); };
    colour.onchange = () => { current.parts[slot].colour = colour.value; dirty = true; void preview(); };
    label.append(partSelect, colour); $('#parts').append(label);
  }
}
async function preview() {
  const version = ++previewVersion;
  try {
    const result = await api('preview', current);
    const images = await Promise.all([result.sprite, result.seatedSprite].map(src => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src;
    })));
    if (version !== previewVersion) return;
    [sprite, seatedSprite] = images;
  } catch (error) { if (version === previewVersion) { sprite = null; seatedSprite = null; status(error.message); } }
}
for (const pose of ['Standing', 'Walking', 'Sitting']) {
  for (const [row, direction] of ['Up', 'Left', 'Down', 'Right'].entries()) {
    const figure = document.createElement('figure'); const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 80;
    const caption = document.createElement('figcaption'); caption.textContent = `${pose} · ${direction}`; figure.append(canvas, caption); $('#poses').append(figure);
    canvases.push({ canvas, row, pose });
  }
}
function draw(time) {
  for (const {canvas, row, pose} of canvases) {
    const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, 64, 80);
    if (!sprite) continue;
    const column = pose === 'Walking' && $('#animate').checked ? 1 + Math.floor(time / 100) % 8 : 0;
    if (pose === 'Sitting') {
      ctx.drawImage(seatedSprite, 640, row * 64, 64, 64, 0, 16, 64, 64);
      ctx.drawImage(sprite, 0, row * 64, 64, 42, 0, 10, 64, 42);
    } else ctx.drawImage(sprite, column * 64, row * 64, 64, 64, 0, 0, 64, 64);
  }
  requestAnimationFrame(draw);
}
$('#name').oninput = () => { current.name = $('#name').value; dirty = true; };
$('#design').onsubmit = event => { event.preventDefault(); void action(async () => {
  current.name = $('#name').value; current = await api('save', current); dirty = false; await refresh(); renderLibrary();
  $('#duplicate').disabled = false; $('#delete').disabled = false; status('Draft saved. Published appearances are unchanged.');
})(); };
$('#new').onclick = () => { if (canDiscard()) { openDraft({ name: 'New character', parts: structuredClone(library[0]?.parts ?? current.parts) }); dirty = true; } };
$('#duplicate').onclick = action(async () => { if (!canDiscard()) return; const copy = await api('duplicate', { id: current.id }); await refresh(); openDraft(copy); status('Independent copy saved.'); });
$('#delete').onclick = action(async () => {
  if (!confirm(`Delete draft “${current.name}”? Published appearances remain available.`)) return;
  await api('delete', { id: current.id }); order = order.filter(id => id !== current.id); await refresh();
  openDraft(library[0] ?? { name: 'New character', parts: current.parts }); status('Draft deleted.');
});
$('#publish').onclick = action(async () => {
  if (dirty) throw new Error('Save or reopen the current draft before publishing saved designs.');
  $('#publish').disabled = true;
  try { await api('publish', { ids: order }); $('#publication-status').textContent = 'Collection published for the next release.'; }
  finally { $('#publish').disabled = false; }
});
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
try {
  const data = await refresh(); order = data.published.presets.map(preset => preset.id);
  const parts = Object.fromEntries(Object.entries(catalogue.slots).map(([slot, choices]) => {
    const [part, definition] = Object.entries(choices)[0]; return [slot, { part, colour: Object.keys(definition.colours)[0] }];
  }));
  openDraft(library[0] ?? { name: 'New character', parts }); requestAnimationFrame(draw);
} catch (error) { status(error.message); }
