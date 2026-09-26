import { openDB } from 'idb';

const DB_NAME = 'chatflow_offline_db';
const DB_VERSION = 1;

export const initOfflineDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('chatId', 'chatId');
      }
      if (!db.objectStoreNames.contains('chats')) {
        db.createObjectStore('chats', { keyPath: 'id' });
      }
    },
  });
};

export const saveMessagesOffline = async (chatId, messages) => {
  const db = await initOfflineDB();
  const tx = db.transaction('messages', 'readwrite');
  
  for (const msg of messages) {
    if (!msg.id) continue;
    await tx.store.put({ ...msg, chatId });
  }
  await tx.done;
};

export const getOfflineMessages = async (chatId) => {
  const db = await initOfflineDB();
  const messages = await db.getAllFromIndex('messages', 'chatId', chatId);
  return messages.sort((a, b) => {
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return timeA - timeB;
  });
};

export const saveChatsOffline = async (chats) => {
  const db = await initOfflineDB();
  const tx = db.transaction('chats', 'readwrite');
  
  for (const chat of chats) {
    if (!chat.id) continue;
    await tx.store.put(chat);
  }
  await tx.done;
};

export const getOfflineChats = async () => {
  const db = await initOfflineDB();
  return db.getAll('chats');
};
