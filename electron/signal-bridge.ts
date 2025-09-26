// electron/signal-bridge.ts
// Dev crypto bridge: X25519 ECDH + HKDF-SHA256 → AES-256-GCM.
// Named ESM exports so esbuild emits clean CJS. No ArrayBuffer types used.

import crypto from "node:crypto";

/* ------------ small utils ------------ */
const b64 = (buf: Buffer) => buf.toString("base64");
const fromB64 = (s: string) => Buffer.from(s, "base64");

function hkdfSha256(
  ikm: Buffer,
  salt: Buffer,
  info: Buffer,
  length = 32
): Buffer {
  // Correct parameter order: hkdfSync(digest, ikm, salt, info, keylen)
  return Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, length));
}

function aes256gcmEncryptRaw(
  key: Buffer,
  plaintext: Buffer
): { ivB64: string; ctB64: string; tagB64: string } {
  if (key.length !== 32) throw new Error("AES-256 key must be 32 bytes");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ivB64: b64(iv), ctB64: b64(ct), tagB64: b64(tag) };
}

function aes256gcmDecryptRaw(
  key: Buffer,
  ivB64: string,
  ctB64: string,
  tagB64: string
): Buffer {
  if (key.length !== 32) throw new Error("AES-256 key must be 32 bytes");
  const iv = fromB64(ivB64);
  const ct = fromB64(ctB64);
  const tag = fromB64(tagB64);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/* ------------ public types (loose) ------------ */
export type PrivateMaterial = {
  identityKeyPrivateB64: string; // X25519 raw 32 bytes b64
  identityKeyPublicB64: string;
  identitySigningPrivateB64?: string; // Ed25519
  identitySigningPublicB64?: string;
  signedPrekeyPrivateB64?: string; // X25519
  signedPrekeyPublicB64?: string;
  signedPrekeySignatureB64?: string; // Ed25519 signature over SPK public
};

export type PublicBundle = {
  identityKeyPublicB64: string; // X25519
  identitySigningPublicB64?: string; // Ed25519
  signedPrekeyPublicB64?: string; // X25519
  signedPrekeySignatureB64?: string; // Ed25519 signature over SPK public
};

export type RecipientBundle = PublicBundle;

/* ------------ in-memory sessions (dev only) ------------ */
const profileSessions = new Map<string, Map<string, Buffer>>(); // profile -> (sessionId -> key)

function getSessionsForProfile(profile: string): Map<string, Buffer> {
  if (!profileSessions.has(profile)) {
    profileSessions.set(profile, new Map<string, Buffer>());
  }
  return profileSessions.get(profile)!;
}

function computeSharedKey(
  ourPrivRawB64: string,
  theirPubRawB64: string
): Buffer {
  // Build KeyObjects from raw 32-byte X25519 keys via DER wrappers
  const theirPubKey = crypto.createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b656e032100", "hex"), // SPKI header for X25519
      fromB64(theirPubRawB64),
    ]),
    format: "der",
    type: "spki",
  });

  const ourPrivKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b656e04220420", "hex"), // PKCS8 header for X25519
      fromB64(ourPrivRawB64),
    ]),
    format: "der",
    type: "pkcs8",
  });

  const secret = crypto.diffieHellman({
    publicKey: theirPubKey,
    privateKey: ourPrivKey,
  }); // 32 bytes
  return hkdfSha256(
    secret,
    Buffer.alloc(0),
    Buffer.from("pwnchat-session-key"),
    32
  );
}

function kdfHmac(key: Buffer, info: string): Buffer {
  const h = crypto.createHmac('sha256', key);
  h.update(info);
  return h.digest();
}

// Compute raw X25519 shared secret (32 bytes)
function deriveDhSecret(
  ourPrivRawB64: string,
  theirPubRawB64: string,
): Buffer {
  const theirPubKey = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b656e032100','hex'), fromB64(theirPubRawB64)]),
    format: 'der', type: 'spki'
  });
  const ourPrivKey = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'), fromB64(ourPrivRawB64)]),
    format: 'der', type: 'pkcs8'
  });
  return crypto.diffieHellman({ publicKey: theirPubKey, privateKey: ourPrivKey });
}

