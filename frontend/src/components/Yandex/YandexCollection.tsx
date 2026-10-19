import { useCallback, useEffect, useState } from 'react'
import { yandexApi, ymErrorMessage } from '../../api/yandex'
import type { YmTrack } from '../../types/yandex'
import { useAsync } from './useAsync'
import {
  AlbumCard, ArtistCard, Async, LoadMore, Notice, PlayButton, PlaylistCard, Section, Segmented, TrackList, useYandexPlayer,
} from './parts'
import type { OpenDetail } from './parts'

type Tab = 'tracks' | 'playlists' | 'albums' | 'artists'
const TABS: { id: Tab; label: string }[] = [
  { id: 'tracks', label: 'Liked' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'albums', label: 'Albums' },
  { id: 'artists', label: 'Artists' },
]
const PAGE = 100

function LikedTracks() {
  const play = useYandexPlayer()
  const [tracks, setTracks] = useState<YmTrack[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    yandexApi.likedTracks(0, PAGE)
      .then((r) => { if (!stale) { setTracks(r.tracks); setTotal(r.total) } })
      .catch((e) => { if (!stale) setError(ymErrorMessage(e)) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [])

  const more = useCallback(async () => {
    setMoreLoading(true)
    try {
      const r = await yandexApi.likedTracks(tracks.length, PAGE)
      setTracks((prev) => [...prev, ...r.tracks])
      setTotal(r.total)
    } catch (e) {
      setError(ymErrorMessage(e))
    }
    setMoreLoading(false)
  }, [tracks.length])

  return (
    <Async loading={loading} error={error}>
      {tracks.length === 0
        ? <Notice>No liked tracks yet — hit the heart on any track.</Notice>
        : (
          <Section title="Liked tracks" count={total} action={<PlayButton onClick={() => play(tracks, 0)} />}>
            <TrackList tracks={tracks} onPlay={(i) => play(tracks, i)} />
            {tracks.length < total && <LoadMore onClick={more} loading={moreLoading} />}
          </Section>
        )}
    </Async>
  )
}

export function YandexCollection({ onOpen }: { onOpen: OpenDetail }) {
  const [tab, setTab] = useState<Tab>('tracks')
  const playlists = useAsync(() => (tab === 'playlists' ? yandexApi.playlists() : Promise.resolve(null)), [tab])
  const albums = useAsync(() => (tab === 'albums' ? yandexApi.likedAlbums() : Promise.resolve(null)), [tab])
  const artists = useAsync(() => (tab === 'artists' ? yandexApi.likedArtists() : Promise.resolve(null)), [tab])

  return (
    <div className="library-scroll">
      <Segmented value={tab} options={TABS} onChange={setTab} />

      {tab === 'tracks' && <LikedTracks />}

      {tab === 'playlists' && (
        <Async loading={playlists.loading} error={playlists.error}>
          {playlists.data && (playlists.data.length === 0
            ? <Notice>No playlists.</Notice>
            : <div className="library-grid">{playlists.data.map((p) => <PlaylistCard key={p.id} playlist={p} onOpen={onOpen} />)}</div>)}
        </Async>
      )}
      {tab === 'albums' && (
        <Async loading={albums.loading} error={albums.error}>
          {albums.data && (albums.data.length === 0
            ? <Notice>No liked albums.</Notice>
            : <div className="library-grid">{albums.data.map((a) => <AlbumCard key={a.id} album={a} onOpen={onOpen} />)}</div>)}
        </Async>
      )}
      {tab === 'artists' && (
        <Async loading={artists.loading} error={artists.error}>
          {artists.data && (artists.data.length === 0
            ? <Notice>No liked artists.</Notice>
            : <div className="artists-grid">{artists.data.map((a) => <ArtistCard key={a.id} artist={a} onOpen={onOpen} />)}</div>)}
        </Async>
      )}
    </div>
  )
}
