import type { IpcMainInvokeEvent } from "electron";
import type { PrivateMaterial, RecipientBundle } from "../src/types/crypto";

import { app, BrowserWindow, screen, ipcMain, Menu, shell } from "electron";
import { join, resolve } from "node:path";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { format } from "node:util";



// Import the crypto bridge (dev) and only prefer native provider if explicitly enabled
let cryptoBridgeMod = require("./signal-bridge");
const NATIVE_ON = process.env.PWNCHAT_NATIVE === '1';
if (NATIVE_ON) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const native = require("./signal-native");
    if (native && native.hasNative) {
      console.log('[crypto] Using native libsignal provider');
      cryptoBridgeMod = native;
    } else {
      console.log('[crypto] Native libsignal provider unavailable; using dev bridge');
    }
  } catch (e) {
    console.log('[crypto] Native provider load failed; using dev bridge');
  }
} else {
  console.log('[crypto] Native provider disabled (PWNCHAT_NATIVE!=1); using dev bridge');
}

const generateSignalProtocolIdentity: (profile: string) => Promise<{
  publicBundle: { identityKeyPublicB64: string; identitySigningPublicB64?: string; signedPrekeyPublicB64?: string; signedPrekeySignatureB64?: string };
  privateMaterial: {
    identityKeyPrivateB64: string;
    identityKeyPublicB64: string;
    identitySigningPrivateB64?: string;
    identitySigningPublicB64?: string;
    signedPrekeyPrivateB64?: string;
    signedPrekeyPublicB64?: string;
    signedPrekeySignatureB64?: string;
  };
}> =
  cryptoBridgeMod.generateSignalProtocolIdentity ??
  cryptoBridgeMod.default?.generateSignalProtocolIdentity;

const establishSession: (
  profile: string,
  privateMaterial: PrivateMaterial,
  recipientBundle: RecipientBundle
) => Promise<{ success: boolean; sessionId: string; sharedAesKeyB64?: string }> =
  cryptoBridgeMod.establishSession ?? cryptoBridgeMod.default?.establishSession;

// New: loadSessionKey from bridge so sessions can be restored from backend
const loadSessionKey: (profile: string, sessionId: string, sharedAesKeyB64: string) => Promise<void> =
  cryptoBridgeMod.loadSessionKey ?? cryptoBridgeMod.default?.loadSessionKey;

const generateOneTimePreKeys: (profile: string, count: number) => Promise<Array<{ publicKeyB64: string }>> =
  cryptoBridgeMod.generateOneTimePreKeys ?? cryptoBridgeMod.default?.generateOneTimePreKeys;

const encryptMessage: (
  profile: string,
  sessionId: string,
  plaintext: string
) => Promise<{ ciphertext: string }> =
  cryptoBridgeMod.encryptMessage ?? cryptoBridgeMod.default?.encryptMessage;

const decryptMessage: (
  profile: string,
  sessionId: string,
  ciphertext: string
) => Promise<{ plaintext: string }> =
  cryptoBridgeMod.decryptMessage ?? cryptoBridgeMod.default?.decryptMessage;

// Handshake envelope helpers (optional)
const generateEphemeralX25519: (profile: string) => Promise<{ ephPubB64: string; ephPrivB64: string }> =
  cryptoBridgeMod.generateEphemeralX25519 ?? cryptoBridgeMod.default?.generateEphemeralX25519;
const establishFromEnvelope: (
  profile: string,
  privateMaterial: PrivateMaterial,
  senderBundle: RecipientBundle,
  ephPubB64: string
) => Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }> =
  cryptoBridgeMod.establishSessionFromEnvelope ?? cryptoBridgeMod.default?.establishSessionFromEnvelope;

// Optional: envelope with OPK
const establishFromEnvelopeWithOpk: (
  profile: string,
  privateMaterial: PrivateMaterial,
  senderBundle: RecipientBundle,
  ephPubB64: string,
  opkPrivB64: string
) => Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }> =
  cryptoBridgeMod.establishFromEnvelopeWithOpk ?? cryptoBridgeMod.default?.establishFromEnvelopeWithOpk;

