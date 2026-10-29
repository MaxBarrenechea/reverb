// Reverb — player UI

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const APP = 'Reverb';
const KEY = k => `reverb.${k}`;
// Running inside a claude.ai Artifact: no folder access, hash links, pop-ups or downloads there
const EMBED = !!window.REVERB_EMBED;
// Storage can be blocked (private windows, some embedded views), so never let it crash the app
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};

// ---------- Icons ----------
const F = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const L = d => `<svg class="stroke" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const HEART = 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
const ICONS = {
  logo: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#F0323F"/><g fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"><path d="M7 9v6M10 6.5v11M13 8.5v7M16 10.5v3"/></g></svg>',
  play: F('<path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.1-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/>'),
  pause: F('<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>'),
  next: F('<path d="M5 6.1v11.8a1 1 0 0 0 1.55.83l8.6-5.9a1 1 0 0 0 0-1.66l-8.6-5.9A1 1 0 0 0 5 6.1z"/><rect x="16.5" y="5" width="2.5" height="14" rx="1.1"/>'),
  prev: F('<path d="M19 6.1v11.8a1 1 0 0 1-1.55.83l-8.6-5.9a1 1 0 0 1 0-1.66l8.6-5.9A1 1 0 0 1 19 6.1z"/><rect x="5" y="5" width="2.5" height="14" rx="1.1"/>'),
  shuffle: L('<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/>'),
  repeat: L('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  heart: L(`<path d="${HEART}"/>`),
  heartFill: F(`<path d="${HEART}"/>`),
  volume: L('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
  volumeLow: L('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'),
  mute: L('<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
  queue: L('<path d="M3 6h14"/><path d="M3 12h10"/><path d="M3 18h8"/><path d="M16 14v7l5-3.5z"/>'),
  more: F('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>'),
  plus: L('<path d="M12 5v14M5 12h14"/>'),
  search: L('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  songs: L('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  albums: L('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>'),
  artists: L('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  refresh: L('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  close: L('<path d="M18 6 6 18M6 6l12 12"/>'),
  edit: L('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: L('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
};
const icon = n => ICONS[n] || '';

// ---------- State ----------
const state = {
  tracks: [], byId: new Map(), albums: [], albumByKey: new Map(), artists: [], artistByName: new Map(),
  files: new Map(), folderName: '', scanning: false, progress: '', needsReconnect: false, source: null,
  liked: new Set(), playlists: [],
  queue: [], original: [], qi: -1, shuffle: false, repeat: 'off',
  listIds: [], sort: store.get(KEY('sort')) || 'plays',
  rawTracks: [], edits: {}, moodFilter: 'all', matchedCount: 0,
};

// Browsers that can't keep access to a folder (iPad, Safari, Firefox) save imported songs inside Reverb instead
const STORE = !Library.canPickFolder || EMBED;

const MOODS = {
  upbeat: { name: 'Upbeat', color: '#F59B23' },
  energy: { name: 'Energy', color: '#E8293B' },
  chill: { name: 'Chill', color: '#1E9E8C' },
  sad: { name: 'Sad', color: '#4762D6' },
  night: { name: 'Late Night', color: '#7A3FD0' },
  dance: { name: 'Dance', color: '#DB3C9B' },
};
const audio = $('#audio');
const view = $('#view');

// ---------- Helpers ----------
const cmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true });
const byTrackNo = (a, b) => (a.disc || 1) - (b.disc || 1) || (a.track || 999) - (b.track || 999) || cmp(a.title, b.title);
const hue = str => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const shuffled = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const albumKey = t => `${t.albumArtist}\u0000${t.album}`;
const albumHref = t => `#/album/${encodeURIComponent(albumKey(t))}`;
const artistHref = name => `#/artist/${encodeURIComponent(name)}`;
const artUrl = t => t?.artUrl || null;
const currentId = () => state.queue[state.qi];
const current = () => state.byId.get(currentId());

