interface ElectronAPI {
  selectFolder: () => Promise<string | null>
  platform: () => Promise<string>
  getFilePath: (file: File) => string
}

interface Window {
  electronAPI?: ElectronAPI
}
