// src/components/chat/ChatWindow.tsx
import React from "react";
import { Message } from "./Message";
import { MessageInput } from "./MessageInput";
import { ChatHeader } from "./ChatHeader";
import "./ChatWindow.css";

interface ChatWindowProps {
  conversationName: string;
  messages: Array<{ id: string; sender: string; text: string }>;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversationName,
  messages,
}) => {
  return (
    <div className="chat-window-container">
      <ChatHeader contactName={conversationName} />

      <div className="messages-list">
        {messages.map((msg) => (
          <Message key={msg.id} sender={msg.sender} text={msg.text} />
        ))}
      </div>

      <div className="message-input-area">
        <MessageInput />
      </div>
    </div>
  );
};
