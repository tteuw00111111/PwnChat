{
  'targets': [
    {
      'target_name': 'signal',
      'sources': [
        'src/addon.cc',
        'src/signal_wrapper.cc',
        'src/provider_openssl.cc',
        'src/store_memory.cc'
      ],
      'include_dirs': [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      'dependencies': [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      'defines': [ 'NAPI_DISABLE_CPP_EXCEPTIONS' ],
      'cflags!': [ '-fno-exceptions' ],
      'cflags_cc!': [ '-fno-exceptions' ],
      'conditions': [
        # If libsignal-protocol-c is installed system-wide and pkg-config works, link it.
        ['OS=="linux" or OS=="mac"', {
          'libraries': [ '<!(pkg-config --libs --silence-errors libsignal-protocol-c || echo)', '-lcrypto' ],
          'include_dirs': [ '<!(pkg-config --cflags-only-I --silence-errors libsignal-protocol-c | sed s/-I//g || echo)' ]
        }]
      ]
    }
  ]
}
