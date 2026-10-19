import axios from 'axios'
import { API_BASE } from './index'
import { useAppStore } from '../store'
import type {
  YmAlbum, YmArtistPage, YmArtist, YmBrowse, YmPlaylist, YmSearchResult, YmStatus, YmTrack,
} from '../types/yandex'

const http = axios.create({ baseURL: `${API_BASE}/api/yandex` })

// A 401 from any Yandex call means the session is gone — flip the UI back to the sign-in gate.
http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.data?.code === 'not_authorized') {
      const { yandexStatus, setYandexStatus } = useAppStore.getState()
      if (yandexStatus?.authorized) setYandexStatus({ ...yandexStatus, authorized: false })
    }
    return Promise.reject(err)
  },
)

const get = <T>(url: string, params?: object) => http.get<T>(url, { params }).then((r) => r.data)

export const yandexApi = {
  status: () => get<YmStatus>('/status'),
  loginWithToken: (token: string) => http.post<YmStatus>('/auth/token', { token }).then((r) => r.data),
  startDeviceAuth: () => http.post('/auth/device').then((r) => r.data),
  logout: () => http.post<YmStatus>('/auth/logout').then((r) => r.data),

  search: (q: string, type = 'all', page = 0) => get<YmSearchResult>('/search', { q, type, page }),
  suggest: (q: string) => get<{ suggestions: string[] }>('/search/suggest', { q }).then((d) => d.suggestions),
  browse: () => get<YmBrowse>('/browse'),

  getAlbum: (id: string) => get<YmAlbum & { tracks: YmTrack[] }>(`/albums/${id}`),
  getArtist: (id: string) => get<YmArtistPage>(`/artists/${id}`),
  getPlaylist: (id: string) => {
    const [uid, kind] = id.split(':')
    return get<YmPlaylist & { tracks: YmTrack[] }>(`/playlists/${uid}/${kind}`)
  },

  likedTracks: (offset = 0, limit = 100) =>
    get<{ tracks: YmTrack[]; total: number; offset: number }>('/collection/tracks', { offset, limit }),
  likedAlbums: () => get<YmAlbum[]>('/collection/albums'),
  likedArtists: () => get<YmArtist[]>('/collection/artists'),
  playlists: () => get<YmPlaylist[]>('/collection/playlists'),

  setLiked: (ymId: string, liked: boolean) => {
    const id = ymId.replace(/^ym:/, '')
    return liked ? http.put(`/tracks/${id}/like`) : http.delete(`/tracks/${id}/like`)
  },
}

/** Human-readable message from a failed Yandex call */
export function ymErrorMessage(err: any): string {
  const data = err?.response?.data
  if (data?.code === 'region_blocked') return 'Yandex Music is not available from your network or region.'
  if (data?.code === 'not_authorized') return 'Signed out of Yandex Music.'
  if (typeof data?.detail === 'string') return data.detail
  return err?.message || 'Something went wrong'
}
