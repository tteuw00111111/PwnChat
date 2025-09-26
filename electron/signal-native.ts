// electron/signal-native.ts
// Optional native provider backed by libsignal-protocol-c via N-API
import crypto from 'node:crypto';
import path from 'node:path';

let binding: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  binding = require('bindings')({ bindings: 'signal', module_root: path.resolve(process.cwd(), 'native', 'signal') });
  binding.init?.();
} catch {
  binding = null;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bridge = require('./signal-bridge');

// Wrapper that prefers native binding functions when present, otherwise falls back to bridge
const native: any = {
  isStub: binding?.isStub ?? true,
  async generateSignalProtocolIdentity(profile?: string) {
    if (binding?.generateSignalProtocolIdentity) return binding.generateSignalProtocolIdentity(profile);
    return bridge.generateSignalProtocolIdentity?.(profile) ?? bridge.default?.generateSignalProtocolIdentity(profile);
  },
  async generateOneTimePreKeys(profile: string, count: number) {
    if (binding?.generateOneTimePreKeys) {
      const out = await binding.generateOneTimePreKeys(profile, count);
      return (Array.isArray(out) ? out : []).map((k: any) => ({
        id: k?.id ?? k?.keyId,
        publicKeyB64: k?.publicKeyB64 ?? k?.pubB64,
        privateKeyB64: k?.privateKeyB64 ?? k?.privB64,
      })).filter((k: any) => typeof k.publicKeyB64 === 'string' && k.publicKeyB64.length > 0);
    }
    return bridge.generateOneTimePreKeys?.(profile, count) ?? bridge.default?.generateOneTimePreKeys(profile, count);
  },
  async establishSession(profile: string, privateMaterial: any, recipientBundle: any) {
    if (binding?.establishSession) return binding.establishSession(profile, privateMaterial, recipientBundle);
    return bridge.establishSession?.(profile, privateMaterial, recipientBundle) ?? bridge.default?.establishSession(profile, privateMaterial, recipientBundle);
  },
  async encryptMessage(profile: string, sessionId: string, plaintext: string) {
    if (binding?.encryptMessage) return binding.encryptMessage(profile, sessionId, plaintext);
    return bridge.encryptMessage?.(profile, sessionId, plaintext) ?? bridge.default?.encryptMessage(profile, sessionId, plaintext);
  },
  async decryptMessage(profile: string, sessionId: string, ciphertext: string) {
    if (binding?.decryptMessage) return binding.decryptMessage(profile, sessionId, ciphertext);
    return bridge.decryptMessage?.(profile, sessionId, ciphertext) ?? bridge.default?.decryptMessage(profile, sessionId, ciphertext);
  },
  async loadSessionKey(profile: string, sessionId: string, sharedAesKeyB64: string) {
    if (binding?.loadSessionKey) return binding.loadSessionKey(profile, sessionId, sharedAesKeyB64);
    return bridge.loadSessionKey?.(profile, sessionId, sharedAesKeyB64) ?? bridge.default?.loadSessionKey(profile, sessionId, sharedAesKeyB64);
  },
  // Extra helpers used conditionally
  generateEphemeralX25519: bridge.generateEphemeralX25519,
  establishSessionFromEnvelope: bridge.establishSessionFromEnvelope,
  establishSessionWithEph: bridge.establishSessionWithEph,
  establishFromEnvelopeWithOpk: bridge.establishFromEnvelopeWithOpk,
  ratchetEncrypt: bridge.ratchetEncrypt,
  ratchetDecrypt: bridge.ratchetDecrypt,
  ratchetAdvance: bridge.ratchetAdvance,
  decryptWithMessageKey: bridge.decryptWithMessageKey,
  generateRatchetDH: bridge.generateRatchetDH,
  dhRatchetStepSender: bridge.dhRatchetStepSender,
  dhRatchetStepReceiver: bridge.dhRatchetStepReceiver,
};

export const hasNative = !!(binding && binding.isStub !== true);

// Phase 1 scaffold wrappers: these call into the N-API addon when available.
// While the addon is a stub, hasNative stays false and the app continues to use the dev bridge.

export async function generateAccount(): Promise<{
  registrationId: number;
  identityKeyB64: string;
  signedPreKey: { id: number; pubB64: string; sigB64: string };
  oneTimePreKeys: Array<{ id: number; pubB64: string }>;
}> {
  if (!binding) throw new Error('native-signal-unavailable');
  if (typeof binding.generateAccount === 'function') return binding.generateAccount();
  // Bridge shim does not expose generateAccount; derive from existing identity generator
  const id = await native.generateSignalProtocolIdentity?.('default');
  return {
    registrationId: Math.floor(Math.random() * 2 ** 16),
    identityKeyB64: id?.publicBundle?.identityKeyPublicB64,
    signedPreKey: {
      id: 1,
      pubB64: id?.publicBundle?.signedPrekeyPublicB64,
      sigB64: id?.publicBundle?.signedPrekeySignatureB64,
    },
    oneTimePreKeys: [],
  } as any;
}

export async function version(): Promise<string> {
  if (!binding) throw new Error('native-signal-unavailable');
  try { return binding.version?.() ?? 'unknown'; } catch { return 'unknown'; }
}

export async function getPublicBundle(): Promise<{
  registrationId: number;
  identityKeyB64: string;
  signedPreKey: { id: number; pubB64: string; sigB64: string };
  oneTimePreKey?: { id: number; pubB64: string };
}> {
  if (!binding) throw new Error('native-signal-unavailable');
  if (typeof binding.getPublicBundle === 'function') return binding.getPublicBundle();
  const id = await native.generateSignalProtocolIdentity?.('default');
  return {
    registrationId: Math.floor(Math.random() * 2 ** 16),
    identityKeyB64: id?.publicBundle?.identityKeyPublicB64,
    signedPreKey: {
      id: 1,
      pubB64: id?.publicBundle?.signedPrekeyPublicB64,
      sigB64: id?.publicBundle?.signedPrekeySignatureB64,
    },
  } as any;
}

export async function processPreKeyBundle(remoteBundle: unknown): Promise<{ sessionId: string }>{
  if (!binding) throw new Error('native-signal-unavailable');
  if (typeof binding.processPreKeyBundle === 'function') return binding.processPreKeyBundle(remoteBundle);
  // Shim to dev bridge establish
  return native.establishSession?.('default', { /* unused */ }, remoteBundle);
}

export async function exportState(): Promise<string> {
  if (!binding) throw new Error('native-signal-unavailable');
  if (typeof binding.exportState === 'function') return binding.exportState();
  return JSON.stringify({ note: 'bridge-shim; state stored in JS vault' });
}

export async function importState(json: string): Promise<void> {
  if (!binding) throw new Error('native-signal-unavailable');
  if (typeof binding.importState === 'function') return binding.importState(json);
  return;
}

export async function clearState(): Promise<void> {
  if (!binding) throw new Error('native-signal-unavailable');
  if (typeof binding.clearState === 'function') return binding.clearState();
  return;
}

// Back-compat mapping used by Register page in current app
export async function generateSignalProtocolIdentity(profile: string) {
  if (!native) throw new Error('native-signal-unavailable');
  // Delegate to native shim (bridge-backed for now)
  return native.generateSignalProtocolIdentity(profile);
}

export async function generateOneTimePreKeys(profile: string, count: number) {
  if (!native) throw new Error('native-signal-unavailable');
  return native.generateOneTimePreKeys(profile, count);
}

export async function establishSession(profile: string, privateMaterial: any, recipientBundle: any) {
  if (!native) throw new Error('native-signal-unavailable');
  return native.establishSession(profile, privateMaterial, recipientBundle);
}

export async function encryptMessage(profile: string, sessionId: string, plaintext: string) {
  if (!native) throw new Error('native-signal-unavailable');
  return native.encryptMessage(profile, sessionId, plaintext);
}

export async function decryptMessage(profile: string, sessionId: string, ciphertext: string) {
  if (!native) throw new Error('native-signal-unavailable');
  return native.decryptMessage(profile, sessionId, ciphertext);
}

export async function loadSessionKey(profile: string, sessionId: string, sharedAesKeyB64: string) {
  if (!native) throw new Error('native-signal-unavailable');
  return native.loadSessionKey?.(profile, sessionId, sharedAesKeyB64);
}

// Optional helpers (pass-through to bridge in shim)
export const generateEphemeralX25519 = (...args: any[]) => native.generateEphemeralX25519?.(...args);
export const establishSessionFromEnvelope = (...args: any[]) => native.establishSessionFromEnvelope?.(...args);
export const establishFromEnvelopeWithOpk = (...args: any[]) => native.establishFromEnvelopeWithOpk?.(...args);
export const establishSessionWithEph = (...args: any[]) => native.establishSessionWithEph?.(...args);
export const ratchetEncrypt = (...args: any[]) => native.ratchetEncrypt?.(...args);
export const ratchetDecrypt = (...args: any[]) => native.ratchetDecrypt?.(...args);
export const ratchetAdvance = (...args: any[]) => native.ratchetAdvance?.(...args);
export const decryptWithMessageKey = (...args: any[]) => native.decryptWithMessageKey?.(...args);
export const generateRatchetDH = (...args: any[]) => native.generateRatchetDH?.(...args);
export const dhRatchetStepSender = (...args: any[]) => native.dhRatchetStepSender?.(...args);
export const dhRatchetStepReceiver = (...args: any[]) => native.dhRatchetStepReceiver?.(...args);
