# PwnChat API Reference

## Table of Contents

- [Authentication](#authentication)
- [User Management](#user-management)
- [Messaging](#messaging)
- [Cryptographic Keys](#cryptographic-keys)
- [WebSocket Events](#websocket-events)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## Base URL

```
https://api.pwnchat.com/api
```

## Authentication

All API endpoints (except registration and login) require JWT authentication.

### Headers

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

### Authentication Endpoints

#### POST /auth/register

Register a new user account.

**Request Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john_doe",
      "email": "john@example.com",
      "display_name": "john_doe",
      "created_at": "2024-01-15T10:30:00Z"
    },
    "tokens": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expires_in": 3600
    }
  }
}
```

**Validation Rules:**
- Username: 3-50 characters, alphanumeric + underscore
- Email: Valid email format
- Password: Minimum 8 characters, must contain uppercase, lowercase, number, and special character

#### POST /auth/login

Authenticate user and receive JWT tokens.

**Request Body:**
```json
{
  "username": "john_doe",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john_doe",
      "email": "john@example.com",
      "display_name": "John Doe",
      "profile_picture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
      "last_login": "2024-01-15T10:30:00Z"
    },
    "tokens": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expires_in": 3600
    }
  }
}
```

#### POST /auth/refresh

Refresh access token using refresh token.

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600
  }
}
```

## User Management

### GET /users/me

Get current user's profile information.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "email": "john@example.com",
    "display_name": "John Doe",
    "profile_picture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-16T14:22:00Z"
  }
}
```

### PUT /users/profile

Update user profile information.

**Request Body:**
```json
{
  "display_name": "John Smith",
  "profile_picture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "display_name": "John Smith",
    "profile_picture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
    "updated_at": "2024-01-16T14:22:00Z"
  }
}
```

### GET /users/search

Search for users by username.

**Query Parameters:**
- `username` (required): Username to search for
- `limit` (optional): Maximum results to return (default: 10, max: 50)

**Example:**
```http
GET /users/search?username=john&limit=5
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "john_doe",
      "display_name": "John Doe",
      "profile_picture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "username": "johnny",
      "display_name": "Johnny Cash",
      "profile_picture": null
    }
  ],
  "metadata": {
    "total": 2,
    "limit": 5
  }
}
```

### GET /users/:userId

Get public profile information for a specific user.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "username": "john_doe",
    "display_name": "John Doe",
    "profile_picture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

## Messaging

### GET /messages/conversations

Get list of conversations for the current user.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "username": "alice_crypto",
      "display_name": "Alice",
      "profile_picture": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
      "last_message": {
        "id": "msg-12345",
        "created_at": "2024-01-16T14:30:00Z",
        "sender_id": "550e8400-e29b-41d4-a716-446655440001"
      }
    }
  ]
}
```

### GET /messages/:peerId

Get message history with a specific user.

**Query Parameters:**
- `limit` (optional): Messages per page (default: 20, max: 100)
- `offset` (optional): Offset for pagination (default: 0)

