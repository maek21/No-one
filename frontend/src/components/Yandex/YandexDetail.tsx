import { yandexApi } from '../../api/yandex'
import type { YmDetail } from '../../types/yandex'
import { useAsync } from './useAsync'
import { AlbumCard, ArtistCard, Async, PlayButton, Section, TrackList, useYandexPlayer } from './parts'
import type { OpenDetail } from './parts'

function Header({ art, round, title, lines, onBack, onPlay, children }: {
  art: string | null
  round?: boolean
  title: string
  lines: (string | null | undefined)[]
  onBack: () => void
  onPlay?: () => void
  children?: React.ReactNode
}) {
  return (
    <>
      <button className="ym-back" onClick={onBack}>← Back</button>
      <div className="ym-hero">
        <div className={`ym-hero-art${round ? ' round' : ''}`}>{art && <img src={art} alt="" />}</div>
        <div className="ym-hero-info">
          <h1>{title}</h1>
          {lines.filter(Boolean).map((l, i) => <div key={i} className="ym-hero-line">{l}</div>)}
          {onPlay && <div style={{ marginTop: 14 }}><PlayButton onClick={onPlay} /></div>}
        </div>
      </div>
      {children}
    </>
  )
}

function AlbumDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const play = useYandexPlayer()
  const { data, loading, error } = useAsync(() => yandexApi.getAlbum(id), [id])
  return (
    <Async loading={loading} error={error}>
      {data && (
        <Header
          art={data.artwork} title={data.title} onBack={onBack}
          lines={[data.artist, [data.year, data.genre, `${data.tracks.length} tracks`].filter(Boolean).join(' · ')]}
          onPlay={() => play(data.tracks, 0)}
        >
          <TrackList tracks={data.tracks} showCover={false} onPlay={(i) => play(data.tracks, i)} />
        </Header>
      )}
    </Async>
  )
}

function PlaylistDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const play = useYandexPlayer()
  const { data, loading, error } = useAsync(() => yandexApi.getPlaylist(id), [id])
  return (
    <Async loading={loading} error={error}>
      {data && (
        <Header
          art={data.artwork} title={data.title} onBack={onBack}
          lines={[data.owner, data.description, `${data.tracks.length} tracks`]}
          onPlay={() => play(data.tracks, 0)}
        >
          <TrackList tracks={data.tracks} onPlay={(i) => play(data.tracks, i)} />
        </Header>
      )}
    </Async>
  )
}

function ArtistDetail({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: OpenDetail }) {
  const play = useYandexPlayer()
  const { data, loading, error } = useAsync(() => yandexApi.getArtist(id), [id])
  return (
    <Async loading={loading} error={error}>
      {data && (
        <Header
          art={data.artist.artwork} round title={data.artist.name} onBack={onBack}
          lines={[data.artist.genres.join(', ')]}
          onPlay={data.popular_tracks.length ? () => play(data.popular_tracks, 0) : undefined}
        >
          {data.popular_tracks.length > 0 && (
            <Section title="Popular tracks">
              <TrackList tracks={data.popular_tracks} onPlay={(i) => play(data.popular_tracks, i)} />
            </Section>
          )}
          {data.albums.length > 0 && (
            <Section title="Albums">
              <div className="library-grid">{data.albums.map((a) => <AlbumCard key={a.id} album={a} onOpen={onOpen} />)}</div>
            </Section>
          )}
          {data.also_albums.length > 0 && (
            <Section title="Also appears on">
              <div className="library-grid">{data.also_albums.map((a) => <AlbumCard key={a.id} album={a} onOpen={onOpen} />)}</div>
            </Section>
          )}
          {data.similar.length > 0 && (
            <Section title="Similar artists">
              <div className="artists-grid">{data.similar.map((a) => <ArtistCard key={a.id} artist={a} onOpen={onOpen} />)}</div>
            </Section>
          )}
        </Header>
      )}
    </Async>
  )
}

export function YandexDetail({ detail, onBack, onOpen }: { detail: YmDetail; onBack: () => void; onOpen: OpenDetail }) {
  return (
    <div className="library-scroll">
      {detail.type === 'album' && <AlbumDetail key={detail.id} id={detail.id} onBack={onBack} />}
      {detail.type === 'playlist' && <PlaylistDetail key={detail.id} id={detail.id} onBack={onBack} />}
      {detail.type === 'artist' && <ArtistDetail key={detail.id} id={detail.id} onBack={onBack} onOpen={onOpen} />}
    </div>
  )
}
