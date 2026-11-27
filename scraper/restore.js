// 用 backup/firestore/ 的備份還原 Firestore 的一份共用資料 (整份蓋回去)。
//
// 執行 (在 repo 根目錄)：
//   FIREBASE_SERVICE_ACCOUNT='<金鑰 JSON>' node scraper/restore.js <events|characters|roster> [--ref <commit>] [--yes]
//   --ref：用某個 commit 的備份 (例如 --ref HEAD~3，或 git log -- backup/firestore/events.json 查到的編號)；沒寫就用目前的檔案
//   --yes：真的寫入。沒加時只比較雲端現在和備份各有幾筆，不寫入
//
// 寫入前會把雲端現在的內容存到 backup/firestore/<名稱>.before-restore-<時間>.json (不會 commit，留在這台電腦)，
// 還原錯了可以再用 --file 指回這個檔案：
//   node scraper/restore.js events --file backup/firestore/events.before-restore-....json --yes
//
// 注意：還原的是整份文件。備份之後才做的修改 (例如今天下午管理員改的名稱) 會一起被蓋掉。
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const S = require('./snapshot.js');

function parseArgs(argv) {
    const args = { name: argv[0], ref: null, file: null, yes: false };
    for (let i = 1; i < argv.length; i++) {
        if (argv[i] === '--yes') args.yes = true;
        else if (argv[i] === '--ref' || argv[i] === '--file') {
            const value = argv[++i];
            if (!value || value.startsWith('--')) throw new Error(`${argv[i - 1]} 後面要接${argv[i - 1] === '--ref' ? ' commit' : '檔案路徑'}`);
            args[argv[i - 1].slice(2)] = value;
        }
        else throw new Error(`看不懂的參數：${argv[i]}`);
    }
    if (!S.DOCS.includes(args.name)) throw new Error(`第一個參數要是 ${S.DOCS.join('、')} 其中一個`);
    if (args.ref && args.file) throw new Error('--ref 和 --file 只能選一個');
    return args;
}

function readBackup({ name, ref, file }) {
    if (file) return fs.readFileSync(file, 'utf8');
    if (ref) return execFileSync('git', ['show', `${ref}:backup/firestore/${name}.json`], { encoding: 'utf8' });
    return fs.readFileSync(path.join(S.BACKUP_DIR, `${name}.json`), 'utf8');
}

// 比較雲端現在和備份 (format 後的文字)，並檢查備份轉成要寫入的資料後，再存一次會不會一模一樣
// (確認時間欄位能正確轉回 Timestamp、沒有欄位在轉換時遺失)。toTimestamp：Date → Firestore Timestamp
function compare(currentText, backup, toTimestamp) {
    const backupText = S.format(backup);
    return { same: currentText === backupText, writable: S.format(S.decode(backup, toTimestamp)) === backupText };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const backup = JSON.parse(readBackup(args));
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error('沒有設定 FIREBASE_SERVICE_ACCOUNT');
    const { initializeApp, cert } = require('firebase-admin/app');
    const { getFirestore, Timestamp } = require('firebase-admin/firestore');
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
    const ref = getFirestore().collection('shared').doc(args.name);

    const snap = await ref.get();
    const currentText = S.format(snap.exists ? snap.data() : null);
    console.log(`雲端現在：${S.summarize(JSON.parse(currentText))}`);
    console.log(`備份    ：${S.summarize(backup)}`);
    const result = compare(currentText, backup, (date) => Timestamp.fromDate(date));
    if (!result.writable) throw new Error('備份轉回 Firestore 格式後內容對不上，停止還原');
    console.log('寫入檢查：備份轉回 Firestore 格式後內容一致');
    if (result.same) { console.log('兩邊一樣，不用還原'); return; }
    if (!args.yes) { console.log('只是比較，沒有寫入。確定要還原請加 --yes'); return; }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const saved = path.join(S.BACKUP_DIR, `${args.name}.before-restore-${stamp}.json`);
    fs.mkdirSync(S.BACKUP_DIR, { recursive: true });
    fs.writeFileSync(saved, currentText);
    console.log(`雲端現在的內容先存到 ${path.relative(process.cwd(), saved)}`);

    const data = S.decode(backup, (date) => Timestamp.fromDate(date));
    if (data === null) await ref.delete();
    else await ref.set(data);
    console.log(`已還原 shared/${args.name}`);
}

module.exports = { parseArgs, compare };

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
}
