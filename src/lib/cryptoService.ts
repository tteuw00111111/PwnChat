import { keyAPI } from "../utils/api";
import type {
  RecipientBundle,
  PrivateMaterial,
  PublicBundle,
  EncryptedMessage,
} from "../types/crypto";
import { ACCESS_TOKEN_KEY } from "../utils/api";
import { jwtDecode } from "jwt-decode";

// --- Module-level cache for our own private keys ---
let myPrivateMaterial: PrivateMaterial | null = null;

async function ensureIdentity(): Promise<void> {
  if (!myPrivateMaterial) {
    try {
      const k = await window.electronAPI.getKeys();
      if (k && k.identityKeyPublicB64 && k.identityKeyPrivateB64) {
        myPrivateMaterial = k as any;
      }
    } catch {}
  }
}

// Local helpers (renderer-safe)
const b64ToU8 = (s: string): Uint8Array => {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
};
const u8ToB64 = (u: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin);
};

const MAX_SKIPPED_KEYS = 2000;
const MAX_JUMP_AHEAD = 2000;

function computeRoleAFromKeys(my: PrivateMaterial | null, peer: RecipientBundle | null): boolean {
  try {
    // Support both dev and native bundle shapes
    const a = String((my as any)?.identityKeyPublicB64 || (my as any)?.identityKeyB64 || '');
    const b = String((peer as any)?.identityKeyPublicB64 || (peer as any)?.identityKeyB64 || '');
    if (!a || !b) return true; // deterministic fallback will be applied elsewhere if needed
    return a < b;
  } catch {
    return true;
  }
}

async function deriveInitialChainsFromShared(sharedB64: string, roleASends: boolean) {
  const base = b64ToU8(sharedB64);
  const te = new TextEncoder();
  const labelA = te.encode('pwnchat-ck-a');
  const labelB = te.encode('pwnchat-ck-b');
  const bufA = new Uint8Array(base.length + labelA.length);
  bufA.set(base, 0); bufA.set(labelA, base.length);
  const bufB = new Uint8Array(base.length + labelB.length);
  bufB.set(base, 0); bufB.set(labelB, base.length);
  const dA = new Uint8Array(await window.crypto.subtle.digest('SHA-256', bufA));
  const dB = new Uint8Array(await window.crypto.subtle.digest('SHA-256', bufB));
  return roleASends
    ? { sendCKB64: u8ToB64(dA), recvCKB64: u8ToB64(dB) }
    : { sendCKB64: u8ToB64(dB), recvCKB64: u8ToB64(dA) };
}

async function getRecipientBundle(username: string): Promise<RecipientBundle> {
  if (!username) throw new Error("Invalid recipient: username is undefined");
  const bundle = await keyAPI.getBundle(username);
  if (!bundle) throw new Error(`Could not fetch key bundle for user ${username}`);
  return bundle;
}

async function getSession(
  recipientId: string,
  bundle: RecipientBundle
): Promise<{ sessionId: string; sharedAesKeyB64: string }> {
  const privateMaterial = cryptoService.getIdentity();
  if (!privateMaterial) {
    throw new Error("Cannot get session: private material not available.");
  }

  const existing = await window.electronAPI.getSession(recipientId);
  if (existing && existing.sessionId && existing.sharedAesKeyB64) {
    await window.electronCrypto.loadSessionKey(existing.sessionId, existing.sharedAesKeyB64);
    return existing;
  }

  const establishResult = await window.electronCrypto.establishSession(privateMaterial, bundle);
  if (!establishResult || !establishResult.sessionId || !establishResult.sharedAesKeyB64) {
    throw new Error("Failed to establish session via bridge.");
  }

  await window.electronAPI.saveSession(
    recipientId,
    establishResult.sessionId,
    establishResult.sharedAesKeyB64
  );
  
  await window.electronCrypto.loadSessionKey(establishResult.sessionId, establishResult.sharedAesKeyB64);

  return { sessionId: establishResult.sessionId, sharedAesKeyB64: establishResult.sharedAesKeyB64 };
}

