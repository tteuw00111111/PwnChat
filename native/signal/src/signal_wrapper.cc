#include "signal_wrapper.h"
#include <napi.h>
#include <string>
#include <memory>
#include <sstream>
#include <cstdio>
#include <cstdlib>
#include <openssl/evp.h>
#include <time.h>
#include <vector>
#include <mutex>
#include <unordered_map>
#include <vector>
#include <algorithm>
// Attempt to include libsignal-protocol-c headers (available via pkg-config)
#include <signal/signal_protocol.h>

// Forward declarations from local provider/store modules
extern "C" int setup_openssl_crypto_provider(signal_context* ctx);
extern "C" int setup_memory_store(signal_protocol_store_context **store_out);

static signal_context* g_ctx = nullptr;
static signal_protocol_store_context* g_store = nullptr;
static bool g_ready = false;
// Persistent store vtables to avoid dangling pointers
static signal_protocol_session_store g_session_store_vt;
static signal_protocol_pre_key_store g_prekey_store_vt;
static signal_protocol_signed_pre_key_store g_spk_store_vt;
static signal_protocol_identity_key_store g_identity_store_vt;
static bool g_debug = false;
static Napi::ObjectReference g_exports;

#define DBG(...) do { if (g_debug) { std::fprintf(stderr, "[libsignal] "); std::fprintf(stderr, __VA_ARGS__); std::fprintf(stderr, "\n"); } } while(0)

// Minimal in-memory store scaffolding (Phase 1)
struct MemoryStores {
  // Identity
  std::vector<uint8_t> identity_priv;
  std::vector<uint8_t> identity_pub;
  uint32_t registration_id = 0;
  // trust store: address -> identity pub bytes
  std::unordered_map<std::string, std::vector<uint8_t>> identities;

  // Signed prekey (single)
  int32_t spk_id = 0;
  std::vector<uint8_t> spk_priv;
  std::vector<uint8_t> spk_pub;
  std::vector<uint8_t> spk_sig;

  // One-time prekeys (id -> pub,priv)
  struct KeyPair { std::vector<uint8_t> pub; std::vector<uint8_t> priv; };
  std::unordered_map<int32_t, KeyPair> one_time_prekeys;
  // Serialized libsignal records for prekeys and signed prekeys
  std::unordered_map<uint32_t, std::vector<uint8_t>> prekey_records;
  std::unordered_map<uint32_t, std::vector<uint8_t>> spk_records;

  // Sessions (address name -> serialized record bytes)
  std::unordered_map<std::string, std::vector<uint8_t>> sessions;
  // Session index (sessionId -> address key)
  std::unordered_map<std::string, std::string> session_index;
};

static std::unique_ptr<MemoryStores> g_mem;
static std::mutex g_mem_mu;

// Forward-declare store wiring (no-op now; will be implemented with libsignal callbacks)
static void EnsureStoreInitialized() {
  if (g_store) return;
  if (!g_ctx) return;
  // For now, create an empty store context so builder/cipher can be wired later.
  signal_protocol_store_context_create(&g_store, g_ctx);
  if (!g_mem) g_mem = std::make_unique<MemoryStores>();
}

// --- small helpers ---
static std::string make_address_key(const signal_protocol_address *addr) {
  std::ostringstream oss; oss << std::string(addr->name, addr->name_len) << "|" << addr->device_id; return oss.str();
}
static std::string b64(const uint8_t *data, size_t len) {
  if (!data || len == 0) return std::string();
  size_t out_len = 4 * ((len + 2) / 3);
  std::string out(out_len, '\0');
  int wrote = EVP_EncodeBlock(reinterpret_cast<unsigned char*>(&out[0]), data, (int)len);
  if (wrote < 0) return std::string();
  out.resize((size_t)wrote);
  return out;
}
static std::string b64v(const std::vector<uint8_t>& v) { return b64(v.data(), v.size()); }
static std::vector<uint8_t> from_b64(const std::string &b64str) {
  if (b64str.empty()) return {};
  std::vector<uint8_t> out((b64str.size() * 3) / 4 + 4);
  int n = EVP_DecodeBlock(out.data(), (const unsigned char*)b64str.data(), (int)b64str.size());
  if (n < 0) return {};
  out.resize((size_t)n);
  size_t trim = 0;
  for (auto it = b64str.rbegin(); it != b64str.rend() && *it == '='; ++it) trim++;
  while (trim-- && !out.empty()) out.pop_back();
  return out;
}

static Napi::String JsonStringify(Napi::Env env, const Napi::Object& obj) {
  try {
    Napi::Value json = env.Global().Get("JSON");
    if (!json.IsObject()) return Napi::String::New(env, "{}");
    Napi::Value fn = json.As<Napi::Object>().Get("stringify");
    if (!fn.IsFunction()) return Napi::String::New(env, "{}");
    return fn.As<Napi::Function>().Call(json, { obj }).As<Napi::String>();
  } catch (...) {
    return Napi::String::New(env, "{}");
  }
}

static Napi::Value JsonParse(Napi::Env env, const Napi::String& str) {
  try {
    Napi::Value json = env.Global().Get("JSON");
    if (!json.IsObject()) return env.Null();
    Napi::Value fn = json.As<Napi::Object>().Get("parse");
    if (!fn.IsFunction()) return env.Null();
    return fn.As<Napi::Function>().Call(json, { str });
  } catch (...) {
    return env.Null();
  }
}

// --- store callbacks (in-memory) ---
// Identity
static int id_get_key_pair(signal_buffer **pub, signal_buffer **priv, void *user_data) {
  (void)user_data; if (!pub || !priv) return SG_ERR_INVAL;
  std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem || g_mem->identity_pub.empty() || g_mem->identity_priv.empty()) return SG_ERR_INVALID_KEY;
  *pub = signal_buffer_create(g_mem->identity_pub.data(), g_mem->identity_pub.size());
  *priv = signal_buffer_create(g_mem->identity_priv.data(), g_mem->identity_priv.size());
  return (*pub && *priv) ? SG_SUCCESS : SG_ERR_NOMEM;
}
static int id_get_reg(void *user_data, uint32_t *registration_id) { (void)user_data; if (!registration_id) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu); *registration_id = g_mem ? g_mem->registration_id : 0; return SG_SUCCESS; }
static int id_save(const signal_protocol_address *address, uint8_t *key_data, size_t key_len, void *user_data) {
  (void)user_data; if (!address) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) return SG_ERR_INVAL; std::string k = make_address_key(address);
  if (key_data && key_len) g_mem->identities[k] = std::vector<uint8_t>(key_data, key_data + key_len); else g_mem->identities.erase(k);
  return SG_SUCCESS;
}
static int id_is_trusted(const signal_protocol_address *address, uint8_t *key_data, size_t key_len, void *user_data) {
  (void)user_data; if (!address || !key_data || !key_len) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) return 0; std::string k = make_address_key(address);
  auto it = g_mem->identities.find(k);
  if (it == g_mem->identities.end()) return 1; // TOFU
  const std::vector<uint8_t>& cur = it->second; if (cur.size() == key_len && memcmp(cur.data(), key_data, key_len) == 0) return 1; return 0;
}

