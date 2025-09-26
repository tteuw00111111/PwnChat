import { useEffect, useState, useMemo, useCallback } from "react";
import { jwtDecode } from "jwt-decode";
import { connectSocket, disconnectSocket, getSocket } from "../lib/socket";
import { userAPI, messageAPI, keyAPI, ACCESS_TOKEN_KEY } from "../utils/api";
import { cryptoService } from "../lib/cryptoService";
import { localMessageService } from "../lib/localMessageService";
import { Message } from "../types";

interface PrivateMessagePayload {
  senderId: string;
  senderUsername: string;
  ciphertext: string;
  id: string;
  created_at: string;
  handshake?: any;
  header?: any;
}

import { MainLayout } from "../components/app/MainLayout";
import { ChatWindow } from "../components/chat/ChatWindow";
import { Sidebar } from "../components/app/Sidebar";
import { ToastContainer, type ToastItem } from "../components/app/Toast";
import "./ChatPage.css";

export type Conversation = {
  id: string;
  name: string;
  username: string;
  profilePicUrl?: string;
};

const getMyId = (): string | null => {
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) return null;
    const decoded: { userId: string } = jwtDecode(token);
    return decoded.userId;
  } catch (e) {
    console.error("Failed to decode token:", e);
    return null;
  }
};

