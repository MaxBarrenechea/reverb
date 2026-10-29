// Reverb — matches downloaded files to your Spotify songs.
// YouTube downloads often have the channel as the artist ("TheStrokesVEVO") and extra words in
// the title ("Selfless (Official Audio)"). This finds the Spotify song each file really is and
// uses Spotify's title, artist, album and mood tags instead.

const Matcher = (() => {
  const STOP = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'in', 'on', 'my', 'me', 'i', 'you', 'is', 'it']);
  // Words that mark a different version of a song
  const VARIANT = new Set(['live', 'acoustic', 'remix', 'demo', 'cover', 'instrumental', 'karaoke', 'slowed', 'sped', 'nightcore', 'reverb', 'unplugged', 'session']);
  // Words in Spotify titles that say nothing about which recording it is
  const NOISE = new Set(['remaster', 'remastered', 'version', 'edit', 'single', 'album', 'digital', 'master', 'mix', 'feat', 'ft', 'with', 'from', 'side', 'b', 'short', 'no', 'intro', 'studio', 'recording', 'original', 'motion', 'picture', 'soundtrack', 'expanded', 'edition', 'performance']);

  // Extra words YouTube titles add that aren't part of the song name
  const FILLER = new Set(['official', 'video', 'audio', 'music', 'lyric', 'lyrics', 'hd', 'hq', '4k', 'remaster', 'remastered',
    'visualizer', 'version', 'full', 'song', 'mv', 'original', 'explicit', 'clean', 'from', 'with', 'feat', 'ft', 'and', 'by', 'the', 'single', 'album']);

  const norm = s => String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const tokens = s => norm(s).split(' ').filter(Boolean);
  const squash = s => norm(s).replace(/ /g, '');

  // "Starman - 2012 Remaster" -> core "Starman"; "Creep - Acoustic" -> core "Creep", extras ["acoustic"]
  function splitTitle(title) {
    let core = title, extra = '';
    const dash = core.match(/^(.*?)\s+-\s+(.*)$/);
    if (dash) { core = dash[1]; extra += ' ' + dash[2]; }
    core = core.replace(/[([](.*?)[)\]]/g, (_, inner) => { extra += ' ' + inner; return ' '; });
    const extras = tokens(extra).filter(w => !NOISE.has(w) && !/^\d{4}$/.test(w));
    return { core: core.trim() || title, extras };
  }

  // What Spotify shows, minus remaster labels: "Starman - 2012 Remaster" -> "Starman"
  function displayTitle(title) {
    return title
      .replace(/\s+-\s+(\d{4}\s+)?(digital\s+)?(remaster(ed)?|master(ed)?)(\s+\d{4})?$/i, '')
      .replace(/\s+-\s+(single|album|radio)\s+version$/i, '')
      .trim();
  }

  function frac(want, have, haveSquashed) {
    const meaningful = want.filter(w => !STOP.has(w));
    const list = meaningful.length >= 2 ? meaningful : want;
    if (!list.length) return 0;
    let hit = 0;
    for (const w of list) if (have.has(w)) hit++;
    let f = hit / list.length;
    const sq = list.join('');
    if (sq.length >= 4 && haveSquashed.includes(sq)) f = Math.max(f, 1);
    return f;
  }

  function prepareSong(s, i) {
    const { core, extras } = splitTitle(s.t);
    const coreTokens = tokens(core);
    return {
      i, s,
      coreTokens,
      coreNorm: ` ${coreTokens.join(' ')} `,
      artistTokens: tokens(s.a),
      extras,
    };
  }

  function prepareTrack(t) {
    const fileStem = (t.path.split('/').pop() || '').replace(/\.[^.]+$/, '');
    const text = [t.title, t.artist, t.album, fileStem].join(' ');
    const list = tokens(text);
    return { t, set: new Set(list), joined: ` ${list.join(' ')} `, squashed: squash(text) };
  }

  function score(song, cand) {
    const titleF = frac(song.coreTokens, cand.set, cand.squashed);
    const n = song.coreTokens.length;
    if (titleF < (n >= 4 ? 0.75 : 1)) return 0;
    const artistF = frac(song.artistTokens, cand.set, cand.squashed);
    const phrase = cand.joined.includes(song.coreNorm);
    // Short titles ("Kids", "Disco") need the artist too, or they'd match anything
    if (artistF < 0.5 && (n <= 2 || !phrase)) return 0;
    let sc = titleF + artistF * 0.6 + (phrase ? 0.3 : 0);
    for (const w of song.extras) sc += cand.set.has(w) ? 0.15 : -0.05;   // prefer the plain version when the file doesn't say which
    for (const w of cand.set) if (VARIANT.has(w) && !song.extras.includes(w)) sc -= 0.25;
    return sc;
  }

  function useSong(t, s) {
    t.yt = { title: t.title, artist: t.artist };
    t.title = displayTitle(s.t);
    t.artist = s.a;
    t.albumArtist = s.a;
    t.album = s.al;
    t.year = null;     // YouTube's date is the upload date, not the release year
    t.track = null;
    t.plays = s.p || 0;
    t.moods = (s.m || []).slice();
    t.matched = true;
  }

  // Changes the tracks in place. Returns how many were matched.
  function apply(tracks, spotify = window.REVERB_SPOTIFY || []) {
    const songs = spotify.map(prepareSong);
    const cands = tracks.map(prepareTrack);
    const pairs = [];
    cands.forEach((c, ci) => {
      for (const song of songs) {
        const sc = score(song, c);
        if (sc >= 1.2) pairs.push([sc, ci, song.i]);
      }
    });
    // Best matches first, each file and each Spotify song used once
    pairs.sort((x, y) => y[0] - x[0]);
    const usedT = new Set(), usedS = new Set();
    let matched = 0;
    for (const [, ci, si] of pairs) {
      if (usedT.has(ci) || usedS.has(si)) continue;
      usedT.add(ci); usedS.add(si);
      useSong(tracks[ci], spotify[si]);
      matched++;
    }
    // Second pass: the file has no artist anywhere, but its title is exactly a song's title
    // plus filler like "(Official Video)". Only used when exactly one unmatched song fits.
    tracks.forEach((t, ci) => {
      if (usedT.has(ci)) return;
      const words = tokens(t.title);
      const fits = songs.filter(song => {
        if (usedS.has(song.i) || !song.coreTokens.length) return false;
        const core = song.coreTokens.join(' ');
        const joined = ` ${words.join(' ')} `;
        if (!joined.includes(` ${core} `)) return false;
        const rest = joined.replace(` ${core} `, ' ').trim().split(' ').filter(Boolean);
        return rest.every(w => FILLER.has(w) || song.extras.includes(w) || song.artistTokens.includes(w) || /^\d{4}$/.test(w));
      });
      if (fits.length !== 1) return;
      const others = tracks.some((u, cj) => cj !== ci && !usedT.has(cj) && ` ${tokens(u.title).join(' ')} `.includes(` ${fits[0].coreTokens.join(' ')} `));
      if (others) return;   // two files could be this song; leave both for you to fix
      usedT.add(ci); usedS.add(fits[0].i);
      useSong(t, spotify[fits[0].i]);
      matched++;
    });

    for (const t of tracks) if (!t.matched) { t.moods ||= []; t.plays ||= 0; }
    return matched;
  }

  return { apply, displayTitle };
})();
