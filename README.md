<p align="center">
  <img src="build/icon.png" width="96" alt="Clipy">
</p>

<h1 align="center">clipy</h1>

<p align="center"><b>Game clipping in black &amp; white.</b><br>
Runs in the background, remembers the last few seconds – one key press and the moment is saved.</p>

---

## Download

Grab the `.exe` from **[Releases](../../releases/latest)**:

| File | Description |
| --- | --- |
| `Clipy-Setup-x.y.z.exe` | Installer (Start menu + desktop shortcut) |
| `Clipy-Portable-x.y.z.exe` | Portable – just run it, no install |

> Windows SmartScreen may warn on first launch because the app is not code-signed → *More info* → *Run anyway*.

## Features

- **Replay buffer** – records continuously in the background and saves the last 15 s – 2 min on a hotkey
- **Global hotkey** (default `F8`) – works right in the middle of a game
- **Screenshots** at full resolution (default `F9`)
- **System audio + microphone** – separate volume levels, mixed into one clip
- **Automatic game detection** – clips are named after the game in the foreground
- **Hardware encoding** – automatically uses NVIDIA NVENC, AMD AMF or Intel Quick Sync (CPU fallback)
- **Library** – grouped by day, search, filters, favorites; thumbnails are monochrome and turn to color + play a preview on hover
- **Trim editor** – drag start/end (or press `I`/`O`) and save as a new clip
- **Drag & drop** – drag a clip card straight into Discord, WhatsApp Web, etc.
- **Overlay + sound cue** to confirm a save, even while in-game
- **Tray mode & autostart** – Clipy keeps running quietly
- Clips are saved as **MP4 (H.264/AAC)** to `Videos\Clipy` – plays everywhere

### New in 1.0.1

- **Discord integration** – connect a channel via webhook, send clips with one click, optional auto-post; clips over the upload limit (10 / 50 / 500 MB) are compressed automatically
- **Profile** – name + picture, optional **Sign in with Google**, stats (top games, 14-day activity, streak)
- **Share menu** – copy the file to the clipboard (paste into Discord/WhatsApp/Explorer), email via Gmail, export as **GIF**
- **Latest clip spotlight**, game filter, right-click menu, quick actions on hover
- Player: speed control, frame-by-frame (`,` `.`), next/previous clip (`↑` `↓`)
- **Storage limit** – oldest non-favorite clips go to the Recycle Bin automatically
- **Welcome tour** and **update notifications** from GitHub Releases

### Google sign-in setup

Google sign-in needs a free OAuth client ID (one time, ~5 min):

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → create a project
2. *OAuth consent screen* → External → add yourself as test user
3. *Credentials → Create credentials → OAuth client ID* → **Desktop app**
4. In Clipy: *Profile → Sign in with Google* → paste client ID + secret

## Player shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` `→` | Back / forward 5 s (with `Shift`: 1 s) |
| `,` `.` | Previous / next frame |
| `↑` `↓` | Previous / next clip |
| `S` | Playback speed |
| `Ctrl+C` | Copy file |
| `I` / `O` | Set selection start / end |
| `F` | Fullscreen |
| `M` | Mute |
| `Esc` | Close |

## Tips

- Games in **borderless windowed** mode are captured most reliably.
- At high resolution + 60 FPS a GPU with a hardware encoder helps a lot.

## Build it yourself

```bash
npm install
npm start          # run in dev mode
npm run dist       # build installer + portable exe into ./dist
```

Built with Electron and FFmpeg.

## License

MIT
