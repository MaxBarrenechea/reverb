// Reverb — music library, read entirely in the browser.
// Opens your music folder, reads tags + cover art from MP3 / FLAC / M4A files,
// and works out song lengths. Nothing leaves your computer.

const Library = (() => {
  const AUDIO = ['mp3', 'm4a', 'mp4', 'aac', 'flac', 'wav', 'ogg', 'oga', 'opus', 'webm'];
  const COVER_NAMES = ['cover', 'folder', 'front', 'album', 'artwork'];
  const IMAGE = ['jpg', 'jpeg', 'png', 'webp'];
  const ext = name => (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
  const stem = name => name.replace(/\.[^.]+$/, '');

  // ---------- Saving the folder choice (IndexedDB) ----------
  let dbPromise;
  function db() {
    return dbPromise ||= new Promise((resolve, reject) => {
      const r = indexedDB.open('reverb', 2);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
        if (!r.result.objectStoreNames.contains('songs')) r.result.createObjectStore('songs');   // iPad: imported songs
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbPromise = null; reject(r.error); };
    });
  }
  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage write was cancelled'));
    });
  }
  const kv = (mode, fn) => tx('kv', mode, fn);
  const saveHandle = h => kv('readwrite', s => s.put(h, 'musicDir')).catch(() => {});
  const loadHandle = () => kv('readonly', s => s.get('musicDir')).catch(() => null);

  const canPickFolder = typeof window.showDirectoryPicker === 'function';

  // ---------- Songs saved inside the browser (iPad, Safari, Firefox) ----------
  // There's no way to keep access to a folder on these browsers, so imported songs
  // are copied into the browser's own storage and play from there, even offline.
  async function storeList() {
    return (await tx('songs', 'readonly', s => s.getAll())) || [];
  }

  async function storeAdd(fileList, onProgress = () => {}) {
    const files = [...fileList].filter(f => AUDIO.includes(ext(f.name)));
    const have = new Map((await storeList()).map(r => [r.name, r.size]));
    let added = 0, skipped = 0, failed = 0, done = 0;
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    for (const f of files) {
      if (have.get(f.name) === f.size) { skipped++; }
      else {
        try {
          // Read the bytes now: some iPad file pickers hand over files that can't be read later
          const blob = new Blob([await f.arrayBuffer()], { type: f.type || 'audio/mpeg' });
          await tx('songs', 'readwrite', s => s.put({ name: f.name, size: f.size, lastModified: f.lastModified || Date.now(), blob }, f.name));
          added++;
        } catch (e) {
          console.warn(`Couldn't save ${f.name}:`, e);
          failed++;
          if (e?.name === 'QuotaExceededError') { onProgress(++done, files.length); break; }
        }
      }
      onProgress(++done, files.length);
    }
    return { added, skipped, failed, total: files.length, notAudio: fileList.length - files.length };
  }

  async function storeFiles() {
    return (await storeList()).map(r => new File([r.blob], r.name, { type: r.blob.type, lastModified: r.lastModified }));
  }
  const storeRemove = name => tx('songs', 'readwrite', s => s.delete(name));
  const storeClear = () => tx('songs', 'readwrite', s => s.clear());
  async function storeUsage() {
    try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; }
    catch { return null; }
  }

  // ---------- Collecting files ----------
  async function walkHandle(dir, prefix = '', out = { audio: [], covers: new Map() }) {
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith('.')) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (h.kind === 'directory') await walkHandle(h, path, out);
      else if (AUDIO.includes(ext(name))) out.audio.push({ path, get: () => h.getFile() });
      else if (IMAGE.includes(ext(name)) && COVER_NAMES.includes(stem(name).toLowerCase()) && !out.covers.has(prefix)) {
        out.covers.set(prefix, () => h.getFile());
      }
    }
    return out;
  }

  function fromFileList(list) {
    const out = { audio: [], covers: new Map() };
    for (const f of list) {
      const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name;
      if (rel.split('/').some(p => p.startsWith('.'))) continue;
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      if (AUDIO.includes(ext(f.name))) out.audio.push({ path: rel, get: async () => f });
      else if (IMAGE.includes(ext(f.name)) && COVER_NAMES.includes(stem(f.name).toLowerCase()) && !out.covers.has(dir)) {
        out.covers.set(dir, async () => f);
      }
    }
    return out;
  }

  // ---------- Small binary helpers ----------
  const readBytes = async (file, start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer());
  const u32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  const u24 = (b, i) => (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
  const syncsafe = (b, i) => (b[i] << 21) | (b[i + 1] << 14) | (b[i + 2] << 7) | b[i + 3];
  const ascii = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));
  const decoders = {};
  const decode = (bytes, enc) => (decoders[enc] ||= new TextDecoder(enc)).decode(bytes);
  const clean = s => s.replace(/\u0000+$/g, '').replace(/\u0000/g, ', ').trim();
  const firstNum = s => { const n = parseInt(String(s || ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const yearOf = s => { const m = String(s || '').match(/\d{4}/); return m ? +m[0] : null; };

  function deUnsync(b) {
    const out = [];
    for (let i = 0; i < b.length; i++) { out.push(b[i]); if (b[i] === 0xFF && b[i + 1] === 0x00) i++; }
    return new Uint8Array(out);
  }

  // ---------- MP3 (ID3v2 / ID3v1) ----------
  function id3Text(data) {
    const enc = data[0];
    const body = data.subarray(1);
    if (enc === 1) return clean(decode(body, 'utf-16'));       // with BOM
    if (enc === 2) return clean(decode(body, 'utf-16be'));
    if (enc === 3) return clean(decode(body, 'utf-8'));
    return clean(decode(body, 'latin1'));
  }

  // Finds the end of a null-terminated string in the given encoding
  function strEnd(b, i, enc) {
    if (enc === 1 || enc === 2) {
      while (i + 1 < b.length && !(b[i] === 0 && b[i + 1] === 0)) i += 2;
      return i + 2;
    }
    while (i < b.length && b[i] !== 0) i++;
    return i + 1;
  }

  function id3Picture(data, v22) {
    const enc = data[0];
    let i = 1, mime;
    if (v22) { const f = ascii(data, 1, 3).toLowerCase(); mime = f === 'png' ? 'image/png' : 'image/jpeg'; i = 4; }
    else { const e = strEnd(data, 1, 0); mime = ascii(data, 1, e - 2) || 'image/jpeg'; i = e; }
    const type = data[i]; i++;
    i = strEnd(data, i, enc);
    if (!mime.includes('/')) mime = `image/${mime.toLowerCase() === 'png' ? 'png' : 'jpeg'}`;
    return { type, mime, data: data.slice(i) };
  }

  async function readMp3(file) {
    const tags = {};
    let audioStart = 0;
    const head = await readBytes(file, 0, 10);
    if (ascii(head, 0, 3) === 'ID3') {
      const ver = head[3], flags = head[5];
      const size = syncsafe(head, 6);
      audioStart = 10 + size + (flags & 0x10 ? 10 : 0);
      let b = await readBytes(file, 10, 10 + size);
      if (flags & 0x80 && ver < 4) b = deUnsync(b);
      let i = 0;
      if (flags & 0x40) i = ver === 4 ? syncsafe(b, 0) : u32(b, 0) + 4;
      const v22 = ver === 2;
      const idLen = v22 ? 3 : 4, hdr = v22 ? 6 : 10;
      const pics = [];
      while (i + hdr <= b.length) {
        const id = ascii(b, i, idLen);
        if (!/^[A-Z0-9]+$/.test(id)) break;
        const fsize = v22 ? u24(b, i + 3) : ver === 4 ? syncsafe(b, i + 4) : u32(b, i + 4);
        const fflags = v22 ? 0 : (b[i + 8] << 8) | b[i + 9];
        let data = b.subarray(i + hdr, i + hdr + fsize);
        i += hdr + fsize;
        if (fsize <= 0) continue;
        if (ver === 4) {
          if (fflags & 0x000C) continue;            // compressed / encrypted
          if (fflags & 0x0001) data = data.subarray(4);
          if (fflags & 0x0002) data = deUnsync(data);
        } else if (ver === 3 && fflags & 0x00C0) continue;
        try {
          switch (id) {
            case 'TIT2': case 'TT2': tags.title = id3Text(data); break;
            case 'TPE1': case 'TP1': tags.artist = id3Text(data); break;
            case 'TPE2': case 'TP2': tags.albumArtist = id3Text(data); break;
            case 'TALB': case 'TAL': tags.album = id3Text(data); break;
            case 'TRCK': case 'TRK': tags.track = firstNum(id3Text(data)); break;
            case 'TPOS': case 'TPA': tags.disc = firstNum(id3Text(data)); break;
            case 'TYER': case 'TYE': case 'TDRC': case 'TDOR': tags.year ||= yearOf(id3Text(data)); break;
            case 'TLEN': case 'TLE': { const ms = firstNum(id3Text(data)); if (ms) tags.duration ||= ms / 1000; break; }
            case 'APIC': case 'PIC': pics.push(id3Picture(data, v22)); break;
          }
        } catch { /* skip a broken frame */ }
      }
      const pic = pics.find(p => p.type === 3) || pics[0];
      if (pic?.data.length) tags.picture = pic;
    } else {
      // ID3v1 at the very end of the file
      const t = await readBytes(file, Math.max(0, file.size - 128), file.size);
      if (ascii(t, 0, 3) === 'TAG') {
        const s = (a, n) => decode(t.subarray(a, a + n), 'latin1').replace(/\u0000.*$/, '').trim();
        tags.title = s(3, 30); tags.artist = s(33, 30); tags.album = s(63, 30); tags.year = yearOf(s(93, 4));
        if (t[125] === 0 && t[126]) tags.track = t[126];
      }
    }
    if (!tags.duration) tags.duration = await mp3Duration(file, audioStart);
    return tags;
  }

  const MP3_BITRATES = {
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  };
  async function mp3Duration(file, start) {
    const b = await readBytes(file, start, start + 16384);
    let i = 0;
    while (i + 4 < b.length && !(b[i] === 0xFF && (b[i + 1] & 0xE6) === 0xE2)) i++; // sync + Layer III
    if (i + 4 >= b.length) return 0;
    const verBits = (b[i + 1] >> 3) & 3;               // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    if (verBits === 1) return 0;
    const mpeg1 = verBits === 3;
    const rate = [44100, 48000, 32000][(b[i + 2] >> 2) & 3] / (mpeg1 ? 1 : verBits === 2 ? 2 : 4);
    const kbps = MP3_BITRATES[mpeg1 ? 1 : 2][b[i + 2] >> 4];
    const mono = (b[i + 3] >> 6) === 3;
    const spf = mpeg1 ? 1152 : 576;
    if (!rate) return 0;

    const xingAt = i + 4 + (mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
    const tag = ascii(b, xingAt, 4);
    if ((tag === 'Xing' || tag === 'Info') && (u32(b, xingAt + 4) & 1)) return (u32(b, xingAt + 8) * spf) / rate;
    if (ascii(b, i + 36, 4) === 'VBRI') return (u32(b, i + 36 + 14) * spf) / rate;
    return kbps ? ((file.size - start - i) * 8) / (kbps * 1000) : 0;
  }

  // ---------- FLAC ----------
  async function readFlac(file) {
    const tags = {};
    let pos = 4, last = false;
    while (!last && pos + 4 <= file.size) {
      const h = await readBytes(file, pos, pos + 4);
      last = !!(h[0] & 0x80);
      const type = h[0] & 0x7F, len = u24(h, 1);
      pos += 4;
      if (type === 0) {
        const b = await readBytes(file, pos, pos + len);
        const rate = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4);
        const total = (b[13] & 0x0F) * 2 ** 32 + u32(b, 14);
        if (rate) tags.duration = total / rate;
      } else if (type === 4) {
        const b = await readBytes(file, pos, pos + len);
        let i = 4 + u32le(b, 0);
        const n = u32le(b, i); i += 4;
        for (let k = 0; k < n && i < b.length; k++) {
          const l = u32le(b, i); i += 4;
          const s = decode(b.subarray(i, i + l), 'utf-8'); i += l;
          const eq = s.indexOf('=');
          const key = s.slice(0, eq).toUpperCase(), val = s.slice(eq + 1).trim();
          if (key === 'TITLE') tags.title ||= val;
          else if (key === 'ARTIST') tags.artist ||= val;
          else if (key === 'ALBUMARTIST' || key === 'ALBUM ARTIST') tags.albumArtist ||= val;
          else if (key === 'ALBUM') tags.album ||= val;
          else if (key === 'TRACKNUMBER') tags.track ||= firstNum(val);
          else if (key === 'DISCNUMBER') tags.disc ||= firstNum(val);
          else if (key === 'DATE' || key === 'YEAR') tags.year ||= yearOf(val);
        }
      } else if (type === 6 && !tags.picture) {
        const b = await readBytes(file, pos, pos + len);
        const ptype = u32(b, 0);
        let i = 4;
        const ml = u32(b, i); i += 4;
        const mime = ascii(b, i, ml); i += ml;
        const dl = u32(b, i); i += 4 + dl + 16;
        const size = u32(b, i); i += 4;
        if (ptype === 3 || !tags.picture) tags.picture = { mime: mime || 'image/jpeg', data: b.slice(i, i + size) };
      }
      pos += len;
    }
    return tags;
  }

  // ---------- M4A / MP4 ----------
  function atoms(b, start, end) {
    const out = [];
    let i = start;
    while (i + 8 <= end) {
      let size = u32(b, i), hdr = 8;
      const type = ascii(b, i + 4, 4);
      if (size === 1) { size = u32(b, i + 8) * 2 ** 32 + u32(b, i + 12); hdr = 16; }
      else if (size === 0) size = end - i;
      if (size < hdr) break;
      out.push({ type, start: i + hdr, end: Math.min(i + size, end) });
      i += size;
    }
    return out;
  }
  const child = (b, a, type, skip = 0) => atoms(b, a.start + skip, a.end).find(x => x.type === type);

  async function readMp4(file) {
    const tags = {};
    // Find the moov box without reading the (possibly huge) audio data
    let pos = 0, moov = null;
    while (pos + 8 <= file.size) {
      const h = await readBytes(file, pos, pos + 16);
      let size = u32(h, 0);
      const type = ascii(h, 4, 4);
      if (size === 1) size = u32(h, 8) * 2 ** 32 + u32(h, 12);
      else if (size === 0) size = file.size - pos;
      if (size < 8) break;
      if (type === 'moov') { moov = { pos, size }; break; }
      pos += size;
    }
    if (!moov || moov.size > 64 * 1024 * 1024) return tags;
    const b = await readBytes(file, moov.pos, moov.pos + moov.size);
    const root = { start: 8, end: b.length };

    const mvhd = child(b, root, 'mvhd');
    if (mvhd) {
      const v = b[mvhd.start];
      const scale = v === 1 ? u32(b, mvhd.start + 20) : u32(b, mvhd.start + 12);
      const dur = v === 1 ? u32(b, mvhd.start + 24) * 2 ** 32 + u32(b, mvhd.start + 28) : u32(b, mvhd.start + 16);
      if (scale) tags.duration = dur / scale;
    }
    const udta = child(b, root, 'udta');
    const meta = udta && child(b, udta, 'meta');
    const ilst = meta && child(b, meta, 'ilst', 4);
    if (!ilst) return tags;
    for (const item of atoms(b, ilst.start, ilst.end)) {
      const data = child(b, item, 'data');
      if (!data) continue;
      const kind = u32(b, data.start) & 0xFFFFFF;
      const val = b.subarray(data.start + 8, data.end);
      const text = () => decode(val, 'utf-8').trim();
      switch (item.type) {
        case '©nam': tags.title = text(); break;
        case '©ART': tags.artist = text(); break;
        case 'aART': tags.albumArtist = text(); break;
        case '©alb': tags.album = text(); break;
        case '©day': tags.year = yearOf(text()); break;
        case 'trkn': tags.track = ((val[2] << 8) | val[3]) || null; break;
        case 'disk': tags.disc = ((val[2] << 8) | val[3]) || null; break;
        case 'covr': if (!tags.picture) tags.picture = { mime: kind === 14 ? 'image/png' : 'image/jpeg', data: val.slice() }; break;
      }
    }
    return tags;
  }

  // ---------- Fallbacks ----------
  // Used when a file has no tags: "Artist/Album/01 - Title.mp3" or "Artist - Title.mp3"
  function guessFromPath(rel) {
    const parts = rel.split('/');
    const base = stem(parts[parts.length - 1]);
    let artist = null;
    let title = base.replace(/^\d{1,3}[\s._-]+/, '').trim();
    const dash = title.split(' - ');
    if (dash.length >= 2) { artist = dash[0].trim(); title = dash.slice(1).join(' - ').trim(); }
    const album = parts.length >= 2 ? parts[parts.length - 2] : null;
    if (!artist && parts.length >= 3) artist = parts[parts.length - 3];
    return { title: title || base, artist, album };
  }

  // Asks the browser for the length when the file itself doesn't say
  function probeDuration(file) {
    return new Promise(resolve => {
      const a = new Audio();
      const url = URL.createObjectURL(file);
      const done = d => { URL.revokeObjectURL(url); a.removeAttribute('src'); resolve(isFinite(d) ? d : 0); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => done(a.duration);
      a.onerror = () => done(0);
      setTimeout(() => done(0), 8000);
      a.src = url;
    });
  }

  function hashId(s) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619);
      h2 = Math.imul(h2 ^ c, 2246822519);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  }

  // ---------- Scan ----------
  let artUrls = [];

  async function scan(source, onProgress = () => {}) {
    const found = source.kind === 'handle' ? await walkHandle(source.handle) : fromFileList(source.files);
    artUrls.forEach(u => URL.revokeObjectURL(u));
    artUrls = [];

    const coverUrls = new Map();
    const coverFor = async dir => {
      if (coverUrls.has(dir)) return coverUrls.get(dir);
      let url = null;
      const get = found.covers.get(dir);
      if (get) { try { url = URL.createObjectURL(await get()); artUrls.push(url); } catch { /* ignore */ } }
      coverUrls.set(dir, url);
      return url;
    };
    const artBySig = new Map(); // reuse identical images (same album art in several files)

    const tracks = [];
    const files = new Map();
    let done = 0;
    const work = found.audio.slice();

    async function worker() {
      while (work.length) {
        const item = work.shift();
        let file;
        try { file = await item.get(); } catch { done++; continue; }
        let tags = {};
        try {
          const e = ext(file.name);
          if (e === 'mp3') tags = await readMp3(file);
          else if (e === 'flac') tags = await readFlac(file);
          else if (e === 'm4a' || e === 'mp4' || e === 'aac') tags = await readMp4(file);
        } catch (err) {
          console.warn(`Couldn't read tags from ${item.path}:`, err);
        }
        const guess = guessFromPath(item.path);
        const artist = tags.artist || tags.albumArtist || guess.artist || 'Unknown artist';
        const t = {
          id: hashId(item.path),
          path: item.path,
          title: tags.title || guess.title,
          artist,
          albumArtist: tags.albumArtist || artist,
          album: tags.album || guess.album || 'Unknown album',
          track: tags.track ?? null,
          disc: tags.disc ?? null,
          year: tags.year ?? null,
          duration: tags.duration || 0,
          added: file.lastModified || 0,
          artUrl: null,
        };
        if (tags.picture?.data?.length) {
          const d = tags.picture.data;
          let h = 0x811c9dc5;
          for (let k = 0; k < d.length; k++) h = Math.imul(h ^ d[k], 16777619);
          const sig = `${d.length}:${h >>> 0}`;
          let url = artBySig.get(sig);
          if (!url) {
            url = URL.createObjectURL(new Blob([d], { type: tags.picture.mime }));
            artUrls.push(url);
            artBySig.set(sig, url);
          }
          t.artUrl = url;
        } else {
          const dir = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
          t.artUrl = (await coverFor(dir)) || null;
        }
        tracks.push(t);
        files.set(t.id, file);
        done++;
        onProgress(done, found.audio.length);
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    return { tracks, files };
  }

  return { scan, probeDuration, saveHandle, loadHandle, canPickFolder, storeAdd, storeFiles, storeRemove, storeClear, storeUsage };
})();
