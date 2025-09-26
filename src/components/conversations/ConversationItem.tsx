// src/components/conversations/ConversationItem.tsx
import React from "react";
import "./ConversationItem.css"; // Import your custom CSS

interface ConversationItemProps {
  name: string;
  isActive: boolean;
  onClick: () => void;
  profilePicUrl?: string;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  name,
  isActive,
  onClick,
  profilePicUrl,
}) => {
  // Combine the base class with the active class if the item is active
  const itemClassName = `conversation-item ${isActive ? "active" : ""}`;

  const generateAvatarColor = (name: string) => {
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

  return (
    <div className={itemClassName} onClick={onClick}>
      <div
        className="avatar-placeholder"
        style={{
          backgroundImage: profilePicUrl ? `url(${profilePicUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: profilePicUrl ? 'transparent' : generateAvatarColor(name),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: '600',
          fontSize: '14px'
        }}
      >
        {!profilePicUrl && name.charAt(0).toUpperCase()}
      </div>
      <div className="conversation-name">{name}</div>
    </div>
  );
};
