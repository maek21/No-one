import axios from 'axios'

const isFileProtocol = window.location.protocol === 'file:'
const API_BASE = isFileProtocol ? 'http://localhost:8000' : ''

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

export const api = {
  checkHealth: async () => {
    try {
      const res = await apiClient.get('/health')
      return res.data?.status === 'healthy'
    } catch { return false }
  },

  getAlbums: (limit = 200, offset = 0) =>
    apiClient.get('/api/library/albums', { params: { limit, offset } }).then((r) => r.data),

  getAlbumTracks: (albumId: string) =>
    apiClient.get(`/api/library/albums/${albumId}/tracks`).then((r) => r.data),

  getStreamUrl: (trackId: string) => `${API_BASE}/api/playback/stream/${trackId}`,

  startImport: (path: string) =>
    apiClient.post('/api/import/start', { path }).then((r) => r.data),

  getLyrics: (trackId: string) =>
    apiClient.get(`/api/lyrics/${trackId}`).then((r) => r.data),

  getSettings: () =>
    apiClient.get('/api/settings').then((r) => r.data),

  updateSettings: (data: any) =>
    apiClient.patch('/api/settings', data).then((r) => r.data),
}

export { apiClient, API_BASE }

export * from './client'