export default function ChatPage() {
  const [isReady, setIsReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [messageOffset, setMessageOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const MESSAGES_PER_PAGE = 20;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const myUserId = useMemo(() => getMyId(), []);

  useEffect(() => {
    const newUserId = myUserId;
    if (currentUserId && newUserId && currentUserId !== newUserId) {
      console.log("User changed, clearing all message state");
      setMessages({});
      setConversations([]);
      setSelectedId(null);
      setMessageOffset(0);
      setHasMoreMessages({});
    }
    setCurrentUserId(newUserId);
  }, [myUserId, currentUserId]);

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await messageAPI.getConversations();
      setConversations(
        data.map((user: any) => ({
          id: String(user.id),
          name: user.display_name || user.username,
          username: user.username,
          profilePicUrl: user.profile_picture,
        }))
      );
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      setErrorMessage("Failed to load conversations. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      try {
        await cryptoService.initIdentity();
        if (!mounted) return;

        await localMessageService.initialize();
        if (!mounted) return;

        await fetchConversations();
        if (!mounted) return;

        const socket = connectSocket();

        const handleConnect = () => console.log("✅ Socket connected:", socket.id);
        const handleDisconnect = () => console.log("🔌 Socket disconnected");

        const handleMessageDelivered = (payload: { id: string; recipientId: string; created_at: string }) => {
          try {
            setMessages((prev) => {
              const list = prev[payload.recipientId] || [];
              const idx = list.findIndex((m) => m.id === payload.id);
              if (idx === -1) return prev;
              const updated = [...list];
              updated[idx] = { ...updated[idx], delivered: true, created_at: payload.created_at };
              return { ...prev, [payload.recipientId]: updated };
            });
          } catch (e) {
            console.error("Failed to handle message delivery notification:", e);
          }
        };

        const handleProfilePictureUpdate = ({ userId, profilePicUrl }: { userId: string, profilePicUrl: string }) => {
          try {
            setConversations((prev) =>
              prev.map(conv =>
                conv.id === userId
                  ? { ...conv, profilePicUrl }
                  : conv
              )
            );
          } catch (e) {
            console.error("Failed to handle profile picture update:", e);
          }
        };

        const handlePrivateMessage = async ({ senderId, senderUsername, ciphertext, id, created_at, handshake, header }: PrivateMessagePayload) => {
          try {
            console.log("incoming", { senderId, senderUsername, ciphertext });

            let ensuredConversation: { id: string; name: string; username: string } | undefined;
            try {
              ensuredConversation = conversations.find((conv) => conv.id === senderId);

              if (!ensuredConversation) {
                const fetchedUser = await userAPI.getById(senderId);
                if (fetchedUser) {
                  const newConv = {
                    id: fetchedUser.id,
                    name: fetchedUser.username,
                    username: fetchedUser.username,
                  };
                  setConversations((prev) => {
                    if (prev.some((c) => c.id === newConv.id)) return prev;
                    return [newConv, ...prev];
                  });
                  ensuredConversation = newConv;
                }
              }
            } catch (error) {
              console.error("Failed to ensure sender in conversations:", error);
            }

            let decryptedMessage: Message | null = null;

            try {
              let plaintext: string;
              if (typeof (window as any).electronCrypto?.ratchetDecrypt === 'function') {
                plaintext = await cryptoService.decryptRatchet({ username: senderUsername, id: senderId }, header, ciphertext);
              } else {
                plaintext = await cryptoService.decrypt(
                  { username: senderUsername, id: senderId },
                  ciphertext
                );
              }
              decryptedMessage = {
                id,
                text: plaintext,
                senderId: senderId,
                created_at,
              };
            } catch (e) {
              console.warn("Decryption failed for incoming message:", e);
              try {
                if (handshake?.ephPubB64) {
                  await cryptoService.ensureSessionFromEnvelope({ username: senderUsername, id: senderId }, handshake);
                } else {
                  await cryptoService.warmUpSession(senderUsername, senderId);
                }
                let plaintext: string;
                if (typeof (window as any).electronCrypto?.ratchetDecrypt === 'function') {
                  plaintext = await cryptoService.decryptRatchet({ username: senderUsername, id: senderId }, header, ciphertext);
                } else {
                  plaintext = await cryptoService.decrypt(
                    { username: senderUsername, id: senderId },
                    ciphertext
                  );
                }
                decryptedMessage = {
                  id,
                  text: plaintext,
                  senderId: senderId,
                  created_at,
                };
              } catch (e2) {
                console.warn("Decrypt retry failed:", e2);
                decryptedMessage = null;
              }
            }

            if (decryptedMessage) {
              try {
                await localMessageService.saveIncomingMessage(
                  senderId,
                  senderUsername,
                  decryptedMessage.text,
                  ciphertext,
                  handshake,
                  header,
                  created_at,
                  id // Use server message ID
                );
              } catch (error) {
                console.warn("Failed to save incoming message to local database:", error);
              }
            }

            if (decryptedMessage) {
              setMessages((prev) => {
                const list = prev[senderId] || [];
                if (list.some((m) => m.id === decryptedMessage!.id)) return prev;
                return {
                  ...prev,
                  [senderId]: [...list, decryptedMessage!],
                };
              });

              setSelectedId((current) => {
                if (current === senderId) return current; // Don't trigger effects if already selected
                return senderId;
              });
            }
          } catch (e) {
            console.error("Failed to handle private message:", e);
          }
        };

        socket.on("connect", handleConnect);
        socket.on("disconnect", handleDisconnect);
        socket.on("message:delivered", handleMessageDelivered);
        socket.on("private:message", handlePrivateMessage);
        socket.on("profile:picture:updated", handleProfilePictureUpdate);

        cleanup = () => {
          socket.off("connect", handleConnect);
          socket.off("disconnect", handleDisconnect);
          socket.off("message:delivered", handleMessageDelivered);
          socket.off("private:message", handlePrivateMessage);
          socket.off("profile:picture:updated", handleProfilePictureUpdate);
        };

        setIsReady(true);
      } catch (err: any) {
        console.error("Setup failed:", err);
        const code = err?.code || err?.message || String(err);
        if (String(code).includes("wrong-passphrase")) {
          enqueueToast({ kind: 'error', message: 'Vault is locked with a different passphrase for this window. Please log in again.' });
        } else if (String(code).includes("vault-not-unlocked")) {
          enqueueToast({ kind: 'error', message: 'Vault is not unlocked. Please log in again to unlock this window.' });
        } else {
          enqueueToast({ kind: 'error', message: 'Setup failed. Check logs in devtool-logs/ and try again.' });
        }
      }
    };

    setup();

    return () => {
      mounted = false;
      if (cleanup) cleanup();
      disconnectSocket();
    };
  }, [fetchConversations]); // fetchConversations is memoized with useCallback, so this runs only when it truly changes

  useEffect(() => {
    if (!isReady || !selectedId) return;

    const selected = conversations.find((c) => c.id === selectedId);
    if (!selected?.username) return;

    let cancelled = false;
    const warmUp = async () => {
      try {
        await cryptoService.warmUpSession(selected.username, selected.id);
        if (cancelled) return;
        console.log(`✅ Secure session ready with ${selected.username}`);
      } catch (err) {
        console.error("Failed to warm up session:", err);
      }
    };

    warmUp();
    return () => {
      cancelled = true;
    };
  }, [selectedId, conversations, isReady]);

  useEffect(() => {
    if (!isReady || !selectedId) {
      console.log("Message Fetching Effect: No selectedId, returning.");
      return;
    }

    console.log(`Message Fetching Effect: selectedId changed to ${selectedId}. Fetching messages...`);

    const fetchMessages = async () => {
      try {
        setLoading(true);
        console.log(`Fetching messages for conversation: ${selectedId}`);

        let localMessages: Message[] = [];
        let decryptedMessages: Message[] = [];

        try {
          localMessages = await localMessageService.getConversationHistory(selectedId, MESSAGES_PER_PAGE, messageOffset);
          console.log(`Found ${localMessages.length} local messages`);
          decryptedMessages = localMessages;
        } catch (error) {
          console.warn("Failed to fetch local messages:", error);
        }

        if (localMessages.length < 5 && messageOffset === 0) {
          try {
            console.log("Fetching additional messages from remote API...");
            const encryptedMessages = await messageAPI.getMessages(selectedId, MESSAGES_PER_PAGE, 0);
            console.log(`messageAPI.getMessages returned: ${encryptedMessages.length} messages`);

            const remoteMessages: Message[] = [];
            for (const msg of encryptedMessages) {
              const peer =
                msg.sender_id === myUserId
                  ? conversations.find((c) => c.id === msg.recipient_id)
                  : conversations.find((c) => c.id === msg.sender_id);

              if (peer) {
                try {
                  let plaintext: string;
                  const header = (msg as any).header_json;
                  if (typeof (window as any).electronCrypto?.ratchetDecrypt === 'function') {
                    plaintext = await cryptoService.decryptRatchet(
                      { username: peer.username, id: peer.id },
                      header,
                      msg.ciphertext
                    );
                  } else {
                    plaintext = await cryptoService.decrypt(
                      { username: peer.username, id: peer.id },
                      msg.ciphertext
                    );
                  }

                  const decryptedMessage: Message = {
                    id: msg.id,
                    text: plaintext,
                    senderId: msg.sender_id,
                    created_at: msg.created_at,
                  };
                  remoteMessages.push(decryptedMessage);
                } catch (e) {
                  console.warn("Failed to decrypt a historical message:", e);
                  const localMatch = localMessages.find(lm => lm.id === msg.id);
                  if (localMatch) {
                    console.log("Using locally stored plaintext for message:", msg.id);
                    remoteMessages.push({
                      id: msg.id,
                      text: localMatch.text,
                      senderId: msg.sender_id,
                      created_at: msg.created_at,
                    });
                  } else {
                    console.log("Skipping undecryptable message:", msg.id);
                  }
                }
              }
            }

            const localIds = new Set(localMessages.map(m => m.id));
            const uniqueRemote = remoteMessages.filter(m => !localIds.has(m.id));
            decryptedMessages = [...localMessages, ...uniqueRemote];
            console.log(`Combined ${localMessages.length} local + ${uniqueRemote.length} remote messages`);
            console.log(`Local IDs:`, Array.from(localIds));
            console.log(`Remote IDs:`, remoteMessages.map(m => m.id));
            console.log(`Filtered Remote IDs:`, uniqueRemote.map(m => m.id));
          } catch (remoteError) {
            console.warn("Failed to fetch remote messages:", remoteError);
          }
        }

        setMessages((prev) => {
          const existing = prev[selectedId] || [];
          const existingIds = new Set(existing.map((m) => m.id));
          const uniqueNew = decryptedMessages.filter((m) => !existingIds.has(m.id));

          const allMessages = [...uniqueNew, ...existing].sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );

          return {
            ...prev,
            [selectedId]: allMessages,
          };
        });

        setHasMoreMessages((prev) => ({
          ...prev,
          [selectedId]: decryptedMessages.length >= MESSAGES_PER_PAGE,
        }));
      } catch (err) {
        console.error("Failed to fetch messages:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [selectedId, conversations, myUserId, messageOffset, isReady]); // Wait until ready

  useEffect(() => {
    if (!selectedId) return;
    setMessageOffset(0);
    setMessages((prev) => {
      if (prev[selectedId] && prev[selectedId].length > 0) return prev;
      return { ...prev, [selectedId]: [] };
    });
    setHasMoreMessages((prev) => ({
      ...prev,
      [selectedId]: true,
    }));
  }, [selectedId]);

  const activeConversation = conversations.find((c) => c.id === selectedId);
  const activeMessages =
    (activeConversation && messages[activeConversation.id]) || [];

  const handleSendMessage = async (text: string) => {
    if (!activeConversation || isSending) return;

    setIsSending(true);
    try {
      let handshake: any | undefined = undefined;
      try {
        const existing = await window.electronAPI.getSession(activeConversation.id);
        if (!existing && typeof window.electronCrypto.genEphemeral === 'function') {
          const eph = await window.electronCrypto.genEphemeral();
          const priv = cryptoService.getIdentity();
          const bundle = await keyAPI.getBundle(activeConversation.username);
          try {
            const prekey = await keyAPI.getOneTimePrekey(activeConversation.username);
            if (prekey?.publicKeyB64 && typeof (window as any).electronCrypto.establishSessionWithEphAndOpk === 'function' && priv && bundle) {
              const res = await (window as any).electronCrypto.establishSessionWithEphAndOpk(priv, bundle, eph.ephPrivB64, prekey.publicKeyB64);
              if (res?.sessionId && res.sharedAesKeyB64) {
                await window.electronAPI.saveSession(activeConversation.id, res.sessionId, res.sharedAesKeyB64);
                handshake = { ephPubB64: eph.ephPubB64, opkPubB64: prekey.publicKeyB64, kind: 'x3dh-opk' };
              }
            }
          } catch (e) {
            console.warn("Failed to establish session with OPK:", e);
            if (typeof (window as any).electronCrypto.establishWithEph === 'function' && priv && bundle) {
              const res = await (window as any).electronCrypto.establishWithEph(priv, bundle, eph.ephPrivB64);
              if (res?.sessionId && res.sharedAesKeyB64) {
                await window.electronAPI.saveSession(activeConversation.id, res.sessionId, res.sharedAesKeyB64);
                handshake = { ephPubB64: eph.ephPubB64, kind: 'x3dh-dev' };
              }
            } else {
            }
          }
        }
      } catch (e) {
        console.warn("Failed to check for or establish session:", e);
      }

      const enc = await cryptoService.encrypt(
        {
          username: activeConversation.username,
          id: activeConversation.id,
        },
        text
      );

      const saved = await messageAPI.sendMessage({
        recipientId: activeConversation.id,
        ciphertext: enc.ciphertext,
        ...(enc.header ? { header: enc.header } : {}),
        ...(handshake ? { handshake } : {}),
      });

      try {
        await localMessageService.saveOutgoingMessage(
          activeConversation.id,
          activeConversation.username,
          text,
          enc.ciphertext,
          handshake,
          enc.header,
          saved.id // Use server ID to prevent duplicate detection
        );
      } catch (error) {
        console.warn("Failed to save outgoing message to local database:", error);
      }

      const newMessage: Message = {
        id: saved.id,
        text,
        senderId: myUserId || "unknown",
        created_at: saved.created_at,
      };
      setMessages((prev) => ({
        ...prev,
        [activeConversation.id]: [
          ...(prev[activeConversation.id] || []),
          newMessage,
        ],
      }));
    } catch (e: any) {
      console.error("Encryption/sending failed:", e);
      if (e?.response) {
        console.error("Send failed details:", {
          status: e.response.status,
          data: e.response.data,
          recipientId: activeConversation.id,
          ciphertextPreview: (typeof e?.config?.data === 'string' ? e.config.data : undefined)?.slice?.(0, 120),
        });
        const msg = typeof e?.response?.data === 'object' ? JSON.stringify(e.response.data) : String(e?.response?.data || e.message);
        enqueueToast({ kind: 'warn', message: `Send failed (${e.response.status}). ${msg}` });
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleUserSelect = (user: Conversation) => {
    if (!conversations.some((conv) => conv.id === user.id)) {
      setConversations((prev) => [
        ...prev,
        { ...user, id: String(user.id) }, // Normalize id to string
      ]);
    }
    setSelectedId(user.id); // Automatically select the new conversation
  };

  const handleLoadMoreMessages = () => {
    setMessageOffset((prevOffset) => prevOffset + MESSAGES_PER_PAGE);
  };

  if (!isReady) {
    return (
      <div
        style={{
          display: "grid",
          placeContent: "center",
          height: "100vh",
          color: "#888",
        }}
      >
        <h2>Initializing secure session...</h2>
        <ToastContainer items={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((x) => x.id !== id))} />
      </div>
    );
  }

  function enqueueToast(t: Omit<ToastItem, 'id'>) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    setToasts((prev) => [...prev, { id, ttlMs: 5000, ...t }]);
  }
  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <MainLayout
      sidebar={(
        <Sidebar // Use the new Sidebar component
          conversations={conversations}
          activeConversationId={selectedId}
          onConversationClick={setSelectedId}
          onUserSelect={handleUserSelect} // Pass the new handler
          myUserId={myUserId}
        />
      )}
    >
      {errorMessage && <div style={{ color: 'red', padding: '10px', textAlign: 'center' }}>{errorMessage}</div>} {/* Error message */}
      {loading && <div style={{ color: 'blue', padding: '10px', textAlign: 'center' }}>Loading...</div>} {/* Loading indicator */}
      {activeConversation ? (
        <ChatWindow
          myUserId={myUserId}
          conversationName={activeConversation.name}
          messages={activeMessages}
          onSendMessage={handleSendMessage}
          onLoadMoreMessages={handleLoadMoreMessages} // Pass load more handler
          hasMoreMessages={selectedId ? hasMoreMessages[selectedId] : false}
          contactProfilePic={activeConversation.profilePicUrl}
          contactUserId={activeConversation.id}
        />
      ) : (
        <div className="no-conversation-selected">
          <h2>Select a conversation</h2>
        </div>
      )}
      <ToastContainer items={toasts} onDismiss={dismissToast} />
    </MainLayout>
  );
}
