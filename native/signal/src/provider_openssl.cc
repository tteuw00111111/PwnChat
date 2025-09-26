// OpenSSL-backed crypto provider for libsignal-protocol-c
#include <signal/signal_protocol.h>

#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <openssl/rand.h>

#include <cstring>
#include <memory>

namespace signalprov {

static int random_func(uint8_t *data, size_t len, void *user_data) {
  (void)user_data;
  if (len == 0) return 0;
  return RAND_bytes(data, (int)len) == 1 ? 0 : -1;
}

// HMAC-SHA256
struct HmacCtx { HMAC_CTX *ctx; };
static int hmac_sha256_init(void **ctx, const uint8_t *key, size_t key_len, void *user_data) {
  (void)user_data;
  auto *h = new HmacCtx{HMAC_CTX_new()};
  if (!h || !h->ctx) { delete h; return -1; }
  if (HMAC_Init_ex(h->ctx, key, (int)key_len, EVP_sha256(), nullptr) != 1) { HMAC_CTX_free(h->ctx); delete h; return -1; }
  *ctx = h; return 0;
}
static int hmac_sha256_update(void *ctx, const uint8_t *data, size_t len, void *user_data) {
  (void)user_data; if (!ctx) return -1; auto *h = ((HmacCtx*)ctx)->ctx; return HMAC_Update(h, data, len) == 1 ? 0 : -1;
}
static int hmac_sha256_final(void *ctx, signal_buffer **output, void *user_data) {
  (void)user_data; if (!ctx) return -1; auto *h = ((HmacCtx*)ctx)->ctx; unsigned int outlen=0; unsigned char md[EVP_MAX_MD_SIZE];
  if (HMAC_Final(h, md, &outlen) != 1) return -1; *output = signal_buffer_create(md, outlen); return *output ? 0 : -1;
}
static void hmac_sha256_cleanup(void *ctx, void *user_data) {
  (void)user_data; if (!ctx) return; auto *hc = (HmacCtx*)ctx; if (hc->ctx) HMAC_CTX_free(hc->ctx); delete hc;
}

// SHA-512 digest required by libsignal
struct Sha512Ctx { EVP_MD_CTX *ctx; };
static int sha512_init(void **ctx, void *user_data) {
  (void)user_data; auto *s = new Sha512Ctx{EVP_MD_CTX_new()}; if (!s || !s->ctx) { delete s; return -1; }
  if (EVP_DigestInit_ex(s->ctx, EVP_sha512(), nullptr) != 1) { EVP_MD_CTX_free(s->ctx); delete s; return -1; }
  *ctx = s; return 0;
}
static int sha512_update(void *ctx, const uint8_t *data, size_t len, void *user_data) {
  (void)user_data; if (!ctx) return -1; auto *s = ((Sha512Ctx*)ctx)->ctx; return EVP_DigestUpdate(s, data, len) == 1 ? 0 : -1;
}
static int sha512_final(void *ctx, signal_buffer **output, void *user_data) {
  (void)user_data; if (!ctx) return -1; auto *s = ((Sha512Ctx*)ctx)->ctx; unsigned int outlen=0; unsigned char md[EVP_MAX_MD_SIZE];
  if (EVP_DigestFinal_ex(s, md, &outlen) != 1) return -1; *output = signal_buffer_create(md, outlen); return *output ? 0 : -1;
}
static void sha512_cleanup(void *ctx, void *user_data) {
  (void)user_data; if (!ctx) return; auto *sc = (Sha512Ctx*)ctx; if (sc->ctx) EVP_MD_CTX_free(sc->ctx); delete sc;
}

// AES-CTR encrypt/decrypt used by libsignal
static const EVP_CIPHER* select_cipher(int cipher, size_t key_len) {
  if (cipher == SG_CIPHER_AES_CTR_NOPADDING) {
    if (key_len == 16) return EVP_aes_128_ctr();
    if (key_len == 32) return EVP_aes_256_ctr();
  } else if (cipher == SG_CIPHER_AES_CBC_PKCS5) {
    if (key_len == 16) return EVP_aes_128_cbc();
    if (key_len == 32) return EVP_aes_256_cbc();
  }
  return nullptr;
}

static int encrypt(signal_buffer **out,
                   int cipher,
                   const uint8_t *key, size_t key_len,
                   const uint8_t *iv, size_t iv_len,
                   const uint8_t *plaintext, size_t plaintext_len,
                   void *user_data) {
  (void)user_data; if (!plaintext || !key || !iv) return -1;
  const EVP_CIPHER *c = select_cipher(cipher, key_len);
  if (!c) return -1;
  EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new(); if (!ctx) return -1;
  int ok = EVP_EncryptInit_ex(ctx, c, nullptr, key, iv);
  if (ok != 1) { EVP_CIPHER_CTX_free(ctx); return -1; }
  std::unique_ptr<uint8_t[]> buf(new uint8_t[plaintext_len + 32]); int out1=0, out2=0;
  ok = EVP_EncryptUpdate(ctx, buf.get(), &out1, plaintext, (int)plaintext_len);
  if (ok != 1) { EVP_CIPHER_CTX_free(ctx); return -1; }
  ok = EVP_EncryptFinal_ex(ctx, buf.get()+out1, &out2);
  EVP_CIPHER_CTX_free(ctx);
  if (ok != 1) return -1;
  *out = signal_buffer_create(buf.get(), out1 + out2);
  return *out ? 0 : -1;
}

static int decrypt(signal_buffer **out,
                   int cipher,
                   const uint8_t *key, size_t key_len,
                   const uint8_t *iv, size_t iv_len,
                   const uint8_t *ciphertext, size_t ciphertext_len,
                   void *user_data) {
  (void)user_data; if (!ciphertext || !key || !iv) return -1;
  const EVP_CIPHER *c = select_cipher(cipher, key_len);
  if (!c) return -1;
  EVP_CIPHER_CTX *ctx = EVP_CIPHER_CTX_new(); if (!ctx) return -1;
  int ok = EVP_DecryptInit_ex(ctx, c, nullptr, key, iv);
  if (ok != 1) { EVP_CIPHER_CTX_free(ctx); return -1; }
  std::unique_ptr<uint8_t[]> buf(new uint8_t[ciphertext_len + 32]); int out1=0, out2=0;
  ok = EVP_DecryptUpdate(ctx, buf.get(), &out1, ciphertext, (int)ciphertext_len);
  if (ok != 1) { EVP_CIPHER_CTX_free(ctx); return -1; }
  ok = EVP_DecryptFinal_ex(ctx, buf.get()+out1, &out2);
  EVP_CIPHER_CTX_free(ctx);
  if (ok != 1) return -1;
  *out = signal_buffer_create(buf.get(), out1 + out2);
  return *out ? 0 : -1;
}

int setup_openssl_crypto_provider(signal_context *ctx) {
  if (!ctx) return -1;
  signal_crypto_provider provider{};
  provider.random_func = random_func;
  provider.hmac_sha256_init_func = hmac_sha256_init;
  provider.hmac_sha256_update_func = hmac_sha256_update;
  provider.hmac_sha256_final_func = hmac_sha256_final;
  provider.hmac_sha256_cleanup_func = hmac_sha256_cleanup;
  provider.sha512_digest_init_func = sha512_init;
  provider.sha512_digest_update_func = sha512_update;
  provider.sha512_digest_final_func = sha512_final;
  provider.sha512_digest_cleanup_func = sha512_cleanup;
  provider.encrypt_func = encrypt;
  provider.decrypt_func = decrypt;
  provider.user_data = nullptr;
  return signal_context_set_crypto_provider(ctx, &provider);
}

} // namespace signalprov

// Export C symbol expected by signal_wrapper.cc
extern "C" int setup_openssl_crypto_provider(signal_context *ctx) {
  return signalprov::setup_openssl_crypto_provider(ctx);
}
