import { useCallback, useEffect, useRef, useState } from 'react'
import { yandexApi, ymErrorMessage } from '../../api/yandex'
import type { YmSearchResult } from '../../types/yandex'
import {
  AlbumCard, ArtistCard, LoadMore, Notice, PlaylistCard, Section, Segmented, TrackList, useYandexPlayer,
} from './parts'
import type { OpenDetail } from './parts'

type Kind = 'all' | 'track' | 'album' | 'artist' | 'playlist'
const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'track', label: 'Tracks' },
  { id: 'album', label: 'Albums' },
  { id: 'artist', label: 'Artists' },
  { id: 'playlist', label: 'Playlists' },
]

const KEY: Record<Exclude<Kind, 'all'>, 'tracks' | 'albums' | 'artists' | 'playlists'> = {
  track: 'tracks', album: 'albums', artist: 'artists', playlist: 'playlists',
}

export function YandexSearch({ onOpen }: { onOpen: OpenDetail }) {
  const play = useYandexPlayer()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [result, setResult] = useState<YmSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [moreLoading, setMoreLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const reqId = useRef(0)

  // Debounced search-as-you-type
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 400)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    const id = ++reqId.current
    if (!query) { setResult(null); setError(null); setLoading(false); return }
    setLoading(true)
    setError(null)
    yandexApi.search(query, kind, 0)
      .then((r) => { if (id === reqId.current) setResult(r) })
      .catch((e) => { if (id === reqId.current) setError(ymErrorMessage(e)) })
      .finally(() => { if (id === reqId.current) setLoading(false) })
  }, [query, kind])

  // Suggestions follow the raw input, a bit faster than the search itself
  useEffect(() => {
    const q = text.trim()
    if (q.length < 2) { setSuggestions([]); return }
    let stale = false
    const t = setTimeout(() => {
      yandexApi.suggest(q).then((s) => { if (!stale) setSuggestions(s.slice(0, 6)) }).catch(() => {})
    }, 200)
    return () => { stale = true; clearTimeout(t) }
  }, [text])

  const loadMore = useCallback(async () => {
    if (!result || kind === 'all') return
    setMoreLoading(true)
    try {
      const next = await yandexApi.search(query, kind, result.page + 1)
      const key = KEY[kind]
      setResult({ ...result, page: next.page, [key]: { ...next[key], items: [...result[key].items, ...next[key].items] } })
    } catch (e) {
      setError(ymErrorMessage(e))
    }
    setMoreLoading(false)
  }, [result, kind, query])

  const pick = (s: string) => { setText(s); setQuery(s); setSuggestions([]) }

  const tracks = result?.tracks.items ?? []
  const nothing = result && !tracks.length && !result.albums.items.length && !result.artists.items.length && !result.playlists.items.length
  const hasMore = (k: Exclude<Kind, 'all'>) => !!result && result[KEY[k]].items.length < result[KEY[k]].total

  return (
    <div className="library-scroll">
      <div className="ym-searchbar">
        <input
          autoFocus
          value={text}
          placeholder="Search tracks, albums, artists, playlists"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') pick(text.trim()) }}
        />
        {suggestions.length > 0 && text.trim() !== query && (
          <div className="ym-suggest">
            {suggestions.map((s) => <div key={s} onMouseDown={() => pick(s)}>{s}</div>)}
          </div>
        )}
      </div>
      <Segmented value={kind} options={KINDS} onChange={setKind} />

      {!query && <Notice>Search Yandex Music — everything you find streams right here.</Notice>}
      {error && <Notice>{error}</Notice>}
      {loading && !result && <Notice>Searching…</Notice>}
      {result?.corrected && <Notice>Showing results for “{result.corrected}”</Notice>}
      {nothing && !loading && <Notice>Nothing found for “{query}”.</Notice>}

      {result && kind === 'all' && (
        <>
          {tracks.length > 0 && (
            <Section title="Tracks" count={result.tracks.total}>
              <TrackList tracks={tracks} onPlay={(i) => play(tracks, i)} />
            </Section>
          )}
          {result.albums.items.length > 0 && (
            <Section title="Albums">
              <div className="library-grid">{result.albums.items.map((a) => <AlbumCard key={a.id} album={a} onOpen={onOpen} />)}</div>
            </Section>
          )}
          {result.artists.items.length > 0 && (
            <Section title="Artists">
              <div className="artists-grid">{result.artists.items.map((a) => <ArtistCard key={a.id} artist={a} onOpen={onOpen} />)}</div>
            </Section>
          )}
          {result.playlists.items.length > 0 && (
            <Section title="Playlists">
              <div className="library-grid">{result.playlists.items.map((p) => <PlaylistCard key={p.id} playlist={p} onOpen={onOpen} />)}</div>
            </Section>
          )}
        </>
      )}

      {result && kind === 'track' && tracks.length > 0 && (
        <Section title="Tracks" count={result.tracks.total}>
          <TrackList tracks={tracks} onPlay={(i) => play(tracks, i)} />
          {hasMore('track') && <LoadMore onClick={loadMore} loading={moreLoading} />}
        </Section>
      )}
      {result && kind === 'album' && result.albums.items.length > 0 && (
        <Section title="Albums" count={result.albums.total}>
          <div className="library-grid">{result.albums.items.map((a) => <AlbumCard key={a.id} album={a} onOpen={onOpen} />)}</div>
          {hasMore('album') && <LoadMore onClick={loadMore} loading={moreLoading} />}
        </Section>
      )}
      {result && kind === 'artist' && result.artists.items.length > 0 && (
        <Section title="Artists" count={result.artists.total}>
          <div className="artists-grid">{result.artists.items.map((a) => <ArtistCard key={a.id} artist={a} onOpen={onOpen} />)}</div>
          {hasMore('artist') && <LoadMore onClick={loadMore} loading={moreLoading} />}
        </Section>
      )}
      {result && kind === 'playlist' && result.playlists.items.length > 0 && (
        <Section title="Playlists" count={result.playlists.total}>
          <div className="library-grid">{result.playlists.items.map((p) => <PlaylistCard key={p.id} playlist={p} onOpen={onOpen} />)}</div>
          {hasMore('playlist') && <LoadMore onClick={loadMore} loading={moreLoading} />}
        </Section>
      )}
    </div>
  )
}
