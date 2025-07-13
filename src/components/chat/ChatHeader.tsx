// src/components/chat/ChatHeader.tsx
import React, { useState } from "react";
import "./ChatHeader.css"; // Import your custom CSS

interface ChatHeaderProps {
  contactName: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ contactName }) => {
  const [searchValue, setSearchValue] = useState("");

  return (
    <div className="chat-header">
      <div className="contact-info">
        <div className="avatar"></div>
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
