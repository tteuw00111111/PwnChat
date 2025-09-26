import { createSecureStore } from "./secure-store";
import { createSqlcipherStore } from "./sqlcipher-store";
import * as electron from "electron";
import { join } from "node:path";
import { rm, readdir } from "node:fs/promises";

type PrivateMaterial = {
  identityKeyPrivateB64: string;
  identityKeyPublicB64: string;
};

type BackendKind = "sqlcipher" | "file";

const instances = new Map<string, { backend: BackendKind; file: ReturnType<typeof createSecureStore>; sql: ReturnType<typeof createSqlcipherStore> }>();
// Tracks the currently unlocked account instance per profile (window partition)
const currentInstanceByProfile = new Map<string, string>();

export const vault = {
  async unlock(passphrase: string, profileKey: string, accountKey?: string): Promise<{ ok: true; backend: string }> {
    const account = (accountKey && sanitizeProfile(accountKey)) || "default";
    const instanceKey = `${profileKey}::${account}`;
    let inst = instances.get(instanceKey);
    if (!inst) {
      inst = {
        backend: "file",
        file: createSecureStore(profileKey, account),
        sql: createSqlcipherStore(profileKey, account),
      };
      instances.set(instanceKey, inst);
    }

    // Try SQLCipher first
    if (inst.sql.available()) {
      const res = await inst.sql.unlock(passphrase);
      if (res.sqlcipher) {
        inst.backend = "sqlcipher";
        // Attempt migration from file store on first run
        try {
          const cur = inst.sql.getKeys();
          if (!cur) {
            await inst.file.unlock(passphrase);
            const oldKeys = await inst.file.getKeys();
            if (oldKeys) {
              inst.sql.saveKeys(oldKeys);
              console.log(`[vault:${profileKey}] Migrated keys from file store to SQLCipher.`);
            }
          }
        } catch (e) {
          console.warn(`[vault:${profileKey}] Migration from file store failed:`, e);
        }
        currentInstanceByProfile.set(profileKey, instanceKey);
        return { ok: true as const, backend: inst.backend };
      }
    }

    // Fallback to encrypted file store
    await inst.file.unlock(passphrase);
    inst.backend = "file";
    currentInstanceByProfile.set(profileKey, instanceKey);
    return { ok: true as const, backend: inst.backend };
  },

  lock(profileKey: string) {
    // Lock all instances for this profile
    for (const [k, inst] of instances) {
      if (!k.startsWith(`${profileKey}::`)) continue;
      if (inst.backend === "sqlcipher") inst.sql.lock();
      else inst.file.lock();
    }
    currentInstanceByProfile.delete(profileKey);
  },

  async saveKeys(bundle: PrivateMaterial): Promise<{ success: true }> {
    throw new Error("profile-required");
  },

  async getKeys(): Promise<PrivateMaterial | null> {
    throw new Error("profile-required");
  },

  async saveSession(
    peerId: string,
    sessionId: string,
    sharedAesKeyB64: string
  ): Promise<{ success: true }> {
    throw new Error("profile-required");
  },

  async getSession(
    peerId: string,
    profileKey: string
  ): Promise<{ sessionId: string; sharedAesKeyB64: string } | null> {
    // Default: use the first instance for this profile (current account)
    const inst = [...instances.entries()].find(([k]) => k.startsWith(`${profileKey}::`))?.[1];
    if (!inst) return null;
    return inst.backend === "sqlcipher"
      ? inst.sql.getSession(peerId)
      : await inst.file.getSession(peerId);
  },
};