// Symmetric chain-key ratchet (no DH) for dev
export async function ratchetEncrypt(
  profile: string,
  chainKeyB64: string,
  counter: number,
  plaintext: string
): Promise<{ ciphertext: string; nextCKB64: string; header: { n: number } }> {
  console.log(`[${profile}] ENCRYPT call: ck=${chainKeyB64.slice(0,10)} n=${counter}`);
  let ck = Buffer.from(chainKeyB64, 'base64');
  const mk = kdfHmac(ck, 'msg');
  console.log(`[${profile}] ENCRYPT derived mk: ${mk.toString('base64').slice(0,10)}`);
  const nextCK = kdfHmac(ck, 'chain');
  const { ivB64, ctB64, tagB64 } = aes256gcmEncryptRaw(mk.subarray(0, 32), Buffer.from(plaintext, 'utf8'));
  return { ciphertext: `${ivB64}.${tagB64}.${ctB64}`, nextCKB64: nextCK.toString('base64'), header: { n: counter } };
}

export async function ratchetDecrypt(
  profile: string,
  chainKeyB64: string,
  currentCounter: number,
  msgCounter: number,
  ciphertext: string
): Promise<{ plaintext: string; nextCKB64: string }> {
  console.log(`[${profile}] DECRYPT call: ck=${chainKeyB64.slice(0,10)} current_n=${currentCounter} msg_n=${msgCounter}`);
  let ck = Buffer.from(chainKeyB64, 'base64');
  let n = currentCounter;
  // Advance chain until we reach message counter
  while (n < msgCounter) {
    ck = kdfHmac(ck, 'chain');
    n++;
  }
  const mk = kdfHmac(ck, 'msg');
  console.log(`[${profile}] DECRYPT derived mk: ${mk.toString('base64').slice(0,10)}`);
  const nextCK = kdfHmac(ck, 'chain');
  const parts = ciphertext.split('.');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivB64, tagB64, ctB64] = parts;
  const pt = aes256gcmDecryptRaw(mk.subarray(0, 32), ivB64, ctB64, tagB64);
  return { plaintext: pt.toString('utf8'), nextCKB64: nextCK.toString('base64') };
}

// Advance ratchet from "fromN" to "toN" (inclusive) and return all derived message keys
export async function ratchetAdvance(
  profile: string,
  chainKeyB64: string,
  fromN: number,
  toN: number
): Promise<{ nextCKB64: string; mks: Array<{ n: number; mkB64: string }> }> {
  let ck = Buffer.from(chainKeyB64, 'base64');
  let n = fromN;
  const mks: Array<{ n: number; mkB64: string }> = [];
  while (n <= toN) {
    const mk = kdfHmac(ck, 'msg');
    ck = kdfHmac(ck, 'chain');
    mks.push({ n, mkB64: mk.subarray(0, 32).toString('base64') });
    n++;
  }
  return { nextCKB64: ck.toString('base64'), mks };
}

export async function decryptWithMessageKey(
  profile: string,
  mkB64: string,
  ciphertext: string
): Promise<{ plaintext: string }> {
  const [ivB64, tagB64, ctB64] = ciphertext.split('.');
  const key = Buffer.from(mkB64, 'base64');
  const pt = aes256gcmDecryptRaw(key, ivB64, ctB64, tagB64);
  return { plaintext: pt.toString('utf8') };
}

/* ------------ API expected by main.ts ------------ */

