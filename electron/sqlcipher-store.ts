import { join } from "node:path";
import * as electron from "electron";
import argon2 from "argon2";

type PrivateMaterial = {
  identityKeyPrivateB64: string;
  identityKeyPublicB64: string;
};

function sanitizeProfile(profile?: string) {
  return (profile || "default").replace(/[^a-zA-Z0-9_-]/g, "-");
}

type SqliteDb = {
  prepare: (sql: string) => any;
  pragma: (pragma: string, opts?: { simple?: boolean }) => any;
  close: () => void;
};

let Database: any = null;
try {
  // Allow disabling SQLCipher backend entirely (work around native module issues)
  if (process.env.PWNCHAT_DISABLE_SQLCIPHER !== '1') {
    // Load lazily at runtime; bundler marks as external
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Database = require("better-sqlite3");
  }
} catch {
  Database = null;
}

export function createSqlcipherStore(profile?: string, account?: string) {
  const p = sanitizeProfile(profile);
  const a = sanitizeProfile(account);
  const DB_PATH = join(electron.app.getPath("userData"), `vault.${p}.${a}.db`);

  let db: SqliteDb | null = null;
  let unlocked = false;

// Optional: derive a normalized passphrase (keeping parity with file store UX)
async function normalizePassphrase(passphrase: string): Promise<string> {
  // Lightweight derivation to discourage trivial ascii-only keys while keeping UX simple
  // We still let SQLCipher use its internal KDF; this just expands inputs slightly.
  const hash = await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: 2 ** 12, // 4 MiB to keep fast
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
    raw: true,
    salt: Buffer.from("pwnchat_vault_v1", "utf8"),
  });
  return Buffer.from(hash).toString("hex"); // hex string used as passphrase
}

