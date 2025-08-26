// No 'React' import needed
import { Message as MessageComponent } from "./Message";
import { MessageInput } from "./MessageInput";
import { Message } from "../../types";
import "./ChatWindow.css";

interface ChatWindowProps {
  myUserId: string | null;
  conversationName: string;
  messages: Message[];
  onSendMessage: (text: string) => void;
}

export function ChatWindow({
  myUserId,
  conversationName,
  messages,
  onSendMessage,
}: ChatWindowProps) {
  return (
    <div className="chat-window-container">
      <header className="chat-header">
        <h2>{conversationName}</h2>
      </header>
      <div className="message-list">
        {messages.map((msg) => (
          <MessageComponent
            key={msg.id}
            text={msg.text}
            isSentByMe={msg.senderId === myUserId}
          />
        ))}
      </div>
      <MessageInput onSendMessage={onSendMessage} />
    </div>
  );
}
