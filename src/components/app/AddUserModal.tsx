import { useState } from 'react';
import { IoClose, IoPersonAdd, IoSearch } from 'react-icons/io5';

interface AddUserModalProps {
  onClose: () => void;
  onAddUser: (username: string) => void;
}

export function AddUserModal({ onClose, onAddUser }: AddUserModalProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await onAddUser(username.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        width: '400px',
        maxWidth: '95vw',
        background: 'rgba(31, 31, 31, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '20px',
        padding: '32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
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
            <IoPersonAdd size={24} style={{ color: '#7dcfff' }} />
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Add New User</h3>
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

        {/* Description */}
        <div style={{
          background: 'rgba(125, 207, 255, 0.1)',
          border: '1px solid rgba(125, 207, 255, 0.3)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '24px',
          fontSize: '14px',
          color: 'rgba(255, 255, 255, 0.8)'
        }}>
          Enter the username of the person you want to add to your contacts.
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: 'rgba(255, 255, 255, 0.8)',
              marginBottom: '8px'
            }}>
              Username
            </label>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}>
              <IoSearch style={{
                position: 'absolute',
                left: '12px',
                color: 'rgba(255, 255, 255, 0.5)',
                zIndex: 1
              }} size={18} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 40px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '16px',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(125, 207, 255, 0.5)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.12)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.target.style.background = 'rgba(255, 255, 255, 0.08)';
                }}
              />
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              fontSize: '14px',
              color: '#ef4444'
            }}>
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px 24px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!username.trim() || loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: loading || !username.trim() ?
                  'rgba(125, 207, 255, 0.3)' :
                  'rgba(125, 207, 255, 0.2)',
                border: '1px solid rgba(125, 207, 255, 0.4)',
                borderRadius: '10px',
                color: loading || !username.trim() ? 'rgba(255, 255, 255, 0.5)' : '#fff',
                cursor: loading || !username.trim() ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                opacity: loading || !username.trim() ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading && username.trim()) {
                  e.currentTarget.style.background = 'rgba(125, 207, 255, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && username.trim()) {
                  e.currentTarget.style.background = 'rgba(125, 207, 255, 0.2)';
                }
              }}
            >
              <IoPersonAdd size={16} />
              {loading ? 'Adding...' : 'Add User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}