// Sessions
static int sess_load(signal_buffer **record, signal_buffer **user_record, const signal_protocol_address *address, void *user_data) {
  (void)user_data; if (!record || !address) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) return 0; std::string k = make_address_key(address);
  auto it = g_mem->sessions.find(k);
  if (it == g_mem->sessions.end()) return 0;
  *record = signal_buffer_create(it->second.data(), it->second.size()); if (user_record) *user_record = 0; return 1;
}
static int sess_get_subs(signal_int_list **sessions, const char *name, size_t name_len, void *user_data) {
  (void)user_data; if (!sessions || !name) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu);
  *sessions = signal_int_list_alloc(); if (!*sessions) return SG_ERR_NOMEM;
  std::string pref(name, name_len); pref += "|";
  for (auto &kv : g_mem->sessions) {
    if (kv.first.rfind(pref, 0) == 0) { // starts with
      // parse device id after '|'
      auto pos = kv.first.find('|'); if (pos != std::string::npos) {
        int dev = atoi(kv.first.c_str() + pos + 1);
        signal_int_list_push_back(*sessions, dev);
      }
    }
  }
  return (int)signal_int_list_size(*sessions);
}
static int sess_store(const signal_protocol_address *address, uint8_t *record, size_t record_len, uint8_t *user_record, size_t user_record_len, void *user_data) {
  (void)user_data; (void)user_record; (void)user_record_len; if (!address || !record || !record_len) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) return SG_ERR_INVAL; std::string k = make_address_key(address); g_mem->sessions[k] = std::vector<uint8_t>(record, record + record_len); return SG_SUCCESS;
}
static int sess_contains(const signal_protocol_address *address, void *user_data) {
  (void)user_data; if (!address) return 0; std::scoped_lock<std::mutex> lk(g_mem_mu); std::string k = make_address_key(address); return g_mem && g_mem->sessions.count(k) ? 1 : 0;
}
static int sess_delete(const signal_protocol_address *address, void *user_data) {
  (void)user_data; if (!address) return 0; std::scoped_lock<std::mutex> lk(g_mem_mu); if (!g_mem) return 0; std::string k = make_address_key(address); auto n = g_mem->sessions.erase(k); return n ? 1 : 0;
}
static int sess_delete_all(const char *name, size_t name_len, void *user_data) {
  (void)user_data; if (!name) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu); if (!g_mem) return 0; std::string pref(name, name_len); pref += "|"; int count = 0; for (auto it = g_mem->sessions.begin(); it != g_mem->sessions.end();) { if (it->first.rfind(pref, 0) == 0) { it = g_mem->sessions.erase(it); count++; } else ++it; } return count;
}

// PreKeys
static int prekey_load(signal_buffer **record, uint32_t pre_key_id, void *user_data) {
  (void)user_data; if (!record) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) return SG_ERR_INVALID_KEY_ID;
  auto it = g_mem->prekey_records.find(pre_key_id);
  if (it == g_mem->prekey_records.end()) return SG_ERR_INVALID_KEY_ID;
  *record = signal_buffer_create(it->second.data(), it->second.size());
  return *record ? SG_SUCCESS : SG_ERR_NOMEM;
}
static int prekey_store(uint32_t pre_key_id, uint8_t *record, size_t record_len, void *user_data) {
  (void)user_data; if (!record || !record_len) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) return SG_ERR_INVAL; g_mem->prekey_records[pre_key_id] = std::vector<uint8_t>(record, record + record_len); return SG_SUCCESS; }
static int prekey_contains(uint32_t pre_key_id, void *user_data) { (void)user_data; std::scoped_lock<std::mutex> lk(g_mem_mu); return (g_mem && g_mem->prekey_records.count(pre_key_id)) ? 1 : 0; }
static int prekey_remove(uint32_t pre_key_id, void *user_data) {
  (void)user_data;
  std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) return SG_ERR_INVAL;
  g_mem->prekey_records.erase(pre_key_id);
  g_mem->one_time_prekeys.erase((int32_t)pre_key_id);
  return SG_SUCCESS;
}

// Signed PreKeys
static int spk_load(signal_buffer **record, uint32_t spk_id, void *user_data) {
  (void)user_data; if (!record) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) return SG_ERR_INVALID_KEY_ID;
  auto it = g_mem->spk_records.find(spk_id);
  if (it == g_mem->spk_records.end()) return SG_ERR_INVALID_KEY_ID;
  *record = signal_buffer_create(it->second.data(), it->second.size());
  return *record ? SG_SUCCESS : SG_ERR_NOMEM;
}
static int spk_store(uint32_t spk_id, uint8_t *record, size_t record_len, void *user_data) { (void)user_data; if (!record || !record_len) return SG_ERR_INVAL; std::scoped_lock<std::mutex> lk(g_mem_mu); if (!g_mem) return SG_ERR_INVAL; g_mem->spk_records[spk_id] = std::vector<uint8_t>(record, record + record_len); return SG_SUCCESS; }
static int spk_contains(uint32_t spk_id, void *user_data) { (void)user_data; std::scoped_lock<std::mutex> lk(g_mem_mu); return (g_mem && g_mem->spk_id == (int32_t)spk_id) ? 1 : 0; }
static int spk_remove(uint32_t spk_id, void *user_data) { (void)user_data; std::scoped_lock<std::mutex> lk(g_mem_mu); if (g_mem && g_mem->spk_id == (int32_t)spk_id) { g_mem->spk_id = 0; g_mem->spk_pub.clear(); g_mem->spk_priv.clear(); g_mem->spk_sig.clear(); } return SG_SUCCESS; }

