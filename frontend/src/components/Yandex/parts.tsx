import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useAppStore } from '../../store'
import { api } from '../../api'
import { yandexApi } from '../../api/yandex'
import { audioPlayer } from '../../services/AudioPlayer'
import type { YmAlbum, YmArtist, YmDetail, YmPlaylist, YmTrack } from '../../types/yandex'
import './Yandex.css'

export type OpenDetail = (detail: YmDetail) => void

export function fmtDur(s: number | null | undefined): string {
  if (!s || !isFinite(s)) return ''
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/** Starts playback of a list of Yandex tracks, mirroring what Library does for local ones. */
export function useYandexPlayer() {
  const setQueue = useAppStore((s) => s.setQueue)
  const setPalette = useAppStore((s) => s.setPalette)
  const setIslandState = useAppStore((s) => s.setIslandState)
  const setCurrentTime = useAppStore((s) => s.setCurrentTime)
  const setDuration = useAppStore((s) => s.setDuration)
  const setIsPlaying = useAppStore((s) => s.setIsPlaying)

  return useCallback(async (tracks: YmTrack[], startIndex = 0) => {
    // Unavailable tracks (removed / region-locked) can't be streamed — drop them and re-map the start index
    const picked = tracks[startIndex]
    const playable = tracks.filter((t) => t.available)
    if (playable.length === 0) return
    const start = Math.max(0, picked ? playable.findIndex((t) => t.id === picked.id) : 0)

    setQueue(
      playable.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        duration: t.duration,
        artwork: t.artwork,
        palette: null, // resolved from the cover by App's palette effect
        source: 'yandex',
      })),
      start,
    )
    setPalette(null)
    setIslandState('playing')
    setCurrentTime(0)
    setDuration(playable[start].duration)
    const ok = await audioPlayer.play(api.getStreamUrl(playable[start].id))
    setIsPlaying(ok)
  }, [setQueue, setPalette, setIslandState, setCurrentTime, setDuration, setIsPlaying])
}

export function Heart({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

interface TrackRowProps {
  track: YmTrack
  index: number
  onPlay: () => void
  showCover?: boolean
  rank?: number
}

export function TrackRow({ track, index, onPlay, showCover = true, rank }: TrackRowProps) {
  const [liked, setLiked] = useState(track.liked)
  const nowPlayingId = useAppStore((s) => s.nowPlaying?.id)
  const isCurrent = nowPlayingId === track.id

  const toggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !liked
    setLiked(next) // optimistic
    try {
      await yandexApi.setLiked(track.id, next)
    } catch {
      setLiked(!next)
    }
  }

  const onDragStart = (e: React.DragEvent) => {
    // Same payload shape Library uses, so dropping onto the island starts playback
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'track',
      tracks: [{
        id: track.id, title: track.title, artist: track.artist,
        duration: track.duration, artwork: track.artwork, source: 'yandex',
      }],
      startIndex: 0,
      artwork: track.artwork,
      palette: null,
    }))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className={`ym-track${track.available ? '' : ' unavailable'}${isCurrent ? ' current' : ''}`}
      draggable={track.available}
      onDragStart={onDragStart}
      onClick={() => track.available && onPlay()}
    >
      <span className="ym-track-index">{rank ?? index + 1}</span>
      {showCover && (
        <div className="ym-track-cover">
          {track.artwork && <img src={track.artwork} alt="" loading="lazy" />}
        </div>
      )}
      <div className="track-meta">
        <div className="track-title">
          {track.title}
          {track.explicit && <span className="ym-explicit">E</span>}
        </div>
        <div className="track-artist">{track.artist}{track.album && showCover ? ` · ${track.album}` : ''}</div>
      </div>
      <button className={`ym-like${liked ? ' on' : ''}`} onClick={toggleLike} title={liked ? 'Unlike' : 'Like'}>
        <Heart filled={liked} />
      </button>
      <span className="track-duration">{fmtDur(track.duration)}</span>
    </div>
  )
}

export function TrackList({ tracks, onPlay, showCover = true, ranked = false }: {
  tracks: YmTrack[]
  onPlay: (index: number) => void
  showCover?: boolean
  ranked?: boolean
}) {
  return (
    <div className="ym-tracklist">
      {tracks.map((t, i) => (
        <TrackRow key={`${t.id}-${i}`} track={t} index={i} showCover={showCover} rank={ranked ? i + 1 : undefined} onPlay={() => onPlay(i)} />
      ))}
    </div>
  )
}

function CardArt({ src, round }: { src: string | null; round?: boolean }) {
  return (
    <div className={round ? 'artist-card-avatar' : 'album-art'}>
      {src ? <img src={src} alt="" loading="lazy" /> : <div className="album-art-placeholder" />}
    </div>
  )
}

export function AlbumCard({ album, onOpen }: { album: YmAlbum; onOpen: OpenDetail }) {
  return (
    <div className="album-card ym-card" onClick={() => onOpen({ type: 'album', id: album.id })}>
      <div className="album-card-inner" style={{ flexDirection: 'column', gap: 8 }}>
        <CardArt src={album.artwork} />
        <div className="album-info">
          <div className="album-title">{album.title}</div>
          <div className="album-artist">{[album.year, album.artist].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    </div>
  )
}

export function PlaylistCard({ playlist, onOpen }: { playlist: YmPlaylist; onOpen: OpenDetail }) {
  return (
    <div className="album-card ym-card" onClick={() => onOpen({ type: 'playlist', id: playlist.id })}>
      <div className="album-card-inner" style={{ flexDirection: 'column', gap: 8 }}>
        <CardArt src={playlist.artwork} />
        <div className="album-info">
          <div className="album-title">{playlist.title}</div>
          <div className="album-artist">{playlist.owner ? `${playlist.owner} · ` : ''}{playlist.track_count} tracks</div>
        </div>
      </div>
    </div>
  )
}

export function ArtistCard({ artist, onOpen }: { artist: YmArtist; onOpen: OpenDetail }) {
  return (
    <div className="artist-card" onClick={() => onOpen({ type: 'artist', id: artist.id })}>
      <div className="artist-card-avatar">
        {artist.artwork
          ? <img src={artist.artwork} alt={artist.name} loading="lazy" />
          : <div className="artist-card-initials">{artist.name.charAt(0).toUpperCase()}</div>}
      </div>
      <div className="artist-card-info">
        <div className="artist-card-name">{artist.name}</div>
        {artist.genres?.length > 0 && <div className="artist-card-meta">{artist.genres[0]}</div>}
      </div>
    </div>
  )
}

export function Section({ title, count, children, action }: {
  title: string
  count?: number
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="ym-section">
      <div className="library-header">
        <h2 className="library-title">{title}</h2>
        {count !== undefined && <span className="library-count">{count}</span>}
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      {children}
    </section>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="library-view-toggle">
      {options.map((o) => (
        <button key={o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="ym-notice">{children}</div>
}

/** Loading / error / content wrapper shared by every Yandex view */
export function Async({ loading, error, children }: { loading: boolean; error: string | null; children: ReactNode }) {
  if (error) return <Notice>{error}</Notice>
  if (loading) return <Notice>Loading…</Notice>
  return <>{children}</>
}

export function PlayButton({ onClick, label = 'Play' }: { onClick: () => void; label?: string }) {
  return (
    <button className="ym-btn primary" onClick={onClick}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      {label}
    </button>
  )
}

export function LoadMore({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 14 }}>
      <button className="ym-btn" onClick={onClick} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</button>
    </div>
  )
}
