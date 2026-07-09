import axios from 'axios'

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8000' : ''

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Library API
export const libraryApi = {
  getTracks: () => apiClient.get('/api/library/tracks'),
  getAlbums: () => apiClient.get('/api/library/albums'),
  getArtists: () => apiClient.get('/api/library/artists'),
  getAlbumTracks: (albumId: string) => apiClient.get(`/api/library/albums/${albumId}/tracks`),
  getArtistTracks: (artistId: string) => apiClient.get(`/api/library/artists/${artistId}/tracks`),
  search: (query: string) => apiClient.get('/api/library/search', { params: { q: query } }),
  toggleFavorite: (trackId: string) => apiClient.post(`/api/library/tracks/${trackId}/favorite`),
  getStats: () => apiClient.get('/api/library/stats')
}

// Playback API
export const playbackApi = {
  play: (trackId: string) => apiClient.post('/api/playback/play', { track_id: trackId }),
  pause: () => apiClient.post('/api/playback/pause'),
  resume: () => apiClient.post('/api/playback/resume'),
  stop: () => apiClient.post('/api/playback/stop'),
  next: () => apiClient.post('/api/playback/next'),
  previous: () => apiClient.post('/api/playback/previous'),
  seek: (position: number) => apiClient.post('/api/playback/seek', { position }),
  setVolume: (volume: number) => apiClient.post('/api/playback/volume', { volume }),
  getStatus: () => apiClient.get('/api/playback/status'),
  getQueue: () => apiClient.get('/api/playback/queue'),
  addToQueue: (trackId: string) => apiClient.post('/api/playback/queue/add', { track_id: trackId }),
  clearQueue: () => apiClient.post('/api/playback/queue/clear')
}

// Import API
export const importApi = {
  start: (path: string, options = {}) => apiClient.post('/api/import/start', { path, options }),
  getStatus: (jobId: string) => apiClient.get(`/api/import/status/${jobId}`),
  cancel: (jobId: string) => apiClient.post(`/api/import/cancel/${jobId}`)
}

// Analysis API
export const analysisApi = {
  get: (trackId: string) => apiClient.get(`/api/analysis/${trackId}`),
}

// Settings API
export const settingsApi = {
  get: () => apiClient.get('/api/settings'),
  update: (settings: any) => apiClient.patch('/api/settings', settings)
}

// Playlists API
export const playlistsApi = {
  getAll: () => apiClient.get('/api/playlists'),
  get: (playlistId: string) => apiClient.get(`/api/playlists/${playlistId}`),
  getTracks: (playlistId: string) => apiClient.get(`/api/playlists/${playlistId}/tracks`),
  create: (name: string, description?: string) => apiClient.post('/api/playlists', { name, description }),
  update: (playlistId: string, payload: any) => apiClient.patch(`/api/playlists/${playlistId}`, payload),
  delete: (playlistId: string) => apiClient.delete(`/api/playlists/${playlistId}`),
  addTracks: (playlistId: string, trackIds: string[], position?: number) => apiClient.post(`/api/playlists/${playlistId}/tracks`, { track_ids: trackIds, position }),
  removeTrack: (playlistId: string, trackId: string) => apiClient.delete(`/api/playlists/${playlistId}/tracks/${trackId}`),
}
