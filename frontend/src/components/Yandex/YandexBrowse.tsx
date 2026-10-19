import { yandexApi } from '../../api/yandex'
import { useAsync } from './useAsync'
import { AlbumCard, Async, PlayButton, PlaylistCard, Section, TrackList, useYandexPlayer } from './parts'
import type { OpenDetail } from './parts'

export function YandexBrowse({ onOpen }: { onOpen: OpenDetail }) {
  const play = useYandexPlayer()
  const { data, loading, error } = useAsync(() => yandexApi.browse(), [])

  return (
    <div className="library-scroll">
      <Async loading={loading} error={error}>
        {data && (
          <>
            {data.personal.length > 0 && (
              <Section title="Made for you">
                <div className="library-grid">{data.personal.map((p) => <PlaylistCard key={p.id} playlist={p} onOpen={onOpen} />)}</div>
              </Section>
            )}
            {data.chart.length > 0 && (
              <Section title="Chart" action={<PlayButton onClick={() => play(data.chart, 0)} label="Play chart" />}>
                <TrackList tracks={data.chart.slice(0, 20)} ranked onPlay={(i) => play(data.chart, i)} />
              </Section>
            )}
            {data.new_releases.length > 0 && (
              <Section title="New releases">
                <div className="library-grid">{data.new_releases.map((a) => <AlbumCard key={a.id} album={a} onOpen={onOpen} />)}</div>
              </Section>
            )}
            {data.new_playlists.length > 0 && (
              <Section title="New playlists">
                <div className="library-grid">{data.new_playlists.map((p) => <PlaylistCard key={p.id} playlist={p} onOpen={onOpen} />)}</div>
              </Section>
            )}
          </>
        )}
      </Async>
    </div>
  )
}
