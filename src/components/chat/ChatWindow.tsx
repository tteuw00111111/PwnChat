// No 'React' import needed
import { useEffect, useRef } from "react";
import { Message as MessageComponent } from "./Message";
import { MessageInput } from "./MessageInput";
import { ChatHeader } from "./ChatHeader";
import { Message } from "../../types";
import "./ChatWindow.css";

interface ChatWindowProps {
  myUserId: string | null;
  conversationName: string;
  messages: Message[];
  onSendMessage: (text: string) => void;
  onLoadMoreMessages: () => void; // New prop for loading more messages
  hasMoreMessages?: boolean; // New prop to control visibility of load more button
  contactProfilePic?: string; // Profile picture for the contact
  contactUserId?: string; // Contact user ID for profile picture updates
}

export function ChatWindow({
  myUserId,
  conversationName,
  messages,
  onSendMessage,
  onLoadMoreMessages,
  hasMoreMessages = true,
  contactProfilePic,
  contactUserId,
}: ChatWindowProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevMessagesLength = useRef(messages.length);

  console.log("ChatWindow received messages:", messages);

  // Function to format date separators
  const formatDateSeparator = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    } else {
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      };
      return date.toLocaleDateString(undefined, options);
    }
  };

  // Auto-scroll to bottom on new messages, or maintain scroll position when loading more
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    // If new messages were added to the end (sent by user)
    if (messages.length > prevMessagesLength.current && messages[messages.length - 1]?.senderId === myUserId) {
      el.scrollTop = el.scrollHeight;
    } else if (messages.length > prevMessagesLength.current) {
      // If new messages were prepended (loaded more), maintain scroll position
      // Calculate the scroll position based on the height of the new messages
      // For now, we'll just scroll to the bottom to show new messages
      el.scrollTop = el.scrollHeight; // Scroll to bottom to show newly loaded messages
    }

    prevMessagesLength.current = messages.length;
  }, [messages, myUserId]);

  return (
    <div className="chat-window-container">
      <ChatHeader contactName={conversationName} contactProfilePic={contactProfilePic} contactUserId={contactUserId} />
      <div className="messages-list" ref={listRef}>
        {messages.length === 0 ? (
          <div style={{
            height: "100%",
            display: "grid",
            placeContent: "center",
            color: "rgba(255,255,255,0.35)",
            fontSize: "14px",
          }}>
            Start the conversation…
          </div>
        ) : (
          <>
            {hasMoreMessages && (
              <button className="load-more" onClick={onLoadMoreMessages}>Load More</button>
            )}
            {messages.map((msg, index) => {
              const currentDate = new Date(msg.created_at).toDateString();
              const previousDate = index > 0 ? new Date(messages[index - 1].created_at).toDateString() : null;
              const shouldShowDateSeparator = currentDate !== previousDate;
              const isSentByMe = msg.senderId === myUserId;

              // Debug logging
              if (index === 0) {
                console.log("Message debugging:", {
                  msgSenderId: msg.senderId,
                  myUserId: myUserId,
                  isSentByMe: isSentByMe,
                  senderType: typeof msg.senderId,
                  myUserIdType: typeof myUserId
                });
              }

              return (
                <div key={msg.id}>
                  {shouldShowDateSeparator && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '20px 0 10px 0',
                      position: 'relative'
                    }}>
                      <div style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255, 255, 255, 0.6)',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        textAlign: 'center',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}>
                        {formatDateSeparator(currentDate)}
                      </div>
                    </div>
                  )}
                  <MessageComponent
                    text={msg.text}
                    isSentByMe={isSentByMe}
                    timestamp={msg.created_at}
                  />
                </div>
              );
            })}
          </>
        )}
      </div>
      <MessageInput onSendMessage={onSendMessage} />
    </div>
  );
}
