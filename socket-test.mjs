import { io } from "socket.io-client";

const url = "http://localhost:3001";
const aliceToken = process.env.ALICE_TOKEN;
const bobToken = process.env.BOB_TOKEN;

// Substitute with actual numeric/string IDs returned from DB.
// For quick smoke test you can discover via your user listing API or logs.
const bobId = process.env.BOB_ID;

const alice = io(url, { auth: { token: aliceToken }, transports: ["websocket"] });
const bob = io(url, { auth: { token: bobToken }, transports: ["websocket"] });

alice.on("connect", () => console.log("Alice connected", alice.id));
bob.on("connect", () => console.log("Bob connected", bob.id));

bob.on("private:message", (msg) => {
  console.log("Bob received:", msg);
  process.exit(0);
});

setTimeout(() => {
  console.log("Alice sending to Bob...");
  alice.emit("private:message", {
    recipientId: bobId,
    ciphertext: "test-ciphertext",
  });
}, 1000);

setTimeout(() => {
  console.error("Timeout waiting for message");
  process.exit(1);
}, 5000);