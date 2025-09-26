// N-API addon entry for libsignal-protocol provider
#include <napi.h>
#include "signal_wrapper.h"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  return signal::Init(env, exports);
}

NODE_API_MODULE(signal, InitAll)