function fmt(s) {
  if (!isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
function totalLength(tracks) {
  const s = tracks.reduce((n, t) => n + (t.duration || 0), 0);
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (s > 0 && s < 60) return `${Math.round(s)} sec`;
  return h ? `${h} hr ${m} min` : `${m} min`;
}
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const songCount = tracks => `${plural(tracks.length, 'song')}, ${totalLength(tracks)}`;

function artHTML(t, name) {
  const u = artUrl(t);
  if (u) return `<img class="art" src="${u}" alt="" loading="lazy" decoding="async">`;
  const n = name ?? t?.album ?? '?';
  return `<div class="ph" style="--h:${hue(n)}"><span>${esc((n.trim()[0] || '?').toUpperCase())}</span></div>`;
}
function mosaicHTML(tracks, name) {
  const seen = new Set(), arts = [];
  for (const t of tracks) {
    if (!t.art || seen.has(albumKey(t))) continue;
    seen.add(albumKey(t)); arts.push(t);
    if (arts.length === 4) break;
  }
  if (arts.length < 4) return artHTML(arts[0], name);
  return `<div class="mosaic">${arts.map(t => artHTML(t)).join('')}</div>`;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- Loading ----------
function buildLibrary(tracks) {
  state.tracks = tracks;
  state.byId = new Map(tracks.map(t => [t.id, t]));

  const albums = new Map();
  const artists = new Map();
  const addArtist = (name, t) => {
    let a = artists.get(name);
    if (!a) artists.set(name, a = { name, tracks: [] });
    if (!a.tracks.includes(t)) a.tracks.push(t);
  };
  for (const t of state.tracks) {
    const k = albumKey(t);
    let a = albums.get(k);
    if (!a) albums.set(k, a = { key: k, name: t.album, artist: t.albumArtist, year: null, tracks: [] });
    a.tracks.push(t);
    if (!a.year && t.year) a.year = t.year;
    addArtist(t.artist, t);
    addArtist(t.albumArtist, t);
  }
  for (const a of albums.values()) { a.tracks.sort(byTrackNo); a.cover = a.tracks.find(t => t.art) || a.tracks[0]; }
  for (const a of artists.values()) { a.cover = a.tracks.find(t => t.art) || a.tracks[0]; }
  state.albums = [...albums.values()].sort((x, y) => cmp(x.name, y.name));
  state.albumByKey = albums;
  state.artists = [...artists.values()].sort((x, y) => cmp(x.name, y.name));
  state.artistByName = artists;
}

// Likes and playlists are saved in this browser
function loadData() {
  try {
    const d = JSON.parse(store.get(KEY('data')) || '{}');
    state.liked = new Set(Array.isArray(d.liked) ? d.liked : []);
    state.playlists = Array.isArray(d.playlists) ? d.playlists : [];
    state.edits = d.edits && typeof d.edits === 'object' ? d.edits : {};
  } catch { /* keep defaults */ }
}

function saveData() {
  if (!store.set(KEY('data'), JSON.stringify({ liked: [...state.liked], playlists: state.playlists, edits: state.edits }))) {
    toast("Couldn't save your likes and playlists in this browser.");
  }
}

// Download / restore likes + playlists as a file
function backupText() {
  return JSON.stringify({ liked: [...state.liked], playlists: state.playlists, edits: state.edits });
}
function openBackup() {
  const d = $('#backupDialog');
  $('#backupText').value = backupText();
  d.showModal();
  $('#backupText').select();
}
function openRestore() {
  $('#restoreText').value = '';
  $('#restoreDialog').showModal();
  $('#restoreText').focus();
}
async function restoreFromText(text) {
  await importData({ text: async () => text });
}

function exportData() {
  if (EMBED) return openBackup();
  const blob = new Blob([JSON.stringify({ liked: [...state.liked], playlists: state.playlists, edits: state.edits }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'reverb-backup.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importData(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.liked) || !Array.isArray(d.playlists)) throw new Error('bad file');
    state.liked = new Set(d.liked);
    state.playlists = d.playlists;
    if (d.edits && typeof d.edits === 'object') { state.edits = d.edits; applyEdits(); }
    saveData(); renderSidebar(); render(true);
    toast('Restored your likes and playlists');
  } catch {
    toast("That file isn't a Reverb backup.");
  }
}

function updateStatus() {
  $('#status').textContent = state.scanning ? (state.progress || 'Reading your music folder…') : '';
}

// ---------- Routing / rendering ----------
let memRoute = '#/songs';
const currentRoute = () => (EMBED ? memRoute : location.hash);
function go(href) {
  if (!EMBED) { location.hash = href; return; }
  memRoute = href;
  $('#search').value = ''; closeMenu(); render();
}
if (EMBED) {
  // Inside the Artifact, links like #/album/... can't change the address, so handle them here
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a || e.defaultPrevented) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
}

function parseRoute() {
  const [, name = 'songs', arg = ''] = currentRoute().slice(1).split('/');
  let decoded = '';
  try { decoded = decodeURIComponent(arg); } catch { decoded = arg; }
  return { name, arg: decoded };
}

function render(keepScroll = false) {
  const top = view.scrollTop;
  const q = $('#search').value.trim();
  const r = parseRoute();
  state.listIds = [];
  let html;

  if (!state.tracks.length) html = emptyLibrary();
  else if (q) html = searchView(q);
  else if (r.name === 'albums') html = albumsView();
  else if (r.name === 'album') html = albumView(r.arg);
  else if (r.name === 'artists') html = artistsView();
  else if (r.name === 'artist') html = artistView(r.arg);
  else if (r.name === 'liked') html = likedView();
  else if (r.name === 'playlist') html = playlistView(r.arg);
  else if (r.name === 'mood') html = moodView(r.arg);
  else html = songsView();

  view.innerHTML = html;
  view.scrollTop = keepScroll ? top : 0;
  markNav();
}

function markNav() {
  const r = parseRoute();
  const searching = !!$('#search').value.trim();
  $$('.nav a').forEach(a => a.classList.toggle('active', !searching && a.dataset.nav === r.name));
  const here = currentRoute();
  $$('.pl-list a').forEach(a => a.classList.toggle('active', !searching && a.getAttribute('href') === here));
}

function hero({ kind, title, meta, art, round = false }) {
  return `<section class="hero">
    ${art !== undefined ? `<div class="hero-art${round ? ' round' : ''}">${art}</div>` : ''}
    <div><div class="kind">${esc(kind)}</div><h1>${esc(title)}</h1><div class="meta">${meta}</div></div>
  </section>`;
}

function actions(tracks, extra = '') {
  return `<div class="actions">
    ${tracks.length ? `<button class="play-big" data-act="play-all" aria-label="Play">${icon('play')}</button>
    <button class="ghost-btn" data-act="shuffle-all">${icon('shuffle')}<span>Shuffle</span></button>` : ''}
    ${extra}
  </div>`;
}

function trackList(tracks, o = {}) {
  state.listIds = tracks.map(t => t.id);
  const showAlbum = o.showAlbum !== false;
  const showArt = o.showArt !== false;
  const cur = currentId();
  const rows = tracks.map((t, i) => {
    const liked = state.liked.has(t.id);
    const num = o.trackNumbers ? (t.track || i + 1) : i + 1;
    return `<div class="row${t.id === cur ? ' playing' : ''}" data-id="${t.id}" data-i="${i}" tabindex="0">
      <span class="num"><span class="n">${num}</span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="p">${icon('play')}</span></span>
      <div class="t-main">
        ${showArt ? `<div class="t-art">${artHTML(t)}</div>` : ''}
        <div class="t-text"><div class="title">${esc(t.title)}</div><div class="sub"><a href="${artistHref(t.artist)}">${esc(t.artist)}</a></div></div>
      </div>
      ${showAlbum ? `<div class="album"><a href="${albumHref(t)}">${esc(t.album)}</a></div>` : ''}
      <button class="icon-btn like${liked ? ' on' : ''}" data-act="like" aria-label="${liked ? 'Remove from' : 'Save to'} Liked songs">${icon(liked ? 'heartFill' : 'heart')}</button>
      <span class="dur">${fmt(t.duration)}</span>
      <button class="icon-btn more" data-act="more" aria-label="More options for ${esc(t.title)}">${icon('more')}</button>
    </div>`;
  }).join('');
  return `<div class="tracks${showAlbum ? '' : ' no-album'}">
    <div class="row head"><span class="num">#</span><span>Title</span>${showAlbum ? '<span class="album">Album</span>' : ''}<span></span><span class="dur">Time</span><span></span></div>
    ${rows}
  </div>`;
}

function albumTile(a) {
  return `<a class="tile" href="#/album/${encodeURIComponent(a.key)}">
    <div class="cover">${artHTML(a.cover, a.name)}<button class="hover-play" data-act="play-album" data-key="${esc(a.key)}" aria-label="Play ${esc(a.name)}">${icon('play')}</button></div>
    <div class="name">${esc(a.name)}</div>
    <div class="sub">${a.year ? `${a.year}, ` : ''}${esc(a.artist)}</div>
  </a>`;
}
function artistTile(a) {
  return `<a class="tile round" href="${artistHref(a.name)}">
    <div class="cover">${artHTML(a.cover, a.name)}<button class="hover-play" data-act="play-artist" data-name="${esc(a.name)}" aria-label="Play ${esc(a.name)}">${icon('play')}</button></div>
    <div class="name">${esc(a.name)}</div>
    <div class="sub">${plural(a.tracks.length, 'song')}</div>
  </a>`;
}

const SORTS = {
  plays: ['Most played', (a, b) => (b.plays || 0) - (a.plays || 0) || cmp(a.artist, b.artist) || cmp(a.title, b.title)],
  artist: ['Artist', (a, b) => cmp(a.artist, b.artist) || cmp(a.album, b.album) || byTrackNo(a, b)],
  title: ['Title', (a, b) => cmp(a.title, b.title)],
  album: ['Album', (a, b) => cmp(a.album, b.album) || byTrackNo(a, b)],
  added: ['Recently added', (a, b) => b.added - a.added],
  length: ['Length', (a, b) => a.duration - b.duration],
};

// Mood filter chips, like the ones on Spotify's Liked Songs
function moodChips() {
  const unmatched = state.tracks.filter(t => !t.matched && !t.edited).length;
  const chip = (key, label, n) => `<button class="chip${state.moodFilter === key ? ' on' : ''}" data-act="mood-filter" data-mood="${key}"${key in MOODS ? ` style="--c:${MOODS[key].color}"` : ''}>${esc(label)}${n != null ? ` <span>${n}</span>` : ''}</button>`;
  return `<div class="chips" role="group" aria-label="Filter by mood">
    ${chip('all', 'All')}
    ${Object.entries(MOODS).map(([k, m]) => chip(k, m.name, state.tracks.filter(t => t.moods?.includes(k)).length)).join('')}
    ${unmatched ? chip('unmatched', 'Needs info', unmatched) : ''}
  </div>`;
}

function songsView() {
  if (state.moodFilter === 'unmatched' && !state.tracks.some(t => !t.matched && !t.edited)) state.moodFilter = 'all';
  let tracks = state.tracks.slice().sort(SORTS[state.sort]?.[1] || SORTS.plays[1]);
  if (state.moodFilter === 'unmatched') tracks = tracks.filter(t => !t.matched && !t.edited);
  else if (state.moodFilter !== 'all') tracks = tracks.filter(t => t.moods?.includes(state.moodFilter));
  const sort = `<label class="sort">Sort by
    <select id="sortSelect">${Object.entries(SORTS).map(([k, [label]]) => `<option value="${k}"${k === state.sort ? ' selected' : ''}>${label}</option>`).join('')}</select>
  </label>`;
  const note = state.moodFilter === 'unmatched'
    ? `<p class="empty-note">These songs didn't match anything in your Spotify list. Right-click one and choose <b>Edit song info</b> to fix its name and artist.</p>` : '';
  return hero({ kind: 'Library', title: 'Songs', meta: songCount(tracks) }) + moodChips() + actions(tracks, sort) + note + trackList(tracks);
}

function moodArt(key, label = true) {
  const m = MOODS[key];
  return `<div class="mood-art" style="--c:${m.color}">${label ? `<span>${esc(m.name)}</span>` : ''}</div>`;
}

function moodView(key) {
  const m = MOODS[key];
  if (!m) return `<p class="empty-note">That mood doesn't exist.</p>`;
  const tracks = state.tracks.filter(t => t.moods?.includes(key)).sort(SORTS.plays[1]);
  return hero({ kind: 'Mood playlist', title: m.name, meta: `Your most played ${m.name.toLowerCase()} songs first. ${songCount(tracks)}`, art: moodArt(key) })
    + actions(tracks)
    + (tracks.length ? trackList(tracks) : `<p class="empty-note">No songs here yet. Right-click a song and choose <b>Edit song info</b> to add it to this mood.</p>`);
}

function albumsView() {
  return `<h1 class="page-title">Albums</h1><div class="grid">${state.albums.map(albumTile).join('')}</div>`;
}

function artistsView() {
  return `<h1 class="page-title">Artists</h1><div class="grid">${state.artists.map(artistTile).join('')}</div>`;
}

function albumView(key) {
  const a = state.albumByKey.get(key);
  if (!a) return `<p class="empty-note">That album isn't in your library anymore.</p>`;
  const meta = `<a href="${artistHref(a.artist)}"><b>${esc(a.artist)}</b></a>${a.year ? `, ${a.year}` : ''}, ${songCount(a.tracks)}`;
  return hero({ kind: 'Album', title: a.name, meta, art: artHTML(a.cover, a.name) })
    + actions(a.tracks)
    + trackList(a.tracks, { trackNumbers: true, showArt: false, showAlbum: false });
}

function artistView(name) {
  const a = state.artistByName.get(name);
  if (!a) return `<p class="empty-note">That artist isn't in your library anymore.</p>`;
  const tracks = a.tracks.slice().sort((x, y) => cmp(x.album, y.album) || byTrackNo(x, y));
  const albums = state.albums.filter(al => al.artist === name || al.tracks.some(t => t.artist === name));
  return hero({ kind: 'Artist', title: name, meta: `${plural(albums.length, 'album')}, ${songCount(tracks)}`, art: artHTML(a.cover, name), round: true })
    + actions(tracks)
    + trackList(tracks)
    + (albums.length ? `<h2 class="section">Albums</h2><div class="grid">${albums.map(albumTile).join('')}</div>` : '');
}

function likedView() {
  const tracks = [...state.liked].reverse().map(id => state.byId.get(id)).filter(Boolean);
  return hero({ kind: 'Playlist', title: 'Liked songs', meta: songCount(tracks), art: `<div class="liked-art">${icon('heartFill')}</div>` })
    + actions(tracks)
    + (tracks.length ? trackList(tracks) : `<p class="empty-note">Tap the heart on any song to save it here.</p>`);
}

function playlistView(id) {
  const p = state.playlists.find(x => x.id === id);
  if (!p) return `<p class="empty-note">That playlist was deleted.</p>`;
  const tracks = p.tracks.map(tid => state.byId.get(tid)).filter(Boolean);
  const more = `<button class="icon-btn more-big" data-act="pl-more" aria-label="Playlist options">${icon('more')}</button>`;
  return hero({ kind: 'Playlist', title: p.name, meta: songCount(tracks), art: mosaicHTML(tracks, p.name) })
    + actions(tracks, more)
    + (tracks.length ? trackList(tracks) : `<p class="empty-note">This playlist is empty. Right-click any song and choose "Add to playlist".</p>`);
}

function searchView(q) {
  const s = q.toLowerCase();
  const has = v => String(v ?? '').toLowerCase().includes(s);
  const songs = state.tracks.filter(t => has(t.title) || has(t.artist) || has(t.album))
    .sort((a, b) => Number(!has(a.title)) - Number(!has(b.title)) || cmp(a.title, b.title))
    .slice(0, 100);
  const albums = state.albums.filter(a => has(a.name) || has(a.artist)).slice(0, 12);
  const artists = state.artists.filter(a => has(a.name)).slice(0, 12);
  if (!songs.length && !albums.length && !artists.length) {
    return `<div class="empty"><h1>No matches</h1><p>Nothing in your library matches "${esc(q)}". Check the spelling or try fewer words.</p></div>`;
  }
  return `<h1 class="page-title">Results for "${esc(q)}"</h1>`
    + (songs.length ? trackList(songs) : '')
    + (albums.length ? `<h2 class="section">Albums</h2><div class="grid">${albums.map(albumTile).join('')}</div>` : '')
    + (artists.length ? `<h2 class="section">Artists</h2><div class="grid">${artists.map(artistTile).join('')}</div>` : '');
}

function emptyLibrary() {
  if (STORE && !state.scanning) return `<div class="empty">
    <h1>Add your music</h1>
    <p>Tap <b>Import songs</b> and pick your songs in the Files app. Reverb saves a copy, so after this they play right away, even offline.</p>
    <button class="pill" data-act="import">Import songs</button>
    <p style="margin-top:18px"><b>Tip:</b> open your <b>music</b> folder in the picker, tap <b>Select</b> in the top corner, then <b>Select All</b>.</p>
  </div>`;
  if (state.scanning) return `<div class="empty"><h1>Loading your music</h1><p>Reading tags and cover art. ${esc(state.progress)}</p></div>`;
  if (state.needsReconnect) return `<div class="empty">
    <h1>Welcome back</h1>
    <p>Your browser needs a click to open the <b>${esc(state.folderName)}</b> folder again.</p>
    <button class="pill" data-act="reconnect">Open my music</button>
  </div>`;
  if (state.source) return `<div class="empty">
    <h1>No songs found</h1>
    <p>There aren't any MP3, M4A, FLAC, WAV, OGG or OPUS files in <b>${esc(state.folderName)}</b> yet. Add some, then rescan.</p>
    <button class="ghost-btn" data-act="rescan">${icon('refresh')}<span>Rescan</span></button>
    <button class="ghost-btn" data-act="choose">${icon('albums')}<span>Pick a different folder</span></button>
  </div>`;
  return `<div class="empty">
    <h1>Pick your music folder</h1>
    <p>Choose the <b>music</b> folder inside Reverb (or any folder with your songs). Reverb reads it right here in your browser; nothing is uploaded.</p>
    <button class="pill" data-act="choose">Choose music folder</button>
    ${Library.canPickFolder ? '<p style="margin-top:18px">Reverb remembers this folder, so next time it opens with one click.</p>'
      : '<p style="margin-top:18px">This browser asks for the folder each time you open Reverb. Chrome or Edge remember it.</p>'}
  </div>`;
}

function sideItem(href, thumb, name, count, round = false) {
  return `<a href="${href}"><span class="thumb${round ? ' round' : ''}">${thumb}</span><span class="pl-name">${esc(name)}</span><span class="count">${count}</span></a>`;
}

function renderSidebar() {
  const mine = state.playlists.length
    ? state.playlists.map(p => {
      const tracks = p.tracks.map(id => state.byId.get(id)).filter(Boolean);
      return sideItem(`#/playlist/${p.id}`, mosaicHTML(tracks, p.name), p.name, p.tracks.length);
    }).join('')
    : '<div class="pl-empty">Make a playlist to group songs your way.</div>';
  const moods = state.tracks.length
    ? `<div class="side-sub">Moods</div>` + Object.keys(MOODS).map(k =>
      sideItem(`#/mood/${k}`, moodArt(k, false), MOODS[k].name, state.tracks.filter(t => t.moods?.includes(k)).length)).join('')
    : '';
  const artists = state.artists.length
    ? `<div class="side-sub">Artists</div>` + state.artists
      .filter(a => a.tracks.some(t => t.artist === a.name))
      .map(a => sideItem(artistHref(a.name), artHTML(a.cover, a.name), a.name, a.tracks.length, true)).join('')
    : '';
  $('#playlists').innerHTML = mine + moods + artists;
  markNav();
}

// ---------- Song info (auto-matched from Spotify, or edited by you) ----------
function applyEdits() {
  const tracks = state.rawTracks.map(t => {
    const e = state.edits[t.id];
    if (!e) return t;
    return { ...t, ...e, albumArtist: e.artist ?? t.albumArtist, edited: true };
  });
  buildLibrary(tracks);
}

function editSong(id) {
  const raw = state.rawTracks.find(t => t.id === id);
  const t = state.byId.get(id);
  if (!raw || !t) return;
  const d = $('#editDialog');
  $('#editTitle').value = t.title;
  $('#editArtist').value = t.artist;
  $('#editAlbum').value = t.album;
  $('#editFrom').textContent = raw.yt ? `From YouTube: "${raw.yt.title}" by ${raw.yt.artist}` : `File: ${raw.path}`;
  $('#editMoods').innerHTML = Object.entries(MOODS).map(([k, m]) =>
    `<label class="chip" style="--c:${m.color}"><input type="checkbox" value="${k}"${t.moods?.includes(k) ? ' checked' : ''}>${esc(m.name)}</label>`).join('');
  $('#editReset').hidden = !state.edits[id];
  d.returnValue = '';
  d.onclose = () => {
    if (d.returnValue === 'reset') {
      delete state.edits[id];
    } else if (d.returnValue === 'ok') {
      const title = $('#editTitle').value.trim() || raw.title;
      const artist = $('#editArtist').value.trim() || raw.artist;
      const album = $('#editAlbum').value.trim() || raw.album;
      const moods = $$('#editMoods input:checked').map(i => i.value);
      state.edits[id] = { title, artist, album, moods };
    } else return;
    saveData();
    applyEdits();
    renderSidebar();
    render(true);
    updateNowPlaying();
    toast(d.returnValue === 'reset' ? 'Went back to the automatic song info' : `Saved "${state.byId.get(id)?.title}"`);
  };
  d.showModal();
  $('#editTitle').select();
}

// ---------- Playback ----------
let pendingSeek = 0;

function playList(ids, start = 0, forceShuffle = null) {
  if (!ids.length) return;
  if (forceShuffle !== null) setShuffle(forceShuffle, false);
  state.original = ids.slice();
  if (state.shuffle) {
    if (forceShuffle) start = Math.floor(Math.random() * ids.length);
    state.queue = [ids[start], ...shuffled(ids.filter((_, i) => i !== start))];
    state.qi = 0;
  } else {
    state.queue = ids.slice();
    state.qi = start;
  }
  loadCurrent(true);
}

function loadCurrent(autoplay, startAt = 0) {
  const t = current();
  if (!t) return;
  pendingSeek = startAt;
  const file = state.files.get(t.id);
  if (!file) return;
  if (audio.dataset.url) URL.revokeObjectURL(audio.dataset.url);
  audio.dataset.url = URL.createObjectURL(file);
  audio.src = audio.dataset.url;
  if (autoplay) audio.play().catch(err => { if (err.name !== 'AbortError') console.warn(err); });
  updateNowPlaying();
  markRows();
  renderQueue();
  saveSession();
}

function togglePlay() {
  if (!current()) {
    const ids = state.listIds.length ? state.listIds : state.tracks.map(t => t.id);
    return playList(ids, 0);
  }
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}

function next(auto = false) {
  if (!state.queue.length) return;
  if (auto && state.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
  if (state.qi < state.queue.length - 1) { state.qi++; loadCurrent(true); }
  else if (state.repeat !== 'off') { state.qi = 0; loadCurrent(true); }
  else if (auto) { audio.pause(); audio.currentTime = 0; }
}

function prev() {
  if (audio.currentTime > 3 || state.qi <= 0) { audio.currentTime = 0; return; }
  state.qi--;
  loadCurrent(true);
}

function setShuffle(on, reorder = true) {
  state.shuffle = on;
  const btn = $('#shuffleBtn');
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on);
  if (reorder && current()) {
    const cur = currentId();
    if (on) {
      const rest = state.original.slice();
      const at = rest.indexOf(cur);
      if (at > -1) rest.splice(at, 1);
      state.queue = [cur, ...shuffled(rest)];
      state.qi = 0;
    } else {
      state.queue = state.original.slice();
      state.qi = Math.max(0, state.queue.indexOf(cur));
    }
    renderQueue();
    saveSession();
  }
}

function cycleRepeat() {
  state.repeat = { off: 'all', all: 'one', one: 'off' }[state.repeat];
  updateRepeatBtn();
  saveSession();
}
function updateRepeatBtn() {
  const b = $('#repeatBtn');
  b.classList.toggle('on', state.repeat !== 'off');
  b.innerHTML = icon('repeat') + (state.repeat === 'one' ? '<span class="badge">1</span>' : '');
  b.setAttribute('aria-label', `Repeat: ${state.repeat === 'one' ? 'this song' : state.repeat === 'all' ? 'on' : 'off'}`);
}

function playNext(id) {
  if (!current()) return playList([id], 0);
  state.queue.splice(state.qi + 1, 0, id);
  const at = state.original.indexOf(currentId());
  state.original.splice(at + 1, 0, id);
  renderQueue(); saveSession();
  toast(`"${state.byId.get(id)?.title}" plays next`);
}
function addToQueue(id) {
  if (!current()) return playList([id], 0);
  state.queue.push(id);
  state.original.push(id);
  renderQueue(); saveSession();
  toast(`Added "${state.byId.get(id)?.title}" to the queue`);
}

function markRows() {
  const id = currentId();
  $$('.row[data-id]').forEach(r => r.classList.toggle('playing', r.dataset.id === id));
}

function updateNowPlaying() {
  const t = current();
  $('#npArt').innerHTML = t ? artHTML(t) : '';
  $('#npTitle').textContent = t?.title || '';
  $('#npTitle').href = t ? albumHref(t) : '#/songs';
  $('#npArtist').textContent = t?.artist || '';
  $('#npArtist').href = t ? artistHref(t.artist) : '#/artists';
  $('#npLike').hidden = !t;
  updateLikeButtons();
  document.title = t ? `${t.title} – ${t.artist}` : APP;
  setTint(t);

  if ('mediaSession' in navigator && t) {
    const u = artUrl(t);
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: t.artist, album: t.album,
      artwork: u ? [{ src: u, sizes: '512x512' }] : [],
    });
  }
}

// Tints the top of the page with the current album's color
function setTint(t) {
  const root = document.documentElement;
  const fallback = t ? `hsl(${hue(t.album)} 30% 32%)` : '#5A1018';
  const u = artUrl(t);
  if (!u) return root.style.setProperty('--tint', fallback);
  const img = new Image();
  img.onload = () => root.style.setProperty('--tint', colorFrom(img) || fallback);
  img.onerror = () => root.style.setProperty('--tint', fallback);
  img.src = u;
}
function colorFrom(img) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i], d[i + 1], d[i + 2]), min = Math.min(d[i], d[i + 1], d[i + 2]);
      const wt = (max - min) ** 1.5 + 1; // favour colourful pixels over greys
      r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
    }
    r /= w * 255; g /= w * 255; b /= w * 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const dd = max - min;
      s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
      h = max === r ? (g - b) / dd + (g < b ? 6 : 0) : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      h *= 60;
    }
    return `hsl(${Math.round(h)} ${Math.round(Math.min(s, 0.7) * 100)}% 34%)`;
  } catch { return null; }
}

