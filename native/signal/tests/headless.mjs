import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bindings from 'bindings';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.resolve(__dirname, '..');

const signal = bindings({ bindings: 'signal', module_root: moduleRoot });
if (typeof signal.init === 'function') signal.init();

function resetAndImport(state) {
  if (typeof signal.clearState === 'function') signal.clearState();
  if (state) signal.importState(state);
}

function exportState() {
  return typeof signal.exportState === 'function' ? signal.exportState() : '';
}

function logState(label, state) {
  assert.ok(typeof state === 'string' && state.length > 0, `${label} state should be non-empty`);
  JSON.parse(state); // ensure valid JSON
}

try {
  // Alice account bootstrap
  resetAndImport();
  const aliceAccount = signal.generateAccount();
  assert.ok(aliceAccount?.registrationId, 'alice registration id');
  const aliceBundle = signal.getPublicBundle();
  const aliceInitialState = exportState();
  logState('alice initial', aliceInitialState);

  // Bob account bootstrap
  resetAndImport();
  const bobAccount = signal.generateAccount();
  assert.ok(bobAccount?.registrationId, 'bob registration id');
  const bobBundle = signal.getPublicBundle();
  const bobInitialState = exportState();
  logState('bob initial', bobInitialState);

  // Alice encrypts to Bob
  resetAndImport(aliceInitialState);
  const ensureSession = signal.processPreKeyBundle(bobBundle);
  assert.ok(ensureSession?.sessionId, 'alice session id');
  const msg1 = signal.encryptMessage(undefined, bobBundle.identityKeyB64, 'hello bob');
  assert.ok(typeof msg1?.ciphertext === 'string' && msg1.ciphertext.length > 0, 'ciphertext present');
  const aliceAfterSend = exportState();

  // Bob decrypts, then exports state
  resetAndImport(bobInitialState);
  const plain1 = signal.decryptMessage(undefined, aliceBundle.identityKeyB64, msg1.ciphertext);
  assert.equal(plain1?.plaintext, 'hello bob', 'round trip plaintext');
  const bobAfterRecv = exportState();

  // Bob replies to Alice using persisted state
  resetAndImport(bobAfterRecv);
  const bobSession = signal.processPreKeyBundle(aliceBundle);
  assert.ok(bobSession?.sessionId, 'bob session id');
  const msg2 = signal.encryptMessage(undefined, aliceBundle.identityKeyB64, 'hi alice');
  assert.ok(typeof msg2?.ciphertext === 'string' && msg2.ciphertext.length > 0, 'reply ciphertext present');
  const bobFinalState = exportState();

  // Alice decrypts Bob's reply after importing prior state
  resetAndImport(aliceAfterSend);
  const plain2 = signal.decryptMessage(undefined, bobBundle.identityKeyB64, msg2.ciphertext);
  assert.equal(plain2?.plaintext, 'hi alice', 'reply plaintext');
  const aliceFinalState = exportState();

  // Verify export/import cycles remain valid
  resetAndImport(aliceFinalState);
  const finalExport = exportState();
  logState('alice final', finalExport);

  resetAndImport(bobFinalState);
  const bobExport = exportState();
  logState('bob final', bobExport);

  console.log('native/signal headless test: PASSED');
} catch (err) {
  console.error('native/signal headless test: FAILED');
  console.error(err);
  process.exitCode = 1;
}
