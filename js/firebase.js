// =====================================================
// Firebase 初始化 (兩個頁面共用，<script type="module" src="js/firebase.js">)
// 和其他工具同一個專案 ms-toolbox-web。其他程式透過 window.firebaseFns 使用 SDK 的函式。
//
// 寫入 (都用 runTransaction，只有管理員)：角色頁的名稱修正 (shared/characters)、角色頁編輯模式改名冊 (shared/roster)、
// 行事曆的編輯活動 (shared/events)。抽卡紀錄 (gacha_records) 在網頁上絕對不寫入。
// =====================================================
// Firebase 初始化改由工具箱共用檔提供（app、auth 和其他工具共用同一份設定）
import { app, auth } from '/monster-strike-toolbox/shared/firebase.js';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

window.firebaseAuth = auth;
window.db = getFirestore(app);
window.envAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
window.firebaseFns = {
    GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
    doc, getDoc, runTransaction, serverTimestamp
};
