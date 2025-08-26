import { IElectronAPI, ICryptoAPI } from "./preload";

declare global {
  // We are extending the existing Window interface
  interface Window {
    ipcRenderer: import("electron").IpcRenderer;
    electronAPI: IElectronAPI;
    electronCrypto: ICryptoAPI;
  }

  // We are extending the existing NodeJS.ProcessEnv interface
  namespace NodeJS {
    interface ProcessEnv {
      APP_ROOT: string;
      VITE_PUBLIC: string;
    }
  }
}

// This export is here to ensure this file is treated as a module.
// It can be an empty export.
export {};
