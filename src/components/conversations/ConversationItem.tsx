// src/components/conversations/ConversationItem.tsx
import React from "react";
import "./ConversationItem.css"; // Import your custom CSS

interface ConversationItemProps {
  name: string;
  isActive: boolean;
  onClick: () => void;
}

export const ConversationItem: React.FC<ConversationItemProps> = ({
  name,
  isActive,
  onClick,
}) => {
  // Combine the base class with the active class if the item is active
  const itemClassName = `conversation-item ${isActive ? "active" : ""}`;

  return (
    <div className={itemClassName} onClick={onClick}>
      <div className="avatar-placeholder"></div>
      <div className="conversation-name">{name}</div>
    </div>
  );
};
