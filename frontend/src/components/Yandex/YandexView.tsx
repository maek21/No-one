import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store'
import { yandexApi } from '../../api/yandex'
import type { YmDetail } from '../../types/yandex'
import { YandexGate } from './YandexAccount'
import { Notice } from './parts'
import { YandexBrowse } from './YandexBrowse'
import { YandexCollection } from './YandexCollection'
import { YandexDetail } from './YandexDetail'
import { YandexSearch } from './YandexSearch'

export type YandexTab = 'browse' | 'search' | 'collection'

/**
 * Online-mode screen. Owns a small drill-down stack (album / artist / playlist pages)
 * on top of the active tab; App remounts it per tab so the stack resets on tab change.
 */
export function YandexView({ tab }: { tab: YandexTab }) {
  const status = useAppStore((s) => s.yandexStatus)
  const setStatus = useAppStore((s) => s.setYandexStatus)
  const [stack, setStack] = useState<YmDetail[]>([])

  // The backend restores a saved session on its own; ask it instead of assuming "signed out"
  useEffect(() => {
    if (status) return
    yandexApi.status().then(setStatus).catch(() => {
      setStatus({ authorized: false, uid: null, login: null, display_name: null, has_plus: false, device_auth: { state: 'idle' } })
    })
  }, [status, setStatus])

  const open = useCallback((d: YmDetail) => setStack((s) => [...s, d]), [])
  const back = useCallback(() => setStack((s) => s.slice(0, -1)), [])

  if (!status) return <div className="library-scroll"><Notice>Connecting to Yandex Music…</Notice></div>
  if (!status.authorized) return <YandexGate />

  const top = stack[stack.length - 1]

  // The tab stays mounted (just hidden) under a detail page, so search results / scroll survive "Back"
  return (
    <>
      <div style={{ display: top ? 'none' : 'contents' }}>
        {tab === 'browse' && <YandexBrowse onOpen={open} />}
        {tab === 'search' && <YandexSearch onOpen={open} />}
        {tab === 'collection' && <YandexCollection onOpen={open} />}
      </div>
      {top && <YandexDetail detail={top} onBack={back} onOpen={open} />}
    </>
  )
}
