import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store'
import { yandexApi, ymErrorMessage } from '../../api/yandex'

/** Sign-in / account card. Used by the gate (when signed out) and by Settings. */
export function YandexAccountPanel() {
  const status = useAppStore((s) => s.yandexStatus)
  const setStatus = useAppStore((s) => s.setYandexStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [device, setDevice] = useState<{ user_code: string; verification_url: string } | null>(null)
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const stopPolling = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = undefined }
  useEffect(() => stopPolling, [])

  const startDeviceLogin = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const d = await yandexApi.startDeviceAuth()
      setDevice({ user_code: d.user_code, verification_url: d.verification_url })
      window.open(d.verification_url, '_blank')
      stopPolling()
      // The backend polls Yandex for us; we just watch the resulting status
      pollRef.current = setInterval(async () => {
        try {
          const st = await yandexApi.status()
          if (st.authorized) { stopPolling(); setDevice(null); setStatus(st) }
          else if (st.device_auth.state === 'expired' || st.device_auth.state === 'error') {
            stopPolling(); setDevice(null)
            setError(st.device_auth.state === 'expired' ? 'The code expired — try again.' : st.device_auth.error || 'Sign-in failed.')
          }
        } catch { /* transient — keep polling */ }
      }, 2000)
    } catch (e) {
      setError(ymErrorMessage(e))
    }
    setBusy(false)
  }, [setStatus])

  const submitToken = useCallback(async () => {
    if (!token.trim()) return
    setError(null)
    setBusy(true)
    try {
      setStatus(await yandexApi.loginWithToken(token))
      setToken('')
    } catch (e) {
      setError(ymErrorMessage(e))
    }
    setBusy(false)
  }, [token, setStatus])

  const logout = useCallback(async () => {
    setBusy(true)
    try { setStatus(await yandexApi.logout()) } catch (e) { setError(ymErrorMessage(e)) }
    setBusy(false)
  }, [setStatus])

  if (status?.authorized) {
    return (
      <div className="ym-account">
        <div>
          <div className="ym-account-name">{status.display_name || status.login}</div>
          <div className="ym-account-meta">{status.has_plus ? 'Yandex Plus active' : 'No Yandex Plus — playback may be limited'}</div>
        </div>
        <button className="ym-btn" onClick={logout} disabled={busy}>Sign out</button>
      </div>
    )
  }

  return (
    <div className="ym-account-signin">
      {device ? (
        <div className="ym-device">
          <div className="ym-account-meta">Enter this code on the page that just opened:</div>
          <div className="ym-device-code">{device.user_code}</div>
          <a href={device.verification_url} target="_blank" rel="noreferrer" className="ym-link">{device.verification_url}</a>
          <div className="ym-account-meta">Waiting for confirmation…</div>
        </div>
      ) : (
        <button className="ym-btn primary" onClick={startDeviceLogin} disabled={busy}>
          {busy ? 'Connecting…' : 'Sign in with Yandex'}
        </button>
      )}
      <button className="ym-link" onClick={() => setShowToken((v) => !v)}>
        {showToken ? 'Hide' : 'I have an OAuth token'}
      </button>
      {showToken && (
        <div className="ym-token-row">
          <input
            type="password"
            value={token}
            placeholder="OAuth token"
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitToken()}
          />
          <button className="ym-btn" onClick={submitToken} disabled={busy || !token.trim()}>Connect</button>
        </div>
      )}
      {error && <div className="ym-error">{error}</div>}
    </div>
  )
}

/** Full-screen gate shown in Yandex mode until the user signs in */
export function YandexGate() {
  return (
    <div className="library-scroll">
      <div className="ym-gate">
        <div className="ym-gate-title">Yandex Music</div>
        <div className="ym-gate-sub">
          Sign in to search, stream and open your collection. Your offline library stays untouched — switch back any time.
        </div>
        <YandexAccountPanel />
      </div>
    </div>
  )
}