export const cryptoService = {
  async initIdentity(): Promise<void> {
    // Prefer native/libsignal if available
    if (typeof (window as any).electronCrypto?.generateLSAccount === 'function') {
      console.log('[CryptoService] Using native libsignal account bootstrap');
      const acc = await (window as any).electronCrypto.generateLSAccount();
      if ((acc as any)?.error) throw new Error((acc as any).error);
      const bundle = {
        registrationId: acc.registrationId,
        identityKeyB64: acc.identityKeyB64,
        signedPreKey: acc.signedPreKey,
        ...(Array.isArray(acc.oneTimePreKeys) && acc.oneTimePreKeys.length
          ? { oneTimePreKey: { id: acc.oneTimePreKeys[0].id ?? 1, pubB64: acc.oneTimePreKeys[0].pubB64 || acc.oneTimePreKeys[0].publicKeyB64 } }
          : {}),
      } as any;
      await keyAPI.uploadBundle(bundle as any);
      try {
        if (Array.isArray((acc as any).oneTimePreKeys) && (acc as any).oneTimePreKeys.length > 0) {
          const mapped = (acc as any).oneTimePreKeys.map((k: any) => ({ publicKeyB64: k.pubB64 || k.publicKeyB64 }));
          try { await window.electronAPI.saveOPKs?.(mapped as any); } catch {}
          try { await keyAPI.topUpPrekeys(mapped); } catch {}
        }
      } catch {}
      myPrivateMaterial = null; // native handles keys internally
      console.log('[CryptoService] Native account ready.');
      // optionally export native state via preload if needed; main handles auto-export on lock
      return;
    }

    // Dev bridge fallback
    const loadedMaterial = await window.electronAPI.getKeys();
    const isRaw32 = (b64?: string) => {
      if (!b64 || typeof b64 !== 'string') return false;
      try { return atob(b64).length === 32; } catch { return false; }
    };
    if (loadedMaterial && isRaw32(loadedMaterial.identityKeyPrivateB64) && isRaw32(loadedMaterial.identityKeyPublicB64)) {
      myPrivateMaterial = loadedMaterial;
      console.log("[CryptoService] Loaded existing identity.");
    } else {
      if (loadedMaterial) console.warn('[CryptoService] Invalid identity in vault (migrating).');
      console.log("[CryptoService] Generating new identity...");
      const { privateMaterial, publicBundle } = await window.electronCrypto.generateIdentity();
      await window.electronAPI.saveKeys(privateMaterial);
      await keyAPI.uploadBundle(publicBundle);
      myPrivateMaterial = privateMaterial;
      console.log("[CryptoService] New identity generated and saved.");
    }

    try {
      const lastTopUp = Number(localStorage.getItem('pwnchat_prekeys_last_topup') || '0');
      const now = Date.now();
      if (!lastTopUp || (now - lastTopUp) > 12 * 60 * 60 * 1000) {
        if (typeof window.electronCrypto?.generateOneTimePreKeys === 'function') {
          const batch = await window.electronCrypto.generateOneTimePreKeys(30);
          await window.electronAPI.saveOPKs?.(batch);
          await keyAPI.topUpPrekeys(batch.map(k => ({ publicKeyB64: k.publicKeyB64 })));
          localStorage.setItem('pwnchat_prekeys_last_topup', String(now));
        }
      }
    } catch (e) {
      console.warn('[CryptoService] Auto prekey top-up skipped:', e);
    }
  },

  getIdentity(): PrivateMaterial | null {
    return myPrivateMaterial;
  },

  async warmUpSession(username: string, userId: string): Promise<void> {
    console.log(`[CryptoService] Warming up session with ${username}`);
    await ensureIdentity();
    // Native path: ensure a libsignal session exists by processing the peer bundle.
    if (typeof (window as any).electronCrypto?.processPreKeyBundle === 'function') {
      try {
        const bundle = await getRecipientBundle(username);
        const res = await (window as any).electronCrypto.processPreKeyBundle(bundle);
        if ((res as any)?.error) throw new Error(String((res as any).error));
        console.log('[CryptoService] Native session ready for', username);
        return;
      } catch (e) {
        console.warn('[CryptoService] Native warmup failed; will rely on decrypt to create:', e);
        return;
      }
    }

    // Dev bridge warm-up (ratchet init)
    const bundle = await getRecipientBundle(username);
    const s = await getSession(userId, bundle);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[CryptoService] Session primed for ${username}`);
    }
    try {
      const rs = await window.electronAPI.getRatchet?.(userId);
      const roleA = computeRoleAFromKeys(myPrivateMaterial, bundle);
      const { sendCKB64, recvCKB64 } = await deriveInitialChainsFromShared(s.sharedAesKeyB64, roleA);
      if (!rs || rs.sessionId !== s.sessionId || ((rs.sendCount || 0) === 0 && (rs.recvCount || 0) === 0 && (rs.sendCKB64 !== sendCKB64 || rs.recvCKB64 !== recvCKB64))) {
        await window.electronAPI.saveRatchet?.(userId, { sessionId: s.sessionId, rootKeyB64: s.sharedAesKeyB64, sendCKB64, recvCKB64, sendCount: 0, recvCount: 0 });
        console.log('[CryptoService] Ratchet primed for', username);
      }
    } catch {}
  },

  async encrypt(
    recipient: { username: string; id: string },
    plaintext: string
  ): Promise<{ ciphertext: string; header?: any; handshake?: any }> {
    await ensureIdentity();
    // Native libsignal path
    if (typeof (window as any).electronCrypto?.lsEncrypt === 'function' && typeof (window as any).electronCrypto?.processPreKeyBundle === 'function') {
      const peerBundle = await getRecipientBundle(recipient.username);
      // Ensure we have a session for the peer (idempotent)
      const pr = await (window as any).electronCrypto.processPreKeyBundle(peerBundle);
      if ((pr as any)?.error) throw new Error('session-setup-failed: ' + (pr as any).error);
      // Use peer identity as session key when mapping is not established
      const sidOrName = peerBundle.identityKeyB64 || recipient.username;
      const enc = await (window as any).electronCrypto.lsEncrypt(sidOrName, plaintext);
      if (!enc || !(enc as any).ciphertext) throw new Error((enc as any)?.error || 'encrypt-failed');
      return { ciphertext: (enc as any).ciphertext };
    }

    const bundle = await getRecipientBundle(recipient.username);
    const session = await getSession(recipient.id, bundle);
    let handshake: any | undefined = undefined;

    let rs = await window.electronAPI.getRatchet?.(recipient.id);
    const roleA = computeRoleAFromKeys(myPrivateMaterial, bundle);
    const init = await deriveInitialChainsFromShared(session.sharedAesKeyB64, roleA);
    if (!rs || rs.sessionId !== session.sessionId || ((rs.sendCount || 0) === 0 && (rs.recvCount || 0) === 0 && (rs.sendCKB64 !== init.sendCKB64 || rs.recvCKB64 !== init.recvCKB64))) {
      try { console.log(`[CryptoService] init ratchet: roleA=${roleA}, sendCK=${init.sendCKB64.slice(0,8)}..., recvCK=${init.recvCKB64.slice(0,8)}...`); } catch {}
      rs = { sessionId: session.sessionId, rootKeyB64: session.sharedAesKeyB64, sendCKB64: init.sendCKB64, recvCKB64: init.recvCKB64, sendCount: 0, recvCount: 0, skipped: {} };
      await window.electronAPI.saveRatchet?.(recipient.id, rs);
    }

    const out = await window.electronCrypto.ratchetEncrypt(rs.sendCKB64, rs.sendCount, plaintext);
    const header: any = { n: out.header.n };

    const newState = { ...rs, sendCKB64: out.nextCKB64, sendCount: rs.sendCount + 1 };
    await window.electronAPI.saveRatchet?.(recipient.id, newState);

    return { ciphertext: out.ciphertext, header, handshake };
  },

  async decrypt(
    sender: { username: string; id: string },
    ciphertext: EncryptedMessage
  ): Promise<string> {
    // Native libsignal path
    if (typeof (window as any).electronCrypto?.lsDecrypt === 'function') {
      const bundle = await getRecipientBundle(sender.username);
      const sidOrName = bundle.identityKeyB64 || sender.username;
      const dec = await (window as any).electronCrypto.lsDecrypt(sidOrName, ciphertext as any);
      if ((dec as any)?.error) throw new Error((dec as any).error);
      return (dec as any).plaintext as string;
    }
    const bundle = await getRecipientBundle(sender.username);
    const session = await getSession(sender.id, bundle);
    return window.electronCrypto.decryptMessage(session.sessionId, ciphertext);
  },
  
  async ensureSessionFromEnvelope(
    sender: { username: string; id: string },
    handshake: { ephPubB64?: string; opkPubB64?: string } | undefined
  ): Promise<void> {
    if (!handshake?.ephPubB64) return;
    const priv = this.getIdentity();
    if (!priv) throw new Error('No private identity loaded');
    const bundle = await getRecipientBundle(sender.username);
    let res;
    if (handshake.opkPubB64 && typeof window.electronAPI.getOPKPriv === 'function' && typeof window.electronCrypto.establishFromEnvelopeWithOpk === 'function') {
      const opkPriv = await window.electronAPI.getOPKPriv(handshake.opkPubB64);
      if (opkPriv) {
        res = await window.electronCrypto.establishFromEnvelopeWithOpk(priv, bundle, handshake.ephPubB64, opkPriv);
        try { await window.electronAPI.consumeOPK?.(handshake.opkPubB64); } catch {}
      }
    }
    if (!res && typeof window.electronCrypto.establishFromEnvelope === 'function') {
      res = await window.electronCrypto.establishFromEnvelope(priv, bundle, handshake.ephPubB64);
    }
    if (res && res.sessionId && res.sharedAesKeyB64) {
      await window.electronAPI.saveSession(sender.id, res.sessionId, res.sharedAesKeyB64);
    }
  },

  async decryptRatchet(
    sender: { username: string; id: string },
    header: any | undefined,
    ciphertext: string
  ): Promise<string> {
    await ensureIdentity();

    const bundle = await getRecipientBundle(sender.username);
    const session = await getSession(sender.id, bundle);
    let rs = await window.electronAPI.getRatchet?.(sender.id);
    const roleA = computeRoleAFromKeys(myPrivateMaterial, bundle);
    const init = await deriveInitialChainsFromShared(session.sharedAesKeyB64, roleA);
    if (!rs || rs.sessionId !== session.sessionId || ((rs.sendCount || 0) === 0 && (rs.recvCount || 0) === 0 && (rs.sendCKB64 !== init.sendCKB64 || rs.recvCKB64 !== init.recvCKB64))) {
      rs = { sessionId: session.sessionId, sendCKB64: init.sendCKB64, recvCKB64: init.recvCKB64, sendCount: 0, recvCount: 0, rootKeyB64: session.sharedAesKeyB64 };
      await window.electronAPI.saveRatchet?.(sender.id, rs);
    }

    const msgN = (header && typeof header.n === 'number') ? header.n : (rs.recvCount || 0);
    try { console.log(`[CryptoService] decryptRatchet: n=${msgN}, curRecv=${rs.recvCount}, ck=${String(rs.recvCKB64).slice(0,8)}...`); } catch {}

    // If history message is older than current counter, jump directly using base chain
    if (msgN < (rs.recvCount || 0) && typeof (window as any).electronCrypto?.ratchetAdvance === 'function' && typeof (window as any).electronCrypto?.decryptWithMessageKey === 'function') {
      try {
        const bundle = await getRecipientBundle(sender.username);
        const session = await getSession(sender.id, bundle);
        const roleA = computeRoleAFromKeys(myPrivateMaterial, bundle);
        const base = await deriveInitialChainsFromShared(session.sharedAesKeyB64, roleA);
        const adv = await window.electronCrypto.ratchetAdvance(base.recvCKB64, 0, msgN);
        const mkEntry = adv.mks.find((m: any) => m.n === msgN);
        if (mkEntry) {
          const dec = await window.electronCrypto.decryptWithMessageKey(mkEntry.mkB64, ciphertext);
          rs.recvCKB64 = adv.nextCKB64;
          rs.recvCount = msgN + 1;
          rs.rootKeyB64 = session.sharedAesKeyB64;
          await window.electronAPI.saveRatchet?.(sender.id, rs);
          return dec.plaintext;
        }
      } catch (e2) {
        console.warn('Backward jump decrypt failed, will try forward path:', e2);
      }
    }

    // Normal forward/in-place decrypt path (handles msgN >= curRecv)
    try {
      const out = await window.electronCrypto.ratchetDecrypt(rs.recvCKB64, rs.recvCount, msgN, ciphertext);
      rs.recvCKB64 = out.nextCKB64;
      rs.recvCount = msgN + 1;
      await window.electronAPI.saveRatchet?.(sender.id, rs);
      return out.plaintext;
    } catch (e) {
      console.error("Decryption failed in decryptRatchet", e);
      // Fallback self-heal: re-derive receiving chain from session key and jump to msgN
      try {
        const bundle = await getRecipientBundle(sender.username);
        const session = await getSession(sender.id, bundle);
        const roleA = computeRoleAFromKeys(myPrivateMaterial, bundle);
        const base = await deriveInitialChainsFromShared(session.sharedAesKeyB64, roleA);
        const ckStart = base.recvCKB64;
        if (typeof (window as any).electronCrypto?.ratchetAdvance === 'function' && typeof (window as any).electronCrypto?.decryptWithMessageKey === 'function') {
          const adv = await window.electronCrypto.ratchetAdvance(ckStart, 0, msgN);
          const mkEntry = adv.mks.find((m: any) => m.n === msgN);
          if (mkEntry) {
            const dec = await window.electronCrypto.decryptWithMessageKey(mkEntry.mkB64, ciphertext);
            rs.recvCKB64 = adv.nextCKB64;
            rs.recvCount = msgN + 1;
            rs.rootKeyB64 = session.sharedAesKeyB64;
            await window.electronAPI.saveRatchet?.(sender.id, rs);
            try { console.warn('[CryptoService] Fallback ratchet jump success at n=', msgN); } catch {}
            return dec.plaintext;
          }
        }
      } catch (e2) {
        console.warn('Fallback ratchet re-derive failed:', e2);
      }
      throw e;
    }
  },
};
