// src/components/chat/ChatHeader.tsx
import React, { useState, useEffect } from "react";
import "./ChatHeader.css";

interface ChatHeaderProps {
  contactName: string;
  contactProfilePic?: string;
  contactUserId?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ contactName, contactProfilePic, contactUserId }) => {
  const [searchValue, setSearchValue] = useState("");
  const [currentProfilePic, setCurrentProfilePic] = useState(contactProfilePic);

  useEffect(() => {
    setCurrentProfilePic(contactProfilePic);
  }, [contactProfilePic]);

  // Listen for profile picture updates
  useEffect(() => {
    const handleProfilePictureUpdate = (event: CustomEvent) => {
      const { userId, profilePicUrl } = event.detail;
      if (contactUserId && contactUserId === userId) {
        setCurrentProfilePic(profilePicUrl);
      }
    };

    window.addEventListener('profilePictureUpdated', handleProfilePictureUpdate as EventListener);

    return () => {
      window.removeEventListener('profilePictureUpdated', handleProfilePictureUpdate as EventListener);
    };
  }, [contactUserId]);

  // Generate a color based on the contact name
  const generateAvatarColor = (name: string) => {
    const colors = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    ];
    const colorIndex = name.charCodeAt(0) % colors.length;
    return colors[colorIndex];
  };

  return (
    <div className="chat-header">
      <div className="contact-info">
        <div
          className="avatar"
          style={{
            background: currentProfilePic ? 'transparent' : generateAvatarColor(contactName),
            backgroundImage: currentProfilePic ? `url(${currentProfilePic})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {!currentProfilePic && contactName.charAt(0).toUpperCase()}
        </div>
        <h1 className="contact-name">{contactName}</h1>
      </div>

      <div className="header-controls">
        {/* The search bar is now built directly here */}
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>

        <button className="options-menu" aria-label="Options">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </button>
      </div>
    </div>
  );
};