// ---------- Likes & playlists ----------
function toggleLike(id) {
  if (!id) return;
  const t = state.byId.get(id);
  if (state.liked.has(id)) { state.liked.delete(id); toast(`Removed "${t?.title}" from Liked songs`); }
  else { state.liked.add(id); toast(`Saved "${t?.title}" to Liked songs`); }
  saveData();
  updateLikeButtons();
  if (parseRoute().name === 'liked' && !$('#search').value.trim()) render(true);
}

function updateLikeButtons() {
  $$('.row[data-id]').forEach(r => {
    const on = state.liked.has(r.dataset.id);
    const b = r.querySelector('.like');
    if (!b || b.classList.contains('on') === on) return;
    b.classList.toggle('on', on);
    b.innerHTML = icon(on ? 'heartFill' : 'heart');
    b.setAttribute('aria-label', `${on ? 'Remove from' : 'Save to'} Liked songs`);
  });
  const id = currentId();
  const on = !!id && state.liked.has(id);
  const b = $('#npLike');
  b.classList.toggle('on', on);
  b.innerHTML = icon(on ? 'heartFill' : 'heart');
  b.setAttribute('aria-label', `${on ? 'Remove from' : 'Save to'} Liked songs`);
}

function askConfirm(message, okLabel = 'Remove') {
  return new Promise(resolve => {
    const d = $('#confirmDialog');
    $('#confirmText').textContent = message;
    $('#confirmOk').textContent = okLabel;
    d.returnValue = '';
    d.onclose = () => resolve(d.returnValue === 'ok');
    d.showModal();
    $('#confirmCancel').focus();
  });
}

