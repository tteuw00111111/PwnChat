import { useEffect } from 'react';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  ttlMs?: number;
};

interface ToastProps {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ items, onDismiss }: ToastProps) {
  useEffect(() => {
    const timers = items.map((t) =>
      setTimeout(() => onDismiss(t.id), t.ttlMs ?? 4500)
    );
    return () => { timers.forEach(clearTimeout); };
  }, [items, onDismiss]);

  if (!items.length) return null;

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, display: 'grid', gap: 8,
      zIndex: 9999
    }}>
      {items.map((t) => (
        <div key={t.id} style={{
          minWidth: 260, maxWidth: 420,
          padding: '10px 12px', borderRadius: 8,
          background: t.kind === 'error' ? '#3b0f0f' : t.kind === 'warn' ? '#3b2f0f' : t.kind === 'success' ? '#0f3b1b' : '#222',
          color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.35)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{t.message}</div>
            <button onClick={() => onDismiss(t.id)} style={{ color: '#bbb' }}>×</button>
          </div>
          {(t.actionLabel && t.onAction) && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <button onClick={t.onAction} style={{ padding: '4px 8px' }}>{t.actionLabel}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

