# 🔐 PwnChat - Secure End-to-End Encrypted Messaging

<div align="center">

![PwnChat Logo](./conceptual_arts/Frame%201(3).png)

**A production-ready, cross-platform desktop messaging application with Signal Protocol encryption**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-30.5.1-blue.svg)](https://electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.1.1-blue.svg)](https://reactjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://postgresql.org/)

*Combining modern web technologies with military-grade cryptography for private communication*

[🚀 Features](#-features) • [🏗️ Architecture](#️-architecture) • [🔧 Installation](#-installation) • [📚 Documentation](#-documentation)

</div>

---

## 🌟 Overview

PwnChat is a sophisticated desktop messaging application that prioritizes security and privacy above all else. Built with modern web technologies and powered by the Signal Protocol, it provides military-grade end-to-end encryption while maintaining an intuitive user experience. Perfect for security-conscious individuals, organizations requiring private communication, and developers interested in cryptographic implementations.

### 🎯 Key Highlights

- **🔒 Signal Protocol Integration**: Implementation of X3DH key agreement and Double Ratchet encryption
- **⚡ Real-time Messaging**: WebSocket-based communication with instant delivery
- **🖥️ Cross-Platform**: Native desktop applications for Windows, macOS, and Linux
- **🏢 Production-Ready**: Enterprise-grade security with comprehensive error handling
- **🔄 Local Storage**: SQLCipher-encrypted local message storage for offline access
- **👤 Profile Management**: Customizable user profiles with real-time updates

---

## 🔐 Security Features

PwnChat implements industry-standard cryptographic protocols to ensure maximum security:

### Core Cryptographic Features

- **🔑 End-to-End Encryption**: Messages are encrypted on the sender's device and only decrypted on the recipient's device
- **🤝 X3DH Key Agreement**: Secure key establishment using identity keys, ephemeral keys, and one-time prekeys
- **🔄 Double Ratchet**: Forward secrecy with automatic key rotation for every message
- **🛡️ Perfect Forward Secrecy**: Past messages remain secure even if current keys are compromised
- **🔍 Message Authentication**: Cryptographic verification of message integrity and sender identity

### Security Architecture

```
┌─────────────────┐    Encrypted     ┌─────────────────┐    Encrypted     ┌─────────────────┐
│   Client A      │ ───────────────► │   Server        │ ───────────────► │   Client B      │
│                 │    WebSocket     │   (Relay Only)  │    WebSocket     │                 │
│ ┌─────────────┐ │                  │                 │                  │ ┌─────────────┐ │
│ │Local SQLite │ │                  │ ┌─────────────┐ │                  │ │Local SQLite │ │
│ │+ SQLCipher  │ │                  │ │PostgreSQL DB│ │                  │ │+ SQLCipher  │ │
│ │Encrypted DB │ │                  │ │(Ciphertext   │ │                  │ │Encrypted DB │ │
│ └─────────────┘ │                  │ │ Only)       │ │                  │ └─────────────┘ │
└─────────────────┘                  │ └─────────────┘ │                  └─────────────────┘
                                     └─────────────────┘
```

---

## 🏗️ Architecture

PwnChat follows a modern client-server architecture with strong separation of concerns:

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT (Electron)                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Frontend (React + TypeScript)                                                     │
│  ├── React Components (UI/UX)          ├── State Management (React Hooks)        │
│  ├── Socket.IO Client (Real-time)      ├── Axios HTTP Client (API)               │
│  └── React Router (Navigation)         └── Custom Crypto Service (Encryption)    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Electron Main Process                                                             │
│  ├── Window Management                  ├── Native Bridge (C++ Addon)             │
│  ├── SQLCipher Local Storage           ├── IPC Communication                      │
│  └── File System Access                └── Security Context Isolation            │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                           ▼
                                    HTTPS/WSS over TLS
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                  SERVER (Node.js)                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  API Layer (Express.js)                                                            │
│  ├── Authentication (JWT)               ├── Rate Limiting & Security              │
│  ├── Input Validation                   ├── CORS & Helmet Protection              │
│  └── Error Handling                     └── Request/Response Logging              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Real-time Layer (Socket.IO)                                                       │
│  ├── Connection Management              ├── Room-based Messaging                  │
│  ├── Authentication Middleware         ├── Event Broadcasting                     │
│  └── Error Recovery                     └── Connection State Tracking             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Data Layer (PostgreSQL)                                                           │
│  ├── User Management                    ├── Message Storage (Encrypted)           │
│  ├── Key Bundle Storage                 ├── Session Management                    │
│  └── Profile Data                       └── Migration System                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Key Exchange**: X3DH protocol establishes shared secret between users
2. **Message Encryption**: Double Ratchet encrypts messages using derived keys
3. **Transmission**: Encrypted messages sent via WebSocket to server
4. **Server Relay**: Server forwards encrypted messages (never sees plaintext)
5. **Client Decryption**: Recipient decrypts messages using their private keys
6. **Local Storage**: Messages stored locally in encrypted SQLCipher database

---

## 💻 Tech Stack

### Frontend Technologies
- **⚛️ React 19.1.1**: Modern UI library with hooks and concurrent features
- **📘 TypeScript 5.4.0**: Type-safe development with advanced type system
- **🎨 Tailwind CSS**: Utility-first CSS framework for rapid styling
- **🔗 React Router 6.30**: Client-side routing and navigation
- **🌐 Axios**: HTTP client with interceptors and request/response handling
- **🔌 Socket.IO Client**: Real-time bidirectional communication

### Backend Technologies
- **🚀 Node.js 20+**: High-performance JavaScript runtime
- **🌐 Express.js 4.18**: Minimal and flexible web framework
- **🔌 Socket.IO**: Real-time engine with WebSocket fallbacks
- **🛡️ Helmet**: Security middleware for HTTP headers
- **⚡ Rate Limiting**: Express-rate-limit for DDoS protection
- **✅ Input Validation**: Express-validator with comprehensive rules

### Desktop & Native
- **⚡ Electron 30.5.1**: Cross-platform desktop framework
- **🔧 Node-GYP**: Native addon build system
- **💾 SQLCipher**: Encrypted SQLite database for local storage
- **🔐 Native C++ Addon**: libsignal-protocol-c integration
- **🏗️ ESBuild**: Fast bundler for Electron main process

### Database & Storage
- **🐘 PostgreSQL 16**: Advanced relational database
- **🔐 SQLCipher**: Encrypted local storage
- **🗄️ Node-postgres (pg)**: PostgreSQL client for Node.js
- **💾 Better-SQLite3**: High-performance SQLite bindings

### Development & Build Tools
- **⚡ Vite 5.4**: Next-generation build tool
- **📦 Electron Builder**: Automated installer generation
- **🔄 Concurrently**: Parallel script execution
- **🧪 Docker**: Containerized development environment
- **📝 ESLint**: Code linting and quality assurance

### Cryptography & Security
- **🔐 Signal Protocol**: Industry-standard E2E encryption
- **🔑 libsignal-protocol-c**: Native cryptographic implementation
- **🛡️ Argon2**: Memory-hard password hashing
- **🔒 JWT**: Stateless authentication tokens
- **🧂 bcrypt**: Password hashing for authentication

---

## ✨ Features

### 🔐 Security & Privacy
- [x] **End-to-End Encryption** - Signal Protocol implementation
- [x] **Perfect Forward Secrecy** - Automatic key rotation
- [x] **Message Authentication** - Cryptographic integrity verification
- [x] **Local Encrypted Storage** - SQLCipher-protected message history
- [x] **Secure Key Exchange** - X3DH protocol for initial key agreement
- [x] **Session Management** - Secure session establishment and recovery

### 💬 Messaging Features
- [x] **Real-time Messaging** - Instant message delivery via WebSockets
- [x] **Message History** - Persistent conversation history
- [x] **Delivery Status** - Message delivered confirmations
- [x] **User Search** - Find and add contacts by username
- [x] **Profile Pictures** - Custom avatar support with real-time updates
- [x] **Message Pagination** - Efficient loading of conversation history

### 👤 User Experience
- [x] **Modern UI/UX** - Clean, intuitive interface design
- [x] **Dark Mode** - Eye-friendly dark theme
- [x] **Cross-Platform** - Windows, macOS, and Linux support
- [x] **Profile Management** - Customizable user profiles
- [x] **Conversation Management** - Organized chat interface
- [x] **Status Indicators** - Online/offline user status

### 🛠️ Technical Features
- [x] **Production-Ready Backend** - Enterprise-grade API server
- [x] **Database Migrations** - Version-controlled schema changes
- [x] **Error Handling** - Comprehensive error recovery
- [x] **Rate Limiting** - DDoS and spam protection
- [x] **Input Validation** - Secure data processing
- [x] **Logging & Monitoring** - Comprehensive application logging

### 🚧 Roadmap
- [ ] **Group Messaging** - Multi-user encrypted conversations
- [ ] **File Sharing** - Encrypted file transfer capabilities
- [ ] **Voice Messages** - Audio message support
- [ ] **Message Reactions** - Emoji reactions to messages
- [ ] **Message Search** - Full-text search across conversations
- [ ] **Push Notifications** - Desktop notifications for new messages
- [ ] **Backup/Restore** - Secure message backup system
- [ ] **Multi-Device Sync** - Synchronize across multiple devices

---

## 🔧 Installation

### Prerequisites

- **Node.js 20+** - JavaScript runtime
- **Python 3.8+** - Required for native module compilation
- **C++ Build Tools** - Platform-specific compiler toolchain
- **PostgreSQL 16** - Database server
- **Git** - Version control

### Platform-Specific Requirements

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get update && sudo apt-get install -y \
  libsignal-protocol-c-dev \
  libssl-dev \
  pkg-config \
  build-essential \
  python3-dev \
  postgresql-16
```

#### macOS
```bash
# Using Homebrew
brew install pkg-config openssl postgresql@16
xcode-select --install
```

#### Windows
```powershell
# Using Chocolatey
choco install nodejs python3 visualstudio2022buildtools postgresql16
# Or install Visual Studio Build Tools manually
```

### Quick Start

1. **Clone the Repository**
   ```bash
   git clone https://github.com/brucewayne/pwnchat-project.git
   cd pwnchat-project
   ```

2. **Install Dependencies**
   ```bash
   # Install frontend dependencies
   npm install

   # Install backend dependencies
   cd backend && npm install && cd ..
   ```

3. **Set Up Database**
   ```bash
   # Start PostgreSQL service
   sudo systemctl start postgresql  # Linux
   brew services start postgresql@16  # macOS

   # Create database and apply migrations
   docker-compose up -d  # Or use your local PostgreSQL

   # Apply database migrations
   for f in db-init/*.sql; do
       psql -U myuser -d pwnbuffer_chat -h localhost -p 5432 -f "$f"
   done
   ```

4. **Configure Environment**
   ```bash
   # Backend configuration
   cd backend
   cp .env.example .env
   # Edit .env with your database credentials

   # Frontend configuration (if needed)
   cd ..
   cp .env.example .env
   ```

5. **Build Native Dependencies**
   ```bash
   # Build the libsignal addon
   npm run build:native
   ```

6. **Start Development**
   ```bash
   # Terminal 1: Start backend server
   cd backend && npm run dev

   # Terminal 2: Start Electron app
   npm run dev
   ```

### Production Build

```bash
# Build all components
npm run build

# Create platform-specific installers
npm run dist  # (Coming soon with electron-builder setup)
```

---

## 📚 Documentation

### Core Documentation
- [🏗️ **Architecture Guide**](./docs/ARCHITECTURE.md) - System design and component interaction
- [🔐 **Security Implementation**](./docs/SECURITY.md) - Detailed cryptographic analysis
- [🚀 **Deployment Guide**](./docs/DEPLOYMENT.md) - Production deployment instructions
- [💻 **Development Setup**](./docs/DEVELOPMENT.md) - Developer environment configuration

### API Documentation
- [📡 **REST API Reference**](./docs/API.md) - Complete endpoint documentation
- [🔌 **WebSocket Events**](./docs/WEBSOCKETS.md) - Real-time communication protocol
- [💾 **Database Schema**](./docs/database.md) - Database structure and migrations

### Additional Resources
- [🔧 **Troubleshooting**](./docs/TROUBLESHOOTING.md) - Common issues and solutions
- [📈 **Performance Guide**](./docs/PERFORMANCE.md) - Optimization recommendations
- [🧪 **Testing Guide**](./docs/TESTING.md) - Testing strategies and frameworks

---

## 🤝 Contributing

We welcome contributions from the community! Please read our contributing guidelines to get started.

### Development Process

1. **Fork the Repository**
2. **Create a Feature Branch** (`git checkout -b feature/amazing-feature`)
3. **Make Your Changes** with proper testing
4. **Run Tests** (`npm test`)
5. **Commit Changes** (`git commit -m 'Add amazing feature'`)
6. **Push to Branch** (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

### Code Style

- **TypeScript/JavaScript**: ESLint + Prettier configuration
- **React**: Functional components with hooks
- **CSS**: Tailwind utility classes
- **Commits**: Conventional commit format

### Areas for Contribution

- 🐛 **Bug Fixes** - Help identify and resolve issues
- ✨ **New Features** - Implement items from the roadmap
- 📚 **Documentation** - Improve guides and API documentation
- 🧪 **Testing** - Add test coverage and improve test quality
- 🎨 **UI/UX** - Enhance user interface and experience
- 🔐 **Security** - Security auditing and improvements

---

## 📊 Project Stats

- **Lines of Code**: ~15,000+ (TypeScript, JavaScript, SQL, C++)
- **Components**: 25+ React components
- **API Endpoints**: 15+ REST endpoints + WebSocket events
- **Database Tables**: 6 core tables with migration system
- **Supported Platforms**: Windows 10+, macOS 10.15+, Linux (Ubuntu 18+)
- **Bundle Size**: ~50MB (includes native dependencies)

---

## 🛡️ Security Considerations

### Threat Model

PwnChat is designed to protect against:
- **Server Compromise** - E2E encryption ensures server cannot read messages
- **Network Interception** - TLS + Signal Protocol double encryption
- **Client Compromise** - Forward secrecy limits damage from key exposure
- **Metadata Analysis** - Minimal metadata collection and retention

### Security Auditing

- **Cryptographic Review** - Signal Protocol implementation audit
- **Dependency Scanning** - Automated vulnerability detection
- **Code Analysis** - Static analysis for security issues
- **Penetration Testing** - Regular security assessments

### Responsible Disclosure

Found a security issue? Please email security@pwnchat.com with details. We'll respond within 24 hours and provide updates throughout the resolution process.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Open Source Acknowledgments

PwnChat is built upon many excellent open source projects:
- [Signal Protocol](https://signal.org/docs/) - Cryptographic protocol design
- [Electron](https://electronjs.org/) - Cross-platform desktop framework
- [React](https://reactjs.org/) - User interface library
- [PostgreSQL](https://postgresql.org/) - Database management system
- [Node.js](https://nodejs.org/) - JavaScript runtime environment

---

## 👨‍💻 About the Developer

Built with ❤️ by **Bruce Wayne** as a portfolio project demonstrating:

- **Full-Stack Development** - Modern web technologies and APIs
- **Security Engineering** - Cryptographic protocol implementation
- **Desktop Application Development** - Cross-platform native apps
- **Database Design** - Scalable data architecture
- **DevOps & Deployment** - Production-ready infrastructure

### Connect

- 💼 **LinkedIn**: [linkedin.com/in/bruce-wayne](https://linkedin.com/in/bruce-wayne)
- 🐙 **GitHub**: [github.com/brucewayne](https://github.com/brucewayne)
- 📧 **Email**: bruce@wayne-enterprises.com
- 🌐 **Portfolio**: [bruce-wayne.dev](https://bruce-wayne.dev)

---

<div align="center">

**⭐ Star this repository if you found it helpful!**

Made with 🔐 for secure communication

</div>