export async function generateSignalProtocolIdentity(profile: string): Promise<{
  publicBundle: PublicBundle;
  privateMaterial: PrivateMaterial;
}> {
  // Identity ECDH (X25519)
  const idDh = crypto.generateKeyPairSync("x25519");
  const idDhPubDer = idDh.publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const idDhPrivDer = idDh.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  const idDhPubRaw = idDhPubDer.subarray(-32);
  const idDhPrivRaw = idDhPrivDer.subarray(-32);

  // Identity signing (Ed25519)
  const idSig = crypto.generateKeyPairSync("ed25519");
  const idSigPub = idSig.publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const idSigPriv = idSig.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;

  // Raw Ed25519 keys are in PKCS8/SPKI; leave as DER base64 for transport
  const idSigPubB64 = b64(idSigPub);
  const idSigPrivB64 = b64(idSigPriv);

  // Signed Prekey (X25519) + signature with identity signing key
  const spk = crypto.generateKeyPairSync("x25519");
  const spkPubDer = spk.publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const spkPrivDer = spk.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  const spkPubRaw = spkPubDer.subarray(-32);
  const spkPrivRaw = spkPrivDer.subarray(-32);

  const signature = crypto.sign(null, spkPubRaw, idSig.privateKey); // Ed25519 signs raw 32-byte SPK

  const privateMaterial: PrivateMaterial = {
    identityKeyPrivateB64: b64(idDhPrivRaw),
    identityKeyPublicB64: b64(idDhPubRaw),
    identitySigningPrivateB64: idSigPrivB64,
    identitySigningPublicB64: idSigPubB64,
    signedPrekeyPrivateB64: b64(spkPrivRaw),
    signedPrekeyPublicB64: b64(spkPubRaw),
    signedPrekeySignatureB64: b64(signature),
  };

  const publicBundle: PublicBundle = {
    identityKeyPublicB64: b64(idDhPubRaw),
    identitySigningPublicB64: idSigPubB64,
    signedPrekeyPublicB64: b64(spkPubRaw),
    signedPrekeySignatureB64: b64(signature),
  };

  return { publicBundle, privateMaterial };
}

// Ephemeral X25519 for handshake envelope (initiator)
export async function generateEphemeralX25519(profile: string): Promise<{ ephPubB64: string; ephPrivB64: string }> {
  const kp = crypto.generateKeyPairSync('x25519');
  const pubDer = kp.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const privDer = kp.privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const ephPubRaw = pubDer.subarray(-32);
  const ephPrivRaw = privDer.subarray(-32);
  return { ephPubB64: b64(ephPubRaw), ephPrivB64: b64(ephPrivRaw) };
}

// DH ratchet helpers (dev)
export async function generateRatchetDH(profile: string): Promise<{ dhPubB64: string; dhPrivB64: string }> {
  const kp = crypto.generateKeyPairSync('x25519');
  const pubDer = kp.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const privDer = kp.privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const pubRaw = pubDer.subarray(-32);
  const privRaw = privDer.subarray(-32);
  return { dhPubB64: b64(pubRaw), dhPrivB64: b64(privRaw) };
}

function deriveRootAndChains(secret: Buffer, rootKey: Buffer, orientation: 'sender' | 'receiver') {
  const newRoot = hkdfSha256(secret, rootKey, Buffer.from('pwnchat-root'), 32);
  const ckSend = hkdfSha256(newRoot, Buffer.alloc(0), Buffer.from('pwnchat-ck-send'), 32);
  const ckRecv = hkdfSha256(newRoot, Buffer.alloc(0), Buffer.from('pwnchat-ck-recv'), 32);
  if (orientation === 'sender') {
    return { newRoot, sendCK: ckSend, recvCK: ckRecv };
  } else {
    // invert mapping on receiver so chains align
    return { newRoot, sendCK: ckRecv, recvCK: ckSend };
  }
}

export async function dhRatchetStepSender(
  profile: string,
  rootKeyB64: string,
  myNewDhPrivB64: string,
  theirDhPubB64: string
): Promise<{ rootKeyB64: string; sendCKB64: string; recvCKB64: string; myDhPubB64: string }> {
  // Build keys
  const theirPubKey = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b656e032100','hex'), Buffer.from(theirDhPubB64,'base64')]),
    format: 'der', type: 'spki'
  });
  const myPrivKey = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'), Buffer.from(myNewDhPrivB64,'base64')]),
    format: 'der', type: 'pkcs8'
  });
  const secret = crypto.diffieHellman({ publicKey: theirPubKey, privateKey: myPrivKey });
  const { newRoot, sendCK, recvCK } = deriveRootAndChains(secret, Buffer.from(rootKeyB64,'base64'), 'sender');

  // Derive my public from priv for header
  const myPubKey = crypto.createPublicKey(myPrivKey);
  const myPubDer = myPubKey.export({ format:'der', type:'spki' }) as Buffer;
  const myPubRaw = myPubDer.subarray(-32);

  return {
    rootKeyB64: b64(newRoot),
    sendCKB64: b64(sendCK),
    recvCKB64: b64(recvCK),
    myDhPubB64: b64(myPubRaw)
  };
}