function ensureSchema(database: SqliteDb) {
  database.prepare(
    `CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`
  ).run();

  database.prepare(
    `CREATE TABLE IF NOT EXISTS keys (
      id INTEGER PRIMARY KEY CHECK (id=1),
      private_material_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  database.prepare(
    `CREATE TABLE IF NOT EXISTS ratchet_sessions (
      peer_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      shared_key_b64 TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();

  database.prepare(
    `CREATE TABLE IF NOT EXISTS ratchet_state (
      peer_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      send_ck_b64 TEXT,
      recv_ck_b64 TEXT,
      send_count INTEGER DEFAULT 0,
      recv_count INTEGER DEFAULT 0,
      skipped_json TEXT,
      root_key_b64 TEXT,
      my_dh_priv_b64 TEXT,
      my_dh_pub_b64 TEXT,
      their_dh_pub_b64 TEXT,
      needs_send_dh INTEGER,
      prev_send_count INTEGER,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  database.prepare(
    `CREATE TABLE IF NOT EXISTS opk_local (
      pub_b64 TEXT PRIMARY KEY,
      priv_b64 TEXT NOT NULL,
      consumed INTEGER DEFAULT 0,
      uploaded INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  database.prepare(
    `CREATE TABLE IF NOT EXISTS native_state (
      id INTEGER PRIMARY KEY CHECK (id=1),
      state_json TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  // best-effort ensure columns exist if table already created
  const addCol = (name: string) => {
    try { database.prepare(`ALTER TABLE ratchet_state ADD COLUMN ${name}`).run(); } catch {}
  };
  addCol('root_key_b64 TEXT');
  addCol('my_dh_priv_b64 TEXT');
  addCol('my_dh_pub_b64 TEXT');
  addCol('their_dh_pub_b64 TEXT');
  addCol('needs_send_dh INTEGER');
  addCol('prev_send_count INTEGER');
}

  const api = {
  available(): boolean {
    if (process.env.PWNCHAT_DISABLE_SQLCIPHER === '1') return false;
    return !!Database;
  },

  async unlock(passphrase: string): Promise<{ ok: true; sqlcipher: boolean }> {
    if (!Database) return { ok: true, sqlcipher: false };

    // Open DB and try to set key; detect SQLCipher with cipher_version
    const pp = await normalizePassphrase(passphrase);
    try {
      db = new Database(DB_PATH);
      db.pragma(`key = '${pp.replace(/'/g, "''")}'`);
      const ver = db.pragma("cipher_version", { simple: true });
      if (!ver) {
        // Not SQLCipher-enabled build
        try { db?.close(); } catch {}
        db = null;
        return { ok: true, sqlcipher: false };
      }
    } catch (e) {
      // Any failure (including ABI mismatch) means we fall back silently
      try { db?.close(); } catch {}
      db = null;
      return { ok: true, sqlcipher: false };
    }

    ensureSchema(db);
    unlocked = true;
    return { ok: true, sqlcipher: true };
  },

  lock() {
    try { db?.close(); } catch {}
    db = null;
    unlocked = false;
  },

  saveKeys(bundle: PrivateMaterial): { success: true } {
    if (!db || !unlocked) throw new Error("Store is locked");
    const upsert = db.prepare(
      `INSERT INTO keys (id, private_material_json)
       VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET private_material_json=excluded.private_material_json, updated_at=CURRENT_TIMESTAMP`
    );
    upsert.run(JSON.stringify(bundle));
    return { success: true as const };
  },

  getKeys(): PrivateMaterial | null {
    if (!db || !unlocked) return null;
    const row = db.prepare(`SELECT private_material_json FROM keys WHERE id=1`).get();
    if (!row) return null;
    try {
      return JSON.parse(row.private_material_json) as PrivateMaterial;
    } catch {
      return null;
    }
  },

  saveSession(peerId: string, sessionId: string, sharedAesKeyB64: string): { success: true } {
    if (!db || !unlocked) throw new Error("Store is locked");
    const upsert = db.prepare(
      `INSERT INTO ratchet_sessions (peer_id, session_id, shared_key_b64)
       VALUES (?, ?, ?)
       ON CONFLICT(peer_id) DO UPDATE SET session_id=excluded.session_id, shared_key_b64=excluded.shared_key_b64, updated_at=CURRENT_TIMESTAMP`
    );
    upsert.run(peerId, sessionId, sharedAesKeyB64);
    return { success: true as const };
  },

  getSession(peerId: string): { sessionId: string; sharedAesKeyB64: string } | null {
    if (!db || !unlocked) return null;
    const row = db.prepare(
      `SELECT session_id, shared_key_b64 FROM ratchet_sessions WHERE peer_id = ?`
    ).get(peerId);
    if (!row) return null;
    return { sessionId: row.session_id, sharedAesKeyB64: row.shared_key_b64 };
  },

  saveRatchetState(peerId: string, state: any): { success: true } {
    if (!db || !unlocked) throw new Error("Store is locked");
    const up = db.prepare(
      `INSERT INTO ratchet_state (peer_id, session_id, send_ck_b64, recv_ck_b64, send_count, recv_count, skipped_json, root_key_b64, my_dh_priv_b64, my_dh_pub_b64, their_dh_pub_b64, needs_send_dh, prev_send_count)
       VALUES (@peer_id, @session_id, @send_ck_b64, @recv_ck_b64, @send_count, @recv_count, @skipped_json, @root_key_b64, @my_dh_priv_b64, @my_dh_pub_b64, @their_dh_pub_b64, @needs_send_dh, @prev_send_count)
       ON CONFLICT(peer_id) DO UPDATE SET
         session_id=excluded.session_id,
         send_ck_b64=excluded.send_ck_b64,
         recv_ck_b64=excluded.recv_ck_b64,
         send_count=excluded.send_count,
         recv_count=excluded.recv_count,
         skipped_json=excluded.skipped_json,
         root_key_b64=excluded.root_key_b64,
         my_dh_priv_b64=excluded.my_dh_priv_b64,
         my_dh_pub_b64=excluded.my_dh_pub_b64,
         their_dh_pub_b64=excluded.their_dh_pub_b64,
         needs_send_dh=excluded.needs_send_dh,
         prev_send_count=excluded.prev_send_count,
         updated_at=CURRENT_TIMESTAMP`
    );
    up.run({
      peer_id: peerId,
      session_id: state.sessionId,
      send_ck_b64: state.sendCKB64 ?? null,
      recv_ck_b64: state.recvCKB64 ?? null,
      send_count: state.sendCount ?? 0,
      recv_count: state.recvCount ?? 0,
      skipped_json: state.skipped ? JSON.stringify(state.skipped) : null,
      root_key_b64: state.rootKeyB64 ?? null,
      my_dh_priv_b64: state.myDhPrivB64 ?? null,
      my_dh_pub_b64: state.myDhPubB64 ?? null,
      their_dh_pub_b64: state.theirDhPubB64 ?? null,
      needs_send_dh: state.needsSendDHRatchet ? 1 : 0,
      prev_send_count: (state.prevSendCount === 0 || state.prevSendCount === undefined || state.prevSendCount === null) ? null : state.prevSendCount,
    });
    return { success: true as const };
  },

  getRatchetState(peerId: string): any | null {
    if (!db || !unlocked) return null;
    const row = db.prepare(`SELECT * FROM ratchet_state WHERE peer_id = ?`).get(peerId);
    if (!row) return null;
    return {
      sessionId: row.session_id,
      sendCKB64: row.send_ck_b64 || null,
      recvCKB64: row.recv_ck_b64 || null,
      sendCount: row.send_count ?? 0,
      recvCount: row.recv_count ?? 0,
      skipped: row.skipped_json ? JSON.parse(row.skipped_json) : undefined,
      rootKeyB64: row.root_key_b64 || null,
      myDhPrivB64: row.my_dh_priv_b64 || null,
      myDhPubB64: row.my_dh_pub_b64 || null,
      theirDhPubB64: row.their_dh_pub_b64 || null,
      needsSendDHRatchet: !!row.needs_send_dh,
      prevSendCount: row.prev_send_count === null || row.prev_send_count === undefined ? undefined : row.prev_send_count,
    };
  },

  saveOPKs(opks: Array<{ publicKeyB64: string; privateKeyB64?: string }>): { success: true } {
    if (!db || !unlocked) throw new Error('Store is locked');
    const ins = db.prepare(`INSERT OR IGNORE INTO opk_local (pub_b64, priv_b64, uploaded) VALUES (?, ?, 0)`);
    for (const k of opks || []) {
      if (k?.publicKeyB64 && k?.privateKeyB64) ins.run(k.publicKeyB64, k.privateKeyB64);
    }
    return { success: true as const };
  },

  getOPKPriv(pubB64: string): string | null {
    if (!db || !unlocked) return null;
    const row = db.prepare(`SELECT priv_b64 FROM opk_local WHERE pub_b64 = ? AND consumed = 0`).get(pubB64);
    return row ? row.priv_b64 : null;
  },

  consumeOPK(pubB64: string): { success: true } {
    if (!db || !unlocked) throw new Error('Store is locked');
    db.prepare(`UPDATE opk_local SET consumed = 1 WHERE pub_b64 = ?`).run(pubB64);
    return { success: true as const };
  },

  // --- Native libsignal state persistence (opaque JSON) ---
  saveNativeState(stateJson: string): { success: true } {
    if (!db || !unlocked) throw new Error('Store is locked');
    const up = db.prepare(
      `INSERT INTO native_state (id, state_json) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json, updated_at=CURRENT_TIMESTAMP`
    );
    up.run(stateJson);
    return { success: true as const };
  },

  getNativeState(): string | null {
    if (!db || !unlocked) return null;
    const row = db.prepare(`SELECT state_json FROM native_state WHERE id=1`).get();
    return row ? (row.state_json as string) : null;
  },
};

  return api;
}

export default createSqlcipherStore;
