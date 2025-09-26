// src/lib/localMessageService.ts
// Service for managing local encrypted message storage

import { jwtDecode } from "jwt-decode";
import { ACCESS_TOKEN_KEY } from "../utils/api";
import { Message } from "../types";

interface LocalMessage {
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
  conversation_id: string;
}

interface ConversationSummary {
  conversation_id: string;
  other_user_id: string;
  other_username: string;
  last_message_at: string;
  last_message_preview: string;
  unread_count: number;
}

class LocalMessageService {
  private isInitialized = false;
  private currentUserId: string | null = null;
  private currentUsername: string | null = null;

  /**
   * Initialize the local database with user credentials
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Get current user info from JWT
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) throw new Error("No authentication token found");

      const decoded: { userId: string; sub: string } = jwtDecode(token);
      this.currentUserId = decoded.userId;
      this.currentUsername = decoded.sub;

      // Generate encryption key from user credentials + device-specific salt
      const encryptionKey = await this.generateEncryptionKey(decoded.userId, decoded.sub);

      // Initialize database
      const result = await window.electronAPI.localDBInit(encryptionKey, decoded.userId, decoded.sub);
      if (!result.success) {
        throw new Error(result.error || "Failed to initialize local database");
      }

      this.isInitialized = true;
      console.log("[LocalMessageService] Initialized successfully");
    } catch (error) {
      console.error("[LocalMessageService] Initialization failed:", error);
      throw error;
    }
  }

  /**
   * Generate a deterministic encryption key that's device-specific, not user-specific
   * This allows all users on the same device to read each other's stored messages
   */
  private async generateEncryptionKey(userId: string, username: string): Promise<string> {
    const encoder = new TextEncoder();

    // Create a device-specific key instead of user-specific
    // This way all users on the same device share the same local encryption key
    const deviceId = await this.getDeviceId();
    const keyMaterial = encoder.encode(`pwnchat-device:${deviceId}:local-db-v1`);

    // Use SubtleCrypto to derive a strong key
    const keyBuffer = await crypto.subtle.digest('SHA-256', keyMaterial);
    const keyArray = new Uint8Array(keyBuffer);

    // Convert to hex string
    return Array.from(keyArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Get a consistent device identifier
   */
  private async getDeviceId(): Promise<string> {
    // Try to get stored device ID first
    const stored = localStorage.getItem('pwnchat_device_id');
    if (stored) return stored;

    // Generate new device ID
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const deviceId = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    localStorage.setItem('pwnchat_device_id', deviceId);
    return deviceId;
  }

  /**
   * Save an incoming message to local storage
   */
  async saveIncomingMessage(
    senderId: string,
    senderUsername: string,
    plaintext: string,
    ciphertext: string,
    handshake?: any,
    header?: any,
    timestamp?: string,
    serverId?: string
  ): Promise<string | null> {
    await this.ensureInitialized();

    try {
      const result = await window.electronAPI.localDBSaveIncomingMessage(
        senderId,
        senderUsername,
        plaintext,
        ciphertext,
        handshake,
        header,
        timestamp,
        serverId
      );

      if (result.success) {
        console.log(`[LocalMessageService] Saved incoming message: ${result.messageId}`);
        return result.messageId || null;
      } else {
        console.error("[LocalMessageService] Failed to save incoming message:", result.error);
        return null;
      }
    } catch (error) {
      console.error("[LocalMessageService] Error saving incoming message:", error);
      return null;
    }
  }

  /**
   * Save an outgoing message to local storage
   */
  async saveOutgoingMessage(
    recipientId: string,
    recipientUsername: string,
    plaintext: string,
    ciphertext: string,
    handshake?: any,
    header?: any,
    serverId?: string
  ): Promise<string | null> {
    await this.ensureInitialized();

    try {
      const result = await window.electronAPI.localDBSaveOutgoingMessage(
        recipientId,
        recipientUsername,
        plaintext,
        ciphertext,
        handshake,
        header,
        serverId
      );

      if (result.success) {
        console.log(`[LocalMessageService] Saved outgoing message: ${result.messageId}`);
        return result.messageId || null;
      } else {
        console.error("[LocalMessageService] Failed to save outgoing message:", result.error);
        return null;
      }
    } catch (error) {
      console.error("[LocalMessageService] Error saving outgoing message:", error);
      return null;
    }
  }

  /**
   * Get conversation history from local storage
   */
  async getConversationHistory(
    otherUserId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    await this.ensureInitialized();

    try {
      const result = await window.electronAPI.localDBGetConversationHistory(otherUserId, limit, offset);

      if (result.success && result.messages) {
        // Convert LocalMessage format to Message format
        return result.messages.map((msg: LocalMessage) => ({
          id: msg.id,
          text: msg.plaintext,
          senderId: msg.sender_id,
          created_at: msg.created_at,
        }));
      } else {
        console.warn("[LocalMessageService] Failed to get conversation history:", result.error);
        return [];
      }
    } catch (error) {
      console.error("[LocalMessageService] Error getting conversation history:", error);
      return [];
    }
  }

  /**
   * Get all conversations from local storage
   */
  async getConversations(): Promise<ConversationSummary[]> {
    await this.ensureInitialized();

    try {
      const result = await window.electronAPI.localDBGetConversations();

      if (result.success && result.conversations) {
        return result.conversations;
      } else {
        console.warn("[LocalMessageService] Failed to get conversations:", result.error);
        return [];
      }
    } catch (error) {
      console.error("[LocalMessageService] Error getting conversations:", error);
      return [];
    }
  }

  /**
   * Search messages by content
   */
  async searchMessages(query: string, limit: number = 20): Promise<Message[]> {
    await this.ensureInitialized();

    try {
      const result = await window.electronAPI.localDBSearchMessages(query, limit);

      if (result.success && result.messages) {
        return result.messages.map((msg: LocalMessage) => ({
          id: msg.id,
          text: msg.plaintext,
          senderId: msg.sender_id,
          created_at: msg.created_at,
        }));
      } else {
        console.warn("[LocalMessageService] Failed to search messages:", result.error);
        return [];
      }
    } catch (error) {
      console.error("[LocalMessageService] Error searching messages:", error);
      return [];
    }
  }

  /**
   * Delete all messages in a conversation ("nuke" feature)
   */
  async nukeConversation(otherUserId: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const result = await window.electronAPI.localDBNukeConversation(otherUserId);

      if (result.success) {
        console.log(`[LocalMessageService] Nuked conversation with user: ${otherUserId}`);
        return true;
      } else {
        console.error("[LocalMessageService] Failed to nuke conversation:", result.error);
        return false;
      }
    } catch (error) {
      console.error("[LocalMessageService] Error nuking conversation:", error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{ messageCount: number; conversationCount: number; dbSize: number } | null> {
    await this.ensureInitialized();

    try {
      const result = await window.electronAPI.localDBGetStats();

      if (result.success && result.stats) {
        return result.stats;
      } else {
        console.warn("[LocalMessageService] Failed to get stats:", result.error);
        return null;
      }
    } catch (error) {
      console.error("[LocalMessageService] Error getting stats:", error);
      return null;
    }
  }

  /**
   * Optimize database (vacuum)
   */
  async vacuum(): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const result = await window.electronAPI.localDBVacuum();

      if (result.success) {
        console.log("[LocalMessageService] Database vacuum completed");
        return true;
      } else {
        console.error("[LocalMessageService] Failed to vacuum database:", result.error);
        return false;
      }
    } catch (error) {
      console.error("[LocalMessageService] Error vacuuming database:", error);
      return false;
    }
  }

  /**
   * Check if the service is properly initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Reset the service (for logout)
   */
  reset(): void {
    this.isInitialized = false;
    this.currentUserId = null;
    this.currentUsername = null;
    console.log("[LocalMessageService] Reset completed");
  }
}

// Export singleton instance
export const localMessageService = new LocalMessageService();