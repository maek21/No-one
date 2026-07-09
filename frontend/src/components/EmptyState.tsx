import { useCallback, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { importApi } from '../api/client'
import { useStore } from '../store'
import './EmptyState.css'

export function EmptyState() {
  const [isDragging, setIsDragging] = useState(false)
  const setImporting = useStore(state => state.setImporting)

  const importMutation = useMutation({
    mutationFn: (folderPath: string) => importApi.start(folderPath),
    onSuccess: (data) => {
      console.log('Import started:', data)
      setImporting(true, 0)
    },
    onError: (error) => {
      console.error('Import failed:', error)
      alert('Failed to start import. Check console for details.')
    }
  })

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer?.files?.[0]
    if (file && (window as any).electronAPI?.getFilePath) {
      const path = (window as any).electronAPI.getFilePath(file)
      if (path) importMutation.mutate(path)
      return
    }

    const items = Array.from(e.dataTransfer.items)

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry()
        if (entry?.isDirectory) {
          const path = prompt(
            `Enter the full path to "${entry.name}" folder:`,
            `C:\\Users\\YourName\\Music\\${entry.name}`
          )
          if (path) importMutation.mutate(path)
        }
      }
    }
  }, [importMutation])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  return (
    <div 
      className={`empty-state ${isDragging ? 'dragging' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-dragging={isDragging}
    >
      <div className="empty-state-content">
        <p className="empty-state-text">
          {isDragging ? 'Release to import' : 'Drop your music.'}
        </p>
        <p className="empty-state-hint">
          Drag a folder containing your music library
        </p>
      </div>
    </div>
  )
}