function askName(title, initial = '') {
  return new Promise(resolve => {
    const d = $('#nameDialog');
    const input = $('#nameInput');
    $('#nameTitle').textContent = title;
    input.value = initial;
    d.returnValue = '';
    d.onclose = () => resolve(d.returnValue === 'ok' ? input.value.trim() || null : null);
    d.showModal();
    input.select();
  });
}

async function createPlaylist(ids = []) {
  const name = await askName('New playlist', `My playlist #${state.playlists.length + 1}`);
  if (!name) return;
  const p = { id: Math.random().toString(36).slice(2, 10), name, tracks: ids.slice(), created: Date.now() };
  state.playlists.push(p);
  saveData();
  renderSidebar();
  if (ids.length) toast(`Added to "${name}"`);
  else go(`#/playlist/${p.id}`);
}

function addToPlaylist(pid, ids) {
  const p = state.playlists.find(x => x.id === pid);
  if (!p) return;
  const fresh = ids.filter(id => !p.tracks.includes(id));
  if (!fresh.length) return toast(`Already in "${p.name}"`);
  p.tracks.push(...fresh);
  saveData();
  renderSidebar();
  toast(`Added to "${p.name}"`);
  if (parseRoute().arg === pid) render(true);
}

function removeFromPlaylist(pid, id) {
  const p = state.playlists.find(x => x.id === pid);
  if (!p) return;
  const at = p.tracks.indexOf(id);
  if (at > -1) p.tracks.splice(at, 1);
  saveData();
  renderSidebar();
  render(true);
}

