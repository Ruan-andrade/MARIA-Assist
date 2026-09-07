const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisDesktop', {
  isElectron: true,
  getSystemInfo: () => ipcRenderer.invoke('jarvis:get-system-info'),
  openBrowser: (url) => ipcRenderer.invoke('jarvis:open-browser', url),
  executeCommand: (command) => ipcRenderer.invoke('jarvis:execute-command', command),
  manageFilesystem: (action, targetPath, content) => ipcRenderer.invoke('jarvis:manage-filesystem', { action, targetPath, content }),
  searchWeb: (query) => ipcRenderer.invoke('jarvis:search-web', query),
  minimizeWindow: () => ipcRenderer.invoke('jarvis:minimize'),
  closeWindow: () => ipcRenderer.invoke('jarvis:close')
});
