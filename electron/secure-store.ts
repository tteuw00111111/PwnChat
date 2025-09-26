import { join } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import * as electron from "electron";
import argon2 from "argon2";

// Simple, robust encrypted file keystore using argon2id + AES-256-GCM.
// This scaffolds a secure-at-rest store without requiring SQLCipher build steps.

type PrivateMaterial = {
  identityKeyPrivateB64: string;
  identityKeyPublicB64: string;
};

type EncryptedBlobV1 = {
  v: 1;
  kdf: "argon2id";
  params: { mem: number; time: number; parallel: number; hashLen: number };
  saltB64: string;
  ivB64: string;
  ctB64: string;
  tagB64: string;
};

function sanitizeProfile(profile?: string) {
  return (profile || "default").replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function createSecureStore(profile?: string, account?: string) {
  const p = sanitizeProfile(profile);
  const a = sanitizeProfile(account);
  const STORE_PATH = join(electron.app.getPath("userData"), `pwnchat_keys.${p}.${a}.v1.enc`);
  const SESS_PATH = join(electron.app.getPath("userData"), `pwnchat_sessions.${p}.${a}.v1.enc`);
  const RATCHET_PATH = join(electron.app.getPath("userData"), `pwnchat_ratchets.${p}.${a}.v1.enc`);
  const OPK_PATH = join(electron.app.getPath("userData"), `pwnchat_opks.${p}.${a}.v1.enc`);
  const NATIVE_STATE_PATH = join(electron.app.getPath("userData"), `pwnchat_native.${p}.${a}.v1.enc`);

  let derivedKey: Buffer | null = null;
  let lastSalt: Buffer | null = null;

const DEFAULT_PARAMS = {
  memoryCost: 2 ** 15, // 32 MiB
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
};

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  const key = await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: DEFAULT_PARAMS.memoryCost,
    timeCost: DEFAULT_PARAMS.timeCost,
    parallelism: DEFAULT_PARAMS.parallelism,
    hashLength: DEFAULT_PARAMS.hashLength,
    salt,
    raw: true,
  });
  return Buffer.from(key);
}

