// src/lib/cryptoService.ts
import type { ICryptoKeyBundle } from "../../electron/preload";

// Assuming PreKey is defined in a shared types file or ICryptoKeyBundle
interface PreKey {
  keyId: number;
  keyPair: {
    pubKey: string;
  };
}

export const cryptoService = {
  async generateIdentity() {
    if (!window.electronCrypto) {
      throw new Error("Crypto bridge is not available!");
    }
    const fullKeyBundle = await window.electronCrypto.generateIdentity();
    const publicBundle = {
      identityKey: fullKeyBundle.identityKeyPair.pubKey,
      registrationId: fullKeyBundle.registrationId,
      preKeys: fullKeyBundle.preKeys.map((k: PreKey) => ({
        keyId: k.keyId,
        publicKey: k.keyPair.pubKey,
      })),
      signedPreKey: {
        keyId: fullKeyBundle.signedPreKey.keyId,
        publicKey: fullKeyBundle.signedPreKey.keyPair.pubKey,
        signature: fullKeyBundle.signedPreKey.signature,
      },
    };
    await window.electronAPI.saveKeys(fullKeyBundle);
    return { publicBundle };
  },
  async getIdentity(): Promise<ICryptoKeyBundle | null> {
    if (!window.electronAPI) {
      throw new Error("Electron API bridge is not available!");
    }
    const keys = await window.electronAPI.getKeys();
    return keys;
  },
};