if (
  !generateSignalProtocolIdentity ||
  !establishSession ||
  !encryptMessage ||
  !decryptMessage ||
  !loadSessionKey
) {
  throw new Error(
    "[signal-bridge] Missing crypto functions. Exported keys: " +
      Object.keys(cryptoBridgeMod).join(", ")
  );
}

const isDev = process.env.NODE_ENV !== "production";
let win: BrowserWindow | null = null;

function resolvePreloadPath(): string {
  return isDev
    ? resolve(process.cwd(), "dist-electron/preload.cjs")
    : join(__dirname, "preload.cjs");
}

function resolveIndexHtmlPath(): string {
  return join(__dirname, "../dist/index.html");
}

// Single instance + perf tweaks
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) app.quit();
// Keep hardware acceleration enabled for smooth UI effects

async function createWindow(partition?: string) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const W = Math.floor(sw * 0.7);
  const H = Math.floor(sh * 0.7);

  win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true,
    frame: false,
    transparent: false, // better perf than transparent windows
    backgroundColor: "#111111",
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(), // built CJS preload
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Allow isolated storage (cookies/localStorage) per window when specified
      ...(partition ? { partition } : {})
    },
  });

  ipcMain.on("window:close", () => win?.close());
  ipcMain.on("window:minimize", () => win?.minimize());
  ipcMain.on("window:maximize", () => {
    win?.isMaximized() ? win.unmaximize() : win?.maximize();
  });

  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);

  win.once("ready-to-show", () => {
    win!.center();
    win!.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    // Retry until Vite dev server is up
    for (let i = 0; i < 40; i++) {
      try {
        await win.loadURL("http://localhost:5173");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    await win.loadFile(resolveIndexHtmlPath());
  }

}

// ---- IPC: Crypto ----
app.whenReady().then(async () => {
  // Dev-only logging setup
  if (isDev) {
    try {
      const logDir = resolve(process.cwd(), "devtool-logs");
      await mkdir(logDir, { recursive: true });
      const logFile = join(logDir, `devtool-${Date.now()}.log`);
      const stream = createWriteStream(logFile, { flags: "a" });
      const logToFile = (message: string) => stream.write(message + "\n");

      // Redirect main process console to file and stdout
      const mainConsole = { ...console };
      const writer = (channel: "stdout" | "stderr", ...args: unknown[]) => {
        const formatted = format(...args);
        logToFile(`[main-${channel}] ${formatted}`);
        mainConsole[channel === "stdout" ? "log" : "error"](formatted);
      };
      console.log = (...args) => writer("stdout", ...args);
      console.error = (...args) => writer("stderr", ...args);
      console.warn = (...args) => writer("stderr", "WARN:", ...args);
      console.info = (...args) => writer("stdout", "INFO:", ...args);

      // Listen for forwarded renderer console logs
      ipcMain.on(
        "renderer:console",
        (_evt, payload: { level: string; args: unknown[] }) => {
          const { level, args } = payload || { level: "log", args: [] };
          const tag = `[renderer:${String(_evt?.sender?.id ?? "?")}]`;
          logToFile(format(tag, level.toUpperCase(), ...args));
        }
      );

      console.log(`Logging to ${logFile}`);
    } catch (err) {
      console.error("Could not create log file:", err);
    }
  }

  // Register global IPC handlers once

  try {
    ipcMain.handle("app:getVersion", () => app.getVersion());
  } catch {}

  
  ipcMain.handle("crypto:generate-identity", async (evt) => {
    const profile = evt.sender?.session?.getPartition?.() || "default";
    return await generateSignalProtocolIdentity(profile);
  });

  ipcMain.handle(
    "crypto:establish-session",
    async (
      evt: IpcMainInvokeEvent,
      privateMaterial: PrivateMaterial,
      recipientBundle: RecipientBundle
    ) => {
      const profile = evt.sender?.session?.getPartition?.() || "default";
      return establishSession(profile, privateMaterial, recipientBundle);
    }
  );

  ipcMain.handle(
    "crypto:encrypt-message",
    async (
      evt: IpcMainInvokeEvent,
      sessionId: string,
      plaintext: string
    ) => {
      const profile = evt.sender?.session?.getPartition?.() || "default";
      return encryptMessage(profile, sessionId, plaintext);
    }
  );

  ipcMain.handle(
    "crypto:decrypt-message",
    async (
      evt: IpcMainInvokeEvent,
      sessionId: string,
      ciphertext: string
    ) => {
      const profile = evt.sender?.session?.getPartition?.() || "default";
      return decryptMessage(profile, sessionId, ciphertext);
    }
  );

  if (typeof generateEphemeralX25519 === 'function') {
    ipcMain.handle(
      "crypto:gen-ephemeral",
      async (evt: IpcMainInvokeEvent) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return generateEphemeralX25519(profile);
      }
    );
  }

  if (typeof establishFromEnvelope === 'function') {
    ipcMain.handle(
      "crypto:establish-from-envelope",
      async (
        evt: IpcMainInvokeEvent,
        privateMaterial: PrivateMaterial,
        senderBundle: RecipientBundle,
        ephPubB64: string
      ) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return establishFromEnvelope(profile, privateMaterial, senderBundle, ephPubB64);
      }
    );
  }

  // Initiator: establish using ephemeral (no OPK)
  if (typeof (cryptoBridgeMod.establishSessionWithEph) === 'function') {
    ipcMain.handle(
      "crypto:establish-with-eph",
      async (
        evt: IpcMainInvokeEvent,
        privateMaterial: PrivateMaterial,
        recipientBundle: RecipientBundle,
        ephPrivB64: string
      ) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return cryptoBridgeMod.establishSessionWithEph(profile, privateMaterial, recipientBundle, ephPrivB64);
      }
    );
  }

  if (typeof establishFromEnvelopeWithOpk === 'function') {
    ipcMain.handle(
      "crypto:establish-from-envelope-opk",
      async (
        evt: IpcMainInvokeEvent,
        privateMaterial: PrivateMaterial,
        senderBundle: RecipientBundle,
        ephPubB64: string,
        opkPrivB64: string
      ) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return establishFromEnvelopeWithOpk(profile, privateMaterial, senderBundle, ephPubB64, opkPrivB64);
      }
    );
  }

  // Libsignal-native specific surface: only register when explicitly enabled
  if (NATIVE_ON) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ls = require("./signal-native");
      ipcMain.handle(
        "crypto:ls-version",
        async () => {
          try { return await ls.version?.(); } catch (e:any) { return { error: String(e?.message || e) }; }
        }
      );
      ipcMain.handle(
        "crypto:ls-generate-account",
        async (_evt: IpcMainInvokeEvent) => {
          try { return await ls.generateAccount(); } catch (e:any) { return { error: String(e?.message || e) }; }
        }
      );
      ipcMain.handle(
        "crypto:ls-get-bundle",
        async (_evt: IpcMainInvokeEvent) => {
          try { return await ls.getPublicBundle(); } catch (e:any) { return { error: String(e?.message || e) }; }
        }
      );
      ipcMain.handle(
        "crypto:ls-process-prekey",
        async (_evt: IpcMainInvokeEvent, remoteBundle: unknown) => {
          try { return await ls.processPreKeyBundle(remoteBundle); } catch (e:any) { return { error: String(e?.message || e) }; }
        }
      );
      ipcMain.handle(
        "crypto:ls-encrypt",
        async (_evt: IpcMainInvokeEvent, sessionId: string, plaintext: string) => {
          try { return await ls.encryptMessage(undefined, sessionId, plaintext); } catch (e:any) { return { error: String(e?.message || e) }; }
        }
      );
      ipcMain.handle(
        "crypto:ls-decrypt",
        async (_evt: IpcMainInvokeEvent, sessionId: string, ciphertext: string) => {
          try { return await ls.decryptMessage(undefined, sessionId, ciphertext); } catch (e:any) { return { error: String(e?.message || e) }; }
        }
      );
    } catch {}
  }

  // Ratchet crypto helpers
  if (typeof (cryptoBridgeMod.ratchetEncrypt) === 'function') {
    ipcMain.handle(
      "crypto:ratchet-encrypt",
      async (evt: IpcMainInvokeEvent, chainKeyB64: string, counter: number, plaintext: string) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return cryptoBridgeMod.ratchetEncrypt(profile, chainKeyB64, counter, plaintext);
      }
    );
  }
  if (typeof (cryptoBridgeMod.ratchetDecrypt) === 'function') {
    ipcMain.handle(
      "crypto:ratchet-decrypt",
      async (evt: IpcMainInvokeEvent, chainKeyB64: string, currentCounter: number, msgCounter: number, ciphertext: string) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return cryptoBridgeMod.ratchetDecrypt(profile, chainKeyB64, currentCounter, msgCounter, ciphertext);
      }
    );
  }
  if (typeof (cryptoBridgeMod.generateRatchetDH) === 'function') {
    ipcMain.handle(
      "crypto:ratchet-gen-dh",
      async (evt: IpcMainInvokeEvent) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return cryptoBridgeMod.generateRatchetDH(profile);
      }
    );
  }
  if (typeof (cryptoBridgeMod.dhRatchetStepSender) === 'function') {
    ipcMain.handle(
      "crypto:ratchet-dh-sender",
      async (evt: IpcMainInvokeEvent, rootKeyB64: string, myNewDhPrivB64: string, theirDhPubB64: string) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return cryptoBridgeMod.dhRatchetStepSender(profile, rootKeyB64, myNewDhPrivB64, theirDhPubB64);
      }
    );
  }
  if (typeof (cryptoBridgeMod.dhRatchetStepReceiver) === 'function') {
    ipcMain.handle(
      "crypto:ratchet-dh-recv",
      async (evt: IpcMainInvokeEvent, rootKeyB64: string, myDhPrivB64: string, theirNewDhPubB64: string) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return cryptoBridgeMod.dhRatchetStepReceiver(profile, rootKeyB64, myDhPrivB64, theirNewDhPubB64);
      }
    );
  }
  if (typeof (cryptoBridgeMod.ratchetAdvance) === 'function') {
    ipcMain.handle(
      "crypto:ratchet-advance",
      async (evt: IpcMainInvokeEvent, chainKeyB64: string, fromN: number, toN: number) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return cryptoBridgeMod.ratchetAdvance(profile, chainKeyB64, fromN, toN);
      }
    );
  }
  if (typeof (cryptoBridgeMod.decryptWithMessageKey) === 'function') {
    ipcMain.handle(
      "crypto:decrypt-mk",
      async (evt: IpcMainInvokeEvent, mkB64: string, ciphertext: string) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return cryptoBridgeMod.decryptWithMessageKey(profile, mkB64, ciphertext);
      }
    );
  }

  ipcMain.handle ( // New handler
    "crypto:load-session-key",
    async (
      evt: IpcMainInvokeEvent,
      sessionId: string,
      sharedAesKeyB64: string
    ) => {
      const profile = evt.sender?.session?.getPartition?.() || "default";
      return loadSessionKey(profile, sessionId, sharedAesKeyB64);
    }
  );

  if (typeof generateOneTimePreKeys === 'function') {
    ipcMain.handle(
      "crypto:generate-prekeys",
      async (evt: IpcMainInvokeEvent, count: number) => {
        const profile = evt.sender?.session?.getPartition?.() || "default";
        return generateOneTimePreKeys(profile, count);
      }
    );
  }

  // Optional: native libsignal state export/import via vault
  ipcMain.handle(
    "crypto:native-export",
    async (evt: IpcMainInvokeEvent) => {
      const profile = evt.sender?.session?.getPartition?.() || 'default';
      try {
        let stateJson: string | null = null;
        if (typeof (cryptoBridgeMod.exportState) === 'function') {
          try { stateJson = await cryptoBridgeMod.exportState(profile); } catch { try { stateJson = await cryptoBridgeMod.exportState(); } catch {} }
        }
        if (stateJson) {
          const { vaultProfile } = await import('./vault');
          await vaultProfile.saveNativeState(String(profile), stateJson as string);
        }
        return { ok: true as const };
      } catch (e:any) {
        console.warn('[native] export failed:', e?.message || e);
        return { ok: false as const, error: String(e?.message || e) };
      }
    }
  );
  ipcMain.handle(
    "crypto:native-import",
    async (evt: IpcMainInvokeEvent) => {
      const profile = evt.sender?.session?.getPartition?.() || 'default';
      try {
        const { vaultProfile } = await import('./vault');
        const stateJson = await vaultProfile.getNativeState(String(profile));
        if (stateJson && typeof (cryptoBridgeMod.importState) === 'function') {
          try { await cryptoBridgeMod.importState(profile, stateJson); } catch { await cryptoBridgeMod.importState(stateJson); }
        }
        return { ok: true as const };
      } catch (e:any) {
        console.warn('[native] import failed:', e?.message || e);
        return { ok: false as const, error: String(e?.message || e) };
      }
    }
  );

  // ---- IPC: Local Message Database (SQLCipher) ----
  const { localDB } = await import("./local-db");
  let currentUserId: string | null = null;
  let currentUsername: string | null = null;

  ipcMain.handle("localdb:init", async (evt, encryptionKey: string, userId: string, username: string) => {
    try {
      await localDB.initialize(encryptionKey);
      currentUserId = userId;
      currentUsername = username;
      return { success: true };
    } catch (error: any) {
      console.error('[LocalDB] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("localdb:save-incoming-message", async (
    evt,
    senderId: string,
    senderUsername: string,
    plaintext: string,
    ciphertext: string,
    handshake?: any,
    header?: any,
    timestamp?: string,
    serverId?: string
  ) => {
    try {
      if (!currentUserId || !currentUsername) throw new Error("Database not initialized with user info");

      const messageId = await localDB.saveMessage({
        sender_id: senderId,
        recipient_id: currentUserId,
        sender_username: senderUsername,
        recipient_username: currentUsername,
        plaintext,
        ciphertext,
        handshake_json: handshake,
        header_json: header,
        created_at: timestamp || new Date().toISOString()
      }, serverId);
      return { success: true, messageId };
    } catch (error: any) {
      console.error('[LocalDB] Failed to save incoming message:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("localdb:save-outgoing-message", async (
    evt,
    recipientId: string,
    recipientUsername: string,
    plaintext: string,
    ciphertext: string,
    handshake?: any,
    header?: any,
    serverId?: string
  ) => {
    try {
      if (!currentUserId || !currentUsername) throw new Error("Database not initialized with user info");

      const messageId = await localDB.saveOutgoingMessage(
        currentUserId,
        currentUsername,
        recipientId,
        recipientUsername,
        plaintext,
        ciphertext,
        handshake,
        header,
        serverId
      );
      return { success: true, messageId };
    } catch (error: any) {
      console.error('[LocalDB] Failed to save outgoing message:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("localdb:get-conversation-history", async (
    evt,
    otherUserId: string,
    limit?: number,
    offset?: number
  ) => {
    try {
      if (!currentUserId) throw new Error("Database not initialized with user info");

      const messages = await localDB.getConversationHistory(
        currentUserId,
        otherUserId,
        limit || 50,
        offset || 0
      );
      return { success: true, messages };
    } catch (error: any) {
      console.error('[LocalDB] Failed to get conversation history:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("localdb:get-conversations", async (evt) => {
    try {
      if (!currentUserId) throw new Error("Database not initialized with user info");

      const conversations = await localDB.getConversations(currentUserId);
      return { success: true, conversations };
    } catch (error: any) {
      console.error('[LocalDB] Failed to get conversations:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("localdb:search-messages", async (
    evt,
    query: string,
    limit?: number
  ) => {
    try {
      if (!currentUserId) throw new Error("Database not initialized with user info");

      const messages = await localDB.searchMessages(currentUserId, query, limit || 20);
      return { success: true, messages };
    } catch (error: any) {
      console.error('[LocalDB] Failed to search messages:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("localdb:nuke-conversation", async (
    evt,
    otherUserId: string
  ) => {
    try {
      if (!currentUserId) throw new Error("Database not initialized with user info");

      await localDB.nukeConversation(currentUserId, otherUserId);
      return { success: true };
    } catch (error: any) {
      console.error('[LocalDB] Failed to nuke conversation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("localdb:get-stats", async (evt) => {
    try {
      const stats = await localDB.getStats();
      return { success: true, stats };
    } catch (error: any) {
      console.error('[LocalDB] Failed to get stats:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle("localdb:vacuum", async (evt) => {
    try {
      await localDB.vacuum();
      return { success: true };
    } catch (error: any) {
      console.error('[LocalDB] Failed to vacuum database:', error);
      return { success: false, error: error.message };
    }
  });

  // ---- IPC: Window control ----
  ipcMain.handle("close-app", async () => {
    // Close database before quitting
    localDB.close();
    app.quit();
  });
  ipcMain.handle("close-window", async () => win?.close());
  ipcMain.handle("minimize-window", async () => win?.minimize());
  ipcMain.handle("maximize-window", async () => {
    if (win?.isMaximized()) {
      win?.restore();
    } else {
      win?.maximize();
    }
  });

  // ---- IPC: Secure keystore (argon2id + AES-GCM) ----
  const { vault } = await import("./vault");

  ipcMain.handle("db:unlock", async (evt, passphrase: string, accountKey?: string) => {
    const profile = evt.sender?.session?.getPartition?.() || "default";
    const res = await vault.unlock(passphrase, String(profile), accountKey ? String(accountKey) : undefined);
    // Attempt to hydrate native/libsignal state for this profile
    try {
      const { vaultProfile } = await import("./vault");
      const stateJson = await vaultProfile.getNativeState(String(profile));
      if (stateJson && (typeof (cryptoBridgeMod.importState) === 'function')) {
        try { await cryptoBridgeMod.importState(profile, stateJson); } catch { await cryptoBridgeMod.importState(stateJson); }
      }
    } catch (e:any) {
      console.warn('[native] auto-import on unlock failed:', e?.message || e);
    }
    return res;
  });

  ipcMain.handle("db:save-keys", async (evt, bundle: PrivateMaterial) => {
    const profile = evt.sender?.session?.getPartition?.() || "default";
    const { vaultProfile } = await import("./vault");
    return vaultProfile.saveKeys(bundle, String(profile));
  });

  ipcMain.handle("db:get-keys", async (evt) => {
    const profile = evt.sender?.session?.getPartition?.() || "default";
    const { vaultProfile } = await import("./vault");
    return vaultProfile.getKeys(String(profile));
  });

  ipcMain.handle("db:lock", async (evt) => {
    const profile = evt.sender?.session?.getPartition?.() || "default";
    // Persist native/libsignal state before locking
    try {
      let stateJson: string | null = null;
      if (typeof (cryptoBridgeMod.exportState) === 'function') {
        try { stateJson = await cryptoBridgeMod.exportState(profile); } catch { stateJson = await cryptoBridgeMod.exportState(); }
      }
      if (stateJson) {
        const { vaultProfile } = await import('./vault');
        await vaultProfile.saveNativeState(String(profile), stateJson);
      }
    } catch (e:any) {
      console.warn('[native] auto-export on lock failed:', e?.message || e);
    }
    await vault.lock(String(profile));
    return { ok: true as const };
  });

  ipcMain.handle("db:reset-vault", async (evt) => {
    const profile = evt.sender?.session?.getPartition?.() || "default";
    const { resetProfileVault } = await import("./vault");
    return resetProfileVault(String(profile));
  });

  ipcMain.handle("db:get-backend", async (evt) => {
    const profile = evt.sender?.session?.getPartition?.() || "default";
    const { vaultProfile } = await import("./vault");
    const backend = vaultProfile.getBackend(String(profile));
    return { backend };
  });

  // Ratchet state persistence
  ipcMain.handle(
    "db:ratchet-save",
    async (evt: IpcMainInvokeEvent, peerId: string, state: any) => {
      const profile = evt.sender?.session?.getPartition?.() || "default";
      const { vaultProfile } = await import("./vault");
      return vaultProfile.saveRatchetState(String(profile), peerId, state);
    }
  );
  ipcMain.handle(
    "db:ratchet-get",
    async (evt: IpcMainInvokeEvent, peerId: string) => {
      const profile = evt.sender?.session?.getPartition?.() || "default";
      const { vaultProfile } = await import("./vault");
      return vaultProfile.getRatchetState(String(profile), peerId);
    }
  );

  // Local session storage for E2EE (per peer)
  ipcMain.handle(
    "db:session-save",
    async (evt: IpcMainInvokeEvent, peerId: string, sessionId: string, sharedAesKeyB64: string) => {
      const profile = evt.sender?.session?.getPartition?.() || "default";
      const { vaultProfile } = await import("./vault");
      return vaultProfile.saveSession(peerId, sessionId, sharedAesKeyB64, String(profile));
    }
  );
  ipcMain.handle(
    "db:session-get",
    async (evt: IpcMainInvokeEvent, peerId: string) => {
      const profile = evt.sender?.session?.getPartition?.() || "default";
      return vault.getSession(peerId, String(profile));
    }
  );

  // Local OPK store
  ipcMain.handle(
    "db:opk-save",
    async (evt: IpcMainInvokeEvent, opks: Array<{ publicKeyB64: string; privateKeyB64?: string }>)=>{
      const profile = evt.sender?.session?.getPartition?.() || 'default';
      const { vaultProfile } = await import('./vault');
      return vaultProfile.saveOPKs(String(profile), opks);
    }
  );
  ipcMain.handle(
    "db:opk-get-priv",
    async (evt: IpcMainInvokeEvent, pubB64: string) => {
      const profile = evt.sender?.session?.getPartition?.() || 'default';
      const { vaultProfile } = await import('./vault');
      return vaultProfile.getOPKPriv(String(profile), pubB64);
    }
  );
  ipcMain.handle(
    "db:opk-consume",
    async (evt: IpcMainInvokeEvent, pubB64: string) => {
      const profile = evt.sender?.session?.getPartition?.() || 'default';
      const { vaultProfile } = await import('./vault');
      return vaultProfile.consumeOPK(String(profile), pubB64);
    }
  );

  setTimeout(() => {
    win?.webContents.send("main-process-message", { type: "app:ready" });
  }, 300);

  await createWindow();

  // Allow renderer to request a new window within the same instance
  ipcMain.handle("window:new", async (_evt, profileName?: string) => {
    // If a profile name is provided, use a persistent partition to isolate storage
    const partition = profileName ? `persist:${profileName}` : undefined;
    await createWindow(partition);
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Best-effort: export native state for all open profiles before quitting
app.on('before-quit', async () => {
  try {
    const wins = BrowserWindow.getAllWindows();
    const profiles = new Set<string>();
    for (const w of wins) {
      const p = (w?.webContents?.session as any)?.getPartition?.() || 'default';
      profiles.add(String(p));
    }
    for (const profile of profiles) {
      try {
        let stateJson: string | null = null;
        if (typeof (cryptoBridgeMod.exportState) === 'function') {
          try { stateJson = await cryptoBridgeMod.exportState(profile); } catch { stateJson = await cryptoBridgeMod.exportState(); }
        }
        if (stateJson) {
          const { vaultProfile } = await import('./vault');
          await vaultProfile.saveNativeState(String(profile), stateJson);
        }
      } catch (e:any) {
        console.warn('[native] before-quit export failed for profile', profile, e?.message || e);
      }
    }
  } catch {}
});

process.on("uncaughtException", (err) => {
  console.error("[main] uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[main] unhandledRejection:", reason);
});
