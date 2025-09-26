Libsignal Integration Plan

Goal
- Replace the development crypto bridge with libsignal-protocol-c via a Node N-API addon for production-grade X3DH + Double Ratchet.

Status
- The app runs on a native-provider shim that delegates to the dev bridge, so UX is stable while native code is implemented.
- IPC and vault persistence paths exist for native state export/import.

Build Prereqs
- Node.js 20+, Python 3, C/C++ toolchain.
- libsignal-protocol-c and its dependencies (OpenSSL, protobuf-c on some platforms). On Linux/macOS, prefer pkg-config.

Linux Quickstart
- Install headers and libs: `sudo apt-get update && sudo apt-get install -y libsignal-protocol-c-dev libssl-dev pkg-config build-essential`
- Build the addon: `npm run build:native`
- Run the app dev build: `npm run dev`

Native Build
- binding.gyp already contains pkg-config hooks.
- Build addon: npm run build:native
  - On Linux we also link OpenSSL’s libcrypto for the crypto provider.

Addon API Surface (native/signal)
- version(): string
- generateAccount(): identity/regId/SPK/OPKs
- getPublicBundle(): PreKeyBundle JSON
- processPreKeyBundle(remote): X3DH
- encrypt(sessionId, ptB64): SignalMessage/PreKeyMessage
- decrypt(sessionId, ctB64): plaintext
- exportState()/importState(json): stores round-trip
- clearState()

Stores
- In Phase 1 keep in-memory stores in the addon and JSON export/import.
- Phase 2 uses electron/vault via IPC to persist identity, prekeys, and sessions in SQLCipher.
  - Current scaffold initializes a memory store and an OpenSSL-backed crypto provider.

Wiring
- electron/signal-native.ts wraps the addon and provides a shim to the existing JS bridge when addon is unavailable.
- electron/main.ts prefers the native provider automatically when addon is non-stub.

Testing
- Headless: two local accounts (A/B), processPreKeyBundle, encrypt/decrypt both ways, then export/import + decrypt again.
- UI: two partitions in one Electron instance, or two separate processes.
