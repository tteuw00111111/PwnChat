# PwnChat Architecture Guide

## Table of Contents

- [System Overview](#system-overview)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Database Design](#database-design)
- [Electron Integration](#electron-integration)
- [Cryptographic Architecture](#cryptographic-architecture)
- [Communication Protocols](#communication-protocols)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [Deployment Architecture](#deployment-architecture)
- [Performance Considerations](#performance-considerations)

## System Overview

PwnChat follows a modern three-tier architecture with strong separation of concerns:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION TIER                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Electron Application                         │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │    │
│  │  │   React UI      │  │  Crypto Service │  │  Local Storage  │  │    │
│  │  │   Components    │  │   (Signal)      │  │   (SQLCipher)   │  │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲▼ IPC/API
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION TIER                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Node.js Server                            │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │    │
│  │  │   Express API   │  │   Socket.IO     │  │   Auth/Security │  │    │
│  │  │   Endpoints     │  │   Real-time     │  │   Middleware    │  │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲▼ SQL
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA TIER                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     PostgreSQL Database                        │    │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │    │
│  │  │     Users       │  │    Messages     │  │   Key Bundles   │  │    │
│  │  │   & Profiles    │  │   (Encrypted)   │  │   & Sessions    │  │    │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Principles

1. **Security by Design**: End-to-end encryption at the application layer
2. **Separation of Concerns**: Clear boundaries between UI, business logic, and data
3. **Scalability**: Stateless server design with horizontal scaling capability
4. **Maintainability**: Modular architecture with well-defined interfaces
5. **Performance**: Efficient message handling and local caching

## Frontend Architecture

### React Component Hierarchy

```
App.tsx
├── PrivateRoute.tsx (Route Protection)
├── pages/
│   ├── Login.tsx
│   ├── Register.tsx
│   └── ChatPage.tsx (Main Application)
│       ├── MainLayout.tsx
│       │   ├── Sidebar.tsx
│       │   │   ├── UserSearch.tsx
│       │   │   ├── ConversationList.tsx
│       │   │   │   └── ConversationItem.tsx
│       │   │   └── HamburgerMenu.tsx
│       │   │       ├── UserProfilePanel.tsx
│       │   │       │   └── PhotoEditor.tsx
│       │   │       └── SettingsPanel.tsx
│       │   └── ChatWindow.tsx
│       │       ├── ChatHeader.tsx
│       │       ├── MessageInput.tsx
│       │       └── Message.tsx (Individual Messages)
│       └── Toast.tsx (Notifications)
```

### State Management Architecture

```typescript
// Global State (React Context/Hooks)
interface AppState {
  // Authentication
  user: UserInfo | null;
  isAuthenticated: boolean;

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;

  // Messages
  messages: Record<string, Message[]>;
  messageOffset: number;
  hasMoreMessages: Record<string, boolean>;

  // UI State
  loading: boolean;
  errorMessage: string | null;
  toasts: ToastItem[];
}

// Service Layer
class CryptoService {
  async encrypt(recipient: Recipient, plaintext: string): Promise<EncryptedMessage>
  async decrypt(sender: Sender, ciphertext: string): Promise<string>
  async initIdentity(): Promise<void>
  async warmUpSession(username: string, userId: string): Promise<void>
}

class LocalMessageService {
  async initialize(): Promise<void>
  async saveIncomingMessage(senderId: string, message: string): Promise<void>
  async saveOutgoingMessage(recipientId: string, message: string): Promise<void>
  async getConversationHistory(conversationId: string): Promise<Message[]>
}
```

### Component Communication Patterns

1. **Props Down**: Data flows down through component props
2. **Events Up**: User actions bubble up through event handlers
3. **Context Providers**: Shared state via React Context
4. **Custom Hooks**: Reusable stateful logic
5. **Event Emitters**: Cross-component communication for real-time updates

```typescript
// Example: Real-time profile picture updates
useEffect(() => {
  const handleProfilePictureUpdate = (event: CustomEvent) => {
    const { userId, profilePicUrl } = event.detail;
    if (contactUserId === userId) {
      setCurrentProfilePic(profilePicUrl);
    }
  };

  window.addEventListener('profilePictureUpdated', handleProfilePictureUpdate);
  return () => window.removeEventListener('profilePictureUpdated', handleProfilePictureUpdate);
}, [contactUserId]);
```

## Backend Architecture

### Express.js Server Structure

```
backend/
├── server.js (Entry Point)
├── routes/
│   ├── auth.js (Authentication endpoints)
│   ├── users.js (User management)
│   ├── messages.js (Message handling)
│   ├── keys.js (Key bundle management)
│   └── sessions.js (Session management)
├── middleware/
│   ├── auth_middleware.js (JWT validation)
│   ├── security.js (Rate limiting, CORS)
│   └── validation.js (Input validation)
├── db/
│   └── index.js (Database connection)
└── utils/
    └── helpers.js (Utility functions)
```

### API Layer Design

```javascript
// RESTful API endpoints
const apiRoutes = {
  // Authentication
  'POST /api/auth/login': loginHandler,
  'POST /api/auth/register': registerHandler,
  'POST /api/auth/refresh': refreshHandler,

  // User management
  'GET /api/users/me': getUserProfile,
  'PUT /api/users/profile': updateProfile,
  'GET /api/users/search': searchUsers,

  // Messaging
  'GET /api/messages/:peerId': getMessageHistory,
  'POST /api/messages': sendMessage,
  'GET /api/messages/conversations': getConversations,

  // Cryptographic keys
  'GET /api/keys/:username': getKeyBundle,
  'POST /api/keys/bundle': uploadKeyBundle,
  'POST /api/keys/prekeys': uploadPrekeys,
  'GET /api/keys/:username/prekey': getOneTimePrekey
};
```

### Middleware Stack

```javascript
// Security-first middleware stack
app.use(helmet()); // Security headers
app.use(cors(corsOptions)); // CORS policy
app.use(rateLimiter); // Rate limiting
app.use(express.json({ limit: '10mb' })); // JSON parsing
app.use(validator); // Input validation
app.use(authenticateToken); // JWT authentication
app.use(errorHandler); // Error handling
```

### Socket.IO Real-time Layer

```javascript
// WebSocket event handling
io.use(socketAuthMiddleware); // Authenticate connections

io.on('connection', (socket) => {
  const userId = socket.user.userId;

  // Add to user socket mapping
  userSocketMap.set(userId, socket);

  // Handle profile picture updates
  socket.on('profile:picture:update', (data) => {
    socket.broadcast.emit('profile:picture:updated', data);
  });

  // Handle message delivery
  socket.on('message:send', async (data) => {
    const recipientSockets = userSocketMap.get(data.recipientId);
    if (recipientSockets) {
      recipientSockets.emit('private:message', data);
    }
  });
});
```

## Database Design

### PostgreSQL Schema

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    profile_picture TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Key bundles for Signal Protocol
CREATE TABLE key_bundles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    identity_key_public TEXT NOT NULL,
    signed_prekey_id INTEGER NOT NULL,
    signed_prekey_public TEXT NOT NULL,
    signed_prekey_signature TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- One-time prekeys
CREATE TABLE one_time_prekeys (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_id INTEGER NOT NULL,
    public_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, key_id)
);

-- Messages (encrypted)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL, -- Encrypted message content
    handshake_json JSONB, -- X3DH handshake data
    header_json JSONB, -- Double Ratchet header
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User sessions for cryptographic state
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID REFERENCES users(id) ON DELETE CASCADE,
    user_b_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_data JSONB NOT NULL, -- Encrypted session state
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_a_id, user_b_id)
);
```

### Indexing Strategy

```sql
-- Performance indexes
CREATE INDEX idx_messages_sender_recipient ON messages(sender_id, recipient_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_key_bundles_user_id ON key_bundles(user_id);
CREATE INDEX idx_one_time_prekeys_user_id ON one_time_prekeys(user_id) WHERE NOT used;
```

### Data Partitioning (Future)

```sql
-- Partition messages by month for scalability
CREATE TABLE messages_y2024m01 PARTITION OF messages
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

## Electron Integration

### Main Process Architecture

```typescript
// electron/main.ts
class ElectronMain {
  private mainWindow: BrowserWindow;
  private vaultService: VaultService;
  private signalBridge: SignalBridge;

  async initialize() {
    // Create main window
    this.mainWindow = this.createMainWindow();

    // Initialize secure storage
    this.vaultService = new VaultService();
    await this.vaultService.unlock();

    // Initialize cryptographic bridge
    this.signalBridge = new SignalBridge();

    // Set up IPC handlers
    this.setupIPCHandlers();
  }

  private setupIPCHandlers() {
    ipcMain.handle('vault:store', this.handleVaultStore.bind(this));
    ipcMain.handle('vault:retrieve', this.handleVaultRetrieve.bind(this));
    ipcMain.handle('crypto:encrypt', this.handleCryptoEncrypt.bind(this));
    ipcMain.handle('crypto:decrypt', this.handleCryptoDecrypt.bind(this));
  }
}
```

### Preload Script Security

```typescript
// electron/preload.ts
const electronAPI = {
  // Secure IPC communication
  vault: {
    store: (key: string, value: any) => ipcRenderer.invoke('vault:store', key, value),
    retrieve: (key: string) => ipcRenderer.invoke('vault:retrieve', key)
  },

  crypto: {
    encrypt: (data: any) => ipcRenderer.invoke('crypto:encrypt', data),
    decrypt: (data: any) => ipcRenderer.invoke('crypto:decrypt', data)
  },

  // Event listeners
  onProfileUpdate: (callback: Function) => {
    ipcRenderer.on('profile:updated', callback);
    return () => ipcRenderer.removeListener('profile:updated', callback);
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
```

### Native Module Integration

```cpp
// native/signal/src/signal_addon.cc
#include <napi.h>
#include <signal/signal_protocol.h>

namespace SignalAddon {
  Napi::Value GenerateKeyPair(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    // Generate Curve25519 key pair
    signal_buffer* public_key;
    signal_buffer* private_key;

    int result = curve_generate_key_pair(global_context, &public_key, &private_key);
    if (result != 0) {
      Napi::TypeError::New(env, "Key generation failed").ThrowAsJavaScriptException();
      return env.Null();
    }

    // Convert to Node.js buffers
    Napi::Object keyPair = Napi::Object::New(env);
    keyPair.Set("publicKey",
      Napi::Buffer<uint8_t>::Copy(env,
        signal_buffer_data(public_key),
        signal_buffer_len(public_key)));
    keyPair.Set("privateKey",
      Napi::Buffer<uint8_t>::Copy(env,
        signal_buffer_data(private_key),
        signal_buffer_len(private_key)));

    // Clean up
    signal_buffer_free(public_key);
    signal_buffer_free(private_key);

    return keyPair;
  }

  Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("generateKeyPair", Napi::Function::New(env, GenerateKeyPair));
    return exports;
  }
}

NODE_API_MODULE(signal_addon, SignalAddon::Init)
```

## Cryptographic Architecture

### Signal Protocol Implementation

```typescript
class SignalProtocolService {
  private identityKeyStore: IdentityKeyStore;
  private preKeyStore: PreKeyStore;
  private signedPreKeyStore: SignedPreKeyStore;
  private sessionStore: SessionStore;

  async initIdentity(): Promise<void> {
    // Generate identity key pair
    const identityKeyPair = await this.generateIdentityKeyPair();
    this.identityKeyStore.saveIdentity(identityKeyPair);

    // Generate signed prekey
    const signedPreKey = await this.generateSignedPreKey(identityKeyPair);
    this.signedPreKeyStore.storeSignedPreKey(signedPreKey.keyId, signedPreKey);

    // Generate one-time prekeys
    const preKeys = await this.generatePreKeys(0, 100);
    preKeys.forEach(preKey => {
      this.preKeyStore.storePreKey(preKey.keyId, preKey);
    });

    // Upload key bundle to server
    await this.uploadKeyBundle({
      identityKey: identityKeyPair.publicKey,
      signedPreKey: signedPreKey,
      preKeys: preKeys.map(pk => ({ keyId: pk.keyId, publicKey: pk.keyPair.publicKey }))
    });
  }

  async encrypt(address: ProtocolAddress, plaintext: string): Promise<CiphertextMessage> {
    const sessionCipher = new SessionCipher(
      this.sessionStore,
      this.preKeyStore,
      this.signedPreKeyStore,
      this.identityKeyStore,
      address
    );

    return await sessionCipher.encrypt(Buffer.from(plaintext, 'utf8'));
  }

  async decrypt(address: ProtocolAddress, ciphertext: CiphertextMessage): Promise<string> {
    const sessionCipher = new SessionCipher(
      this.sessionStore,
      this.preKeyStore,
      this.signedPreKeyStore,
      this.identityKeyStore,
      address
    );

    const decrypted = await sessionCipher.decrypt(ciphertext);
    return decrypted.toString('utf8');
  }
}
```

### Local Storage Encryption

```typescript
class VaultService {
  private db: Database;
  private masterKey: CryptoKey;

  async unlock(passphrase: string): Promise<void> {
    // Derive master key from passphrase
    this.masterKey = await this.deriveKey(passphrase);

    // Open encrypted SQLCipher database
    this.db = new Database('vault.db');
    this.db.pragma(`key = '${await this.encodeKey(this.masterKey)}'`);
    this.db.pragma('cipher = "aes-256-cbc"');
    this.db.pragma('kdf_iter = 256000');
  }

  async store(key: string, value: any): Promise<void> {
    const encrypted = await this.encrypt(JSON.stringify(value));
    this.db.prepare('INSERT OR REPLACE INTO vault (key, value) VALUES (?, ?)')
           .run(key, encrypted);
  }

  async retrieve(key: string): Promise<any> {
    const row = this.db.prepare('SELECT value FROM vault WHERE key = ?').get(key);
    if (!row) return null;

    const decrypted = await this.decrypt(row.value);
    return JSON.parse(decrypted);
  }

  private async encrypt(plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.masterKey,
      encoded
    );

    return Buffer.from(iv).toString('base64') + ':' +
           Buffer.from(ciphertext).toString('base64');
  }
}
```

## Communication Protocols

### WebSocket Protocol

```typescript
// Message types for real-time communication
interface WebSocketMessage {
  type: 'private:message' | 'message:delivered' | 'profile:picture:updated' | 'typing:start' | 'typing:stop';
  data: any;
  timestamp: string;
  messageId: string;
}

// Private message format
interface PrivateMessage {
  senderId: string;
  senderUsername: string;
  ciphertext: string;
  header?: DoubleRatchetHeader;
  handshake?: X3DHHandshake;
  created_at: string;
}
```

### HTTP API Protocol

```typescript
// Standardized API response format
interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

// Error handling
class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
  }
}
```

## Data Flow

### Message Sending Flow

```
User types message
         ↓
UI Component (MessageInput)
         ↓
Crypto Service encrypts
         ↓
API call to backend
         ↓
Server stores encrypted message
         ↓
WebSocket broadcast to recipient
         ↓
Recipient decrypts message
         ↓
Local storage update
         ↓
UI re-renders with new message
```

### Key Exchange Flow

```
User A wants to message User B
         ↓
A fetches B's key bundle from server
         ↓
A performs X3DH key agreement
         ↓
A initializes Double Ratchet session
         ↓
A encrypts first message with handshake
         ↓
B receives message and handshake
         ↓
B completes session establishment
         ↓
Both parties can exchange messages
```

## Performance Considerations

### Frontend Optimization

1. **Virtual Scrolling**: Large message lists use virtualization
2. **Message Pagination**: Load messages in chunks
3. **Image Lazy Loading**: Profile pictures loaded on demand
4. **Debounced API Calls**: Prevent excessive server requests
5. **Local Caching**: Frequently accessed data cached locally

### Backend Optimization

1. **Connection Pooling**: PostgreSQL connections pooled and reused
2. **Database Indexing**: Strategic indexes for common queries
3. **Rate Limiting**: Prevent abuse and ensure fair usage
4. **Stateless Design**: Horizontal scaling capability
5. **Efficient Queries**: Optimized SQL with proper JOIN strategies

### Memory Management

```typescript
// Secure memory cleanup
class SecureBuffer {
  private buffer: Uint8Array;

  constructor(size: number) {
    this.buffer = new Uint8Array(size);
  }

  destroy(): void {
    // Secure wipe of sensitive data
    this.buffer.fill(0);
    // Force garbage collection (if available)
    if (global.gc) global.gc();
  }
}
```

This architecture provides a solid foundation for a secure, scalable, and maintainable messaging application with strong cryptographic guarantees and modern development practices.