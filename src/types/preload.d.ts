// src/types/preload.d.ts

import type { PrivateMaterial, PublicBundle, RecipientBundle } from "./crypto";

declare global {
  interface Window {
    electronAPI: {
      closeApp?: () => Promise<void>;
      closeWindow?: () => Promise<void>;
      minimizeWindow?: () => Promise<void>;
      maximizeWindow?: () => Promise<void>;

      // ✅ add these:
      unlockDB: (passphrase: string, accountKey?: string) => Promise<{ ok: true; backend?: string }>;
      lockDB: () => Promise<{ ok: true }>;
      resetVault: () => Promise<{ ok: true }>;
      getBackend: () => Promise<{ backend: 'file' | 'sqlcipher' | null }>;
      saveKeys: (bundle: PrivateMaterial) => Promise<{ success: true }>;
      getKeys: () => Promise<PrivateMaterial | null>;
      saveRatchet: (peerId: string, state: any) => Promise<{ success: true }>;
      getRatchet: (peerId: string) => Promise<any | null>;
      saveOPKs?: (
        opks: Array<{ publicKeyB64: string; privateKeyB64?: string }>
      ) => Promise<{ success: true }>;
      getOPKPriv?: (pubB64: string) => Promise<string | null>;
      consumeOPK?: (pubB64: string) => Promise<{ success: true }>;

      // Local session persistence
      saveSession: (
        peerId: string,
        sessionId: string,
        sharedAesKeyB64: string
      ) => Promise<{ success: true }>;
      getSession: (
        peerId: string
      ) => Promise<{ sessionId: string; sharedAesKeyB64: string } | null>;

      // Local message database
      localDBInit: (encryptionKey: string, userId: string, username: string) => Promise<{ success: boolean; error?: string }>;
      localDBSaveIncomingMessage: (
        senderId: string,
        senderUsername: string,
        plaintext: string,
        ciphertext: string,
        handshake?: any,
        header?: any,
        timestamp?: string,
        serverId?: string
      ) => Promise<{ success: boolean; messageId?: string; error?: string }>;
      localDBSaveOutgoingMessage: (
        recipientId: string,
        recipientUsername: string,
        plaintext: string,
        ciphertext: string,
        handshake?: any,
        header?: any,
        serverId?: string
      ) => Promise<{ success: boolean; messageId?: string; error?: string }>;
      localDBGetConversationHistory: (
        otherUserId: string,
        limit?: number,
        offset?: number
      ) => Promise<{ success: boolean; messages?: any[]; error?: string }>;
      localDBGetConversations: () => Promise<{ success: boolean; conversations?: any[]; error?: string }>;
      localDBSearchMessages: (
        query: string,
        limit?: number
      ) => Promise<{ success: boolean; messages?: any[]; error?: string }>;
      localDBNukeConversation: (otherUserId: string) => Promise<{ success: boolean; error?: string }>;
      localDBGetStats: () => Promise<{ success: boolean; stats?: { messageCount: number; conversationCount: number; dbSize: number }; error?: string }>;
      localDBVacuum: () => Promise<{ success: boolean; error?: string }>;

      onMainProcessMessage?: (cb: (message: unknown) => void) => () => void;
      // add other methods you actually expose, if any
    };

    electronCrypto: {
      genEphemeral: () => Promise<{ ephPubB64: string; ephPrivB64: string; }>;
      // ✅ used by Register
      generateIdentity: () => Promise<{
        publicBundle: { identityKeyPublicB64: string };
        privateMaterial: {
          identityKeyPrivateB64: string;
          identityKeyPublicB64: string;
        };
      }>;

      // Optional libsignal-native surface
      generateLSAccount?: () => Promise<{
        registrationId: number;
        identityKeyB64: string;
        signedPreKey: { id: number; pubB64: string; sigB64: string };
        oneTimePreKeys?: Array<{ id: number; pubB64: string }>;
      } | { error: string }>;
      getPreKeyBundle?: () => Promise<{
        registrationId: number;
        identityKeyB64: string;
        signedPreKey: { id: number; pubB64: string; sigB64: string };
        oneTimePreKey?: { id: number; pubB64: string };
      } | { error: string }>;
      processPreKeyBundle?: (remoteBundle: unknown) => Promise<{ sessionId: string } | { error: string }>;
      lsEncrypt?: (sessionId: string, plaintext: string) => Promise<{ ciphertext: string } | { error: string }>;
      lsDecrypt?: (sessionId: string, ciphertext: string) => Promise<{ plaintext: string } | { error: string }>;

      // Optional: only if you implemented it in preload
      generateOneTimePreKeys?: (
        count: number
      ) => Promise<Array<{ id?: number; keyId?: number; publicKeyB64: string; privateKeyB64?: string }>>;

      // Optional: used by chat encryption if present
      establishSession?: (
        privateMaterial: {
          identityKeyPrivateB64: string;
          identityKeyPublicB64: string;
        },
        recipientBundle: { identityKeyPublicB64: string }
      ) => Promise<{ success: boolean; sessionId: string; sharedAesKeyB64?: string }>;

      encryptMessage?: (
        sessionId: string,
        plaintext: string
      ) => Promise<{ ciphertext: string }>;

      decryptMessage?: (
        sessionId: string,
        ciphertext: string
      ) => Promise<{ plaintext: string }>;
      nativeExport?: () => Promise<{ ok: boolean; error?: string }>;
      nativeImport?: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}


// This is required for some reason.
export {};