import { contextBridge, ipcRenderer } from 'electron'


export interface IElectronAPI {
  closeApp: () => Promise<void>
  closeWindow: () => Promise<void>
  onMainProcessMessage: (callback: (message: string) => void) => void
}



contextBridge.exposeInMainWorld('electronAPI', {
  
  closeApp: () => ipcRenderer.invoke('close-app'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  
  
  onMainProcessMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('main-process-message', (_event, message) => {
      callback(message)
    })
  }
} as IElectronAPI)


declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}