const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  platform: () => ipcRenderer.invoke('get-platform'),
  getFilePath: (file) => webUtils.getPathForFile(file),
})
