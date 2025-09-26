// src/lib/socket.ts
import { io, Socket } from "socket.io-client";
import { ACCESS_TOKEN_KEY } from "../utils/api";

export let socket: Socket;

export function connectSocket(): Socket {
  if (socket) return socket;

  // FIX: Retrieve the JWT token from local storage.
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);

  // FIX: Pass the token in the `auth` payload during connection.
  // The server-side middleware will use this to identify the user.
  socket = io("http://localhost:3001", {
    auth: { token },
    transports: ["websocket"],
    autoConnect: true,
  });

  return socket;
}

export function getSocket(): Socket {
  if (!socket) throw new Error("Socket not connected");
  return socket;
}

export function disconnectSocket() {
  try {
    socket?.disconnect();
  } catch {
    /* noop */
  }
}