async function renamePlaylist(pid) {
  const p = state.playlists.find(x => x.id === pid);
  const name = p && await askName('Rename playlist', p.name);
  if (!name) return;
  p.name = name;
  saveData();
  renderSidebar();
  render(true);
}

async function deletePlaylist(pid) {
  const p = state.playlists.find(x => x.id === pid);
  if (!p || !(await askConfirm(`Delete "${p.name}"? Your songs stay in your library.`, 'Delete playlist'))) return;
  state.playlists = state.playlists.filter(x => x.id !== pid);
  saveData();
  renderSidebar();
  go('#/songs');
  toast(`Deleted "${p.name}"`);
}

// ---------- Menus ----------
function openMenu(items, x, y) {
  const m = $('#menu');
  m.innerHTML = items.map((it, k) => {
    if (it === '-') return '<hr>';
    if (it.label) return `<div class="label">${esc(it.label)}</div>`;
    return `<button role="menuitem" data-k="${k}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.text)}</span></button>`;
  }).join('');
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`;
  m.style.top = `${y + r.height > innerHeight - 8 ? Math.max(8, y - r.height) : y}px`;
  m.onclick = e => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    closeMenu();
    items[+b.dataset.k].run();
  };
  m.querySelector('button')?.focus();
}
function closeMenu() { $('#menu').hidden = true; }

function trackMenu(id, x, y) {
  const t = state.byId.get(id);
  if (!t) return;
  const r = parseRoute();
  const inPlaylist = r.name === 'playlist' && !$('#search').value.trim() ? r.arg : null;
  openMenu([
    { text: 'Play next', icon: 'next', run: () => playNext(id) },
    { text: 'Add to queue', icon: 'queue', run: () => addToQueue(id) },
    '-',
    { text: 'Add to playlist', icon: 'plus', run: () => playlistPicker([id], x, y) },
    ...(inPlaylist ? [{ text: 'Remove from this playlist', icon: 'trash', run: () => removeFromPlaylist(inPlaylist, id) }] : []),
    { text: state.liked.has(id) ? 'Remove from Liked songs' : 'Save to Liked songs', icon: 'heart', run: () => toggleLike(id) },
    '-',
    { text: 'Go to album', icon: 'albums', run: () => { $('#search').value = ''; go(albumHref(t)); } },
    { text: 'Go to artist', icon: 'artists', run: () => { $('#search').value = ''; go(artistHref(t.artist)); } },
    '-',
    { text: 'Edit song info', icon: 'edit', run: () => editSong(id) },
    ...(STORE ? [{ text: 'Remove from Reverb', icon: 'trash', run: () => removeSong(id) }] : []),
  ], x, y);
}

function playlistPicker(ids, x, y) {
  setTimeout(() => openMenu([
    { label: 'Add to playlist' },
    { text: 'New playlist', icon: 'plus', run: () => createPlaylist(ids) },
    ...(state.playlists.length ? ['-'] : []),
    ...state.playlists.map(p => ({ text: p.name, run: () => addToPlaylist(p.id, ids) })),
  ], x, y));
}

// ---------- Queue panel ----------
function queueItem(t, j, now = false) {
  return `<div class="q-item${now ? ' now' : ''}" data-j="${j}">
    <div class="t-art">${artHTML(t)}</div>
    <div class="t-text"><div class="title">${esc(t.title)}</div><div class="sub">${esc(t.artist)}</div></div>
    ${now ? '' : `<button class="icon-btn rm" data-rm="${j}" aria-label="Remove from queue">${icon('close')}</button>`}
  </div>`;
}

function renderQueue() {
  if ($('#queuePanel').hidden) return;
  const t = current();
  if (!t) { $('#queueList').innerHTML = '<p class="q-more">Play something and your queue shows up here.</p>'; return; }
  const LIMIT = 150;
  const up = [];
  for (let j = state.qi + 1; j < state.queue.length && up.length < LIMIT; j++) {
    const u = state.byId.get(state.queue[j]);
    if (u) up.push(queueItem(u, j));
  }
  const extra = state.queue.length - state.qi - 1 - LIMIT;
  $('#queueList').innerHTML = `<h3>Now playing</h3>${queueItem(t, state.qi, true)}
    <h3>Next up</h3>${up.join('') || `<p class="q-more">${state.repeat === 'all' ? 'The queue starts over after this song.' : 'Nothing else queued.'}</p>`}
    ${extra > 0 ? `<p class="q-more">…and ${plural(extra, 'more song')}</p>` : ''}`;
}

function toggleQueue(show = $('#queuePanel').hidden) {
  $('#queuePanel').hidden = !show;
  $('#queueBtn').classList.toggle('on', show);
  $('#queueBtn').setAttribute('aria-pressed', show);
  renderQueue();
}

// ---------- Session (remembers where you left off) ----------
function saveSession() {
  try {
    store.set(KEY('session'), JSON.stringify({
      queue: state.queue, original: state.original, qi: state.qi,
      time: audio.currentTime || 0, shuffle: state.shuffle, repeat: state.repeat,
    }));
  } catch { /* storage full or blocked */ }
}

function restoreSession() {
  let s;
  try { s = JSON.parse(store.get(KEY('session'))); } catch { return; }
  if (!s) return;
  state.repeat = ['off', 'all', 'one'].includes(s.repeat) ? s.repeat : 'off';
  updateRepeatBtn();
  setShuffle(!!s.shuffle, false);
  const curId = s.queue?.[s.qi];
  state.queue = (s.queue || []).filter(id => state.byId.has(id));
  state.original = (s.original || []).filter(id => state.byId.has(id));
  state.qi = state.queue.indexOf(curId);
  if (state.qi > -1) loadCurrent(false, s.time || 0);
}

// ---------- Volume ----------
function setVolume(v, remember = true) {
  v = Math.min(1, Math.max(0, v));
  audio.volume = v;
  $('#volume').value = v;
  setPct($('#volume'));
  if (remember) store.set(KEY('volume'), v);
  updateMuteIcon();
}
function updateMuteIcon() {
  const v = audio.muted ? 0 : audio.volume;
  $('#muteBtn').innerHTML = icon(v === 0 ? 'mute' : v < 0.5 ? 'volumeLow' : 'volume');
  $('#muteBtn').setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
}
function toggleMute() {
  audio.muted = !audio.muted;
  if (!audio.muted && audio.volume === 0) setVolume(0.5);
  $('#volume').value = audio.muted ? 0 : audio.volume;
  setPct($('#volume'));
  updateMuteIcon();
}
const setPct = el => el.style.setProperty('--pct', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);

// ---------- Events ----------
$$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
$('#playBtn').innerHTML = icon('play');
updateRepeatBtn();

view.addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  const row = e.target.closest('.row:not(.head)');
  if (act) {
    const a = act.dataset.act;
    if (act.closest('a')) e.preventDefault();
    if (a === 'play-all') return playList(state.listIds, 0, false);
    if (a === 'shuffle-all') return playList(state.listIds, 0, true);
    if (a === 'like') return toggleLike(row?.dataset.id);
    if (a === 'more') { const r = act.getBoundingClientRect(); return trackMenu(row.dataset.id, r.left - 180, r.bottom + 4); }
    if (a === 'mood-filter') { state.moodFilter = act.dataset.mood; return render(true); }
    if (a === 'rescan') return rescan();
    if (a === 'choose') return chooseFolder();
    if (a === 'import') return $('#importSongs').click();
    if (a === 'reconnect') return reconnect();
    if (a === 'play-album') { const al = state.albumByKey.get(act.dataset.key); return al && playList(al.tracks.map(t => t.id), 0); }
    if (a === 'play-artist') {
      const ar = state.artistByName.get(act.dataset.name);
      return ar && playList(ar.tracks.slice().sort((x, y) => cmp(x.album, y.album) || byTrackNo(x, y)).map(t => t.id), 0);
    }
    if (a === 'pl-more') {
      const pid = parseRoute().arg;
      const r = act.getBoundingClientRect();
      return openMenu([
        { text: 'Rename', icon: 'edit', run: () => renamePlaylist(pid) },
        { text: 'Delete playlist', icon: 'trash', run: () => deletePlaylist(pid) },
      ], r.left, r.bottom + 4);
    }
  }
  if (e.target.closest('a')) return; // artist / album links
  if (row) {
    if (row.dataset.id === currentId() && !audio.ended) return togglePlay();
    playList(state.listIds, +row.dataset.i);
  }
});

view.addEventListener('contextmenu', e => {
  const row = e.target.closest('.row:not(.head)');
  if (!row) return;
  e.preventDefault();
  trackMenu(row.dataset.id, e.clientX, e.clientY);
});

view.addEventListener('change', e => {
  if (e.target.id === 'sortSelect') {
    state.sort = e.target.value;
    store.set(KEY('sort'), state.sort);
    render(true);
  }
});

$('#queueList').addEventListener('click', e => {
  const rm = e.target.closest('[data-rm]');
  if (rm) {
    const j = +rm.dataset.rm;
    const [id] = state.queue.splice(j, 1);
    const at = state.original.lastIndexOf(id);
    if (at > -1) state.original.splice(at, 1);
    renderQueue(); saveSession();
    return;
  }
  const item = e.target.closest('.q-item');
  if (item && !item.classList.contains('now')) { state.qi = +item.dataset.j; loadCurrent(true); }
});

document.addEventListener('mousedown', e => { if (!e.target.closest('#menu')) closeMenu(); });
window.addEventListener('blur', closeMenu);
view.addEventListener('scroll', closeMenu, { passive: true });

let searchTimer;
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => render(), 120); });
window.addEventListener('hashchange', () => { $('#search').value = ''; closeMenu(); render(); });

$('#newPlaylist').addEventListener('click', () => createPlaylist());
$('#nameCancel').addEventListener('click', () => $('#nameDialog').close('cancel'));
$('#editCancel').addEventListener('click', () => $('#editDialog').close('cancel'));
$('#rescan').addEventListener('click', () => (STORE ? $('#importSongs').click() : state.source ? rescan() : chooseFolder()));
$('#chooseFolder').addEventListener('click', () => (STORE ? removeAllSongs() : chooseFolder()));
$('#topImport').addEventListener('click', () => $('#importSongs').click());
$('#importSongs').addEventListener('change', e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) importSongs(files);
});
if (STORE) {
  $('#rescan span').textContent = 'Import songs';
  $('#rescan svg')?.remove();
  $('#rescan').insertAdjacentHTML('afterbegin', icon('plus'));
  $('#chooseFolder span').textContent = 'Remove all songs';
  $('#chooseFolder svg')?.remove();
  $('#chooseFolder').insertAdjacentHTML('afterbegin', icon('trash'));
  $('#topImport').hidden = false;
}
$('#exportData').addEventListener('click', exportData);
$('#importData').addEventListener('click', () => (EMBED ? openRestore() : $('#importInput').click()));
$('#backupCopy').addEventListener('click', async () => {
  const text = $('#backupText').value;
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it into Restore on your other device.'); }
  catch { $('#backupText').select(); toast('Press Copy on your keyboard menu to copy the selected text.'); }
});
$('#backupClose').addEventListener('click', () => $('#backupDialog').close());
$('#restoreCancel').addEventListener('click', () => $('#restoreDialog').close());
$('#restoreFile').addEventListener('click', () => $('#importInput').click());
$('#restoreForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#restoreText').value.trim();
  if (!text) return toast('Paste your backup text first.');
  $('#restoreDialog').close();
  restoreFromText(text);
});
$('#confirmCancel').addEventListener('click', () => $('#confirmDialog').close('cancel'));
$('#importInput').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) { $('#restoreDialog').open && $('#restoreDialog').close(); importData(f); } });
$('#folderInput').addEventListener('change', e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  state.folderName = (files[0].webkitRelativePath || '').split('/')[0] || 'music';
  state.source = { kind: 'files', files };
  rescan();
});
$('#playBtn').addEventListener('click', togglePlay);
$('#nextBtn').addEventListener('click', () => next());
$('#prevBtn').addEventListener('click', prev);
$('#shuffleBtn').addEventListener('click', () => { setShuffle(!state.shuffle); saveSession(); });
$('#repeatBtn').addEventListener('click', cycleRepeat);
$('#queueBtn').addEventListener('click', () => toggleQueue());
$('#closeQueue').addEventListener('click', () => toggleQueue(false));
$('#npLike').addEventListener('click', () => toggleLike(currentId()));
$('#muteBtn').addEventListener('click', toggleMute);
$('#volume').addEventListener('input', e => { audio.muted = false; setVolume(+e.target.value); });

// Seek bar
const seek = $('#seek');
let seeking = false;
seek.addEventListener('input', () => {
  seeking = true;
  const d = audio.duration || current()?.duration || 0;
  $('#cur').textContent = fmt((seek.value / 1000) * d);
  setPct(seek);
});
seek.addEventListener('change', () => {
  if (isFinite(audio.duration)) audio.currentTime = (seek.value / 1000) * audio.duration;
  seeking = false;
});

let lastSessionSave = 0;
function updateTime() {
  const d = isFinite(audio.duration) ? audio.duration : current()?.duration || 0;
  $('#dur').textContent = fmt(d);
  if (!seeking) {
    $('#cur').textContent = fmt(audio.currentTime);
    seek.value = d ? (audio.currentTime / d) * 1000 : 0;
    setPct(seek);
  }
  if (Date.now() - lastSessionSave > 5000) { lastSessionSave = Date.now(); saveSession(); }
}

audio.addEventListener('timeupdate', updateTime);
audio.addEventListener('loadedmetadata', () => {
  if (pendingSeek) { audio.currentTime = Math.min(pendingSeek, audio.duration - 1); pendingSeek = 0; }
  updateTime();
});
audio.addEventListener('play', () => { document.body.classList.remove('paused'); $('#playBtn').innerHTML = icon('pause'); $('#playBtn').setAttribute('aria-label', 'Pause'); });
audio.addEventListener('pause', () => { document.body.classList.add('paused'); $('#playBtn').innerHTML = icon('play'); $('#playBtn').setAttribute('aria-label', 'Play'); saveSession(); });
audio.addEventListener('ended', () => next(true));

let errorStreak = 0;
audio.addEventListener('playing', () => { errorStreak = 0; });
audio.addEventListener('error', () => {
  const t = current();
  if (!t || !audio.getAttribute('src')) return;
  toast(`Can't play "${t.title}". Your browser doesn't support this file's format.`);
  if (++errorStreak < 5 && state.qi < state.queue.length - 1) next();
});

