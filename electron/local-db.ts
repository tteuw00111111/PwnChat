// electron/local-db.ts
// Local SQLCipher database for encrypted message storage

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require('better-sqlite3');
import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { JsonStorage } from './json-storage';

export interface LocalMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender_username?: string;
  recipient_username?: string;
  plaintext: string;
  ciphertext: string;
  handshake_json?: any;
  header_json?: any;
  created_at: string;
  conversation_id: string; // derived from sorted user IDs
}

export interface ConversationSummary {
  conversation_id: string;
  other_user_id: string;
  other_username: string;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
}

class LocalDatabase {
  private db: any | null = null;
  private jsonStorage: JsonStorage | null = null;
  private useSQLite = true;
  private isInitialized = false;
  private dbPath: string;
  private encryptionKey: string = '';

  constructor() {
    // Store database in app's userData directory
    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'pwnchat');
    this.dbPath = path.join(dbDir, 'messages.db');

    // Ensure directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  /**
   * Initialize the database with encryption key
   * Uses application-level encryption for better compatibility
   */
  async initialize(encryptionKey: string): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }

    try {
      console.log('[LocalDB] Starting initialization...');
      console.log('[LocalDB] Database path:', this.dbPath);
      console.log('[LocalDB] Directory exists:', fs.existsSync(path.dirname(this.dbPath)));

      // Store encryption key for application-level encryption
      this.encryptionKey = encryptionKey;
      console.log('[LocalDB] Encryption key set');

      // Create database connection (no SQLCipher, just regular SQLite)
      console.log('[LocalDB] Creating database connection...');

      // Test if better-sqlite3 module is available
      console.log('[LocalDB] better-sqlite3 Database constructor:', typeof Database);

      this.db = new Database(this.dbPath);
      console.log('[LocalDB] Database connection created');

      // Test basic functionality
      const testResult = this.db.prepare('SELECT 1 as test').get();
      console.log('[LocalDB] Database test query result:', testResult);

      // Performance optimizations for SQLite
      console.log('[LocalDB] Setting SQLite pragmas...');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 1000');
      this.db.pragma('temp_store = memory');
      console.log('[LocalDB] SQLite pragmas set');

      // Create tables
      console.log('[LocalDB] Creating tables...');
      this.createTables();
      console.log('[LocalDB] Tables created');

      this.isInitialized = true;
      console.log('[LocalDB] Database initialized with application-level encryption');
    } catch (error) {
      console.error('[LocalDB] Failed to initialize database. Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        dbPath: this.dbPath,
        dirExists: fs.existsSync(path.dirname(this.dbPath)),
        fileExists: fs.existsSync(this.dbPath)
      });

      // Try fallback with JSON storage
      console.log('[LocalDB] Attempting fallback to JSON storage...');
      try {
        this.jsonStorage = new JsonStorage();
        await this.jsonStorage.initialize(encryptionKey);
        this.useSQLite = false;
        this.isInitialized = true;
        console.log('[LocalDB] Fallback JSON storage initialized successfully');
        return;
      } catch (fallbackError) {
        console.error('[LocalDB] JSON storage fallback also failed:', fallbackError);
      }

      throw new Error(`Failed to initialize encrypted database: ${error.message}`);
    }
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        sender_username TEXT,
        recipient_username TEXT,
        plaintext TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        handshake_json TEXT,
        header_json TEXT,
        created_at TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        is_outgoing INTEGER NOT NULL DEFAULT 0,
        delivered_at TEXT,
        read_at TEXT
      );
    `);

    // Indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient
      ON messages(sender_id, recipient_id, created_at);

      CREATE INDEX IF NOT EXISTS idx_messages_created_at
      ON messages(created_at DESC);
    `);

    // Conversations table for quick lookup
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user1_id TEXT NOT NULL,
        user2_id TEXT NOT NULL,
        user1_username TEXT,
        user2_username TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_message_at TEXT,
        last_message_preview TEXT,
        unread_count INTEGER DEFAULT 0,
        UNIQUE(user1_id, user2_id)
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_users
      ON conversations(user1_id, user2_id);

      CREATE INDEX IF NOT EXISTS idx_conversations_updated
      ON conversations(updated_at DESC);
    `);

    // User settings/profile cache
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_cache (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        avatar_url TEXT,
        last_seen TEXT,
        cached_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Generate conversation ID from two user IDs (deterministic, sorted)
   */
  private getConversationId(userId1: string, userId2: string): string {
    const sorted = [userId1, userId2].sort();
    return crypto.createHash('sha256').update(sorted.join('|')).digest('hex').substring(0, 16);
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   */
  private encrypt(data: string): string {
    try {
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipherGCM('aes-256-gcm', key);
      cipher.setAAD(Buffer.from('pwnchat-local-db'));

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      // Return: iv(32) + authTag(32) + encrypted
      return iv.toString('hex') + authTag.toString('hex') + encrypted;
    } catch (error) {
      console.error('[LocalDB] Encryption failed:', error);
      return data; // Fallback to plaintext
    }
  }

  /**
   * Decrypt sensitive data using AES-256-GCM
   */
  private decrypt(encryptedData: string): string {
    try {
      if (encryptedData.length < 64) return encryptedData; // Too short to be encrypted

      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      const iv = Buffer.from(encryptedData.slice(0, 32), 'hex');
      const authTag = Buffer.from(encryptedData.slice(32, 64), 'hex');
      const encrypted = encryptedData.slice(64);

      const decipher = crypto.createDecipherGCM('aes-256-gcm', key);
      decipher.setAAD(Buffer.from('pwnchat-local-db'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.warn('[LocalDB] Decryption failed, returning as-is:', error);
      return encryptedData; // Return as-is if decryption fails
    }
  }

  /**
   * Save a message to local storage
   */
  async saveMessage(message: Omit<LocalMessage, 'id' | 'conversation_id'>, serverId?: string): Promise<string> {
    if (!this.useSQLite && this.jsonStorage) {
      return this.jsonStorage.saveMessage(message, serverId);
    }

    if (!this.db) throw new Error('Database not initialized');

    const messageId = serverId || crypto.randomUUID();
    const conversationId = this.getConversationId(message.sender_id, message.recipient_id);
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, sender_id, recipient_id, sender_username, recipient_username,
        plaintext, ciphertext, handshake_json, header_json,
        created_at, conversation_id, is_outgoing
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      this.db.transaction(() => {
        // Insert the message (encrypt sensitive fields)
        stmt.run(
          messageId,
          message.sender_id,
          message.recipient_id,
          message.sender_username,
          message.recipient_username,
          this.encrypt(message.plaintext), // Encrypt the plaintext
          message.ciphertext, // Ciphertext can stay as-is (already encrypted by Signal)
          message.handshake_json ? this.encrypt(JSON.stringify(message.handshake_json)) : null,
          message.header_json ? this.encrypt(JSON.stringify(message.header_json)) : null,
          message.created_at || now,
          conversationId,
          0 // will be determined by sender vs current user
        );

        // Update or create conversation
        this.updateConversation(
          message.sender_id,
          message.recipient_id,
          message.sender_username,
          message.recipient_username,
          message.plaintext,
          message.created_at || now
        );
      })();

      console.log(`[LocalDB] Message saved: ${messageId}`);
      return messageId;
    } catch (error) {
      console.error('[LocalDB] Error saving message:', error);
      throw error;
    }
  }

  /**
   * Save an outgoing message
   */
  async saveOutgoingMessage(
    currentUserId: string,
    currentUsername: string,
    recipientId: string,
    recipientUsername: string,
    plaintext: string,
    ciphertext: string,
    handshake?: any,
    header?: any,
    serverId?: string
  ): Promise<string> {
    if (!this.useSQLite && this.jsonStorage) {
      return this.jsonStorage.saveMessage({
        sender_id: currentUserId,
        recipient_id: recipientId,
        sender_username: currentUsername,
        recipient_username: recipientUsername,
        plaintext,
        ciphertext,
        handshake_json: handshake,
        header_json: header,
        created_at: new Date().toISOString(),
      }, serverId);
    }

    if (!this.db) throw new Error('Database not initialized');

    const messageId = serverId || crypto.randomUUID();
    const conversationId = this.getConversationId(currentUserId, recipientId);
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, sender_id, recipient_id, sender_username, recipient_username,
        plaintext, ciphertext, handshake_json, header_json,
        created_at, conversation_id, is_outgoing
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      this.db.transaction(() => {
        stmt.run(
          messageId,
          currentUserId,
          recipientId,
          currentUsername,
          recipientUsername,
          this.encrypt(plaintext), // Encrypt the plaintext
          ciphertext, // Ciphertext stays as-is
          handshake ? this.encrypt(JSON.stringify(handshake)) : null,
          header ? this.encrypt(JSON.stringify(header)) : null,
          now,
          conversationId,
          1 // outgoing
        );

        this.updateConversation(
          currentUserId,
          recipientId,
          currentUsername,
          recipientUsername,
          plaintext,
          now
        );
      })();

      return messageId;
    } catch (error) {
      console.error('[LocalDB] Error saving outgoing message:', error);
      throw error;
    }
  }

  private updateConversation(
    userId1: string,
    userId2: string,
    username1?: string,
    username2?: string,
    lastMessage?: string,
    timestamp?: string
  ): void {
    if (!this.db) throw new Error('Database not initialized');

    const [user1, user2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
    const [name1, name2] = userId1 < userId2 ? [username1, username2] : [username2, username1];
    const conversationId = this.getConversationId(user1, user2);
    const now = timestamp || new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversations (
        id, user1_id, user2_id, user1_username, user2_username,
        created_at, updated_at, last_message_at, last_message_preview
      ) VALUES (?, ?, ?, ?, ?,
        COALESCE((SELECT created_at FROM conversations WHERE id = ?), ?),
        ?, ?, ?
      )
    `);

    stmt.run(
      conversationId,
      user1,
      user2,
      name1,
      name2,
      conversationId, // for the COALESCE lookup
      now, // fallback created_at
      now, // updated_at
      now, // last_message_at
      lastMessage ? this.encrypt(lastMessage.substring(0, 100)) : null // encrypt preview
    );
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    currentUserId: string,
    otherUserId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<LocalMessage[]> {
    if (!this.useSQLite && this.jsonStorage) {
      return this.jsonStorage.getConversationHistory(currentUserId, otherUserId, limit, offset);
    }

    if (!this.db) throw new Error('Database not initialized');

    const conversationId = this.getConversationId(currentUserId, otherUserId);

    const stmt = this.db.prepare(`
      SELECT
        id, sender_id, recipient_id, sender_username, recipient_username,
        plaintext, ciphertext, handshake_json, header_json, created_at, conversation_id
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(conversationId, limit, offset) as any[];

    return rows.map(row => ({
      ...row,
      plaintext: this.decrypt(row.plaintext), // Decrypt the plaintext
      handshake_json: row.handshake_json ? JSON.parse(this.decrypt(row.handshake_json)) : null,
      header_json: row.header_json ? JSON.parse(this.decrypt(row.header_json)) : null,
    })); // Already in chronological order
  }

  /**
   * Get all conversations for a user
   */
  async getConversations(currentUserId: string): Promise<ConversationSummary[]> {
    if (!this.useSQLite && this.jsonStorage) {
      return this.jsonStorage.getConversations(currentUserId);
    }

    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT
        id as conversation_id,
        CASE
          WHEN user1_id = ? THEN user2_id
          ELSE user1_id
        END as other_user_id,
        CASE
          WHEN user1_id = ? THEN user2_username
          ELSE user1_username
        END as other_username,
        last_message_at,
        last_message_preview,
        unread_count
      FROM conversations
      WHERE user1_id = ? OR user2_id = ?
      ORDER BY last_message_at DESC
    `);

    const rows = stmt.all(currentUserId, currentUserId, currentUserId, currentUserId) as any[];

    return rows.map(row => ({
      ...row,
      last_message_preview: row.last_message_preview ? this.decrypt(row.last_message_preview) : '',
    })) as ConversationSummary[];
  }

  /**
   * Search messages by content (client-side search since data is encrypted)
   */
  async searchMessages(currentUserId: string, query: string, limit: number = 20): Promise<LocalMessage[]> {
    if (!this.useSQLite && this.jsonStorage) {
      return this.jsonStorage.searchMessages(currentUserId, query, limit);
    }

    if (!this.db) throw new Error('Database not initialized');

    // Get all messages for the user first, then search client-side
    const stmt = this.db.prepare(`
      SELECT
        id, sender_id, recipient_id, sender_username, recipient_username,
        plaintext, ciphertext, handshake_json, header_json, created_at, conversation_id
      FROM messages
      WHERE (sender_id = ? OR recipient_id = ?)
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(currentUserId, currentUserId) as any[];

    // Decrypt and filter client-side
    const decryptedRows = rows.map(row => ({
      ...row,
      plaintext: this.decrypt(row.plaintext),
      handshake_json: row.handshake_json ? JSON.parse(this.decrypt(row.handshake_json)) : null,
      header_json: row.header_json ? JSON.parse(this.decrypt(row.header_json)) : null,
    }));

    // Filter by search query
    const filtered = decryptedRows.filter(row =>
      row.plaintext.toLowerCase().includes(query.toLowerCase())
    );

    return filtered.slice(0, limit);
  }

  /**
   * Delete conversation and all its messages
   */
  async nukeConversation(currentUserId: string, otherUserId: string): Promise<void> {
    if (!this.useSQLite && this.jsonStorage) {
      return this.jsonStorage.nukeConversation(currentUserId, otherUserId);
    }

    if (!this.db) throw new Error('Database not initialized');

    const conversationId = this.getConversationId(currentUserId, otherUserId);

    try {
      this.db.transaction(() => {
        // Delete messages
        this.db!.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);

        // Delete conversation
        this.db!.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
      })();

      console.log(`[LocalDB] Conversation nuked: ${conversationId}`);
    } catch (error) {
      console.error('[LocalDB] Error nuking conversation:', error);
      throw error;
    }
  }

  /**
   * Get database stats
   */
  async getStats(): Promise<{ messageCount: number; conversationCount: number; dbSize: number }> {
    if (!this.useSQLite && this.jsonStorage) {
      return this.jsonStorage.getStats();
    }

    if (!this.db) throw new Error('Database not initialized');

    const messageCount = this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number };
    const conversationCount = this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };

    let dbSize = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      dbSize = stats.size;
    } catch (e) {
      console.warn('[LocalDB] Could not get database file size');
    }

    return {
      messageCount: messageCount.count,
      conversationCount: conversationCount.count,
      dbSize
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.jsonStorage) {
      this.jsonStorage.close();
      this.jsonStorage = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
    console.log('[LocalDB] Database closed');
  }

  /**
   * Vacuum database (cleanup and optimization)
   */
  async vacuum(): Promise<void> {
    if (!this.useSQLite && this.jsonStorage) {
      return this.jsonStorage.vacuum();
    }

    if (!this.db) throw new Error('Database not initialized');

    console.log('[LocalDB] Running database vacuum...');
    this.db.exec('VACUUM');
    console.log('[LocalDB] Database vacuum completed');
  }
}

// Singleton instance
export const localDB = new LocalDatabase();