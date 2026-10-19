import { useRef, useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../../store'
import { api } from '../../api'
import GlassSurface from '../GlassSurface'
import '../Yandex/Yandex.css'
import type { SourceMode } from '../../utils/source'

export type ViewId =
  | 'library' | 'playlists' | 'lyrics' | 'queue' | 'settings'
  | 'ym-browse' | 'ym-search' | 'ym-collection'

interface Tab {
  id: ViewId
  label: string
  icon: string
}

const LYRICS_TAB: Tab = { id: 'lyrics', label: 'Lyrics', icon: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM8 15h8v1.5H8V15zm0-3h8v1.5H8V12zm0-3h5v1.5H8V9z' }
const QUEUE_TAB: Tab = { id: 'queue', label: 'Queue', icon: 'M4 14h16v2H4zm0-6h16v2H4zm0 12h10v-2H4zm0-16v2h16V4z' }
const SETTINGS_TAB: Tab = { id: 'settings', label: 'Settings', icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z' }

const LOCAL_TABS: Tab[] = [
  { id: 'library', label: 'Library', icon: 'M4 6h16v12H4z' },
  { id: 'playlists', label: 'Playlists', icon: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z' },
  LYRICS_TAB, QUEUE_TAB, SETTINGS_TAB,
]

const YANDEX_TABS: Tab[] = [
  { id: 'ym-browse', label: 'Home', icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
  { id: 'ym-search', label: 'Search', icon: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' },
  { id: 'ym-collection', label: 'Collection', icon: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z' },
  LYRICS_TAB, QUEUE_TAB, SETTINGS_TAB,
]

const DEFAULT_VIEW: Record<SourceMode, ViewId> = { local: 'library', yandex: 'ym-browse' }

const TAB_HEIGHT = 28
const TAB_GAP = 2
const BLOB_PADDING = 10

interface TabBarProps {
  activeView: ViewId
  onViewChange: (view: ViewId) => void
}

export function TabBar({ activeView, onViewChange }: TabBarProps) {
  const palette = useAppStore((s) => s.palette)
  const glassSettings = useAppStore((s) => s.glassSettings)
  const sourceMode = useAppStore((s) => s.sourceMode)
  const setSourceMode = useAppStore((s) => s.setSourceMode)
  const tabs = sourceMode === 'yandex' ? YANDEX_TABS : LOCAL_TABS
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([])
  const [blobRect, setBlobRect] = useState({ left: 0, width: 60 })

  const accentColor = palette?.accent || '#ffffff'

  const switchMode = (mode: SourceMode) => {
    if (mode === sourceMode) return
    setSourceMode(mode)
    api.updateSettings({ source_mode: mode }).catch(() => {})
    // Keep shared screens (lyrics / queue / settings) where they are; otherwise land on the mode's home
    const target = (mode === 'yandex' ? YANDEX_TABS : LOCAL_TABS).some((t) => t.id === activeView)
    if (!target) onViewChange(DEFAULT_VIEW[mode])
  }

  useEffect(() => {
    buttonsRef.current.length = tabs.length
    const idx = tabs.findIndex((t) => t.id === activeView)
    const btn = buttonsRef.current[idx]
    if (!btn) return
    const parent = btn.parentElement
    if (!parent) return
    const parentRect = parent.getBoundingClientRect()
    const btnRect = btn.getBoundingClientRect()
    setBlobRect({
      left: btnRect.left - parentRect.left - BLOB_PADDING - 8,
      width: btnRect.width + BLOB_PADDING * 2 + 16,
    })
  }, [activeView, tabs])

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      gap: TAB_GAP,
      padding: `6px 10px`,
      background: 'rgba(20, 22, 28, 0.75)',
      backdropFilter: 'blur(24px) saturate(1.3)',
      WebkitBackdropFilter: 'blur(24px) saturate(1.3)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      borderRadius: 20,
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
      userSelect: 'none',
    }}>
      {/* GlassSurface as active tab indicator */}
      <div
        id="tabbar-glass-indicator"
        style={{
          position: 'absolute',
          left: blobRect.left,
          top: -3,
          width: blobRect.width,
          height: TAB_HEIGHT + BLOB_PADDING + 6,
          borderRadius: (TAB_HEIGHT + BLOB_PADDING + 6) / 2,
          transition: 'left 0.35s cubic-bezier(0.22, 1, 0.36, 1), width 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'left, width',
          pointerEvents: 'none',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        <GlassSurface
          width="100%"
          height="100%"
          borderRadius={TAB_HEIGHT / 2}
          borderWidth={glassSettings.borderWidth}
          brightness={glassSettings.brightness}
          opacity={glassSettings.opacity}
          blur={glassSettings.blur}
          displace={glassSettings.displace}
          backgroundOpacity={glassSettings.backgroundOpacity}
          saturation={glassSettings.saturation}
          distortionScale={glassSettings.distortionScale}
          redOffset={glassSettings.redOffset}
          greenOffset={glassSettings.greenOffset}
          blueOffset={glassSettings.blueOffset}
          mixBlendMode={glassSettings.mixBlendMode as any}
          xChannel={glassSettings.xChannel as any}
          yChannel={glassSettings.yChannel as any}
        />
      </div>

      <div className="ym-mode" title="Switch between your offline library and Yandex Music">
        <button className={sourceMode === 'local' ? 'active' : ''} onClick={() => switchMode('local')}>Local</button>
        <button className={sourceMode === 'yandex' ? 'active' : ''} onClick={() => switchMode('yandex')}>Yandex</button>
      </div>

      {tabs.map((tab, i) => {
        const isActive = activeView === tab.id
        return (
          <button
            key={tab.id}
            ref={(el) => { buttonsRef.current[i] = el }}
            onClick={() => onViewChange(tab.id)}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              height: TAB_HEIGHT,
              borderRadius: TAB_HEIGHT / 2,
              cursor: 'pointer',
              color: isActive ? accentColor : 'rgba(255, 255, 255, 0.45)',
              transition: 'color 0.2s',
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: 0.3,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              position: 'relative',
              zIndex: 1,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d={tab.icon} />
            </svg>
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}