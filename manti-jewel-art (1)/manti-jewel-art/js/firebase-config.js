// ============================================================
// firebase-config.js — Replace with YOUR Firebase project config
// Firebase Console → Project Settings → Your Apps → Web App
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDnuVCKNRYaV_Hvwh2JbfdlGHBpVHHSVrU",
  authDomain: "manti-jewel-art.firebaseapp.com",
  projectId: "manti-jewel-art",
  storageBucket: "manti-jewel-art.firebasestorage.app",
  messagingSenderId: "666274916712",
  appId: "1:666274916712:web:c6fb9dbb71e2d32ded4edd",
  measurementId: "G-W8W5F5NG11"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

// ---- Admin email (change to your admin email) ----
const ADMIN_EMAIL = "vicky@manti.com";
// ---- WhatsApp number (country code + number, no +) ----
const WHATSAPP_NUMBER = "919092727655";
// ---- Telegram bot token and chat id for admin notifications ----
// const TELEGRAM_BOT_TOKEN = "8598526336:AAGD2-JizYWPQfRZB6q6a8uBMGO5618EzLw";
// const TELEGRAM_CHAT_ID = "1995267677";



// const SEND_EMAIL_URL = ""; 



// window.WHATSAPP_NUMBER = String(WHATSAPP_NUMBER).replace(/\D/g,'');
// window.ADMIN_EMAIL = ADMIN_EMAIL;
// window.SEND_EMAIL_URL = SEND_EMAIL_URL;
// window.TELEGRAM_BOT_TOKEN = TELEGRAM_BOT_TOKEN;
// window.TELEGRAM_CHAT_ID = TELEGRAM_CHAT_ID;



