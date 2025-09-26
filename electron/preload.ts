// electron/preload.ts
// CJS is fine here because we build to .cjs
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { contextBridge, ipcRenderer } = require("electron");
import type {
  PrivateMaterial,
  PublicBundle,
  RecipientBundle,
  EncryptedMessage,
} from "../src/types/crypto";

// TYPE-ONLY
type MainMessageCallback = (message: unknown) => void;

interface LocalMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender_username?: string;
  recipient_username?: string;
  plaintext: string;
  ciphertext: string;
  handshake_json?: any;
  header_json?: any;
  created_at: string;
  conversation_id: string;
}

interface ConversationSummary {
  conversation_id: string;
  other_user_id: string;
  other_username: string;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
}

interface ElectronAPI {
  closeApp: () => Promise<void>;
  closeWindow: () => Promise<void>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  openNewWindow: (profileName?: string) => Promise<void>;
  unlockDB: (passphrase: string, accountKey?: string) => Promise<{ ok: true; backend?: string }>;
  lockDB: () => Promise<{ ok: true }>;
  resetVault: () => Promise<{ ok: true }>;
  getBackend: () => Promise<{ backend: 'file' | 'sqlcipher' | null }>;
  saveKeys: (bundle: unknown) => Promise<{ success: true }>;
  getKeys: () => Promise<PrivateMaterial | null>;
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
    timestamp?: string
  ) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  localDBSaveOutgoingMessage: (
    recipientId: string,
    recipientUsername: string,
    plaintext: string,
    ciphertext: string,
    handshake?: any,
    header?: any
  ) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  localDBGetConversationHistory: (
    otherUserId: string,
    limit?: number,
    offset?: number
  ) => Promise<{ success: boolean; messages?: LocalMessage[]; error?: string }>;
  localDBGetConversations: () => Promise<{ success: boolean; conversations?: ConversationSummary[]; error?: string }>;
  localDBSearchMessages: (
    query: string,
    limit?: number
  ) => Promise<{ success: boolean; messages?: LocalMessage[]; error?: string }>;
  localDBNukeConversation: (otherUserId: string) => Promise<{ success: boolean; error?: string }>;
  localDBGetStats: () => Promise<{ success: boolean; stats?: { messageCount: number; conversationCount: number; dbSize: number }; error?: string }>;
  localDBVacuum: () => Promise<{ success: boolean; error?: string }>;

  onMainProcessMessage: (cb: MainMessageCallback) => () => void;
}

interface ElectronCryptoAPI {
  generateIdentity: () => Promise<{
    publicBundle: PublicBundle;
    privateMaterial: PrivateMaterial;
  }>;
  nativeEnabled?: boolean;
  // Libsignal-native optional surface
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
  generateOneTimePreKeys?: (
    count: number
  ) => Promise<Array<{ publicKeyB64: string; privateKeyB64?: string; id?: number }>>;
  generateEphemeral?: () => Promise<{ ephPubB64: string; ephPrivB64: string }>;
  establishFromEnvelope?: (
    privateMaterial: PrivateMaterial,
    senderBundle: RecipientBundle,
    ephPubB64: string
  ) => Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }>;
  establishWithEph?: (
    privateMaterial: PrivateMaterial,
    recipientBundle: RecipientBundle,
    ephPrivB64: string
  ) => Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }>;
  establishFromEnvelopeWithOpk?: (
    privateMaterial: PrivateMaterial,
    senderBundle: RecipientBundle,
    ephPubB64: string,
    opkPrivB64: string
  ) => Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }>;
  ratchetEncrypt?: (chainKeyB64: string, counter: number, plaintext: string) => Promise<{ ciphertext: string; nextCKB64: string; header: { n: number } }>;
  ratchetDecrypt?: (chainKeyB64: string, currentCounter: number, msgCounter: number, ciphertext: string) => Promise<{ plaintext: string; nextCKB64: string }>;
  ratchetAdvance?: (chainKeyB64: string, fromN: number, toN: number) => Promise<{ nextCKB64: string; mks: Array<{ n: number; mkB64: string }> }>;
  decryptWithMessageKey?: (mkB64: string, ciphertext: string) => Promise<{ plaintext: string }>;
  ratchetGenDh?: () => Promise<{ dhPubB64: string; dhPrivB64: string }>;
  ratchetDhSender?: (rootKeyB64: string, myNewDhPrivB64: string, theirDhPubB64: string) => Promise<{ rootKeyB64: string; sendCKB64: string; recvCKB64: string; myDhPubB64: string }>;
  ratchetDhReceiver?: (rootKeyB64: string, myDhPrivB64: string, theirNewDhPubB64: string) => Promise<{ rootKeyB64: string; sendCKB64: string; recvCKB64: string }>;
  establishSession: (
    privateMaterial: PrivateMaterial,
    recipientBundle: RecipientBundle
  ) => Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }>; // Updated return type
  encryptMessage: (
    sessionId: string,
    plaintext: string
  ) => Promise<{ ciphertext: EncryptedMessage }>;
  decryptMessage: (
    sessionId: string,
    ciphertext: EncryptedMessage
  ) => Promise<{ plaintext: string }>;
  loadSessionKey: (sessionId: string, sharedAesKeyB64: string) => Promise<void>; // New function
  decryptMessage: (
    sessionId: string,
    ciphertext: EncryptedMessage
  ) => Promise<{ plaintext: string }>;
  nativeExport?: () => Promise<{ ok: boolean; error?: string }>;
  nativeImport?: () => Promise<{ ok: boolean; error?: string }>;
  getNativeVersion?: () => Promise<string | { error: string }>;
}

