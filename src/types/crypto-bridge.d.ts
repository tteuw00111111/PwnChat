export {};

declare global {
  interface Window {
    cryptoBridge: {
      isAvailable(): boolean;
      randomBytesBase64(n: number): string;
      sha256Hex(data: string | Uint8Array): string;
      hmacSha256Hex(key: string, data: string): string;
      aes256gcmEncryptUtf8ToB64(
        keyB64: string,
        plaintext: string
      ): { ivB64: string; ctB64: string; tagB64: string };
      aes256gcmDecryptB64ToUtf8(
        keyB64: string,
        ivB64: string,
        ctB64: string,
        tagB64: string
      ): string;
      concatBase64(parts: string[]): string;
      hexToBase64(h: string): string;
      base64ToHex(b: string): string;
    };

    // optional alias if your code references this name
    signalBridge: Window["cryptoBridge"];
  }
}
