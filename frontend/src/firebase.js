import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC-mLKbkDHcMZ8wgbR6eNKq7jXgfSB4QOs",
  authDomain: "fir-chat-app-b8fa6.firebaseapp.com",
  projectId: "fir-chat-app-b8fa6",
  storageBucket: "fir-chat-app-b8fa6.firebasestorage.app",
  messagingSenderId: "167326951700",
  appId: "1:167326951700:web:e919cd09092cef81a33a01"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