window.addEventListener('pagehide', saveSession);

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  const el = e.target;
  if (el.matches('input:not([type=range]), textarea, select')) {
    if (e.key === 'Escape' && el.id === 'search') { el.value = ''; render(); el.blur(); }
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape') return closeMenu();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (el.matches('input[type=range]') && e.key.startsWith('Arrow')) return;

  if (e.code === 'Space') {
    if (el.closest('button, a')) return;
    e.preventDefault(); togglePlay();
  } else if (e.key === 'Enter' && el.matches('.row')) {
    el.click();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault(); e.shiftKey ? next() : (audio.currentTime = Math.min(audio.currentTime + 5, audio.duration || 0));
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault(); e.shiftKey ? prev() : (audio.currentTime = Math.max(audio.currentTime - 5, 0));
  } else if (e.key === 'm' || e.key === 'M') toggleMute();
  else if (e.key === 's' || e.key === 'S') { setShuffle(!state.shuffle); saveSession(); }
  else if (e.key === 'r' || e.key === 'R') cycleRepeat();
  else if (e.key === 'q' || e.key === 'Q') toggleQueue();
  else if (e.key === 'l' || e.key === 'L') toggleLike(currentId());
  else if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
});

// Media keys on your keyboard / headphones
if ('mediaSession' in navigator) {
  const handlers = {
    play: () => audio.play(), pause: () => audio.pause(),
    previoustrack: prev, nexttrack: () => next(),
    seekto: d => { audio.currentTime = d.seekTime; },
  };
  for (const [a, f] of Object.entries(handlers)) { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* unsupported */ } }
}

