// Minimal in-memory store context scaffolding for libsignal-protocol-c
#include <signal/signal_protocol.h>

static int setup_memory_store_impl(signal_protocol_store_context **store_out) {
  if (!store_out) return -1;
  return signal_protocol_store_context_create(store_out, nullptr);
}

extern "C" int setup_memory_store(signal_protocol_store_context **store_out) {
  return setup_memory_store_impl(store_out);
}