namespace signal {

// Helper to throw consistent error when libsignal is not linked yet
static Napi::Value NotImplemented(const Napi::CallbackInfo& info, const char* name) {
  Napi::Env env = info.Env();
  Napi::Error::New(env, std::string("Native libsignal stub: ") + name + " not implemented. Build with libsignal-protocol-c.").ThrowAsJavaScriptException();
  return env.Null();
}

// Simple in-memory state placeholder while wiring libsignal
static std::string g_state_json;

// init(): string (version or "stub")
static Napi::Value InitNative(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  g_debug = (std::getenv("PWNCHAT_NATIVE_DEBUG") != nullptr);
  if (!g_ctx) {
    int rc = signal_context_create(&g_ctx, nullptr);
    if (rc != 0) {
      return Napi::String::New(env, std::string("stub:ctx-failed(") + std::to_string(rc) + ")");
    }
  }
  // Setup crypto provider (OpenSSL) and minimal store
  if (setup_openssl_crypto_provider(g_ctx) != 0) {
    // Keep context alive but mark stub state
  }
  if (!g_store) {
    // Create store context using the initialized global context
    signal_protocol_store_context_create(&g_store, g_ctx);
    // Fill persistent store vtables and attach callbacks (do this once)
    memset(&g_session_store_vt, 0, sizeof(g_session_store_vt));
    g_session_store_vt.load_session_func = sess_load;
    g_session_store_vt.get_sub_device_sessions_func = sess_get_subs;
    g_session_store_vt.store_session_func = sess_store;
    g_session_store_vt.contains_session_func = sess_contains;
    g_session_store_vt.delete_session_func = sess_delete;
    g_session_store_vt.delete_all_sessions_func = sess_delete_all;
    g_session_store_vt.user_data = nullptr;
    signal_protocol_store_context_set_session_store(g_store, &g_session_store_vt);

    memset(&g_prekey_store_vt, 0, sizeof(g_prekey_store_vt));
    g_prekey_store_vt.load_pre_key = prekey_load;
    g_prekey_store_vt.store_pre_key = prekey_store;
    g_prekey_store_vt.contains_pre_key = prekey_contains;
    g_prekey_store_vt.remove_pre_key = prekey_remove;
    g_prekey_store_vt.user_data = nullptr;
    signal_protocol_store_context_set_pre_key_store(g_store, &g_prekey_store_vt);

    memset(&g_spk_store_vt, 0, sizeof(g_spk_store_vt));
    g_spk_store_vt.load_signed_pre_key = spk_load;
    g_spk_store_vt.store_signed_pre_key = spk_store;
    g_spk_store_vt.contains_signed_pre_key = spk_contains;
    g_spk_store_vt.remove_signed_pre_key = spk_remove;
    g_spk_store_vt.user_data = nullptr;
    signal_protocol_store_context_set_signed_pre_key_store(g_store, &g_spk_store_vt);

    memset(&g_identity_store_vt, 0, sizeof(g_identity_store_vt));
    g_identity_store_vt.get_identity_key_pair = id_get_key_pair;
    g_identity_store_vt.get_local_registration_id = id_get_reg;
    g_identity_store_vt.save_identity = id_save;
    g_identity_store_vt.is_trusted_identity = id_is_trusted;
    g_identity_store_vt.user_data = nullptr;
    signal_protocol_store_context_set_identity_key_store(g_store, &g_identity_store_vt);
  }
  EnsureStoreInitialized();
  if (!g_mem) g_mem = std::make_unique<MemoryStores>();
  g_ready = (g_ctx && g_store);
  if (g_exports) {
    g_exports.Set("isStub", Napi::Boolean::New(env, !g_ready));
  }
  return Napi::String::New(env, g_ready ? "ready" : "stub:ctx-ok");
}

// version(): string
static Napi::Value Version(const Napi::CallbackInfo& info) {
  // Return a composite version indicating context status
  std::string v = "scaffold-0";
  if (g_ctx) v += "+ctx";
  if (g_store) v += "+store";
  return Napi::String::New(info.Env(), v);
}

// Include libsignal helpers
#include <signal/key_helper.h>
#include <signal/curve.h>
#include <signal/session_pre_key.h>
#include <signal/session_builder.h>
#include <signal/session_cipher.h>
#include <signal/protocol.h>
#include <signal/ratchet.h>

// Phase 1 scaffold API (N-API surface)
// generateAccount(): { registrationId, identityKeyB64, signedPreKey: { id, pubB64, sigB64 }, oneTimePreKeys: Array<{ id, pubB64 }> }
static Napi::Value GenerateAccount(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  EnsureStoreInitialized();
  if (!g_ctx || !g_store) {
    Napi::Error::New(env, "libsignal not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  ratchet_identity_key_pair *id_pair = nullptr;
  if (signal_protocol_key_helper_generate_identity_key_pair(&id_pair, g_ctx) != SG_SUCCESS) {
    Napi::Error::New(env, "identity-gen-failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  ec_public_key *id_pub = ratchet_identity_key_pair_get_public(id_pair);
  ec_private_key *id_priv = ratchet_identity_key_pair_get_private(id_pair);
  signal_buffer *pubbuf = nullptr;
  signal_buffer *privbuf = nullptr;
  if (ec_public_key_serialize(&pubbuf, id_pub) != SG_SUCCESS || ec_private_key_serialize(&privbuf, id_priv) != SG_SUCCESS) {
    ratchet_identity_key_pair_destroy((signal_type_base*)id_pair);
    if (pubbuf) signal_buffer_free(pubbuf);
    if (privbuf) signal_buffer_bzero_free(privbuf);
    Napi::Error::New(env, "identity-serialize-failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::vector<uint8_t> identity_pub(signal_buffer_data(pubbuf), signal_buffer_data(pubbuf) + signal_buffer_len(pubbuf));
  std::vector<uint8_t> identity_priv(signal_buffer_data(privbuf), signal_buffer_data(privbuf) + signal_buffer_len(privbuf));
  signal_buffer_free(pubbuf);
  signal_buffer_bzero_free(privbuf);

  uint32_t reg = 0;
  signal_protocol_key_helper_generate_registration_id(&reg, 0, g_ctx);

  session_signed_pre_key *spk = nullptr;
  uint32_t spk_id = 1;
  uint64_t ts = (uint64_t)(time(nullptr)) * 1000ull;
  if (signal_protocol_key_helper_generate_signed_pre_key(&spk, id_pair, spk_id, ts, g_ctx) != SG_SUCCESS) {
    ratchet_identity_key_pair_destroy((signal_type_base*)id_pair);
    Napi::Error::New(env, "spk-gen-failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  signal_protocol_signed_pre_key_store_key(g_store, spk);
  ec_key_pair *spk_kp = session_signed_pre_key_get_key_pair(spk);
  ec_public_key *spk_pub = ec_key_pair_get_public(spk_kp);
  signal_buffer *spk_pubbuf = nullptr;
  ec_public_key_serialize(&spk_pubbuf, spk_pub);
  const uint8_t *spk_sig_ptr = session_signed_pre_key_get_signature(spk);
  size_t spk_sig_len = session_signed_pre_key_get_signature_len(spk);
  std::vector<uint8_t> spk_pub_vec;
  std::vector<uint8_t> spk_sig_vec;
  if (spk_pubbuf) {
    spk_pub_vec.assign(signal_buffer_data(spk_pubbuf), signal_buffer_data(spk_pubbuf) + signal_buffer_len(spk_pubbuf));
    signal_buffer_free(spk_pubbuf);
  }
  spk_sig_vec.assign(spk_sig_ptr, spk_sig_ptr + spk_sig_len);

  signal_protocol_key_helper_pre_key_list_node *head = nullptr;
  const unsigned int count = 5;
  signal_protocol_key_helper_generate_pre_keys(&head, 1, count, g_ctx);
  std::unordered_map<int32_t, MemoryStores::KeyPair> generated_opks;
  for (auto node = head; node; node = signal_protocol_key_helper_key_list_next(node)) {
    session_pre_key *pk = signal_protocol_key_helper_key_list_element(node);
    signal_protocol_pre_key_store_key(g_store, pk);
    uint32_t id = session_pre_key_get_id(pk);
    ec_key_pair *kp = session_pre_key_get_key_pair(pk);
    ec_public_key *pub = ec_key_pair_get_public(kp);
    signal_buffer *pb = nullptr;
    signal_buffer *pr = nullptr;
    if (pub) ec_public_key_serialize(&pb, pub);
    ec_private_key *priv = kp ? ec_key_pair_get_private(kp) : nullptr;
    if (priv) ec_private_key_serialize(&pr, priv);
    MemoryStores::KeyPair kp_store{};
    if (pb) {
      kp_store.pub.assign(signal_buffer_data(pb), signal_buffer_data(pb) + signal_buffer_len(pb));
      signal_buffer_free(pb);
    }
    if (pr) {
      kp_store.priv.assign(signal_buffer_data(pr), signal_buffer_data(pr) + signal_buffer_len(pr));
      signal_buffer_bzero_free(pr);
    }
    generated_opks[(int32_t)id] = std::move(kp_store);
  }
  signal_protocol_key_helper_key_list_free(head);

  {
    std::scoped_lock<std::mutex> lk(g_mem_mu);
    if (!g_mem) g_mem = std::make_unique<MemoryStores>();
    g_mem->identity_pub = identity_pub;
    g_mem->identity_priv = identity_priv;
    g_mem->registration_id = reg;
    g_mem->spk_id = (int32_t)spk_id;
    g_mem->spk_pub = spk_pub_vec;
    g_mem->spk_sig = spk_sig_vec;
    g_mem->one_time_prekeys.clear();
    for (auto &kv : generated_opks) {
      g_mem->one_time_prekeys[kv.first] = kv.second;
    }
  }

  Napi::Object out = Napi::Object::New(env);
  out.Set("registrationId", Napi::Number::New(env, reg));
  out.Set("identityKeyB64", Napi::String::New(env, b64v(identity_pub)));
  Napi::Object spko = Napi::Object::New(env);
  spko.Set("id", Napi::Number::New(env, spk_id));
  spko.Set("pubB64", Napi::String::New(env, b64v(spk_pub_vec)));
  spko.Set("sigB64", Napi::String::New(env, b64(spk_sig_vec.data(), spk_sig_vec.size())));
  out.Set("signedPreKey", spko);
  Napi::Array arr = Napi::Array::New(env);
  uint32_t idx = 0;
  for (const auto &kv : generated_opks) {
    Napi::Object entry = Napi::Object::New(env);
    entry.Set("id", Napi::Number::New(env, (uint32_t)kv.first));
    entry.Set("pubB64", Napi::String::New(env, b64v(kv.second.pub)));
    arr[idx++] = entry;
  }
  out.Set("oneTimePreKeys", arr);

  DBG("generateAccount ok: reg=%u, spk_id=%u, opk_count=%zu", reg, spk_id, generated_opks.size());
  ratchet_identity_key_pair_destroy((signal_type_base*)id_pair);
  session_signed_pre_key_destroy((signal_type_base*)spk);
  g_ready = true;
  if (g_exports) {
    g_exports.Set("isStub", Napi::Boolean::New(env, !g_ready));
  }
  return out;
}

// getPublicBundle(): { registrationId, identityKeyB64, signedPreKey: { id, pubB64, sigB64 }, oneTimePreKey?: { id, pubB64 } }
static Napi::Value GetPublicBundle(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem || g_mem->identity_pub.empty() || g_mem->spk_pub.empty() || g_mem->spk_sig.empty()) { Napi::Error::New(env, "account-not-initialized").ThrowAsJavaScriptException(); return env.Null(); }
  Napi::Object out = Napi::Object::New(env);
  out.Set("registrationId", Napi::Number::New(env, g_mem->registration_id));
  out.Set("identityKeyB64", Napi::String::New(env, b64v(g_mem->identity_pub)));
  Napi::Object spko = Napi::Object::New(env);
  spko.Set("id", Napi::Number::New(env, (uint32_t)g_mem->spk_id));
  spko.Set("pubB64", Napi::String::New(env, b64v(g_mem->spk_pub)));
  spko.Set("sigB64", Napi::String::New(env, b64((const uint8_t*)g_mem->spk_sig.data(), g_mem->spk_sig.size())));
  out.Set("signedPreKey", spko);
  // Optionally include one opk placeholder
  if (!g_mem->one_time_prekeys.empty()) {
    auto it = g_mem->one_time_prekeys.begin();
    Napi::Object opk = Napi::Object::New(env);
    opk.Set("id", Napi::Number::New(env, (uint32_t)it->first));
    opk.Set("pubB64", Napi::String::New(env, b64v(it->second.pub)));
    out.Set("oneTimePreKey", opk);
  }
  return out;
}

// processPreKeyBundle(remoteBundleJson): { sessionId }
static Napi::Value ProcessPreKeyBundle(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  EnsureStoreInitialized();
  if (!g_ctx || !g_store) { Napi::Error::New(env, "libsignal not initialized").ThrowAsJavaScriptException(); return env.Null(); }
  if (info.Length() < 1 || !info[0].IsObject()) { Napi::TypeError::New(env, "expected bundle object").ThrowAsJavaScriptException(); return env.Null(); }
  Napi::Object obj = info[0].As<Napi::Object>();

  auto getStr = [&](const char* k)->std::string { Napi::Value v = obj.Get(k); return v.IsString() ? v.As<Napi::String>().Utf8Value() : std::string(); };
  auto getNestedStr = [&](const char* parent, const char* k)->std::string { Napi::Value p = obj.Get(parent); if (!p.IsObject()) return std::string(); Napi::Value v = p.As<Napi::Object>().Get(k); return v.IsString() ? v.As<Napi::String>().Utf8Value() : std::string(); };

  uint32_t registration_id = obj.Get("registrationId").IsNumber() ? obj.Get("registrationId").As<Napi::Number>().Uint32Value() : 0;
  int device_id = obj.Get("deviceId").IsNumber() ? obj.Get("deviceId").As<Napi::Number>().Int32Value() : 1;
  std::string ik_b64 = getStr("identityKeyB64");
  std::string spk_pub_b64 = getNestedStr("signedPreKey", "pubB64");
  std::string spk_sig_b64 = getNestedStr("signedPreKey", "sigB64");
  uint32_t spk_id = obj.Get("signedPreKey").IsObject() ? obj.Get("signedPreKey").As<Napi::Object>().Get("id").As<Napi::Number>().Uint32Value() : 1;

  std::string opk_pub_b64 = getNestedStr("oneTimePreKey", "pubB64");
  uint32_t opk_id = obj.Get("oneTimePreKey").IsObject() ? obj.Get("oneTimePreKey").As<Napi::Object>().Get("id").As<Napi::Number>().Uint32Value() : 0;

  // Decode keys
  auto dec = [](const std::string &b64)->std::vector<uint8_t> {
    return from_b64(b64);
  };
  std::vector<uint8_t> ik_ser = dec(ik_b64);
  std::vector<uint8_t> spk_pub_ser = dec(spk_pub_b64);
  std::vector<uint8_t> spk_sig = dec(spk_sig_b64);
  std::vector<uint8_t> opk_pub_ser = dec(opk_pub_b64);

  ec_public_key *ik_pub = nullptr, *spk_pub = nullptr, *opk_pub = nullptr;
  if (curve_decode_point(&ik_pub, ik_ser.data(), ik_ser.size(), g_ctx) != SG_SUCCESS) { Napi::Error::New(env, "bad-identity").ThrowAsJavaScriptException(); return env.Null(); }
  if (curve_decode_point(&spk_pub, spk_pub_ser.data(), spk_pub_ser.size(), g_ctx) != SG_SUCCESS) { if (ik_pub) ec_public_key_destroy((signal_type_base*)ik_pub); Napi::Error::New(env, "bad-spk").ThrowAsJavaScriptException(); return env.Null(); }
  if (!opk_pub_ser.empty()) {
    if (curve_decode_point(&opk_pub, opk_pub_ser.data(), opk_pub_ser.size(), g_ctx) != SG_SUCCESS) { if (ik_pub) ec_public_key_destroy((signal_type_base*)ik_pub); if (spk_pub) ec_public_key_destroy((signal_type_base*)spk_pub); Napi::Error::New(env, "bad-opk").ThrowAsJavaScriptException(); return env.Null(); }
  }

  session_pre_key_bundle *bundle = nullptr;
  int rc = session_pre_key_bundle_create(&bundle,
    registration_id, device_id,
    opk_id, opk_pub,
    spk_id, spk_pub,
    spk_sig.data(), spk_sig.size(),
    ik_pub);
  if (rc != SG_SUCCESS) { if (ik_pub) ec_public_key_destroy((signal_type_base*)ik_pub); if (spk_pub) ec_public_key_destroy((signal_type_base*)spk_pub); if (opk_pub) ec_public_key_destroy((signal_type_base*)opk_pub); Napi::Error::New(env, "bundle-create-failed").ThrowAsJavaScriptException(); return env.Null(); }

  // Use identity key b64 as address name (placeholder) and device id
  signal_protocol_address addr{ ik_b64.c_str(), ik_b64.size(), device_id };
  session_builder *builder = nullptr;
  rc = session_builder_create(&builder, g_store, &addr, g_ctx);
  if (rc != SG_SUCCESS) {
    DBG("session_builder_create failed rc=%d", rc);
  }
  if (rc == SG_SUCCESS) {
    rc = session_builder_process_pre_key_bundle(builder, bundle);
  }
  if (builder) session_builder_free(builder);
  session_pre_key_bundle_destroy((signal_type_base*)bundle);
  if (ik_pub) ec_public_key_destroy((signal_type_base*)ik_pub);
  if (spk_pub) ec_public_key_destroy((signal_type_base*)spk_pub);
  if (opk_pub) ec_public_key_destroy((signal_type_base*)opk_pub);
  if (rc != SG_SUCCESS) {
    DBG("session_builder_process_pre_key_bundle failed rc=%d", rc);
    Napi::Error::New(env, "session-build-failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  // Create a deterministic session id (sha256 of ik_b64) and index mapping
  unsigned char md[EVP_MAX_MD_SIZE]; unsigned int mdlen=0; EVP_MD_CTX *mctx = EVP_MD_CTX_new(); EVP_DigestInit_ex(mctx, EVP_sha256(), nullptr); EVP_DigestUpdate(mctx, ik_b64.data(), ik_b64.size()); EVP_DigestFinal_ex(mctx, md, &mdlen); EVP_MD_CTX_free(mctx);
  static const char hex[] = "0123456789abcdef"; std::string sid; sid.resize(mdlen*2); for (unsigned int i=0;i<mdlen;i++){ sid[2*i]=hex[(md[i]>>4)&0xF]; sid[2*i+1]=hex[md[i]&0xF]; }
  {
    std::scoped_lock<std::mutex> lk(g_mem_mu);
    if (g_mem) g_mem->session_index[sid] = make_address_key(&addr);
  }
  DBG("processPreKeyBundle ok: sid=%s dev=%d", sid.c_str(), device_id);
  Napi::Object out = Napi::Object::New(env); out.Set("sessionId", Napi::String::New(env, sid));
  return out;
}

// Back-compat encryptMessage(sessionId, plaintext) -> { ciphertext: b64 }
static Napi::Value EncryptMessage(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  EnsureStoreInitialized();
  if (!g_ctx || !g_store) { Napi::Error::New(env, "libsignal not initialized").ThrowAsJavaScriptException(); return env.Null(); }
  if (info.Length() < 2) { Napi::TypeError::New(env, "encryptMessage(sessionId, plaintext)").ThrowAsJavaScriptException(); return env.Null(); }
  size_t idx_sid = info.Length() == 3 ? 1 : 0;
  size_t idx_pt  = info.Length() == 3 ? 2 : 1;
  if (!info[idx_sid].IsString() || !info[idx_pt].IsString()) { Napi::TypeError::New(env, "invalid args").ThrowAsJavaScriptException(); return env.Null(); }
  std::string sid = info[idx_sid].As<Napi::String>().Utf8Value();
  std::string pt  = info[idx_pt].As<Napi::String>().Utf8Value();

  // Lookup address from session index
  std::string addr_key;
  {
    std::scoped_lock<std::mutex> lk(g_mem_mu);
    if (g_mem && g_mem->session_index.count(sid)) addr_key = g_mem->session_index[sid];
  }
  std::string name; int device_id = 1;
  if (!addr_key.empty()) {
    auto bar = addr_key.find('|'); if (bar == std::string::npos) return Napi::Error::New(env, "bad-session-map").Value();
    name = addr_key.substr(0, bar);
    device_id = atoi(addr_key.c_str() + bar + 1);
  } else {
    // Fallback: treat sid as remote address name (identityKeyB64), default device 1
    name = sid;
  }
  signal_protocol_address addr{ name.c_str(), name.size(), device_id };

  session_cipher *cipher = nullptr;
  int rc = session_cipher_create(&cipher, g_store, &addr, g_ctx);
  if (rc != SG_SUCCESS || !cipher) { Napi::Error::New(env, "cipher-create-failed").ThrowAsJavaScriptException(); return env.Null(); }

  ciphertext_message *cmsg = nullptr;
  rc = session_cipher_encrypt(cipher, reinterpret_cast<const uint8_t*>(pt.data()), pt.size(), &cmsg);
  if (rc != SG_SUCCESS || !cmsg) { session_cipher_free(cipher); Napi::Error::New(env, "encrypt-failed").ThrowAsJavaScriptException(); return env.Null(); }
  signal_buffer *ser = ciphertext_message_get_serialized(cmsg);
  std::string ct_b64 = b64(signal_buffer_data(ser), signal_buffer_len(ser));
  // Free
  signal_type_unref((signal_type_base*)cmsg);
  session_cipher_free(cipher);

  Napi::Object out = Napi::Object::New(env);
  out.Set("ciphertext", Napi::String::New(env, ct_b64));
  DBG("encrypt ok: addr=%s dev=%d len=%zu", name.c_str(), device_id, (size_t)signal_buffer_len(ser));
  return out;
}

// Back-compat decryptMessage(sessionId, ciphertext) -> { plaintext }
static Napi::Value DecryptMessage(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  EnsureStoreInitialized();
  if (!g_ctx || !g_store) { Napi::Error::New(env, "libsignal not initialized").ThrowAsJavaScriptException(); return env.Null(); }
  if (info.Length() < 2) { Napi::TypeError::New(env, "decryptMessage(sessionId, ciphertextB64)").ThrowAsJavaScriptException(); return env.Null(); }
  size_t idx_sid = info.Length() == 3 ? 1 : 0;
  size_t idx_ct  = info.Length() == 3 ? 2 : 1;
  if (!info[idx_sid].IsString() || !info[idx_ct].IsString()) { Napi::TypeError::New(env, "invalid args").ThrowAsJavaScriptException(); return env.Null(); }
  std::string sid = info[idx_sid].As<Napi::String>().Utf8Value();
  std::string ct_b64 = info[idx_ct].As<Napi::String>().Utf8Value();

  std::string addr_key;
  {
    std::scoped_lock<std::mutex> lk(g_mem_mu);
    if (g_mem && g_mem->session_index.count(sid)) addr_key = g_mem->session_index[sid];
  }
  std::string name;
  int device_id = 1;
  if (!addr_key.empty()) {
    auto bar = addr_key.find('|');
    if (bar == std::string::npos) return Napi::Error::New(env, "bad-session-map").Value();
    name = addr_key.substr(0, bar);
    device_id = atoi(addr_key.c_str() + bar + 1);
  } else {
    // Fallback: sid is remote identity key string
    name = sid;
  }
  signal_protocol_address addr{ name.c_str(), name.size(), device_id };

  // Decode ciphertext
  std::vector<uint8_t> ct = from_b64(ct_b64);
  if (ct.empty()) {
    Napi::Error::New(env, "b64-decode-failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  session_cipher *cipher = nullptr;
  int rc = session_cipher_create(&cipher, g_store, &addr, g_ctx);
  if (rc != SG_SUCCESS || !cipher) {
    DBG("session_cipher_create failed rc=%d", rc);
    Napi::Error::New(env, "cipher-create-failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  signal_buffer *pt = nullptr;
  // Try as signal_message first
  signal_message *sm = nullptr;
  if (signal_message_deserialize(&sm, ct.data(), ct.size(), g_ctx) == SG_SUCCESS) {
    rc = session_cipher_decrypt_signal_message(cipher, sm, nullptr, &pt);
    signal_message_destroy((signal_type_base*)sm);
  } else {
    pre_key_signal_message *pm = nullptr;
    if (pre_key_signal_message_deserialize(&pm, ct.data(), ct.size(), g_ctx) == SG_SUCCESS) {
      rc = session_cipher_decrypt_pre_key_signal_message(cipher, pm, nullptr, &pt);
      pre_key_signal_message_destroy((signal_type_base*)pm);
    } else {
      session_cipher_free(cipher);
      Napi::Error::New(env, "ciphertext-parse-failed").ThrowAsJavaScriptException();
      return env.Null();
    }
  }
  session_cipher_free(cipher);
  if (rc != SG_SUCCESS || !pt) { Napi::Error::New(env, "decrypt-failed").ThrowAsJavaScriptException(); return env.Null(); }

  // If we didn't have a mapping, add one based on name
  if (addr_key.empty()) {
    unsigned char md[EVP_MAX_MD_SIZE]; unsigned int mdlen=0; EVP_MD_CTX *mctx = EVP_MD_CTX_new(); EVP_DigestInit_ex(mctx, EVP_sha256(), nullptr); EVP_DigestUpdate(mctx, name.data(), name.size()); EVP_DigestFinal_ex(mctx, md, &mdlen); EVP_MD_CTX_free(mctx);
    static const char hex[] = "0123456789abcdef"; std::string sid2; sid2.resize(mdlen*2); for (unsigned int i=0;i<mdlen;i++){ sid2[2*i]=hex[(md[i]>>4)&0xF]; sid2[2*i+1]=hex[md[i]&0xF]; }
    std::scoped_lock<std::mutex> lk(g_mem_mu);
    if (g_mem) g_mem->session_index[sid2] = make_address_key(&addr);
  }

  std::string out(reinterpret_cast<char*>(signal_buffer_data(pt)), signal_buffer_len(pt));
  signal_buffer_bzero_free(pt);
  Napi::Object o = Napi::Object::New(env);
  o.Set("plaintext", Napi::String::New(env, out));
  DBG("decrypt ok: addr=%s dev=%d len=%zu", name.c_str(), device_id, (size_t)out.size());
  return o;
}

// exportState(): string (JSON)
static Napi::Value ExportState(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  EnsureStoreInitialized();
  std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) {
    return Napi::String::New(env, g_state_json);
  }

  Napi::Object root = Napi::Object::New(env);
  root.Set("version", Napi::Number::New(env, 1));
  root.Set("legacyState", Napi::String::New(env, g_state_json));

  Napi::Object identity = Napi::Object::New(env);
  identity.Set("registrationId", Napi::Number::New(env, g_mem->registration_id));
  identity.Set("identityPubB64", Napi::String::New(env, b64v(g_mem->identity_pub)));
  identity.Set("identityPrivB64", Napi::String::New(env, b64v(g_mem->identity_priv)));
  root.Set("identity", identity);

  Napi::Object spk = Napi::Object::New(env);
  spk.Set("id", Napi::Number::New(env, (uint32_t)g_mem->spk_id));
  spk.Set("pubB64", Napi::String::New(env, b64v(g_mem->spk_pub)));
  spk.Set("sigB64", Napi::String::New(env, b64((const uint8_t*)g_mem->spk_sig.data(), g_mem->spk_sig.size())));
  root.Set("signedPreKey", spk);

  Napi::Object trusted = Napi::Object::New(env);
  for (const auto &kv : g_mem->identities) {
    trusted.Set(kv.first, Napi::String::New(env, b64v(kv.second)));
  }
  root.Set("trustedIdentities", trusted);

  Napi::Object sessions = Napi::Object::New(env);
  for (const auto &kv : g_mem->sessions) {
    sessions.Set(kv.first, Napi::String::New(env, b64v(kv.second)));
  }
  root.Set("sessions", sessions);

  Napi::Object sessionIdx = Napi::Object::New(env);
  for (const auto &kv : g_mem->session_index) {
    sessionIdx.Set(kv.first, Napi::String::New(env, kv.second));
  }
  root.Set("sessionIndex", sessionIdx);

  Napi::Object prekeys = Napi::Object::New(env);
  for (const auto &kv : g_mem->prekey_records) {
    prekeys.Set(std::to_string(kv.first), Napi::String::New(env, b64v(kv.second)));
  }
  root.Set("prekeyRecords", prekeys);

  Napi::Object spkRecords = Napi::Object::New(env);
  for (const auto &kv : g_mem->spk_records) {
    spkRecords.Set(std::to_string(kv.first), Napi::String::New(env, b64v(kv.second)));
  }
  root.Set("spkRecords", spkRecords);

  Napi::Array opks = Napi::Array::New(env);
  uint32_t idx = 0;
  for (const auto &kv : g_mem->one_time_prekeys) {
    Napi::Object entry = Napi::Object::New(env);
    entry.Set("id", Napi::Number::New(env, (uint32_t)kv.first));
    entry.Set("pubB64", Napi::String::New(env, b64v(kv.second.pub)));
    if (!kv.second.priv.empty()) {
      entry.Set("privB64", Napi::String::New(env, b64v(kv.second.priv)));
    }
    opks[idx++] = entry;
  }
  root.Set("oneTimePreKeys", opks);

  return JsonStringify(env, root);
}

// importState(jsonString): void
static Napi::Value ImportState(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "importState(json) expects a string").ThrowAsJavaScriptException();
    return env.Null();
  }
  EnsureStoreInitialized();
  Napi::String json = info[0].As<Napi::String>();
  Napi::Value parsed;
  parsed = JsonParse(env, json);
  if (parsed.IsEmpty() || parsed.IsNull() || parsed.IsUndefined()) {
    g_state_json = json;
    return env.Undefined();
  }
  if (!parsed.IsObject()) {
    g_state_json = json;
    return env.Undefined();
  }

  Napi::Object state = parsed.As<Napi::Object>();
  g_state_json = state.Get("legacyState").IsString() ? state.Get("legacyState").As<Napi::String>() : json;

  std::scoped_lock<std::mutex> lk(g_mem_mu);
  if (!g_mem) g_mem = std::make_unique<MemoryStores>();
  g_mem->identities.clear();
  g_mem->prekey_records.clear();
  g_mem->spk_records.clear();
  g_mem->sessions.clear();
  g_mem->session_index.clear();
  g_mem->one_time_prekeys.clear();

  if (state.Get("identity").IsObject()) {
    Napi::Object id = state.Get("identity").As<Napi::Object>();
    if (id.Get("registrationId").IsNumber()) g_mem->registration_id = id.Get("registrationId").As<Napi::Number>().Uint32Value();
    if (id.Get("identityPubB64").IsString()) g_mem->identity_pub = from_b64(id.Get("identityPubB64").As<Napi::String>().Utf8Value());
    if (id.Get("identityPrivB64").IsString()) g_mem->identity_priv = from_b64(id.Get("identityPrivB64").As<Napi::String>().Utf8Value());
  }

  if (state.Get("signedPreKey").IsObject()) {
    Napi::Object spk = state.Get("signedPreKey").As<Napi::Object>();
    if (spk.Get("id").IsNumber()) g_mem->spk_id = (int32_t)spk.Get("id").As<Napi::Number>().Uint32Value();
    if (spk.Get("pubB64").IsString()) g_mem->spk_pub = from_b64(spk.Get("pubB64").As<Napi::String>().Utf8Value());
    if (spk.Get("sigB64").IsString()) g_mem->spk_sig = from_b64(spk.Get("sigB64").As<Napi::String>().Utf8Value());
  }

  if (state.Get("trustedIdentities").IsObject()) {
    Napi::Object trusted = state.Get("trustedIdentities").As<Napi::Object>();
    auto names = trusted.GetPropertyNames();
    for (uint32_t i = 0; i < names.Length(); ++i) {
      std::string name = names.Get(i).ToString().Utf8Value();
      std::string val = trusted.Get(name).IsString() ? trusted.Get(name).As<Napi::String>().Utf8Value() : std::string();
      if (!val.empty()) g_mem->identities[name] = from_b64(val);
    }
  }

  if (state.Get("sessions").IsObject()) {
    Napi::Object sessions = state.Get("sessions").As<Napi::Object>();
    auto names = sessions.GetPropertyNames();
    for (uint32_t i = 0; i < names.Length(); ++i) {
      std::string name = names.Get(i).ToString().Utf8Value();
      std::string val = sessions.Get(name).IsString() ? sessions.Get(name).As<Napi::String>().Utf8Value() : std::string();
      if (!val.empty()) g_mem->sessions[name] = from_b64(val);
    }
  }

  if (state.Get("sessionIndex").IsObject()) {
    Napi::Object idx = state.Get("sessionIndex").As<Napi::Object>();
    auto names = idx.GetPropertyNames();
    for (uint32_t i = 0; i < names.Length(); ++i) {
      std::string sid = names.Get(i).ToString().Utf8Value();
      std::string addr = idx.Get(sid).IsString() ? idx.Get(sid).As<Napi::String>().Utf8Value() : std::string();
      if (!addr.empty()) g_mem->session_index[sid] = addr;
    }
  }

  if (state.Get("prekeyRecords").IsObject()) {
    Napi::Object prekeys = state.Get("prekeyRecords").As<Napi::Object>();
    auto names = prekeys.GetPropertyNames();
    for (uint32_t i = 0; i < names.Length(); ++i) {
      std::string idStr = names.Get(i).ToString().Utf8Value();
      std::string val = prekeys.Get(idStr).IsString() ? prekeys.Get(idStr).As<Napi::String>().Utf8Value() : std::string();
      if (!val.empty()) {
        uint32_t id = (uint32_t)std::strtoul(idStr.c_str(), nullptr, 10);
        g_mem->prekey_records[id] = from_b64(val);
      }
    }
  }

  if (state.Get("spkRecords").IsObject()) {
    Napi::Object rec = state.Get("spkRecords").As<Napi::Object>();
    auto names = rec.GetPropertyNames();
    for (uint32_t i = 0; i < names.Length(); ++i) {
      std::string idStr = names.Get(i).ToString().Utf8Value();
      std::string val = rec.Get(idStr).IsString() ? rec.Get(idStr).As<Napi::String>().Utf8Value() : std::string();
      if (!val.empty()) {
        uint32_t id = (uint32_t)std::strtoul(idStr.c_str(), nullptr, 10);
        g_mem->spk_records[id] = from_b64(val);
      }
    }
  }

  if (state.Get("oneTimePreKeys").IsArray()) {
    Napi::Array arr = state.Get("oneTimePreKeys").As<Napi::Array>();
    for (uint32_t i = 0; i < arr.Length(); ++i) {
      Napi::Value v = arr.Get(i);
      if (!v.IsObject()) continue;
      Napi::Object e = v.As<Napi::Object>();
      if (!e.Get("id").IsNumber() || !e.Get("pubB64").IsString()) continue;
      MemoryStores::KeyPair kp{};
      kp.pub = from_b64(e.Get("pubB64").As<Napi::String>().Utf8Value());
      if (e.Get("privB64").IsString()) kp.priv = from_b64(e.Get("privB64").As<Napi::String>().Utf8Value());
      g_mem->one_time_prekeys[(int32_t)e.Get("id").As<Napi::Number>().Uint32Value()] = std::move(kp);
    }
  }

  g_ready = (g_ctx && g_store);
  if (g_exports) {
    g_exports.Set("isStub", Napi::Boolean::New(env, !g_ready));
  }
  return env.Undefined();
}

// clearState(): void
static Napi::Value ClearState(const Napi::CallbackInfo& info) {
  std::scoped_lock<std::mutex> lk(g_mem_mu);
  g_state_json.clear();
  g_mem = std::make_unique<MemoryStores>();
  if (g_exports) {
    g_exports.Set("isStub", Napi::Boolean::New(info.Env(), !g_ready));
  }
  return info.Env().Undefined();
}

// Back-compat placeholders used by earlier experiments
static Napi::Value GenerateIdentity(const Napi::CallbackInfo& info) { return NotImplemented(info, "generateIdentity"); }
static Napi::Value GenerateSignedPreKey(const Napi::CallbackInfo& info) { return NotImplemented(info, "generateSignedPreKey"); }
static Napi::Value GenerateOneTimePreKeys(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  EnsureStoreInitialized();
  if (!g_ctx || !g_store) {
    Napi::Error::New(env, "libsignal not initialized").ThrowAsJavaScriptException();
    return env.Null();
  }

  size_t count_idx = 0;
  if (info.Length() >= 2 && info[0].IsString()) {
    count_idx = 1;
  }
  uint32_t requested = 10;
  if (info.Length() > count_idx && info[count_idx].IsNumber()) {
    requested = info[count_idx].As<Napi::Number>().Uint32Value();
  }
  requested = std::max<uint32_t>(1, std::min<uint32_t>(requested, 100));

  uint32_t start_id = 1;
  {
    std::scoped_lock<std::mutex> lk(g_mem_mu);
    if (g_mem) {
      for (const auto &kv : g_mem->one_time_prekeys) {
        if ((uint32_t)kv.first >= start_id) start_id = (uint32_t)kv.first + 1;
      }
      for (const auto &kv : g_mem->prekey_records) {
        if (kv.first >= start_id) start_id = kv.first + 1;
      }
    }
  }

  signal_protocol_key_helper_pre_key_list_node *head = nullptr;
  int rc = signal_protocol_key_helper_generate_pre_keys(&head, start_id, requested, g_ctx);
  if (rc != SG_SUCCESS) {
    if (head) signal_protocol_key_helper_key_list_free(head);
    Napi::Error::New(env, "prekey-gen-failed").ThrowAsJavaScriptException();
    return env.Null();
  }

  struct GeneratedPreKey { uint32_t id; std::vector<uint8_t> pub; std::vector<uint8_t> priv; };
  std::vector<GeneratedPreKey> created;

  for (auto node = head; node; node = signal_protocol_key_helper_key_list_next(node)) {
    session_pre_key *pk = signal_protocol_key_helper_key_list_element(node);
    if (!pk) continue;
    uint32_t id = session_pre_key_get_id(pk);
    // Store in libsignal so the session builder can load it later
    signal_protocol_pre_key_store_key(g_store, pk);

    ec_key_pair *kp = session_pre_key_get_key_pair(pk);
    ec_public_key *pub = kp ? ec_key_pair_get_public(kp) : nullptr;
    ec_private_key *priv = kp ? ec_key_pair_get_private(kp) : nullptr;
    signal_buffer *pb = nullptr;
    signal_buffer *pr = nullptr;
    if (pub) ec_public_key_serialize(&pb, pub);
    if (priv) ec_private_key_serialize(&pr, priv);

    GeneratedPreKey out{};
    out.id = id;
    if (pb) out.pub.assign(signal_buffer_data(pb), signal_buffer_data(pb) + signal_buffer_len(pb));
    if (pr) out.priv.assign(signal_buffer_data(pr), signal_buffer_data(pr) + signal_buffer_len(pr));
    if (pb) signal_buffer_free(pb);
    if (pr) signal_buffer_bzero_free(pr);

    created.push_back(std::move(out));
  }
  signal_protocol_key_helper_key_list_free(head);

  {
    std::scoped_lock<std::mutex> lk(g_mem_mu);
    if (!g_mem) g_mem = std::make_unique<MemoryStores>();
    for (auto &pk : created) {
      MemoryStores::KeyPair kp{};
      kp.pub = pk.pub;
      kp.priv = pk.priv;
      g_mem->one_time_prekeys[(int32_t)pk.id] = std::move(kp);
    }
  }

  Napi::Array arr = Napi::Array::New(env, created.size());
  for (size_t i = 0; i < created.size(); ++i) {
    Napi::Object entry = Napi::Object::New(env);
    entry.Set("id", Napi::Number::New(env, created[i].id));
    entry.Set("pubB64", Napi::String::New(env, b64(created[i].pub.data(), created[i].pub.size())));
    if (!created[i].priv.empty()) {
      entry.Set("privB64", Napi::String::New(env, b64(created[i].priv.data(), created[i].priv.size())));
    }
    arr[(uint32_t)i] = entry;
  }
  return arr;
}
static Napi::Value EstablishSession(const Napi::CallbackInfo& info) { return NotImplemented(info, "establishSession"); }

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("init", Napi::Function::New(env, InitNative));
  exports.Set("version", Napi::Function::New(env, Version));

  // Phase 1 scaffold
  exports.Set("generateAccount", Napi::Function::New(env, GenerateAccount));
  exports.Set("getPublicBundle", Napi::Function::New(env, GetPublicBundle));
  exports.Set("processPreKeyBundle", Napi::Function::New(env, ProcessPreKeyBundle));
  // Optional low-level variants can be added in the future
  // Back-compat encrypt/decrypt used by app
  exports.Set("encryptMessage", Napi::Function::New(env, EncryptMessage));
  exports.Set("decryptMessage", Napi::Function::New(env, DecryptMessage));
  exports.Set("exportState", Napi::Function::New(env, ExportState));
  exports.Set("importState", Napi::Function::New(env, ImportState));
  exports.Set("clearState", Napi::Function::New(env, ClearState));

  // Back-compat exports
  exports.Set("generateIdentity", Napi::Function::New(env, GenerateIdentity));
  exports.Set("generateSignedPreKey", Napi::Function::New(env, GenerateSignedPreKey));
  exports.Set("generateOneTimePreKeys", Napi::Function::New(env, GenerateOneTimePreKeys));
  exports.Set("establishSession", Napi::Function::New(env, EstablishSession));
  exports.Set("encryptMessage", Napi::Function::New(env, EncryptMessage));
  exports.Set("decryptMessage", Napi::Function::New(env, DecryptMessage));

  if (!g_exports.IsEmpty()) g_exports.Reset();
  g_exports = Napi::Persistent(exports);
  g_exports.SuppressDestruct();
  exports.Set("isStub", Napi::Boolean::New(env, !g_ready));
  // Small helper: expose addon base path for diagnostics
  try { exports.Set("path", Napi::String::New(env, "native/signal")); } catch (...) {}
  return exports;
}

} // namespace signal
