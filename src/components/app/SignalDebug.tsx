import { useEffect, useState } from 'react';

export function SignalDebug() {
  const [version, setVersion] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const nativeOn = !!(window as any).electronCrypto?.nativeEnabled;

  useEffect(() => {
    (async () => {
      if (!nativeOn) return;
      try {
        const v = await (window as any).electronCrypto?.getNativeVersion?.();
        if (v) setVersion(String(v));
      } catch {}
    })();
  }, [nativeOn]);

  const runAccount = async () => {
    setOutput('');
    try {
      const acc = await (window as any).electronCrypto?.generateLSAccount?.();
      setOutput(JSON.stringify(acc, null, 2));
    } catch (e: any) {
      setOutput('Error: ' + (e?.message || String(e)));
    }
  };

  if (!nativeOn) return null;
  return (
    <div style={{ marginTop: 16, padding: 12, border: '1px solid #444', borderRadius: 6 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>Signal Debug (native)</div>
      <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>Version: {version || 'n/a'}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={runAccount}>generateLSAccount()</button>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.3, maxHeight: 180, overflow: 'auto' }}>{output}</pre>
    </div>
  );
}

