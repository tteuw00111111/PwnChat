import React, { useState } from "react";
import { ConversationItem } from "./ConversationItem";
import "./ConversationList.css";

interface Conversation {
  id: string;
  name: string;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null; // Allow it to be null
  onlineUsers: Set<string>;
  onConversationClick: (id: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onConversationClick,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false); // State for the menu

  const filteredConversations = conversations.filter((conversation) =>
    conversation.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="conversation-list">
      <div className="list-header">
        <button
          className={`menu-button ${isMenuOpen ? "active" : ""}`}
          aria-label="Toggle menu"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <div className="menu-bar"></div>
          <div className="menu-bar"></div>
          <div className="menu-bar"></div>
        </button>

        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="items-container">
        {filteredConversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            name={conversation.name}
            isActive={conversation.id === activeConversationId}
            onClick={() => onConversationClick(conversation.id)}
          />
        ))}
      </div>
    </div>
  );
};