// Profile-scoped helpers
export const vaultProfile = {
  async saveKeys(bundle: PrivateMaterial, profileKey: string): Promise<{ success: true }> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) throw new Error("vault-not-unlocked");
    const inst = instances.get(instanceKey);
    if (!inst) throw new Error("vault-not-unlocked");
    if (inst.backend === "sqlcipher") inst.sql.saveKeys(bundle);
    else await inst.file.saveKeys(bundle);
    return { success: true as const };
  },

  async getKeys(profileKey: string): Promise<PrivateMaterial | null> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) return null;
    const inst = instances.get(instanceKey);
    if (!inst) return null;
    try {
      return inst.backend === "sqlcipher" ? inst.sql.getKeys() : await inst.file.getKeys();
    } catch (e) {
      // Bubble up; renderer can show a friendly message
      throw e;
    }
  },

  async saveSession(
    peerId: string,
    sessionId: string,
    sharedAesKeyB64: string,
    profileKey: string
  ): Promise<{ success: true }> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) throw new Error("vault-not-unlocked");
    const inst = instances.get(instanceKey);
    if (!inst) throw new Error("vault-not-unlocked");
    if (inst.backend === "sqlcipher") inst.sql.saveSession(peerId, sessionId, sharedAesKeyB64);
    else await inst.file.saveSession(peerId, sessionId, sharedAesKeyB64);
    return { success: true as const };
  },

  getBackend(profileKey: string): BackendKind | null {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) return null;
    const inst = instances.get(instanceKey);
    return inst?.backend ?? null;
  },

  async saveRatchetState(profileKey: string, peerId: string, state: any): Promise<{ success: true }> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) throw new Error("vault-not-unlocked");
    const inst = instances.get(instanceKey);
    if (!inst) throw new Error("vault-not-unlocked");
    if (inst.backend === "sqlcipher") return inst.sql.saveRatchetState(peerId, state);
    return inst.file.saveRatchetState(peerId, state);
  },

  async getRatchetState(profileKey: string, peerId: string): Promise<any | null> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) return null;
    const inst = instances.get(instanceKey);
    if (!inst) return null;
    return inst.backend === "sqlcipher" ? inst.sql.getRatchetState(peerId) : inst.file.getRatchetState(peerId);
  },

  async saveOPKs(profileKey: string, opks: Array<{ publicKeyB64: string; privateKeyB64?: string }>): Promise<{ success: true }> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) throw new Error('vault-not-unlocked');
    const inst = instances.get(instanceKey)!;
    return inst.backend === 'sqlcipher' ? inst.sql.saveOPKs(opks) : inst.file.saveOPKs(opks);
  },

  async getOPKPriv(profileKey: string, pubB64: string): Promise<string | null> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) return null;
    const inst = instances.get(instanceKey)!;
    return inst.backend === 'sqlcipher' ? inst.sql.getOPKPriv(pubB64) : inst.file.getOPKPriv(pubB64);
  },

  async consumeOPK(profileKey: string, pubB64: string): Promise<{ success: true }> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) throw new Error('vault-not-unlocked');
    const inst = instances.get(instanceKey)!;
    return inst.backend === 'sqlcipher' ? inst.sql.consumeOPK(pubB64) : inst.file.consumeOPK(pubB64);
  },

  // Native libsignal state (opaque JSON)
  saveNativeState(profileKey: string, stateJson: string): { success: true } | Promise<{ success: true }> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) throw new Error('vault-not-unlocked');
    const inst = instances.get(instanceKey)!;
    return inst.backend === 'sqlcipher' ? inst.sql.saveNativeState(stateJson) : inst.file.saveNativeState(stateJson);
  },

  getNativeState(profileKey: string): string | null | Promise<string | null> {
    const instanceKey = currentInstanceByProfile.get(profileKey);
    if (!instanceKey) return null;
    const inst = instances.get(instanceKey)!;
    return inst.backend === 'sqlcipher' ? inst.sql.getNativeState() : inst.file.getNativeState();
  },
};

// Utilities for maintenance
function sanitizeProfile(profile?: string) {
  return (profile || "default").replace(/[^a-zA-Z0-9_-]/g, "-");
}

export async function resetProfileVault(profileKey: string): Promise<{ ok: true }> {
  const p = sanitizeProfile(profileKey);
  const userData = electron.app.getPath("userData");
  const files = await readdir(userData);
  const prefixes = [
    `pwnchat_keys.${p}.`,
    `pwnchat_sessions.${p}.`,
    `pwnchat_ratchets.${p}.`,
    `vault.${p}.`,
    // legacy names without account suffix
    `pwnchat_keys.${p}.v1.enc`,
    `pwnchat_sessions.${p}.v1.enc`,
    `pwnchat_ratchets.${p}.v1.enc`,
    `vault.${p}.db`,
  ];
  const targets = files.filter((f) => prefixes.some((pref) => f.startsWith(pref)) || prefixes.includes(f));
  await Promise.allSettled(targets.map((f) => rm(join(userData, f), { force: true })));
  // Remove all in-memory instances for this profile
  for (const k of [...instances.keys()]) {
    if (k.startsWith(`${profileKey}::`)) instances.delete(k);
  }
  currentInstanceByProfile.delete(profileKey);
  return { ok: true as const };
}

export default vault;
