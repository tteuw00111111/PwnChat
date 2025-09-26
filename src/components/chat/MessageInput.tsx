// src/components/chat/MessageInput.tsx
import React, { useState } from "react";
import { Plus } from "lucide-react";
import { HiOutlinePaperAirplane } from "react-icons/hi2";
import "./MessageInput.css";

interface MessageInputProps {
  onSendMessage: (text: string) => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
}) => {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage(text);
    setText("");
  };

  return (
    <form className="message-input-form" onSubmit={handleSubmit}>
      <div className="message-input-container">
        <button
          type="button"
          className="attach-button"
          aria-label="Attach file"
        >
          <Plus size={24} />
        </button>
        <input
          type="text"
          className="message-input-field"
          placeholder="Write a message"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="send-button" aria-label="Send message">
          <HiOutlinePaperAirplane size={18} className="send-icon" />
        </button>
      </div>
    </form>
  );
};
