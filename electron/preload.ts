// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";

// --- Type Definitions ---
export interface ICryptoKeyBundle {
  identityKeyPair: { pubKey: string; privKey: string };
  registrationId: number;
  preKeys: { keyId: number; keyPair: { pubKey: string; privKey: string } }[];
  signedPreKey: {
    keyId: number;
    keyPair: { pubKey: string; privKey: string };
    signature: string;
  };
}

export interface IElectronAPI {
  closeApp: () => Promise<void>;
  closeWindow: () => Promise<void>;
  onMainProcessMessage: (callback: (message: string) => void) => void;
  // 👇 FIX: Use a specific type instead of 'any'
  saveKeys: (keyBundle: ICryptoKeyBundle) => Promise<{ success: boolean }>;
  getKeys: () => Promise<ICryptoKeyBundle | null>;
}

export interface ICryptoAPI {
  generateIdentity: () => Promise<ICryptoKeyBundle>;
}

// --- electronAPI Bridge ---
contextBridge.exposeInMainWorld("electronAPI", {
  closeApp: () => ipcRenderer.invoke("close-app"),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  onMainProcessMessage: (callback: (message: string) => void) => {
    ipcRenderer.on("main-process-message", (_event, message) => {
      callback(message);
    });
  },
  saveKeys: (keyBundle) => ipcRenderer.invoke("db:save-keys", keyBundle),
  getKeys: () => ipcRenderer.invoke("db:get-keys"),
} as IElectronAPI);

// ... (keep the mock electronCrypto bridge as is)
contextBridge.exposeInMainWorld("electronCrypto", {
  generateIdentity: async (): Promise<ICryptoKeyBundle> => {
    console.log("BRIDGE: Generating identity keys (mock)...");
    const fullBundle: ICryptoKeyBundle = {
      identityKeyPair: {
        pubKey: "public_identity_key_mock",
        privKey: "private_identity_key_mock",
      },
      registrationId: Math.floor(Math.random() * 10000),
      preKeys: [
        {
          keyId: 1,
          keyPair: {
            pubKey: "public_prekey_mock",
            privKey: "private_prekey_mock",
          },
        },
      ],
      signedPreKey: {
        keyId: 1,
        keyPair: {
          pubKey: "public_signed_prekey_mock",
          privKey: "private_signed_prekey_mock",
        },
        signature: "mock_signature",
      },
    };
    return fullBundle;
  },
} as ICryptoAPI);

// --- Global Type Declarations ---
declare global {
  interface Window {
    electronAPI: IElectronAPI;
    electronCrypto: ICryptoAPI;
  }
}
