// Tracks from Yandex Music live in the same queue as local ones; their ids carry this prefix.
export const YM_PREFIX = 'ym:'

export type SourceMode = 'local' | 'yandex'

export const isYandexId = (id: string | null | undefined): boolean =>
  !!id && id.startsWith(YM_PREFIX)

export const stripYandexPrefix = (id: string): string =>
  isYandexId(id) ? id.slice(YM_PREFIX.length) : id
