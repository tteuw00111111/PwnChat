// src/types/crypto.ts

/**
 * Defines the private cryptographic material for a user.
 * This is a simplified model for the dev bridge.
 */
export interface PrivateMaterial {
  // X25519 identity key pair (ECDH)
  identityKeyPrivateB64: string;
  identityKeyPublicB64: string;
  // Ed25519 identity signing key (for signed prekey)
  identitySigningPrivateB64?: string;
  identitySigningPublicB64?: string;
  // X25519 signed prekey (longer-lived than one-time prekeys)
  signedPrekeyPrivateB64?: string;
  signedPrekeyPublicB64?: string;
  signedPrekeySignatureB64?: string; // signature over signedPrekeyPublic (raw 32 bytes) using Ed25519 identity signing key
}

/**
 * Defines the public-facing cryptographic material for a user.
 * This is what is shared with others to initiate a conversation.
 */
export interface PublicBundle {
  identityKeyPublicB64: string; // X25519
  identitySigningPublicB64?: string; // Ed25519 (to verify signed prekey)
  signedPrekeyPublicB64?: string; // X25519
  signedPrekeySignatureB64?: string; // Ed25519 signature over signedPrekeyPublic
}

/**
 * Alias for PublicBundle, used when fetching a recipient's keys.
 */
export type RecipientBundle = PublicBundle;

/**
 * Represents the structure of an encrypted message payload.
 * In this simplified model, it's just the ciphertext string.
 */
export type EncryptedMessage = string;
