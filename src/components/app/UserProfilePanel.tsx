import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { ACCESS_TOKEN_KEY, userAPI } from '../../utils/api';
import { getSocket } from '../../lib/socket';
import { IoClose, IoPerson, IoCamera, IoCheckmark, IoPencil } from 'react-icons/io5';
import { PhotoEditor } from './PhotoEditor';

interface UserProfilePanelProps {
  onClose: () => void;
}

interface UserInfo {
  userId: string;
  username: string;
}

export function UserProfilePanel({ onClose }: UserProfilePanelProps) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [tempImageUrl, setTempImageUrl] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const token = localStorage.getItem(ACCESS_TOKEN_KEY);
        if (token) {
          const decoded: any = jwtDecode(token);
          const info = {
            userId: decoded.userId,
            username: decoded.sub || decoded.username || 'Unknown'
          };
          setUserInfo(info);

          // Fetch current profile from API
          try {
            const profile = await userAPI.getProfile();
            setDisplayName(profile.name);
            setProfilePicUrl(profile.profilePicUrl);
          } catch (apiError) {
            console.warn('Failed to fetch profile from API, using defaults:', apiError);
            setDisplayName(info.username);
          }
        }
      } catch (error) {
        console.error('Failed to decode user token');
      }
    };

    loadUserProfile();
  }, []);

  const handleSaveDisplayName = async () => {
    if (userInfo && displayName.trim()) {
      try {
        await userAPI.updateProfile({ displayName: displayName.trim() });
        setIsEditingName(false);

        // Also save to localStorage for backwards compatibility
        localStorage.setItem(`displayName_${userInfo.userId}`, displayName.trim());

        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('displayNameUpdated', {
          detail: { userId: userInfo.userId, displayName: displayName.trim() }
        }));
      } catch (error) {
        console.error('Failed to update display name:', error);
        // Could add error toast here
      }
    }
  };

  const handleProfilePicChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setTempImageUrl(result);
        setShowPhotoEditor(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoEditorSave = async (editedImageUrl: string) => {
    if (userInfo) {
      try {
        // Update local state first to show immediate update
        setProfilePicUrl(editedImageUrl);

        await userAPI.updateProfile({ profilePicture: editedImageUrl });

        // Also save to localStorage for backwards compatibility
        localStorage.setItem(`profilePic_${userInfo.userId}`, editedImageUrl);

        // Emit socket event for real-time updates to other users
        try {
          const socket = getSocket();
          socket.emit('profile:picture:update', {
            userId: userInfo.userId,
            profilePicUrl: editedImageUrl
          });
        } catch (socketError) {
          console.warn('Failed to emit profile picture update via socket:', socketError);
        }

        // Dispatch custom event to notify other components
        window.dispatchEvent(new CustomEvent('profilePictureUpdated', {
          detail: { userId: userInfo.userId, profilePicUrl: editedImageUrl }
        }));
      } catch (error) {
        console.error('Failed to update profile picture:', error);
        // Revert local state if API call failed
        setProfilePicUrl(profilePicUrl);
        // Could add error toast here
      }
    }
    setShowPhotoEditor(false);
    setTempImageUrl(null);
    setPreviewImageUrl(null);
  };

  const handlePhotoEditorCancel = () => {
    setShowPhotoEditor(false);
    setTempImageUrl(null);
    setPreviewImageUrl(null);
  };

  const handlePhotoEditorPreview = (previewImageUrl: string) => {
    setPreviewImageUrl(previewImageUrl);
  };

  const generateAvatar = (name: string) => {
    const colors = [
      '#6B7280', // gray-500
      '#4B5563', // gray-600
      '#374151', // gray-700
      '#1F2937', // gray-800
      '#111827', // gray-900
      '#0F172A', // slate-900
    ];
    const colorIndex = name.charCodeAt(0) % colors.length;
    return colors[colorIndex];
  };

  if (!userInfo) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        width: '420px',
        maxWidth: '95vw',
        background: '#1F1F1F',
        border: '1px solid #2A2A2A',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
        color: '#fff'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IoPerson size={24} style={{ color: '#9CA3AF' }} />
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Profile Settings</h3>
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

        {/* Profile Picture Section */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '32px'
        }}>
          <div style={{
            position: 'relative',
            marginBottom: '16px'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: (previewImageUrl || profilePicUrl) ? `url(${previewImageUrl || profilePicUrl})` : generateAvatar(displayName),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: '3px solid #2A2A2A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '36px',
              fontWeight: '600',
              color: '#fff',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {!(previewImageUrl || profilePicUrl) && displayName.charAt(0).toUpperCase()}

              {/* Camera overlay */}
              <label style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                width: '32px',
                height: '32px',
                background: 'rgba(0, 0, 0, 0.7)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}>
                <IoCamera size={16} color="#fff" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePicChange}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <div style={{
            fontSize: '14px',
            opacity: 0.7,
            textAlign: 'center',
            lineHeight: 1.4
          }}>
            Click the camera icon to upload a profile picture
          </div>
        </div>

        {/* Display Name Section */}
        <div style={{
          background: '#2A2A2A',
          border: '1px solid #3A3A3A',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <label style={{
              fontSize: '14px',
              fontWeight: '500',
              color: 'rgba(255, 255, 255, 0.8)'
            }}>
              Display Name
            </label>
            <button
              onClick={() => isEditingName ? handleSaveDisplayName() : setIsEditingName(true)}
              style={{
                background: '#3A3A3A',
                border: '1px solid #4A4A4A',
                borderRadius: '8px',
                padding: '6px 8px',
                color: '#E5E7EB',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#4A4A4A';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#3A3A3A';
                e.currentTarget.style.color = '#E5E7EB';
              }}
            >
              {isEditingName ? <IoCheckmark size={14} /> : <IoPencil size={14} />}
              {isEditingName ? 'Save' : 'Edit'}
            </button>
          </div>

          {isEditingName ? (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveDisplayName();
                if (e.key === 'Escape') {
                  setIsEditingName(false);
                  setDisplayName(userInfo.username);
                }
              }}
              style={{
                width: '100%',
                background: '#1A1A1A',
                border: '1px solid #3A3A3A',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#fff',
                fontSize: '16px',
                outline: 'none'
              }}
              autoFocus
            />
          ) : (
            <div style={{
              fontSize: '16px',
              fontWeight: '500',
              color: '#fff',
              padding: '10px 12px',
              background: '#1A1A1A',
              borderRadius: '8px',
              border: '1px solid #3A3A3A'
            }}>
              {displayName}
            </div>
          )}
        </div>

        {/* User Info */}
        <div style={{
          background: '#2A2A2A',
          border: '1px solid #3A3A3A',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            color: 'rgba(255, 255, 255, 0.8)',
            marginBottom: '8px'
          }}>
            Username
          </div>
          <div style={{
            fontSize: '16px',
            color: '#fff',
            fontFamily: 'monospace',
            background: '#1A1A1A',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #3A3A3A'
          }}>
            {userInfo.username}
          </div>
        </div>
      </div>

      {/* Photo Editor */}
      {showPhotoEditor && tempImageUrl && (
        <PhotoEditor
          imageUrl={tempImageUrl}
          onSave={handlePhotoEditorSave}
          onCancel={handlePhotoEditorCancel}
          onPreview={handlePhotoEditorPreview}
        />
      )}
    </div>
  );
}