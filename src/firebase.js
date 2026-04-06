import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCdo-lWBYazJ215br083O0RYM7eGhxx2xY",
  authDomain: "kawinnath-ef1c6.firebaseapp.com",
  databaseURL: "https://kawinnath-ef1c6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kawinnath-ef1c6",
  storageBucket: "kawinnath-ef1c6.firebasestorage.app",
  messagingSenderId: "586965826381",
  appId: "1:586965826381:web:a1827eb00af4c878035504",
  measurementId: "G-QJPZV6F1L8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);
export const storage = getStorage(app);