export async function dhRatchetStepReceiver(
  profile: string,
  rootKeyB64: string,
  myDhPrivB64: string,
  theirNewDhPubB64: string
): Promise<{ rootKeyB64: string; sendCKB64: string; recvCKB64: string }> {
  const theirPubKey = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b656e032100','hex'), Buffer.from(theirNewDhPubB64,'base64')]),
    format: 'der', type: 'spki'
  });
  const myPrivKey = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'), Buffer.from(myDhPrivB64,'base64')]),
    format: 'der', type: 'pkcs8'
  });
  const secret = crypto.diffieHellman({ publicKey: theirPubKey, privateKey: myPrivKey });
  const { newRoot, sendCK, recvCK } = deriveRootAndChains(secret, Buffer.from(rootKeyB64,'base64'), 'receiver');
  return { rootKeyB64: b64(newRoot), sendCKB64: b64(sendCK), recvCKB64: b64(recvCK) };
}

export async function establishSessionFromEnvelope(
  profile: string,
  privateMaterial: PrivateMaterial,
  senderBundle: PublicBundle,
  ephPubB64: string
): Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }> {
  const sessions = getSessionsForProfile(profile);
  // Receiver computes symmetric terms matching initiator's selection
  const dhParts: Buffer[] = [];

  // DH(IK_self_priv, IK_peer_pub)
  const dh_id_id = computeSharedKey(
    privateMaterial.identityKeyPrivateB64,
    senderBundle.identityKeyPublicB64
  );
  dhParts.push(dh_id_id);

  // DH(SPK_self_priv, IK_peer_pub) if we have SPK
  try {
    if (privateMaterial.signedPrekeyPrivateB64) {
      const theirIkPubKey = crypto.createPublicKey({
        key: Buffer.concat([
          Buffer.from("302a300506032b656e032100", "hex"),
          Buffer.from(senderBundle.identityKeyPublicB64, 'base64')
        ]),
        format: 'der', type: 'spki',
      });
      const mySpkPrivKey = crypto.createPrivateKey({
        key: Buffer.concat([
          Buffer.from("302e020100300506032b656e04220420", "hex"),
          Buffer.from(privateMaterial.signedPrekeyPrivateB64, 'base64')
        ]),
        format: 'der', type: 'pkcs8',
      });
      const secret = crypto.diffieHellman({ publicKey: theirIkPubKey, privateKey: mySpkPrivKey });
      const dh_spk = hkdfSha256(secret, Buffer.alloc(0), Buffer.from('pwnchat-x3dh-spk'), 32);
      dhParts.push(dh_spk);
    }
  } catch {}

  // DH(eph_peer_pub, IK_self_priv)
  const dh_eph = computeSharedKey(privateMaterial.identityKeyPrivateB64, ephPubB64);
  dhParts.push(dh_eph);

  const ikm = Buffer.concat(dhParts);
  const key = hkdfSha256(ikm, Buffer.alloc(0), Buffer.from('pwnchat-x3dh'), 32);
  const sessionId = crypto.createHash('sha256').update(key).digest('hex');
  sessions.set(sessionId, key);
  return { success: true, sessionId, sharedAesKeyB64: b64(key) };
}

export async function establishSession(
  profile: string,
  privateMaterial: PrivateMaterial,
  recipientBundle: RecipientBundle
): Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }> {
  const sessions = getSessionsForProfile(profile);
  const secrets: Buffer[] = [];
  // IK-IK term
  secrets.push(deriveDhSecret(privateMaterial.identityKeyPrivateB64, recipientBundle.identityKeyPublicB64));
  let spkIncluded = false;
  try {
    if (recipientBundle.signedPrekeyPublicB64) {
      secrets.push(deriveDhSecret(privateMaterial.identityKeyPrivateB64, recipientBundle.signedPrekeyPublicB64));
      spkIncluded = true;
    }
    if (privateMaterial.signedPrekeyPrivateB64) {
      secrets.push(deriveDhSecret(privateMaterial.signedPrekeyPrivateB64, recipientBundle.identityKeyPublicB64));
      spkIncluded = spkIncluded || true;
    }
  } catch (e) {
    console.warn('[bridge] establishSession SPK terms error:', (e as any)?.message || e);
  }
  // Deterministic IKM: sort secrets lexicographically by bytes
  secrets.sort((a, b) => a.compare(b));
  const ikm = Buffer.concat(secrets);
  const key = hkdfSha256(ikm, Buffer.alloc(0), Buffer.from('pwnchat-x3dh-v2'), 32);
  const sessionId = crypto.createHash('sha256').update(key).digest('hex');
  sessions.set(sessionId, key);
  try { console.log(`[bridge] establishSession: parts=x3dh/ik-ik+spk-terms:${spkIncluded ? 'yes' : 'no'}, sessionId=${sessionId.slice(0,8)}, key=${key.toString('base64').slice(0,8)}...`); } catch {}
  return { success: true, sessionId, sharedAesKeyB64: b64(key) };
}

