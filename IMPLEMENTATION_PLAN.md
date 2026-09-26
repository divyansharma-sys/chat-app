# Comprehensive Enhancement Implementation Plan

This document outlines the step-by-step technical plan to implement advanced, real-time features into ChatFlow to make it a competitive, real-world application.

## Phase 1: Real-Time Presence & Engagement (Current Focus)
These are high-impact, low-friction features that significantly improve the "live" feel of the chat.

1.  **Online/Last Seen Presence**
    *   **Goal**: Show a green dot when a user is online, and "Last seen at X" when offline.
    *   **Implementation**: We will use Firebase Realtime Database (RTDB) because Firestore is not ideal for presence due to billing costs (too many writes) and lack of native `onDisconnect`. Wait, the project currently only uses Firestore. We will either add RTDB, or implement a heartbeat-based approach in Firestore, or just update status on login/logout and visibility change. Let's use Firestore for now with a visibility-change listener to keep it simple without adding a new Firebase service unless necessary.
    *   **Action**: Update the user document in Firestore `users/{uid}` with `isOnline` (boolean) and `lastSeen` (timestamp).

2.  **Typing Indicators**
    *   **Goal**: Show "User is typing..." when someone is actively typing in a chat.
    *   **Implementation**: Add a subcollection or fields in the chat session document (e.g., `chats/{chatId}/typing/{uid}`). Set it to true on keypress, and false after 2 seconds of inactivity or on message send.

3.  **Read Receipts (Status Ticks)**
    *   **Goal**: Show status ticks (Sent, Delivered, Read).
    *   **Implementation**: Update message documents in Firestore with a `status` field: `sent`, `delivered` (requires device ping, might skip for web), `read` (updated when the recipient opens the chat and sees the message).

## Phase 2: Engagement (Reactions & Replies)
1.  **Message Reactions**
    *   **Goal**: Long-press a message to add an emoji.
    *   **Implementation**: Add a `reactions` map to the message document: `{ 'uid1': '❤️', 'uid2': '👍' }`. Update the `ChatArea` component to render these.

2.  **Threaded Replies**
    *   **Goal**: Swipe to reply.
    *   **Implementation**: Add a `replyTo` field to new messages containing the ID of the referenced message. Render a small quote block above the message.

## Phase 3: Performance & Offline (IndexedDB)
1.  **Offline First**
    *   **Implementation**: Use a lightweight wrapper like `localforage` or `idb` to sync Firestore messages to a local IndexedDB. Serve from IndexedDB on load, then hydrate from Firestore. Capacitor's SQLite can also be explored later for native performance.

## Phase 4: Privacy (End-to-End Encryption)
1.  **E2EE Setup**
    *   **Implementation**: Use Web Crypto API. Generate RSA/ECDH keypairs on signup. Store public keys in Firestore, private keys in local IndexedDB. Encrypt message payloads before Firestore writes.

---
**Next Step**: I will begin by implementing **Phase 1: Online Presence and Typing Indicators**.
