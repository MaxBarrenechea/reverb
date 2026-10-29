# Reverb — your own Spotify-style music player

Reverb runs entirely in your browser. There's no server and nothing to install: it reads your `music` folder directly, pulls out each song's title, artist, album and cover art, and plays everything locally. Nothing is uploaded anywhere.

You get Songs, Albums, Artists, Liked songs, playlists, mood playlists, a playlist for every artist, a queue, shuffle and repeat, and it remembers the song you were on.

## Folder layout

```
Reverb/
├── index.html        ← the player
├── app.js, library.js, match.js, style.css
├── sw.js, manifest.webmanifest, icons/   ← iPad home screen + offline support
├── spotify-data.js   ← your Spotify songs, albums, play counts and moods
├── ytdlp_batch.txt   ← your song list for yt-dlp
├── music/            ← your songs go here
└── .vscode/launch.json
```

## Use it on iPad

1. Open the Reverb link (your GitHub Pages address) in Chrome or Safari on the iPad.
2. Tap **Share** then **Add to Home Screen**. Reverb gets its own icon and opens full screen.
3. Copy your songs to the iPad (AirDrop the `music` folder from your Mac, or put it in iCloud Drive).
4. In Reverb, tap **Import songs**, open the music folder, tap **Select**, then **Select All**.

Reverb saves a copy of each song, so they play offline from then on. To add new songs later, copy them over and tap **Import songs** again. Songs you already imported are skipped. To delete one, tap **⋯** next to it and choose **Remove from Reverb**.

Likes and playlists don't sync between devices. Use **Back up** on one and **Restore** on the other.

## Run it from VS Code (Mac)

1. Open the **Reverb** folder in VS Code (File > Open Folder…).
2. Press **F5** and pick "Open Reverb in Chrome". (You need Google Chrome installed.)
3. Click **Choose music folder** and select the `music` folder inside Reverb.

Chrome remembers the folder. Next time it opens with one click ("Open my music").

You can also just double-click `index.html`. In Chrome or Edge everything works the same. Safari and Firefox work too, but they ask you to pick the folder every time.

## Getting your songs with yt-dlp

Install the tools once (needs Homebrew from https://brew.sh):

```
brew install yt-dlp ffmpeg
```

Then in the VS Code terminal, inside the Reverb folder:

```
yt-dlp -a ytdlp_batch.txt -x --audio-format mp3 --audio-quality 0 --embed-metadata --embed-thumbnail --no-playlist --match-filter "duration < 900" --download-archive downloaded.txt --ignore-errors -o "music/%(title)s.%(ext)s"
```

When it finishes (or partway through), click **Rescan music folder** in Reverb.

## Adding more music

Drop files into `music` and click **Rescan music folder**. Subfolders are fine, like `music/Artist/Album/01 - Song.mp3`.

Supported: MP3, M4A/AAC, FLAC, WAV, OGG, OPUS. Songs without tags still work: a file named `Artist - Title.mp3` is read that way, and the folder name becomes the album. If a song has no embedded cover, a `cover.jpg` or `folder.jpg` next to it is used.

## Song names, artists and moods

YouTube downloads usually have the channel as the artist ("TheStrokesVEVO") and extra words in the title ("Selfless (Official Audio)"). Reverb matches each file to the song in your Spotify list (`spotify-data.js`) and shows Spotify's title, artist and album instead. Nothing in your files is changed.

Each song is tagged with one or two moods: **Upbeat, Energy, Chill, Sad, Late Night, Dance**. Use the mood buttons above the Songs list, or open a mood from the sidebar to play it as a playlist (most played first). Every artist also has their own playlist in the sidebar.

**Fixing a song:** right-click it and choose **Edit song info** to change its title, artist, album or moods. **Use automatic info** undoes your changes. Songs that didn't match anything show up under the **Needs info** button on the Songs page.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Back / forward 5 seconds |
| Shift + ← / → | Previous / next song |
| S | Shuffle on/off |
| R | Repeat: off, all, this song |
| Q | Show the queue |
| L | Like the current song |
| M | Mute |
| / | Search |

Right-click any song for Play next, Add to queue, Add to playlist and more. Media keys work too.

## Where your likes, playlists and edits are saved

In the browser you open Reverb with. Clearing that browser's site data, or switching browsers, starts you fresh. Use **Back up** at the bottom of the sidebar to save them to a file, and **Restore** to bring them back.

Note: Chrome opened from VS Code (F5) and Chrome opened by double-clicking `index.html` keep separate data. Pick one way and stick with it, or move your playlists over with Back up / Restore.