export async function generateOneTimePreKeys(
  profile: string,
  count: number
): Promise<Array<{ publicKeyB64: string; privateKeyB64: string }>> {
  const out: Array<{ publicKeyB64: string; privateKeyB64: string }> = [];
  for (let i = 0; i < Math.max(0, Math.min(count || 0, 100)); i++) {
    const k = crypto.generateKeyPairSync("x25519");
    const pubDer = k.publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const privDer = k.privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
    const pubRaw = pubDer.subarray(-32);
    const privRaw = privDer.subarray(-32);
    out.push({ publicKeyB64: b64(pubRaw), privateKeyB64: b64(privRaw) });
  }
  return out;
}

export async function establishSessionWithEphAndOpk(
  profile: string,
  privateMaterial: PrivateMaterial,
  recipientBundle: PublicBundle,
  ephPrivB64: string,
  opkPeerPubB64: string
): Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }> {
  const sessions = getSessionsForProfile(profile);
  const dhParts: Buffer[] = [];
  const dh_id_id = computeSharedKey(
    privateMaterial.identityKeyPrivateB64,
    recipientBundle.identityKeyPublicB64
  );
  dhParts.push(dh_id_id);
  // SPK initiator term
  try {
    if (recipientBundle.signedPrekeyPublicB64 && recipientBundle.signedPrekeySignatureB64 && recipientBundle.identitySigningPublicB64) {
      const idSigPubKey = crypto.createPublicKey({ key: fromB64(recipientBundle.identitySigningPublicB64), format: 'der', type: 'spki' });
      const spkRaw = fromB64(recipientBundle.signedPrekeyPublicB64);
      const sig = fromB64(recipientBundle.signedPrekeySignatureB64);
      if (crypto.verify(null, spkRaw, idSigPubKey, sig)) {
        const dh_spk = computeSharedKey(privateMaterial.identityKeyPrivateB64, recipientBundle.signedPrekeyPublicB64);
        dhParts.push(dh_spk);
      }
    }
  } catch {}
  // OPK via eph
  const dh_opk = computeSharedKey(ephPrivB64, opkPeerPubB64);
  dhParts.push(dh_opk);
  const key = hkdfSha256(Buffer.concat(dhParts), Buffer.alloc(0), Buffer.from('pwnchat-x3dh-opk'), 32);
  const sessionId = crypto.createHash('sha256').update(key).digest('hex');
  sessions.set(sessionId, key);
  return { success: true, sessionId, sharedAesKeyB64: b64(key) };
}

// Initiator: IK-IK [+ IK_self with SPK_peer] + eph_priv with IK_peer (no OPK)
export async function establishSessionWithEph(
  profile: string,
  privateMaterial: PrivateMaterial,
  recipientBundle: PublicBundle,
  ephPrivB64: string
): Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }> {
  const sessions = getSessionsForProfile(profile);
  const dhParts: Buffer[] = [];
  // IK-IK
  const dh_id_id = computeSharedKey(privateMaterial.identityKeyPrivateB64, recipientBundle.identityKeyPublicB64);
  dhParts.push(dh_id_id);
  // SPK initiator term if valid
  try {
    if (recipientBundle.signedPrekeyPublicB64 && recipientBundle.signedPrekeySignatureB64 && recipientBundle.identitySigningPublicB64) {
      const idSigPubKey = crypto.createPublicKey({ key: fromB64(recipientBundle.identitySigningPublicB64), format: 'der', type: 'spki' });
      const spkRaw = fromB64(recipientBundle.signedPrekeyPublicB64);
      const sig = fromB64(recipientBundle.signedPrekeySignatureB64);
      if (crypto.verify(null, spkRaw, idSigPubKey, sig)) {
        const dh_spk = computeSharedKey(privateMaterial.identityKeyPrivateB64, recipientBundle.signedPrekeyPublicB64);
        dhParts.push(dh_spk);
      }
    }
  } catch {}
  // EPH with IK_peer
  const dh_eph = computeSharedKey(ephPrivB64, recipientBundle.identityKeyPublicB64);
  dhParts.push(dh_eph);
  const key = hkdfSha256(Buffer.concat(dhParts), Buffer.alloc(0), Buffer.from('pwnchat-x3dh'), 32);
  const sessionId = crypto.createHash('sha256').update(key).digest('hex');
  sessions.set(sessionId, key);
  return { success: true, sessionId, sharedAesKeyB64: b64(key) };
}

