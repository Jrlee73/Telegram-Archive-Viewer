const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectExportDirectory: () => ipcRenderer.invoke('dialog:selectExportDirectory'),
  readDirectoryFiles: (dirPath) => ipcRenderer.invoke('fs:readDirectoryFiles', dirPath),
  readFileAsText: (filePath) => ipcRenderer.invoke('fs:readFileAsText', filePath),
  readMultipleFilesAsText: (filePaths) => ipcRenderer.invoke('fs:readMultipleFilesAsText', filePaths),
  readFileAsBlobUrl: (filePath, mimeType) => ipcRenderer.invoke('fs:readFileAsBlobUrl', filePath, mimeType),
  getExportFolderInfo: (dirPath) => ipcRenderer.invoke('fs:getExportFolderInfo', dirPath),
  checkDirectoryExists: (dirPath) => ipcRenderer.invoke('fs:checkDirectoryExists', dirPath),
  getSetting: (key) => ipcRenderer.invoke('app:getSetting', key),
  setSetting: (key, val) => ipcRenderer.invoke('app:setSetting', key, val),
  getExportRoot: () => ipcRenderer.invoke('app:getExportRoot'),
  setExportRoot: (rootPath, rootName) => ipcRenderer.invoke('app:setExportRoot', rootPath, rootName),
  openInSystemApp: (relativePath) => ipcRenderer.invoke('fs:openInSystemApp', relativePath),
  closeApp: () => ipcRenderer.invoke('app:closeApp'),
});