**Example:**
```http
GET /messages/550e8400-e29b-41d4-a716-446655440001?limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "msg-12345",
      "sender_id": "550e8400-e29b-41d4-a716-446655440000",
      "recipient_id": "550e8400-e29b-41d4-a716-446655440001",
      "ciphertext": "AQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
      "handshake_json": null,
      "header_json": {
        "ratchetKey": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
        "counter": 42,
        "previousCounter": 41
      },
      "created_at": "2024-01-16T14:30:00Z"
    }
  ],
  "metadata": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

### POST /messages

Send an encrypted message to a user.

**Request Body:**
```json
{
  "recipient_id": "550e8400-e29b-41d4-a716-446655440001",
  "ciphertext": "AQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
  "header": {
    "ratchetKey": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
    "counter": 43,
    "previousCounter": 42
  },
  "handshake": {
    "ephPubB64": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
    "kind": "x3dh-opk"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "msg-12346",
    "created_at": "2024-01-16T14:35:00Z",
    "handshake_json": {
      "ephPubB64": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
      "kind": "x3dh-opk"
    },
    "header_json": {
      "ratchetKey": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
      "counter": 43,
      "previousCounter": 42
    }
  }
}
```

## Cryptographic Keys

### GET /keys/:username

Get public key bundle for a user.

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "550e8400-e29b-41d4-a716-446655440001",
    "username": "alice_crypto",
    "identity_key_public": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
    "signed_prekey": {
      "id": 1,
      "public_key": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
      "signature": "MEQCIBxjzHdxfNc8K4..."
    },
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### POST /keys/bundle

Upload user's public key bundle.

**Request Body:**
```json
{
  "identity_key_public": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
  "signed_prekey": {
    "id": 1,
    "public_key": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9...",
    "signature": "MEQCIBxjzHdxfNc8K4..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Key bundle uploaded successfully",
    "key_bundle_id": "kb-12345"
  }
}
```

### POST /keys/prekeys

Upload one-time prekeys.

**Request Body:**
```json
{
  "prekeys": [
    {
      "id": 1,
      "public_key": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9..."
    },
    {
      "id": 2,
      "public_key": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9..."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Prekeys uploaded successfully",
    "count": 2
  }
}
```

### GET /keys/:username/prekey

Get a one-time prekey for a user.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 5,
    "public_key": "BQICAxABEiEAoJJ5FfGwVVdXgzQf9..."
  }
}
```

## WebSocket Events

Connect to WebSocket endpoint: `wss://api.pwnchat.com/socket.io/`

### Authentication

WebSocket connections must authenticate on connection:

```javascript
const socket = io('wss://api.pwnchat.com', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Client Events (Outgoing)

#### profile:picture:update

Update profile picture in real-time.

```javascript
socket.emit('profile:picture:update', {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  profilePicUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...'
});
```

### Server Events (Incoming)

#### private:message

Receive an encrypted message.

```javascript
socket.on('private:message', (data) => {
  console.log('New message:', data);
  // {
  //   id: 'msg-12347',
  //   senderId: '550e8400-e29b-41d4-a716-446655440001',
  //   senderUsername: 'alice_crypto',
  //   ciphertext: 'AQICAxABEiEAoJJ5FfGwVVdXgzQf9...',
  //   header: { ... },
  //   handshake: { ... },
  //   created_at: '2024-01-16T14:40:00Z'
  // }
});
```

#### message:delivered

Confirmation that message was delivered.

```javascript
socket.on('message:delivered', (data) => {
  console.log('Message delivered:', data);
  // {
  //   id: 'msg-12346',
  //   recipientId: '550e8400-e29b-41d4-a716-446655440001',
  //   created_at: '2024-01-16T14:35:00Z'
  // }
});
```

#### profile:picture:updated

User updated their profile picture.

```javascript
socket.on('profile:picture:updated', (data) => {
  console.log('Profile updated:', data);
  // {
  //   userId: '550e8400-e29b-41d4-a716-446655440001',
  //   profilePicUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...'
  // }
});
```

## Error Handling

### Error Response Format

All errors follow this standard format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Username is required",
    "details": {
      "field": "username",
      "value": "",
      "constraint": "required"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Access denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

### Cryptographic Errors

| Code | Description |
|------|-------------|
| `CRYPTO_INIT_FAILED` | Cryptographic initialization failed |
| `INVALID_KEY_BUNDLE` | Key bundle validation failed |
| `ENCRYPTION_FAILED` | Message encryption failed |
| `DECRYPTION_FAILED` | Message decryption failed |
| `SESSION_NOT_FOUND` | Cryptographic session not established |

## Rate Limiting

### Limits

| Endpoint Category | Rate Limit | Window |
|------------------|------------|--------|
| Authentication | 5 requests | 15 minutes |
| API Endpoints | 100 requests | 15 minutes |
| Message Sending | 60 messages | 1 minute |
| Key Operations | 10 requests | 1 minute |

### Headers

Rate limit information is included in response headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1642334400
```

### Rate Limit Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 900 seconds.",
    "details": {
      "limit": 100,
      "remaining": 0,
      "reset": 1642334400
    }
  }
}
```

## Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');
const io = require('socket.io-client');

class PwnChatAPI {
  constructor(baseURL, token) {
    this.baseURL = baseURL;
    this.token = token;
    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async sendMessage(recipientId, ciphertext, header, handshake = null) {
    try {
      const response = await this.client.post('/messages', {
        recipient_id: recipientId,
        ciphertext,
        header,
        handshake
      });
      return response.data;
    } catch (error) {
      console.error('Send message error:', error.response?.data);
      throw error;
    }
  }

  async getMessages(peerId, limit = 20, offset = 0) {
    try {
      const response = await this.client.get(`/messages/${peerId}`, {
        params: { limit, offset }
      });
      return response.data;
    } catch (error) {
      console.error('Get messages error:', error.response?.data);
      throw error;
    }
  }

  connectWebSocket() {
    const socket = io(this.baseURL.replace('/api', ''), {
      auth: { token: this.token }
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket');
    });

    socket.on('private:message', (message) => {
      console.log('New message received:', message);
      // Handle incoming encrypted message
    });

    socket.on('message:delivered', (delivery) => {
      console.log('Message delivered:', delivery);
      // Update UI to show delivery status
    });

    return socket;
  }
}

// Usage
const api = new PwnChatAPI('https://api.pwnchat.com/api', 'your-jwt-token');
const socket = api.connectWebSocket();

// Send a message
api.sendMessage(
  'recipient-user-id',
  'encrypted-message-content',
  { ratchetKey: '...', counter: 1 }
).then(result => {
  console.log('Message sent:', result);
});
```

### Python

```python
import requests
import socketio

class PwnChatAPI:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        })

    def send_message(self, recipient_id, ciphertext, header, handshake=None):
        payload = {
            'recipient_id': recipient_id,
            'ciphertext': ciphertext,
            'header': header
        }
        if handshake:
            payload['handshake'] = handshake

        response = self.session.post(f'{self.base_url}/messages', json=payload)
        response.raise_for_status()
        return response.json()

    def get_messages(self, peer_id, limit=20, offset=0):
        params = {'limit': limit, 'offset': offset}
        response = self.session.get(f'{self.base_url}/messages/{peer_id}', params=params)
        response.raise_for_status()
        return response.json()

    def connect_websocket(self):
        sio = socketio.Client()

        @sio.event
        def connect():
            print('Connected to WebSocket')

        @sio.on('private:message')
        def on_message(data):
            print('New message:', data)

        @sio.on('message:delivered')
        def on_delivered(data):
            print('Message delivered:', data)

        sio.connect(self.base_url.replace('/api', ''),
                   auth={'token': self.token})
        return sio

# Usage
api = PwnChatAPI('https://api.pwnchat.com/api', 'your-jwt-token')
socket = api.connect_websocket()

# Send a message
result = api.send_message(
    'recipient-user-id',
    'encrypted-message-content',
    {'ratchetKey': '...', 'counter': 1}
)
print('Message sent:', result)
```

This API reference provides comprehensive documentation for integrating with the PwnChat backend services, including authentication, messaging, key management, and real-time communication.