function b64(b: Buffer) {
  return b.toString("base64");
}
function fromB64(s: string) {
  return Buffer.from(s, "base64");
}

  const api = {
    async unlock(passphrase: string): Promise<{ ok: true }> {
      if (!passphrase) throw new Error("Invalid passphrase");

    // If a file exists, derive using its salt; otherwise generate a new salt.
    let salt: Buffer;
    try {
      const raw = await readFile(STORE_PATH);
      const blob: EncryptedBlobV1 = JSON.parse(raw.toString("utf8"));
      if (blob.v !== 1 || blob.kdf !== "argon2id" || !blob.saltB64)
        throw new Error("Unsupported keystore format");
      salt = fromB64(blob.saltB64);
    } catch (e: any) {
      if (e?.code === "ENOENT") {
        salt = randomBytes(16);
      } else {
        // On parse error, do not leak; start with new salt (user will overwrite on save)
        salt = randomBytes(16);
      }
    }

    derivedKey = await deriveKey(passphrase, salt);
    lastSalt = salt;
    return { ok: true as const };
  },

  lock() {
    derivedKey?.fill(0);
    derivedKey = null;
    lastSalt = null;
  },

  async saveKeys(bundle: PrivateMaterial): Promise<{ success: true }> {
    if (!derivedKey || !lastSalt) throw new Error("Store is locked");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
    const pt = Buffer.from(JSON.stringify(bundle), "utf8");
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    const blob: EncryptedBlobV1 = {
      v: 1,
      kdf: "argon2id",
      params: { mem: DEFAULT_PARAMS.memoryCost, time: DEFAULT_PARAMS.timeCost, parallel: DEFAULT_PARAMS.parallelism, hashLen: DEFAULT_PARAMS.hashLength },
      saltB64: b64(lastSalt),
      ivB64: b64(iv),
      ctB64: b64(ct),
      tagB64: b64(tag),
    };
    await writeFile(STORE_PATH, JSON.stringify(blob));
    return { success: true as const };
  },

  async getKeys(): Promise<PrivateMaterial | null> {
    if (!derivedKey) return null; // locked
    try {
      const raw = await readFile(STORE_PATH);
      const blob: EncryptedBlobV1 = JSON.parse(raw.toString("utf8"));
      const iv = fromB64(blob.ivB64);
      const ct = fromB64(blob.ctB64);
      const tag = fromB64(blob.tagB64);
      const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      return JSON.parse(pt.toString("utf8"));
    } catch (e: any) {
      if (e?.code === "ENOENT") return null;
      if (
        typeof e?.message === "string" &&
        (e.message.includes("unable to authenticate") || e.message.includes("bad decrypt"))
      ) {
        const err = new Error("wrong-passphrase");
        (err as any).code = "WRONG_PASSPHRASE";
        throw err;
      }
      throw e;
    }
  },

  async saveSession(
    peerId: string,
    sessionId: string,
    sharedAesKeyB64: string
  ): Promise<{ success: true }> {
    if (!derivedKey) throw new Error("Store is locked");
    // Load existing sessions map
    const map = await (async () => {
      try {
        const raw = await readFile(SESS_PATH);
        const blob = JSON.parse(raw.toString("utf8")) as {
          v: 1;
          ivB64: string;
          ctB64: string;
          tagB64: string;
        };
        const iv = fromB64(blob.ivB64);
        const ct = fromB64(blob.ctB64);
        const tag = fromB64(blob.tagB64);
        const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
        decipher.setAuthTag(tag);
        const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        return JSON.parse(pt.toString("utf8")) as Record<string, { sessionId: string; sharedAesKeyB64: string }>;
      } catch (e: any) {
        if (e?.code === "ENOENT") return {};
        if (
          typeof e?.message === "string" &&
          (e.message.includes("unable to authenticate") || e.message.includes("bad decrypt"))
        ) {
          // Old session file encrypted with different passphrase; start a new map
          return {};
        }
        throw e;
      }
    })();

    map[peerId] = { sessionId, sharedAesKeyB64 };

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
    const pt = Buffer.from(JSON.stringify(map), "utf8");
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    const out = { v: 1, ivB64: b64(iv), ctB64: b64(ct), tagB64: b64(tag) };
    await writeFile(SESS_PATH, JSON.stringify(out));
    return { success: true as const };
  },

  async getSession(
    peerId: string
  ): Promise<{ sessionId: string; sharedAesKeyB64: string } | null> {
    if (!derivedKey) return null;
    try {
      const raw = await readFile(SESS_PATH);
      const blob = JSON.parse(raw.toString("utf8")) as {
        v: 1;
        ivB64: string;
        ctB64: string;
        tagB64: string;
      };
      const iv = fromB64(blob.ivB64);
      const ct = fromB64(blob.ctB64);
      const tag = fromB64(blob.tagB64);
      const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      const map = JSON.parse(pt.toString("utf8")) as Record<string, { sessionId: string; sharedAesKeyB64: string }>;
      return map[peerId] ?? null;
    } catch (e: any) {
      if (e?.code === "ENOENT") return null;
      throw e;
    }
  },

  async saveRatchetState(peerId: string, state: any): Promise<{ success: true }> {
    if (!derivedKey) throw new Error("Store is locked");
    const map = await (async () => {
      try {
        const raw = await readFile(RATCHET_PATH);
        const blob = JSON.parse(raw.toString("utf8")) as { v: 1; ivB64: string; ctB64: string; tagB64: string };
        const iv = fromB64(blob.ivB64);
        const ct = fromB64(blob.ctB64);
        const tag = fromB64(blob.tagB64);
        const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
        decipher.setAuthTag(tag);
        const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        return JSON.parse(pt.toString("utf8")) as Record<string, any>;
      } catch (e: any) {
        if (e?.code === 'ENOENT') return {};
        if (typeof e?.message === 'string' && (e.message.includes('unable to authenticate') || e.message.includes('bad decrypt'))) return {};
        throw e;
      }
    })();

    map[peerId] = state;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
    const pt = Buffer.from(JSON.stringify(map), "utf8");
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    const out = { v: 1, ivB64: b64(iv), ctB64: b64(ct), tagB64: b64(tag) };
    await writeFile(RATCHET_PATH, JSON.stringify(out));
    return { success: true as const };
  },

  async getRatchetState(peerId: string): Promise<any | null> {
    if (!derivedKey) return null;
    try {
      const raw = await readFile(RATCHET_PATH);
      const blob = JSON.parse(raw.toString("utf8")) as { v: 1; ivB64: string; ctB64: string; tagB64: string };
      const iv = fromB64(blob.ivB64);
      const ct = fromB64(blob.ctB64);
      const tag = fromB64(blob.tagB64);
      const decipher = createDecipheriv("aes-256-gcm", derivedKey, iv);
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      const map = JSON.parse(pt.toString("utf8")) as Record<string, any>;
      return map[peerId] ?? null;
    } catch (e: any) {
      if (e?.code === 'ENOENT') return null;
      throw e;
    }
  },

  async saveOPKs(opks: Array<{ publicKeyB64: string; privateKeyB64?: string }>): Promise<{ success: true }> {
    if (!derivedKey) throw new Error('Store is locked');
    const map = await (async () => {
      try {
        const raw = await readFile(OPK_PATH);
        const blob = JSON.parse(raw.toString('utf8')) as { v:1; ivB64:string; ctB64:string; tagB64:string };
        const iv = fromB64(blob.ivB64); const ct = fromB64(blob.ctB64); const tag = fromB64(blob.tagB64);
        const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv); decipher.setAuthTag(tag);
        const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
        return JSON.parse(pt.toString('utf8')) as Record<string,{ priv:string, consumed?:boolean }>;
      } catch (e:any) {
        if (e?.code==='ENOENT') return {};
        // If the file exists but is encrypted with a different passphrase or corrupted,
        // start a new map instead of throwing (avoid noisy logs in prod)
        if (typeof e?.message === 'string' && (e.message.includes('unable to authenticate') || e.message.includes('bad decrypt'))) {
          return {};
        }
        throw e;
      }
    })();
    for (const k of opks || []) {
      if (k?.publicKeyB64 && k?.privateKeyB64 && !map[k.publicKeyB64]) map[k.publicKeyB64] = { priv: k.privateKeyB64 };
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
    const pt = Buffer.from(JSON.stringify(map), 'utf8');
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]); const tag = cipher.getAuthTag();
    await writeFile(OPK_PATH, JSON.stringify({ v:1, ivB64:b64(iv), ctB64:b64(ct), tagB64:b64(tag) }));
    return { success: true as const };
  },

  async getOPKPriv(pubB64: string): Promise<string | null> {
    if (!derivedKey) return null;
    try {
      const raw = await readFile(OPK_PATH);
      const blob = JSON.parse(raw.toString('utf8')) as { v:1; ivB64:string; ctB64:string; tagB64:string };
      const iv = fromB64(blob.ivB64); const ct = fromB64(blob.ctB64); const tag = fromB64(blob.tagB64);
      const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv); decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      const map = JSON.parse(pt.toString('utf8')) as Record<string,{ priv:string, consumed?:boolean }>;
      const e = map[pubB64];
      if (!e || e.consumed) return null;
      return e.priv;
    } catch (e:any) { if (e?.code==='ENOENT') return null; throw e; }
  },

  async consumeOPK(pubB64: string): Promise<{ success: true }> {
    if (!derivedKey) throw new Error('Store is locked');
    const raw = await (async () => { try { return await readFile(OPK_PATH); } catch (e:any) { if (e?.code==='ENOENT') return null; throw e; } })();
    const map: Record<string,{ priv:string, consumed?:boolean }> = raw ? (() => {
      const blob = JSON.parse(raw.toString('utf8')) as { v:1; ivB64:string; ctB64:string; tagB64:string };
      const iv = fromB64(blob.ivB64); const ct = fromB64(blob.ctB64); const tag = fromB64(blob.tagB64);
      const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv); decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      return JSON.parse(pt.toString('utf8')) as Record<string,{ priv:string, consumed?:boolean }>;
    })() : {};
    if (map[pubB64]) map[pubB64].consumed = true;
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
    const pt = Buffer.from(JSON.stringify(map),'utf8'); const ct = Buffer.concat([cipher.update(pt), cipher.final()]); const tag = cipher.getAuthTag();
    await writeFile(OPK_PATH, JSON.stringify({ v:1, ivB64:b64(iv), ctB64:b64(ct), tagB64:b64(tag) }));
    return { success: true as const };
  },

  // --- Native libsignal state persistence (opaque JSON) ---
  async saveNativeState(stateJson: string): Promise<{ success: true }> {
    if (!derivedKey) throw new Error('Store is locked');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', derivedKey, iv);
    const pt = Buffer.from(stateJson, 'utf8');
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    await writeFile(NATIVE_STATE_PATH, JSON.stringify({ v:1, ivB64:b64(iv), ctB64:b64(ct), tagB64:b64(tag) }));
    return { success: true as const };
  },

  async getNativeState(): Promise<string | null> {
    if (!derivedKey) return null;
    try {
      const raw = await readFile(NATIVE_STATE_PATH);
      const blob = JSON.parse(raw.toString('utf8')) as { v:1; ivB64:string; ctB64:string; tagB64:string };
      const iv = fromB64(blob.ivB64); const ct = fromB64(blob.ctB64); const tag = fromB64(blob.tagB64);
      const decipher = createDecipheriv('aes-256-gcm', derivedKey, iv); decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      return pt.toString('utf8');
    } catch (e:any) {
      if (e?.code === 'ENOENT') return null;
      throw e;
    }
  },
};

  return api;
}

export default createSecureStore;