// ---------- Music folder ----------
async function chooseFolder() {
  if (STORE) return $('#importSongs').click();
  let handle;
  try { handle = await window.showDirectoryPicker({ id: 'reverb-music', mode: 'read' }); }
  catch (e) { if (e.name !== 'AbortError') toast("Couldn't open that folder."); return; }
  await Library.saveHandle(handle);
  state.folderName = handle.name;
  state.source = { kind: 'handle', handle };
  state.needsReconnect = false;
  rescan();
}

async function reconnect() {
  const handle = state.source?.handle;
  if (!handle) return chooseFolder();
  try {
    if (await handle.requestPermission({ mode: 'read' }) !== 'granted') return toast('Reverb needs permission to read that folder.');
  } catch { return chooseFolder(); }
  state.needsReconnect = false;
  rescan();
}

let scanRun = 0;
async function rescan() {
  if (STORE) {
    state.folderName = 'Reverb';
    state.source = { kind: 'files', files: await Library.storeFiles().catch(() => []) };
  }
  if (!state.source) return chooseFolder();
  const run = ++scanRun;
  const b = $('#rescan');
  b.classList.add('spinning');
  state.scanning = true;
  state.progress = '';
  updateStatus();
  if (!state.tracks.length) render();
  try {
    const { tracks, files } = await Library.scan(state.source, (done, total) => {
      if (run !== scanRun) return;
      state.progress = `Reading ${done.toLocaleString()} of ${total.toLocaleString()} songs…`;
      updateStatus();
      const p = view.querySelector('.empty p');
      if (p && !state.tracks.length) p.textContent = `Reading tags and cover art. ${state.progress}`;
    });
    if (run !== scanRun) return;
    const wasEmpty = !state.tracks.length;
    const playingFile = state.files.get(currentId());
    state.files = files;
    if (playingFile && currentId() && !files.has(currentId())) state.files.set(currentId(), playingFile);
    state.matchedCount = Matcher.apply(tracks);
    state.rawTracks = tracks;
    applyEdits();
    state.scanning = false;
    updateStatus();
    renderSidebar();
    render(!wasEmpty);
    if (wasEmpty) restoreSession();
    else updateNowPlaying();
    if (!STORE) $('#rescan span').textContent = 'Rescan music folder';
    if (tracks.length || !STORE) toast(`${plural(tracks.length, 'song')}, ${state.matchedCount.toLocaleString()} matched to your Spotify info`);
    fillMissingDurations(run);
  } catch (e) {
    console.error(e);
    state.scanning = false;
    updateStatus();
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') { state.needsReconnect = true; render(); }
    else toast("Couldn't read that folder. Try choosing it again.");
  } finally {
    b.classList.remove('spinning');
  }
}

