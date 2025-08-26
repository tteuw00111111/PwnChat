export interface Conversation {
  id: string; // The other user's UUID
  username: string;
}

export interface Message {
  id: string;
  senderId: string; // The UUID of the sender
  text: string;
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