export async function establishFromEnvelopeWithOpk(
  profile: string,
  privateMaterial: PrivateMaterial,
  senderBundle: PublicBundle,
  ephPubB64: string,
  opkPrivB64: string
): Promise<{ success: boolean; sessionId: string; sharedAesKeyB64: string }> {
  const sessions = getSessionsForProfile(profile);
  const dhParts: Buffer[] = [];
  const dh_id_id = computeSharedKey(privateMaterial.identityKeyPrivateB64, senderBundle.identityKeyPublicB64);
  dhParts.push(dh_id_id);
  // SPK receiver term
  try {
    if (privateMaterial.signedPrekeyPrivateB64) {
      const theirIkPubKey = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100','hex'), fromB64(senderBundle.identityKeyPublicB64)]), format:'der', type:'spki' });
      const mySpkPrivKey = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'), fromB64(privateMaterial.signedPrekeyPrivateB64)]), format:'der', type:'pkcs8' });
      const secret = crypto.diffieHellman({ publicKey: theirIkPubKey, privateKey: mySpkPrivKey });
      const dh_spk = hkdfSha256(secret, Buffer.alloc(0), Buffer.from('pwnchat-x3dh-spk'), 32);
      dhParts.push(dh_spk);
    }
  } catch {}
  // OPK via eph
  const dh_opk = computeSharedKey(opkPrivB64, ephPubB64);
  dhParts.push(dh_opk);
  const key = hkdfSha256(Buffer.concat(dhParts), Buffer.alloc(0), Buffer.from('pwnchat-x3dh-opk'), 32);
  const sessionId = crypto.createHash('sha256').update(key).digest('hex');
  sessions.set(sessionId, key);
  return { success: true, sessionId, sharedAesKeyB64: b64(key) };
}

export async function encryptMessage(
  profile: string,
  sessionId: string,
  plaintext: string
): Promise<{ ciphertext: string }> {
  const sessions = getSessionsForProfile(profile);
  const key = sessions.get(sessionId);
  if (!key) throw new Error("Unknown session");
  const { ivB64, ctB64, tagB64 } = aes256gcmEncryptRaw(
    key,
    Buffer.from(plaintext, "utf8")
  );
  return { ciphertext: `${ivB64}.${tagB64}.${ctB64}` };
}

export async function decryptMessage(
  profile: string,
  sessionId: string,
  ciphertext: string
): Promise<{ plaintext: string }> {
  const sessions = getSessionsForProfile(profile);
  const key = sessions.get(sessionId);
  if (!key) throw new Error("Unknown session");
  const parts = ciphertext.split(".");
  if (parts.length !== 3) throw new Error("Invalid ciphertext format");
  const [ivB64, tagB64, ctB64] = parts;
  const pt = aes256gcmDecryptRaw(key, ivB64, ctB64, tagB64);
  return { plaintext: pt.toString("utf8") };
}

export async function loadSessionKey(profile: string, sessionId: string, sharedAesKeyB64: string): Promise<void> {
  const sessions = getSessionsForProfile(profile);
  const key = fromB64(sharedAesKeyB64);
  sessions.set(sessionId, key);
  try { console.log(`[bridge] loadSessionKey: profile=${profile}, sessionId=${String(sessionId).slice(0,8)}, key=${sharedAesKeyB64.slice(0,8)}...`); } catch {}
}
