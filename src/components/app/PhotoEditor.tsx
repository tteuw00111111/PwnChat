import { useState, useRef, useCallback, useEffect } from 'react';
import { IoClose, IoCheckmark, IoMove, IoCrop, IoResize } from 'react-icons/io5';

interface PhotoEditorProps {
  imageUrl: string;
  onSave: (editedImageUrl: string) => void;
  onCancel: () => void;
  onPreview?: (previewImageUrl: string) => void;
}

export function PhotoEditor({ imageUrl, onSave, onCancel, onPreview }: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [editMode, setEditMode] = useState<'move' | 'crop' | 'resize'>('move');
  const [previewTimeoutId, setPreviewTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const drawImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Set canvas size
      canvas.width = 300;
      canvas.height = 300;

      // Draw image with transformations
      ctx.save();
      ctx.translate(position.x + canvas.width / 2, position.y + canvas.height / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.restore();

      // Draw crop overlay if in crop mode
      if (editMode === 'crop') {
        // Darken areas outside crop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Clear crop area
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillRect(crop.x, crop.y, crop.width, crop.height);
        ctx.globalCompositeOperation = 'source-over';

        // Draw crop border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(crop.x, crop.y, crop.width, crop.height);

        // Draw corner handles
        const handleSize = 8;
        const corners = [
          { x: crop.x - handleSize / 2, y: crop.y - handleSize / 2 },
          { x: crop.x + crop.width - handleSize / 2, y: crop.y - handleSize / 2 },
          { x: crop.x - handleSize / 2, y: crop.y + crop.height - handleSize / 2 },
          { x: crop.x + crop.width - handleSize / 2, y: crop.y + crop.height - handleSize / 2 },
        ];

        ctx.fillStyle = '#fff';
        corners.forEach(corner => {
          ctx.fillRect(corner.x, corner.y, handleSize, handleSize);
        });
      }
    };
    img.src = imageUrl;
  }, [imageUrl, position, scale, crop, editMode]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDragging(true);
    setDragStart({ x: x - position.x, y: y - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (editMode === 'move') {
      setPosition({
        x: x - dragStart.x,
        y: y - dragStart.y,
      });
    } else if (editMode === 'crop') {
      setCrop(prev => ({
        ...prev,
        x: Math.max(0, Math.min(x - dragStart.x, canvas.width - prev.width)),
        y: Math.max(0, Math.min(y - dragStart.y, canvas.height - prev.height)),
      }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const generatePreview = useCallback(() => {
    if (!onPreview) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
      // Create a small preview canvas for the final cropped image
      const previewCanvas = document.createElement('canvas');
      const previewCtx = previewCanvas.getContext('2d');
      if (!previewCtx) return;

      previewCanvas.width = crop.width;
      previewCanvas.height = crop.height;

      // Draw the cropped and scaled image
      previewCtx.save();
      previewCtx.translate(crop.width / 2 - crop.x, crop.height / 2 - crop.y);
      previewCtx.translate(position.x, position.y);
      previewCtx.scale(scale, scale);
      previewCtx.drawImage(img, -img.width / 2, -img.height / 2);
      previewCtx.restore();

      const previewImageUrl = previewCanvas.toDataURL('image/png');
      onPreview(previewImageUrl);
    };
    img.src = imageUrl;
  }, [imageUrl, position, scale, crop, onPreview]);

  const debouncedPreview = useCallback(() => {
    if (previewTimeoutId) {
      clearTimeout(previewTimeoutId);
    }
    const newTimeoutId = setTimeout(() => {
      generatePreview();
    }, 200); // 200ms debounce
    setPreviewTimeoutId(newTimeoutId);
  }, [generatePreview, previewTimeoutId]);

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create a new canvas for the final image
    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d');
    if (!finalCtx) return;

    finalCanvas.width = crop.width;
    finalCanvas.height = crop.height;

    const img = new Image();
    img.onload = () => {
      // Draw the cropped and scaled image
      finalCtx.save();
      finalCtx.translate(crop.width / 2 - crop.x, crop.height / 2 - crop.y);
      finalCtx.translate(position.x, position.y);
      finalCtx.scale(scale, scale);
      finalCtx.drawImage(img, -img.width / 2, -img.height / 2);
      finalCtx.restore();

      const editedImageUrl = finalCanvas.toDataURL('image/png');
      onSave(editedImageUrl);
    };
    img.src = imageUrl;
  };

  // Redraw when dependencies change
  useEffect(() => {
    drawImage();
  }, [drawImage]);

  // Generate preview when editing parameters change
  useEffect(() => {
    debouncedPreview();
  }, [position, scale, crop, debouncedPreview]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (previewTimeoutId) {
        clearTimeout(previewTimeoutId);
      }
    };
  }, [previewTimeoutId]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        width: '400px',
        maxWidth: '95vw',
        background: '#1F1F1F',
        border: '1px solid #2A2A2A',
        borderRadius: '16px',
        padding: '24px',
        color: '#fff'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            Edit Photo
          </h3>
          <button
            onClick={onCancel}
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

        {/* Canvas */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '24px',
          border: '1px solid #2A2A2A',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            style={{
              cursor: editMode === 'move' ? 'move' : editMode === 'crop' ? 'crosshair' : 'nw-resize',
              display: 'block'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </div>

        {/* Tools */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          justifyContent: 'center'
        }}>
          <button
            onClick={() => setEditMode('move')}
            style={{
              background: editMode === 'move' ? '#3A3A3A' : '#2A2A2A',
              border: '1px solid #3A3A3A',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              transition: 'all 0.2s ease'
            }}
          >
            <IoMove size={16} />
            Move
          </button>
          <button
            onClick={() => setEditMode('crop')}
            style={{
              background: editMode === 'crop' ? '#3A3A3A' : '#2A2A2A',
              border: '1px solid #3A3A3A',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              transition: 'all 0.2s ease'
            }}
          >
            <IoCrop size={16} />
            Crop
          </button>
          <button
            onClick={() => setEditMode('resize')}
            style={{
              background: editMode === 'resize' ? '#3A3A3A' : '#2A2A2A',
              border: '1px solid #3A3A3A',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              transition: 'all 0.2s ease'
            }}
          >
            <IoResize size={16} />
            Scale
          </button>
        </div>

        {/* Reset Button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <button
            onClick={() => {
              setPosition({ x: 0, y: 0 });
              setScale(1);
              setCrop({ x: 50, y: 50, width: 200, height: 200 });
            }}
            style={{
              background: '#3A3A3A',
              border: '1px solid #4A4A4A',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#9CA3AF',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s ease'
            }}
          >
            Reset Position & Size
          </button>
        </div>

        {/* Crop Presets */}
        {editMode === 'crop' && (
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            background: '#2A2A2A',
            borderRadius: '8px',
            border: '1px solid #3A3A3A'
          }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '12px',
              color: '#9CA3AF'
            }}>
              Quick Crop Sizes
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { name: 'Square', size: 200 },
                { name: 'Large', size: 250 },
                { name: 'Small', size: 150 }
              ].map(preset => (
                <button
                  key={preset.name}
                  onClick={() => setCrop(prev => ({
                    ...prev,
                    width: preset.size,
                    height: preset.size
                  }))}
                  style={{
                    background: '#3A3A3A',
                    border: '1px solid #4A4A4A',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scale Control */}
        {editMode === 'resize' && (
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            background: '#2A2A2A',
            borderRadius: '8px',
            border: '1px solid #3A3A3A'
          }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              marginBottom: '12px',
              color: '#9CA3AF'
            }}>
              Scale: {Math.round(scale * 100)}%
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map(scaleValue => (
                <button
                  key={scaleValue}
                  onClick={() => setScale(scaleValue)}
                  style={{
                    background: scale === scaleValue ? '#4A4A4A' : '#3A3A3A',
                    border: '1px solid #4A4A4A',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '11px',
                    minWidth: '35px'
                  }}
                >
                  {Math.round(scaleValue * 100)}%
                </button>
              ))}
            </div>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              style={{
                width: '100%',
                background: '#3A3A3A',
                borderRadius: '4px',
                height: '6px',
                outline: 'none'
              }}
            />
          </div>
        )}

        {/* Crop Controls */}
        {editMode === 'crop' && (
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            background: '#2A2A2A',
            borderRadius: '8px',
            border: '1px solid #3A3A3A'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              fontSize: '14px'
            }}>
              <div>
                <label style={{ color: '#9CA3AF', marginBottom: '4px', display: 'block' }}>
                  Width
                </label>
                <input
                  type="number"
                  value={crop.width}
                  onChange={(e) => setCrop(prev => ({ ...prev, width: parseInt(e.target.value) || 0 }))}
                  style={{
                    width: '100%',
                    background: '#1A1A1A',
                    border: '1px solid #3A3A3A',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ color: '#9CA3AF', marginBottom: '4px', display: 'block' }}>
                  Height
                </label>
                <input
                  type="number"
                  value={crop.height}
                  onChange={(e) => setCrop(prev => ({ ...prev, height: parseInt(e.target.value) || 0 }))}
                  style={{
                    width: '100%',
                    background: '#1A1A1A',
                    border: '1px solid #3A3A3A',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onCancel}
            style={{
              background: '#2A2A2A',
              border: '1px solid #3A3A3A',
              borderRadius: '8px',
              padding: '10px 16px',
              color: '#9CA3AF',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s ease'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              padding: '10px 16px',
              color: '#000',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            <IoCheckmark size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}