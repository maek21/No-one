# No-one.
<img width="1080" height="270" alt="Frame 8" src="https://github.com/user-attachments/assets/85f69d7e-6363-4c3f-94ca-2097ddc70d4c" />
> Music is the only designer.

A desktop music player where the interface is transformed by your music.

## Features

- Import your local music library with drag & drop
- Dynamic glass UI that responds to the currently playing track
- Audio analysis & real-time visualizations
- Metadata enrichment pipeline (MusicBrainz, Discogs, Last.fm)
- Waveform audio player with crossfade
- Queue management, playlists, and lyrics view
- **Yandex Music mode** — switch from your offline library to streaming (search, charts, your likes & playlists)

## Yandex Music mode

Use the **Local / Yandex** toggle in the tab bar. In Yandex mode every screen is backed by Yandex Music:
Home (charts, new releases, made-for-you), Search (tracks / albums / artists / playlists), and your Collection
(likes, playlists, albums, artists). Streaming, covers, lyrics and the cover-driven palette all work like local tracks,
and tracks can be dragged onto the island or queued as usual.

Sign in from the Yandex screen or **Settings → Yandex Music** ("Sign in with Yandex" shows a code to confirm in the browser;
you can also paste an OAuth token). The token is stored in the local database and used only against Yandex.
Playback quality depends on your Yandex Plus subscription, and the service is only reachable from supported regions.

Built on the unofficial [`yandex-music`](https://github.com/MarshalX/yandex-music-api) client — not affiliated with Yandex.

## Download

Pre-built installers are available on the [Releases](https://github.com/anomalyco/no-one/releases) page.

| Platform | Format |
|----------|--------|
| Windows | `.exe` (NSIS installer) |
| macOS   | `.dmg` |
| Linux   | `.AppImage`, `.deb` |

## Building from source

### Prerequisites

- **Node.js** v20+
- **Python** 3.12+
- **pip** dependencies: `pip install -r backend/requirements.txt`

### Setup

```bash
# Install Node dependencies
npm install
cd frontend && npm install && cd ..

# Install Python dependencies
pip install -r backend/requirements.txt
```

### Development

```bash
npm run dev
# Or separately:
npm run dev:backend   # Python FastAPI server (port 8000)
npm run dev:frontend  # Vite dev server (port 5174)
npm run dev:electron  # Full stack with Electron window
```

### Production build

```bash
# Build frontend + backend bundle
npm run build

# Package platform-specific installer
npm run dist:win     # Windows (.exe)
npm run dist:mac     # macOS (.dmg)
npm run dist:linux   # Linux (.AppImage / .deb)
```

The installers will be in the `release/` directory.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + WebGPU (OGL)
- **Backend**: Python 3.12+ / FastAPI
- **Database**: SQLite (via SQLAlchemy async)
- **Desktop**: Electron (with standalone PyInstaller backend)

<img width="128" height="128" alt="icon" src="https://github.com/user-attachments/assets/e57b14ac-399e-4ea7-bbfb-237c2c85b166" />
