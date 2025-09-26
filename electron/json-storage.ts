// electron/json-storage.ts
// Fallback JSON-based storage when SQLite is not available

import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

interface StoredMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  sender_username?: string;
  recipient_username?: string;
  plaintext: string; // encrypted
  ciphertext: string;
  handshake_json?: string; // encrypted
  header_json?: string; // encrypted
  created_at: string;
  conversation_id: string;
}

interface StoredConversation {
  id: string;
  user1_id: string;
  user2_id: string;
  user1_username?: string;
  user2_username?: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  last_message_preview?: string; // encrypted
}

interface JsonDatabase {
  messages: StoredMessage[];
  conversations: StoredConversation[];
  version: number;
}

export class JsonStorage {
  private dbPath: string;
  private encryptionKey: string = '';
  private data: JsonDatabase = { messages: [], conversations: [], version: 1 };
  private isInitialized = false;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'pwnchat');
    this.dbPath = path.join(dbDir, 'messages.json');
  }

  async initialize(encryptionKey: string): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.encryptionKey = encryptionKey;

      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath);
      try {
        await fs.mkdir(dbDir, { recursive: true });
      } catch (e) {
        // Directory might already exist
      }

      // Load existing data
      try {
        const fileContent = await fs.readFile(this.dbPath, 'utf8');
        this.data = JSON.parse(fileContent);
        console.log('[JsonStorage] Loaded existing data:', {
          messages: this.data.messages.length,
          conversations: this.data.conversations.length
        });
      } catch (e) {
        // File doesn't exist, start fresh
        console.log('[JsonStorage] Starting with fresh database');
        await this.save();
      }

      this.isInitialized = true;
      console.log('[JsonStorage] Initialized successfully with JSON storage');
    } catch (error) {
      console.error('[JsonStorage] Failed to initialize:', error);
      throw error;
    }
  }

  private encrypt(data: string): string {
    // Temporary: Disable encryption to fix crypto bundling issues
    // TODO: Re-enable with proper crypto import handling
    console.log('[JsonStorage] Encryption disabled in development');
    return data;
  }

  private decrypt(encryptedData: string): string {
    // Temporary: Disable encryption to fix crypto bundling issues
    // TODO: Re-enable with proper crypto import handling
    return encryptedData;
  }

  private async save(): Promise<void> {
    try {
      await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('[JsonStorage] Failed to save data:', error);
    }
  }

  private getConversationId(userId1: string, userId2: string): string {
    const sorted = [userId1, userId2].sort();
    // Simple hash for conversation ID without crypto dependency
    let hash = 0;
    const str = sorted.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 16);
  }

  async saveMessage(message: any, serverId?: string): Promise<string> {
    console.log(`[JsonStorage] saveMessage called with serverId: ${serverId}`);
    const messageId = serverId || Math.random().toString(36).substring(2) + Date.now().toString(36);
    console.log(`[JsonStorage] Using messageId: ${messageId}`);
    const conversationId = this.getConversationId(message.sender_id, message.recipient_id);
    const now = new Date().toISOString();

    // Check if message already exists (prevent duplicates)
    const existingMessage = this.data.messages.find(m => m.id === messageId);
    if (existingMessage) {
      console.log(`[JsonStorage] Message ${messageId} already exists, skipping duplicate`);
      return messageId;
    }

    const storedMessage: StoredMessage = {
      id: messageId,
      sender_id: message.sender_id,
      recipient_id: message.recipient_id,
      sender_username: message.sender_username,
      recipient_username: message.recipient_username,
      plaintext: this.encrypt(message.plaintext),
      ciphertext: message.ciphertext,
      handshake_json: message.handshake_json ? this.encrypt(JSON.stringify(message.handshake_json)) : undefined,
      header_json: message.header_json ? this.encrypt(JSON.stringify(message.header_json)) : undefined,
      created_at: message.created_at || now,
      conversation_id: conversationId,
    };

    this.data.messages.push(storedMessage);

    // Update conversation
    this.updateConversation(
      message.sender_id,
      message.recipient_id,
      message.sender_username,
      message.recipient_username,
      message.plaintext,
      message.created_at || now
    );

    await this.save();
    return messageId;
  }

  private updateConversation(
    userId1: string,
    userId2: string,
    username1?: string,
    username2?: string,
    lastMessage?: string,
    timestamp?: string
  ): void {
    const [user1, user2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
    const [name1, name2] = userId1 < userId2 ? [username1, username2] : [username2, username1];
    const conversationId = this.getConversationId(user1, user2);
    const now = timestamp || new Date().toISOString();

    let conversation = this.data.conversations.find(c => c.id === conversationId);

    if (!conversation) {
      conversation = {
        id: conversationId,
        user1_id: user1,
        user2_id: user2,
        user1_username: name1,
        user2_username: name2,
        created_at: now,
        updated_at: now,
        last_message_at: now,
        last_message_preview: lastMessage ? this.encrypt(lastMessage.substring(0, 100)) : undefined,
      };
      this.data.conversations.push(conversation);
    } else {
      conversation.updated_at = now;
      conversation.last_message_at = now;
      if (lastMessage) {
        conversation.last_message_preview = this.encrypt(lastMessage.substring(0, 100));
      }
    }
  }

  async getConversationHistory(
    currentUserId: string,
    otherUserId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<any[]> {
    const conversationId = this.getConversationId(currentUserId, otherUserId);

    const messages = this.data.messages
      .filter(m => m.conversation_id === conversationId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(offset, offset + limit);

    return messages.map(msg => ({
      ...msg,
      plaintext: this.decrypt(msg.plaintext),
      handshake_json: msg.handshake_json ? JSON.parse(this.decrypt(msg.handshake_json)) : null,
      header_json: msg.header_json ? JSON.parse(this.decrypt(msg.header_json)) : null,
    }));
  }

  async getConversations(currentUserId: string): Promise<any[]> {
    return this.data.conversations
      .filter(c => c.user1_id === currentUserId || c.user2_id === currentUserId)
      .map(conv => ({
        conversation_id: conv.id,
        other_user_id: conv.user1_id === currentUserId ? conv.user2_id : conv.user1_id,
        other_username: conv.user1_id === currentUserId ? conv.user2_username : conv.user1_username,
        last_message_at: conv.last_message_at || conv.created_at,
        last_message_preview: conv.last_message_preview ? this.decrypt(conv.last_message_preview) : '',
        unread_count: 0, // TODO: implement if needed
      }))
      .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
  }

  async searchMessages(currentUserId: string, query: string, limit: number = 20): Promise<any[]> {
    const userMessages = this.data.messages
      .filter(m => m.sender_id === currentUserId || m.recipient_id === currentUserId)
      .map(msg => ({
        ...msg,
        plaintext: this.decrypt(msg.plaintext),
        handshake_json: msg.handshake_json ? JSON.parse(this.decrypt(msg.handshake_json)) : null,
        header_json: msg.header_json ? JSON.parse(this.decrypt(msg.header_json)) : null,
      }))
      .filter(msg => msg.plaintext.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return userMessages;
  }

  async nukeConversation(currentUserId: string, otherUserId: string): Promise<void> {
    const conversationId = this.getConversationId(currentUserId, otherUserId);

    // Remove messages
    this.data.messages = this.data.messages.filter(m => m.conversation_id !== conversationId);

    // Remove conversation
    this.data.conversations = this.data.conversations.filter(c => c.id !== conversationId);

    await this.save();
  }

  async getStats(): Promise<{ messageCount: number; conversationCount: number; dbSize: number }> {
    let dbSize = 0;
    try {
      const stats = await fs.stat(this.dbPath);
      dbSize = stats.size;
    } catch (e) {
      // File might not exist
    }

    return {
      messageCount: this.data.messages.length,
      conversationCount: this.data.conversations.length,
      dbSize,
    };
  }

  async vacuum(): Promise<void> {
    // For JSON storage, just save to clean up the file
    await this.save();
  }

  close(): void {
    // JSON storage doesn't need explicit closing
    this.isInitialized = false;
  }
}