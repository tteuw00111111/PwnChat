import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ConversationList } from "../components/conversations/ConversationList";
import { ChatWindow } from "../components/chat/ChatWindow";
import { socket } from "../lib/socket";
import { authAPI } from "../utils/api"; // Assuming your api calls are in here

// Define a type for our message objects
interface Message {
  id: string;
  senderId: string; // The UUID of the sender
  text: string;
}

// Define a type for our conversation objects
interface Conversation {
  id: string; // The other user's UUID
  name: string;
}

export function ChatPage() {
  const navigate = useNavigate();

  // --- State Management ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [myUserId, setMyUserId] = useState<string | null>(null); // To store our own user ID

  useEffect(() => {
    // This effect runs once when the component mounts to set everything up.

    // 1. --- Authentication & User Info ---
    const token = localStorage.getItem("jwt_token");
    if (!token) {
      navigate("/login"); // If no token, the user is not authenticated
      return;
    }
    // Decode the JWT to get our own user ID.
    // NOTE: In a real app, a dedicated library like 'jwt-decode' is better.
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setMyUserId(payload.userId);
    } catch (e) {
      console.error("Failed to decode token:", e);
      navigate("/login");
      return;
    }

    // 2. --- Initial Data Fetching ---
    const fetchUsers = async () => {
      try {
        const users = await authAPI.getUsers();
        setConversations(users);
        // Automatically select the first user in the list to chat with.
        if (users.length > 0) {
          setActiveConversationId(users[0].id);
        }
      } catch (error) {
        console.error("Failed to fetch users:", error);
      }
    };
    fetchUsers();

    // 3. --- Socket.IO Connection ---
    if (!socket.connected) {
      socket.auth = { token };
      socket.connect();
    }

    // 4. --- Real-Time Event Listeners ---
    const onPrivateMessage = (message: { text: string; from: string }) => {
      // Add the incoming message to the state
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        text: message.text,
        senderId: message.from,
      };
      setMessages((prevMessages) => [...prevMessages, newMessage]);
    };

    const onOnlineUsers = (users: string[]) => {
      setOnlineUsers(new Set(users));
    };

    socket.on("privateMessage", onPrivateMessage);
    socket.on("onlineUsers", onOnlineUsers);

    // 5. --- Cleanup Function ---
    // This runs when the component unmounts (e.g., user logs out).
    return () => {
      socket.off("privateMessage", onPrivateMessage);
      socket.off("onlineUsers", onOnlineUsers);
      socket.disconnect();
    };
  }, [navigate]);

  const handleSendMessage = (text: string) => {
    if (!activeConversationId || !myUserId) return;

    // Add the message to our own UI instantly for a snappy feel.
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      senderId: myUserId,
      text: text,
    };
    setMessages((prevMessages) => [...prevMessages, newMessage]);

    // Emit the message to the server for the specific recipient.
    socket.emit("privateMessage", { text, recipientId: activeConversationId });
  };

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId
  );

  return (
    <div className="flex h-screen bg-neutral-950 text-white">
      <ConversationList
        conversations={conversations}
        activeConversationId={activeConversationId}
        onlineUsers={onlineUsers}
        onConversationClick={(id) => setActiveConversationId(id)}
      />

      <div className="flex-1 flex flex-col">
        {activeConversation ? (
          <ChatWindow
            myUserId={myUserId}
            conversationName={activeConversation.name}
            messages={messages}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500">
            Select a conversation to start chatting.
          </div>
        )}
      </div>
    </div>
  );
}
