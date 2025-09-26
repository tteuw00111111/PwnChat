import { useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { ACCESS_TOKEN_KEY } from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { localMessageService } from '../../lib/localMessageService';
import {
  IoPerson,
  IoPeople,
  IoBookmark,
  IoSettings,
  IoMoon,
  IoLogOut,
  IoClose,
  IoCall,
  IoPersonAdd
} from 'react-icons/io5';
import { UserProfilePanel } from './UserProfilePanel';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsClick: () => void;
}

interface UserInfo {
  userId: string;
  username: string;
  displayName?: string;
}

export function HamburgerMenu({ isOpen, onClose, onSettingsClick }: HamburgerMenuProps) {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    // Get user info from JWT token
    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (token) {
        const decoded: any = jwtDecode(token);
        const info = {
          userId: decoded.userId,
          username: decoded.sub || decoded.username || 'Unknown'
        };
        setUserInfo(info);

        // Load saved display name and profile picture
        const savedDisplayName = localStorage.getItem(`displayName_${info.userId}`);
        const savedProfilePic = localStorage.getItem(`profilePic_${info.userId}`);

        if (savedDisplayName) info.displayName = savedDisplayName;
        if (savedProfilePic) setProfilePicUrl(savedProfilePic);
      }
    } catch (error) {
      console.error('Failed to decode user token:', error);
    }
  }, []);

  // Listen for profile picture and display name updates
  useEffect(() => {
    const handleProfilePictureUpdate = (event: CustomEvent) => {
      const { userId, profilePicUrl } = event.detail;
      if (userInfo && userInfo.userId === userId) {
        setProfilePicUrl(profilePicUrl);
      }
    };

    const handleDisplayNameUpdate = (event: CustomEvent) => {
      const { userId, displayName } = event.detail;
      if (userInfo && userInfo.userId === userId) {
        setUserInfo(prev => prev ? { ...prev, displayName } : null);
      }
    };

    window.addEventListener('profilePictureUpdated', handleProfilePictureUpdate as EventListener);
    window.addEventListener('displayNameUpdated', handleDisplayNameUpdate as EventListener);

    return () => {
      window.removeEventListener('profilePictureUpdated', handleProfilePictureUpdate as EventListener);
      window.removeEventListener('displayNameUpdated', handleDisplayNameUpdate as EventListener);
    };
  }, [userInfo]);

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

  const handleLogout = async () => {
    try {
      await window.electronAPI.lockDB();
      localMessageService.reset(); // Reset local message service on logout
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const menuItems = [
    { icon: IoPeople, label: 'New Group', action: () => {} },
    { icon: IoPersonAdd, label: 'Contacts', action: () => {} },
    { icon: IoCall, label: 'Calls', action: () => {} },
    { icon: IoBookmark, label: 'Saved Messages', action: () => {} },
    { icon: IoSettings, label: 'Settings', action: onSettingsClick },
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
        }}
        onClick={onClose}
      />

      {/* Menu */}
      <div style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: '320px',
        background: '#1F1F1F',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s ease',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {/* Header with user info */}
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid #2A2A2A',
          position: 'relative',
        }}>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '12px',
              transition: 'background 0.2s ease',
            }}
            onClick={() => setShowProfile(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2A2A2A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: profilePicUrl ? `url(${profilePicUrl})` : generateAvatar(userInfo?.displayName || userInfo?.username || ''),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '24px',
              fontWeight: '600',
              marginRight: '16px',
              border: '2px solid #2A2A2A',
            }}>
              {!profilePicUrl && (userInfo?.displayName || userInfo?.username || '')?.charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{
                color: '#FFFFFF',
                fontSize: '18px',
                fontWeight: '600',
                marginBottom: '4px',
              }}>
                {userInfo?.displayName || userInfo?.username || 'Loading...'}
              </div>
              <div style={{
                color: '#9CA3AF',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10B981',
                }} />
                Online
              </div>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div style={{ flex: 1, padding: '8px 0' }}>
          {menuItems.map((item, index) => (
            <button
              key={index}
              onClick={item.action}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 20px',
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                transition: 'background 0.2s ease',
                fontSize: '16px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2A2A2A';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
              }}
            >
              <item.icon size={24} style={{ color: '#9CA3AF' }} />
              {item.label}
            </button>
          ))}

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              fontSize: '16px',
              marginBottom: '8px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2A2A2A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <IoMoon size={24} style={{ color: '#9CA3AF' }} />
              Night Mode
            </div>
            <div style={{
              width: '44px',
              height: '24px',
              borderRadius: '12px',
              background: darkMode ? '#3a3a3a' : '#4B5563',
              position: 'relative',
              transition: 'background 0.2s ease',
              marginRight: '40px',
            }}>
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'white',
                position: 'absolute',
                top: '2px',
                left: darkMode ? '22px' : '2px',
                transition: 'left 0.2s ease',
              }} />
            </div>
          </button>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #2A2A2A',
        }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px 0',
              background: 'none',
              border: 'none',
              color: '#EF4444',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
              fontSize: '16px',
              borderRadius: '8px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2A2A2A';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
            }}
          >
            <IoLogOut size={24} />
            Log Out
          </button>

          <div style={{
            color: '#6B7280',
            fontSize: '12px',
            textAlign: 'center',
            marginTop: '16px',
          }}>
            PwnChat Desktop<br />
            Version 1.0.0
          </div>
        </div>
      </div>

      {/* Profile Panel */}
      {showProfile && <UserProfilePanel onClose={() => setShowProfile(false)} />}
    </>
  );
}