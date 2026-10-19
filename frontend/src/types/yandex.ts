export interface YmTrack {
  id: string            // "ym:<track id>" — playable through api.getStreamUrl
  yandex_id: string
  title: string
  artist: string
  artists: { id: string; name: string }[]
  album: string | null
  album_id: string | null
  duration: number
  artwork: string | null
  available: boolean
  explicit: boolean
  has_lyrics: boolean
  liked: boolean
  source: 'yandex'
}

export interface YmAlbum {
  id: string
  title: string
  artist: string
  artist_id: string | null
  year: number | null
  genre: string | null
  track_count: number
  artwork: string | null
  available: boolean
  tracks?: YmTrack[]
}

export interface YmArtist {
  id: string
  name: string
  artwork: string | null
  genres: string[]
  track_count: number | null
  album_count: number | null
}

export interface YmPlaylist {
  id: string            // "<uid>:<kind>"
  uid: string
  kind: string
  title: string
  description: string | null
  owner: string | null
  track_count: number
  duration: number
  artwork: string | null
  tracks?: YmTrack[]
}

export interface YmPage<T> {
  items: T[]
  total: number
}

export interface YmSearchResult {
  query: string
  type: string
  page: number
  corrected: string | null
  tracks: YmPage<YmTrack>
  albums: YmPage<YmAlbum>
  artists: YmPage<YmArtist>
  playlists: YmPage<YmPlaylist>
}

export interface YmArtistPage {
  artist: YmArtist
  popular_tracks: YmTrack[]
  albums: YmAlbum[]
  also_albums: YmAlbum[]
  similar: YmArtist[]
}

export interface YmBrowse {
  chart: YmTrack[]
  new_releases: YmAlbum[]
  new_playlists: YmPlaylist[]
  personal: YmPlaylist[]
}

export interface YmDeviceAuth {
  state: 'idle' | 'pending' | 'ok' | 'expired' | 'error'
  user_code?: string
  verification_url?: string
  expires_in?: number
  error?: string
}

export interface YmStatus {
  authorized: boolean
  uid: string | null
  login: string | null
  display_name: string | null
  has_plus: boolean
  device_auth: YmDeviceAuth
}

export type YmDetail =
  | { type: 'album'; id: string }
  | { type: 'artist'; id: string }
  | { type: 'playlist'; id: string }
