import React from "react";
import { ConversationItem } from "./ConversationItem";
import "./ConversationList.css";
import { Conversation } from "../../types";


interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null; // Allow it to be null
  onConversationClick: (id: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onConversationClick,
}) => {
  return (
    <div className="conversation-list">
      <div className="items-container">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            name={conversation.name}
            isActive={conversation.id === activeConversationId}
            onClick={() => onConversationClick(conversation.id)}
            profilePicUrl={conversation.profilePicUrl}
          />
        ))}
      </div>
    </div>
  );
};
