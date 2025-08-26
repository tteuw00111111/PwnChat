"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  closeApp: () => electron.ipcRenderer.invoke("close-app"),
  closeWindow: () => electron.ipcRenderer.invoke("close-window"),
  onMainProcessMessage: (callback) => {
    electron.ipcRenderer.on("main-process-message", (_event, message) => {
      callback(message);
    });
  }
});
electron.contextBridge.exposeInMainWorld("electronCrypto", {
  generateIdentity: async () => {
    console.log("BRIDGE: Generating identity keys...");
    const fullBundle = {
      identityKeyPair: {
        pubKey: "public_identity_key_mock",
        privKey: "private_identity_key_mock"
      },
      registrationId: Math.floor(Math.random() * 1e4),
      preKeys: [
        {
          keyId: 1,
          keyPair: {
            pubKey: "public_prekey_mock",
            privKey: "private_prekey_mock"
          }
        }
      ],
      signedPreKey: {
        keyId: 1,
        keyPair: {
          pubKey: "public_signed_prekey_mock",
          privKey: "private_signed_prekey_mock"
        },
        signature: "mock_signature"
      }
    };
    return fullBundle;
  }
});
