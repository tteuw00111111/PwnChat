// src/pages/ChatPage.tsx
import React, { useState } from "react";
import { ConversationList } from "../components/conversations/ConversationList";
import { ChatWindow } from "../components/chat/ChatWindow";

const ChatPage = () => {
  const [activeConversationId, setActiveConversationId] = useState("2");

  const conversations = [
    { id: "1", name: "John Daba" },
    { id: "2", name: "John Doe" },
    { id: "3", name: "John Dube" },
  ];

  const messages = [
    { id: "a", sender: "John Doe", text: "Hi there!" },
    { id: "b", sender: "You", text: "It works now!" },
  ];

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  return (
    // What: The main screen container.
    // How: The `flex` class is crucial. It puts its children in a row.
    <div className="flex h-screen bg-neutral-950 text-white">
      {/* Child 1: The Conversation List. It has a fixed width from its own CSS. */}
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        onConversationClick={(id) => setActiveConversationId(id)}
      />

      {/* Child 2: The container for the Chat Window. */}
      {/* How: The `flex-1` class is the key. It tells this div to take up all remaining horizontal space. */}
      {/* `flex` and `flex-col` make its own children stack vertically. */}
      <div className="flex-1 flex flex-col">
        {activeConversation && (
          <ChatWindow
            conversationName={activeConversation.name}
            messages={messages}
          />
        )}
      </div>
    </div>
  );
};

export default ChatPage;
