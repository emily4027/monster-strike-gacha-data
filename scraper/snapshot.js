// 每天把 Firestore 的三份共用資料存成 JSON，放進 repo 的 backup/firestore/ (git 歷史就是每天的版本)。
// GitHub Actions 每天爬蟲「之前」跑一次，所以備份是爬蟲和寫回名冊動手前的樣子。還原用 scraper/restore.js。
//
//   shared/events     活動清單 (爬蟲、行事曆的管理員編輯)
//   shared/characters 抽卡紀錄裡打錯的角色名稱修正 (角色頁管理員)
//   shared/roster     角色頁編輯模式對名冊的修改 (寫回 characters.json 後會被清掉)
//
// 執行：FIREBASE_SERVICE_ACCOUNT='<金鑰 JSON>' node scraper/snapshot.js
'use strict';

const fs = require('fs');
const path = require('path');

const DOCS = ['events', 'characters', 'roster'];
const BACKUP_DIR = path.join(__dirname, '..', 'backup', 'firestore');
const TS_KEY = '__timestamp__';

// Firestore 的值轉成可以存成 JSON 的樣子：時間 → {"__timestamp__": ISO 字串}；物件的欄位依名稱排序，每天的差異才看得清楚
function encode(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof value.toDate === 'function') return { [TS_KEY]: value.toDate().toISOString() };
    if (Array.isArray(value)) return value.map(encode);
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = encode(value[key]);
    return out;
}

// encode 的反向。toTimestamp 把 Date 轉成 Firestore 的 Timestamp (還原時傳入)
function decode(value, toTimestamp) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => decode(v, toTimestamp));
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === TS_KEY) return toTimestamp(new Date(value[TS_KEY]));
    const out = {};
    for (const key of keys) out[key] = decode(value[key], toTimestamp);
    return out;
}

// 文件不存在時存 null，還原時才分得出「本來就沒有」
const format = (data) => JSON.stringify(data === undefined ? null : encode(data), null, 2) + '\n';

// 給人看的摘要：每個欄位有幾筆
function summarize(data) {
    if (!data) return '（文件不存在）';
    return Object.keys(data).sort().map((key) => {
        const v = data[key];
        if (Array.isArray(v)) return `${key}: ${v.length} 筆`;
        if (v && typeof v === 'object' && !(TS_KEY in v)) return `${key}: ${Object.keys(v).length} 項`;
        return `${key}: ${v && v[TS_KEY] ? v[TS_KEY] : JSON.stringify(v)}`;
    }).join('、');
}

async function main() {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error('沒有設定 FIREBASE_SERVICE_ACCOUNT');
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    const db = getFirestore();
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    for (const name of DOCS) {
        const snap = await db.collection('shared').doc(name).get();
        const text = format(snap.exists ? snap.data() : null);
        fs.writeFileSync(path.join(BACKUP_DIR, `${name}.json`), text);
        console.log(`備份 shared/${name}：${summarize(JSON.parse(text))}`);
    }
}

module.exports = { DOCS, BACKUP_DIR, encode, decode, format, summarize };

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
