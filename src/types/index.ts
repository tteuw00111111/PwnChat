export interface Conversation {
  id: string; // The other user's UUID
  name: string;
  username: string;
  profilePicUrl?: string; // Optional profile picture URL
}

export interface Message {
  id: string;
  senderId: string; // The UUID of the sender
  text: string;
  created_at: string; // ISO 8601 timestamp
  delivered?: boolean; // true when server acked delivery (for sender)
}

interface KeyPair {
  pubKey: string;
  privKey: string;
}

interface PreKey {
  keyId: number;
  keyPair: KeyPair;
}

interface SignedPreKey extends PreKey {
  signature: string;
}

export interface ICryptoKeyBundle {
  identityKeyPair: KeyPair;
  registrationId: number;
  preKeys: PreKey[];
  signedPreKey: SignedPreKey;
}