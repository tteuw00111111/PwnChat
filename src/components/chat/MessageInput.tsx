// src/components/chat/MessageInput.tsx
import React, { useState } from "react";
import { Plus } from "lucide-react";
import "./MessageInput.css"; // Import your custom CSS

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
    onSendMessage(text); // 3. Use the prop
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
      </div>
    </form>
  );
};
