import { io, Socket } from "socket.io-client";

const URL = "http://localhost:3001";

export const socket: Socket = io(URL, {
  //prevent the socket from connecting automatically, control when the connection happens, for example only after the user log in
  autoConnect: false,
});
