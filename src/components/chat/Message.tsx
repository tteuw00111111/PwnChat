// src/components/chat/Message.tsx
import React from "react";
import "./Message.css"; // We'll create this CSS file

interface MessageProps {
  sender: string;
  text: string;
}

export const Message: React.FC<MessageProps> = ({ sender, text }) => {
  // This logic changes the style if the message is from "You"
  const isMe = sender === "You";

  return (
    <div className={`message-row ${isMe ? "sent" : "received"}`}>
      <div className="message-bubble">{text}</div>
    </div>
  );
};
