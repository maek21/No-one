import { useEffect, useState } from 'react'
import { ymErrorMessage } from '../../api/yandex'

/** Runs `load` when `deps` change; ignores results that arrive after a newer request started. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    setLoading(true)
    setError(null)
    load()
      .then((d) => { if (!stale) setData(d) })
      .catch((e) => { if (!stale) setError(ymErrorMessage(e)) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, setData }
}