// Some formats (WAV, OGG) don't store their length; ask the browser instead
async function fillMissingDurations(run) {
  const missing = state.tracks.filter(t => !t.duration);
  if (!missing.length) return;
  let changed = 0;
  const work = missing.slice();
  async function worker() {
    while (work.length && run === scanRun) {
      const t = work.shift();
      const f = state.files.get(t.id);
      if (!f) continue;
      t.duration = await Library.probeDuration(f);
      if (t.duration) changed++;
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker));
  if (changed && run === scanRun) { render(true); updateTime(); }
}

// ---------- Imported songs (iPad) ----------
const gb = n => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`;

async function importSongs(files) {
  const b = $('#rescan');
  b.classList.add('spinning');
  state.scanning = true;
  state.progress = 'Saving songs…';
  updateStatus();
  if (!state.tracks.length) render();
  try {
    const r = await Library.storeAdd(files, (done, total) => {
      state.progress = `Saving ${done.toLocaleString()} of ${total.toLocaleString()} songs…`;
      updateStatus();
      const p = view.querySelector('.empty p');
      if (p && !state.tracks.length) p.textContent = state.progress;
    });
    state.scanning = false;
    await rescan();
    const use = await Library.storeUsage();
    const bits = [`Added ${plural(r.added, 'song')}`];
    if (r.skipped) bits.push(`${r.skipped.toLocaleString()} already here`);
    if (r.failed) bits.push(`${r.failed.toLocaleString()} couldn't be saved${use && use.quota && use.used > use.quota * 0.9 ? ' (storage is full)' : ''}`);
    if (r.notAudio) bits.push(`${r.notAudio.toLocaleString()} weren't songs`);
    toast(bits.join(', ') + (use?.used ? `. Using ${gb(use.used)}.` : '.'));
  } catch (e) {
    console.error(e);
    state.scanning = false;
    updateStatus();
    render();
    toast("Couldn't save those songs. Check that your iPad has free space.");
  } finally {
    b.classList.remove('spinning');
  }
}

async function removeSong(id) {
  const t = state.byId.get(id);
  const raw = state.rawTracks.find(x => x.id === id);
  if (!t || !raw || !(await askConfirm(`Remove "${t.title}" from Reverb? The original file on your device isn't touched.`))) return;
  if (currentId() === id) { audio.pause(); }
  await Library.storeRemove(raw.path).catch(() => {});
  await rescan();
  toast(`Removed "${t.title}"`);
}

async function removeAllSongs() {
  if (!state.tracks.length) return toast('There are no songs to remove.');
  if (!(await askConfirm(`Remove all ${state.tracks.length} songs from Reverb? Your likes and playlists are kept, and the original files on your device aren't touched.`, 'Remove all'))) return;
  audio.pause();
  await Library.storeClear().catch(() => {});
  await rescan();
  toast('Removed all songs');
}

// ---------- Start ----------
(async function init() {
  setVolume(parseFloat(store.get(KEY('volume')) ?? '0.8'), false);
  loadData();
  renderSidebar();
  if (STORE) return rescan();
  const handle = Library.canPickFolder ? await Library.loadHandle() : null;
  if (handle) {
    state.folderName = handle.name;
    state.source = { kind: 'handle', handle };
    let perm = 'prompt';
    try { perm = await handle.queryPermission({ mode: 'read' }); } catch { /* ignore */ }
    if (perm === 'granted') return rescan();
    state.needsReconnect = true;
  }
  render();
})();

// Lets Reverb open with no internet once it's been installed from a website
if (!EMBED && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