// ---- electronAPI (DB + window control) ----
const electronAPI: ElectronAPI = {
  closeApp: () => ipcRenderer.invoke("close-app"),
  closeWindow: () => ipcRenderer.invoke("close-window"),
  minimizeWindow: () => ipcRenderer.invoke("minimize-window"),
  maximizeWindow: () => ipcRenderer.invoke("maximize-window"),
  openNewWindow: (profileName?: string) =>
    ipcRenderer.invoke("window:new", profileName),
  unlockDB: (passphrase: string, accountKey?: string) => ipcRenderer.invoke("db:unlock", passphrase, accountKey),
  lockDB: () => ipcRenderer.invoke("db:lock"),
  resetVault: () => ipcRenderer.invoke("db:reset-vault"),
  getBackend: () => ipcRenderer.invoke("db:get-backend"),
  saveKeys: (bundle: unknown) => ipcRenderer.invoke("db:save-keys", bundle),
  getKeys: () => ipcRenderer.invoke("db:get-keys"),
  // Ratchet state per peer
  saveRatchet: (peerId: string, state: any) => ipcRenderer.invoke("db:ratchet-save", peerId, state),
  getRatchet: (peerId: string) => ipcRenderer.invoke("db:ratchet-get", peerId),
  // Local OPK store
  saveOPKs: (opks: Array<{ publicKeyB64: string; privateKeyB64?: string }>) => ipcRenderer.invoke("db:opk-save", opks),
  getOPKPriv: (pubB64: string) => ipcRenderer.invoke("db:opk-get-priv", pubB64),
  consumeOPK: (pubB64: string) => ipcRenderer.invoke("db:opk-consume", pubB64),
  saveSession: (peerId: string, sessionId: string, sharedAesKeyB64: string) =>
    ipcRenderer.invoke("db:session-save", peerId, sessionId, sharedAesKeyB64),
  getSession: (peerId: string) =>
    ipcRenderer.invoke("db:session-get", peerId),

  // Local message database
  localDBInit: (encryptionKey: string, userId: string, username: string) =>
    ipcRenderer.invoke("localdb:init", encryptionKey, userId, username),
  localDBSaveIncomingMessage: (senderId, senderUsername, plaintext, ciphertext, handshake, header, timestamp, serverId) =>
    ipcRenderer.invoke("localdb:save-incoming-message", senderId, senderUsername, plaintext, ciphertext, handshake, header, timestamp, serverId),
  localDBSaveOutgoingMessage: (recipientId, recipientUsername, plaintext, ciphertext, handshake, header, serverId) =>
    ipcRenderer.invoke("localdb:save-outgoing-message", recipientId, recipientUsername, plaintext, ciphertext, handshake, header, serverId),
  localDBGetConversationHistory: (otherUserId, limit, offset) =>
    ipcRenderer.invoke("localdb:get-conversation-history", otherUserId, limit, offset),
  localDBGetConversations: () =>
    ipcRenderer.invoke("localdb:get-conversations"),
  localDBSearchMessages: (query, limit) =>
    ipcRenderer.invoke("localdb:search-messages", query, limit),
  localDBNukeConversation: (otherUserId) =>
    ipcRenderer.invoke("localdb:nuke-conversation", otherUserId),
  localDBGetStats: () =>
    ipcRenderer.invoke("localdb:get-stats"),
  localDBVacuum: () =>
    ipcRenderer.invoke("localdb:vacuum"),

  onMainProcessMessage: (cb: MainMessageCallback) => {
    const listener = (_evt: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on("main-process-message", listener);
    return () => ipcRenderer.off("main-process-message", listener);
  },
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

// ---- electronCrypto (Signal wrappers) ----
const NATIVE_ON = process.env.PWNCHAT_NATIVE === '1';
const cryptoAPI: ElectronCryptoAPI = {
  generateIdentity: () => ipcRenderer.invoke("crypto:generate-identity"),
  nativeEnabled: NATIVE_ON,
  ...(NATIVE_ON
    ? {
        getNativeVersion: () => ipcRenderer.invoke('crypto:ls-version'),
        generateLSAccount: () => ipcRenderer.invoke("crypto:ls-generate-account"),
        getPreKeyBundle: () => ipcRenderer.invoke("crypto:ls-get-bundle"),
        processPreKeyBundle: (remote: unknown) =>
          ipcRenderer.invoke("crypto:ls-process-prekey", remote),
        lsEncrypt: (sessionId: string, plaintext: string) =>
          ipcRenderer.invoke("crypto:ls-encrypt", sessionId, plaintext),
        lsDecrypt: (sessionId: string, ciphertext: string) =>
          ipcRenderer.invoke("crypto:ls-decrypt", sessionId, ciphertext),
      }
    : {}),
  generateOneTimePreKeys: (count: number) => ipcRenderer.invoke("crypto:generate-prekeys", count),
  generateEphemeral: () => ipcRenderer.invoke("crypto:gen-ephemeral"),
  establishFromEnvelope: (priv, bundle, ephPubB64) => ipcRenderer.invoke("crypto:establish-from-envelope", priv, bundle, ephPubB64),
  establishWithEph: (priv, bundle, ephPrivB64) => ipcRenderer.invoke("crypto:establish-with-eph", priv, bundle, ephPrivB64),
  establishFromEnvelopeWithOpk: (priv, bundle, ephPubB64, opkPrivB64) => ipcRenderer.invoke("crypto:establish-from-envelope-opk", priv, bundle, ephPubB64, opkPrivB64),
  ratchetEncrypt: (ck, counter, pt) => ipcRenderer.invoke("crypto:ratchet-encrypt", ck, counter, pt),
  ratchetDecrypt: (ck, curN, n, ct) => ipcRenderer.invoke("crypto:ratchet-decrypt", ck, curN, n, ct),
  ratchetAdvance: (ck, fromN, toN) => ipcRenderer.invoke("crypto:ratchet-advance", ck, fromN, toN),
  decryptWithMessageKey: (mk, ct) => ipcRenderer.invoke("crypto:decrypt-mk", mk, ct),
  ratchetGenDh: () => ipcRenderer.invoke("crypto:ratchet-gen-dh"),
  ratchetDhSender: (root, myPriv, theirPub) => ipcRenderer.invoke("crypto:ratchet-dh-sender", root, myPriv, theirPub),
  ratchetDhReceiver: (root, myPriv, theirPub) => ipcRenderer.invoke("crypto:ratchet-dh-recv", root, myPriv, theirPub),
  establishSession: (privateMaterial, recipientBundle) =>
    ipcRenderer.invoke(
      "crypto:establish-session",
      privateMaterial,
      recipientBundle
    ),
  encryptMessage: (sessionId, plaintext) =>
    ipcRenderer.invoke("crypto:encrypt-message", sessionId, plaintext),
  decryptMessage: (sessionId, ciphertext) =>
    ipcRenderer.invoke("crypto:decrypt-message", sessionId, ciphertext),
  loadSessionKey: (sessionId, sharedAesKeyB64) => ipcRenderer.invoke("crypto:load-session-key", sessionId, sharedAesKeyB64), // New entry
  nativeExport: () => ipcRenderer.invoke('crypto:native-export'),
  nativeImport: () => ipcRenderer.invoke('crypto:native-import'),
};

contextBridge.exposeInMainWorld("electronCrypto", cryptoAPI);

// ---- Forward renderer console logs to main process (duplicate to stdout) ----
try {
  const levels = ["log", "info", "warn", "error"] as const;
  levels.forEach((level) => {
    const original = console[level];
    // @ts-ignore - index signature for console methods
    console[level] = (...args: unknown[]) => {
      try {
        ipcRenderer.send("renderer:console", { level, args });
      } catch {}
      // Call original so logs still appear in DevTools
      // @ts-ignore
      original.apply(console, args);
    };
  });
  // Global error catchers to forward to main logs
  window.addEventListener('error', (ev: any) => {
    try { ipcRenderer.send('renderer:console', { level: 'error', args: ['window.onerror:', ev?.error?.stack || String(ev?.message)] }); } catch {}
  });
  window.addEventListener('unhandledrejection', (ev: any) => {
    try { ipcRenderer.send('renderer:console', { level: 'error', args: ['unhandledrejection:', ev?.reason?.stack || String(ev?.reason)] }); } catch {}
  });
} catch {}
