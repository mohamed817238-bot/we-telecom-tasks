import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBffkbUS6unHIx_-vHe20qojx6FiqckDK8",
  authDomain: "we-telecom-egypt-melsayed.firebaseapp.com",
  projectId: "we-telecom-egypt-melsayed",
  storageBucket: "we-telecom-egypt-melsayed.firebasestorage.app",
  messagingSenderId: "30285808130",
  appId: "1:30285808130:web:b66efb36bc397e43a31d1b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);