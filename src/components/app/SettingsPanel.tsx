import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keyAPI, ACCESS_TOKEN_KEY } from '../../utils/api';
import { localMessageService } from '../../lib/localMessageService';
import { SignalDebug } from './SignalDebug';
import { IoClose, IoLogOut, IoKey, IoShield, IoSettings } from 'react-icons/io5';

type BackendKind = 'file' | 'sqlcipher' | null;

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const nav = useNavigate();
  const [backend, setBackend] = useState<BackendKind>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // dev-only toggles removed; handshake/ratchet are default-on

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const info = await window.electronAPI.getBackend();
        if (!mounted) return;
        setBackend(info?.backend ?? null);
        // no-op: handshake/ratchet default-enabled
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);


  const handleTopUpPrekeys = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (typeof window.electronCrypto.generateOneTimePreKeys !== 'function') {
        setMsg('Prekey generator not available in this build.');
        return;
      }
      const batch = await window.electronCrypto.generateOneTimePreKeys(30);
      const added = await keyAPI.topUpPrekeys(batch);
      try { await window.electronAPI.saveOPKs(batch as any); } catch {}
      setMsg(`Uploaded ${added?.added ?? batch.length} prekeys.`);
    } catch (e: any) {
      setMsg('Failed to upload prekeys: ' + (e?.message || 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setMsg(null);
    try {
      try { await window.electronAPI.lockDB(); } catch {}
      try { localMessageService.reset(); } catch {} // Reset local message service on logout
      try { localStorage.removeItem(ACCESS_TOKEN_KEY); } catch {}
      nav('/login', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  // no toggles; defaults enforced in app

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        width: '460px',
        maxWidth: '95vw',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '20px',
        padding: '24px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        color: '#fff'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IoSettings size={24} style={{ color: '#7dcfff' }} />
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Settings</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: '4px',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#ef4444',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#ef4444';
            }}
          >
            <IoClose size={16} />
          </button>
        </div>

        {/* Security Info */}
        <div style={{
          background: 'rgba(125, 207, 255, 0.1)',
          border: '1px solid rgba(125, 207, 255, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <IoShield style={{ color: '#7dcfff' }} />
            <span style={{ fontWeight: '500' }}>Security Backend</span>
          </div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>
            <strong>Vault:</strong> {backend === 'sqlcipher' ? 'SQLCipher (Encrypted)' :
                                      backend === 'file' ? 'File Storage' : 'Unknown'}
          </div>
        </div>

        {/* Message */}
        {msg && (
          <div style={{
            background: 'rgba(125, 207, 255, 0.2)',
            border: '1px solid rgba(125, 207, 255, 0.4)',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '20px',
            fontSize: '14px',
            color: '#7dcfff'
          }}>
            {msg}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          {import.meta.env.DEV && (
            <button
              onClick={handleTopUpPrekeys}
              disabled={busy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                background: 'rgba(125, 207, 255, 0.2)',
                border: '1px solid rgba(125, 207, 255, 0.4)',
                borderRadius: '10px',
                color: '#fff',
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                opacity: busy ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!busy) e.currentTarget.style.background = 'rgba(125, 207, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                if (!busy) e.currentTarget.style.background = 'rgba(125, 207, 255, 0.2)';
              }}
            >
              <IoKey size={16} />
              {busy ? 'Uploading...' : 'Refresh Keys'}
            </button>
          )}

          <button
            onClick={handleLogout}
            disabled={busy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              background: 'rgba(255, 99, 99, 0.2)',
              border: '1px solid rgba(255, 99, 99, 0.4)',
              borderRadius: '10px',
              color: '#fff',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              opacity: busy ? 0.6 : 1
            }}
            onMouseEnter={(e) => {
              if (!busy) e.currentTarget.style.background = 'rgba(255, 99, 99, 0.3)';
            }}
            onMouseLeave={(e) => {
              if (!busy) e.currentTarget.style.background = 'rgba(255, 99, 99, 0.2)';
            }}
          >
            <IoLogOut size={16} />
            Logout
          </button>
        </div>

        {/* Debug Panel */}
        <SignalDebug />
      </div>
    </div>
  );
}
