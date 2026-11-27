# 2026-11-27　Firestore 共用資料備份、卡池 PR 修正

## 改了什麼
- 新增 `scraper/snapshot.js`：讀 `shared/events`、`shared/characters`、`shared/roster`，寫成 `backup/firestore/<名稱>.json`。時間欄位存成 `{"__timestamp__": ISO}`，物件欄位依名稱排序，文件不存在就存 `null`。
- 新增 `scraper/restore.js`：用目前的檔案、`--ref <commit>` 或 `--file <路徑>` 的備份整份蓋回去。預設只比較，加 `--yes` 才寫入；寫入前把雲端現在的內容存成 `*.before-restore-*.json`（已加進 .gitignore）。
- workflow `scrape` job：第一步先備份並 commit；`pool-seen.json` 改成卡池 PR 那一步成功才 commit（中間先收進 `$RUNNER_TEMP`，免得切分支、合併時被擋）。
- `scraper/pool-pr.sh`：如果是淺複本就先 `git fetch --unshallow`；合併 main 失敗時 abort，並印出 `::error::` 說明。
- `scraper/pool-seen.json` 拿掉 11-16、18、20、22 四篇公告，讓它們重讀。
- 測試：`tests/snapshot.test.js`（6 個）。

## 為什麼
- 支柱 1「出錯時有備份可還原」：名稱修正、活動編輯原本送出就不能退回。
- 卡池 PR 開著時，追加新卡池每次都失敗（`refusing to merge unrelated histories`），而且讀過的紀錄已經先 commit，卡池就漏掉了。

## 怎麼用
- 備份是自動的；看歷史用 `git log -- backup/firestore/events.json`。
- 還原：`FIREBASE_SERVICE_ACCOUNT='<金鑰>' node scraper/restore.js events --ref <commit>` 先看比較，再加 `--yes`。

## 已知限制
- 一天一份：最多會掉一天內的修改；還原是整份蓋回，備份之後的修改會一起不見。
- 還原腳本沒有對正式資料寫入過。
- PR 和 main 有衝突時，爬蟲每天都會失敗，直到有人解決衝突或關掉 PR（這是刻意的：不自動丟掉 PR 裡的內容）。
- 還原 `shared/roster` 之後，下次爬蟲的寫回名冊會照新內容處理；已經寫回 `characters.json` 的部分要另外用 `git revert`。

## 追加：依介紹順序對應獸神化前的名稱（同日）
- 改了什麼：`scraper/pool-parse.js` 的 `parseHeadingLists` 在有推測名稱時呼叫 `matchByIntroOrder`（用 `quotedRuns` 抓內文並列的「」名稱串）；結果記在名單的 `ordered`，`planHonke` 產生提醒。`planHonke` 單一卡池的出口原本丟掉先前的 flags（推測名稱的提醒從沒出現過），一併修好。測試 +2。
- 為什麼：新娘 5 的「MDT 婚禮革新者・生存α」被當成新角色。
- 怎麼用：自動；PR 報告會出現「依公告內文介紹新角色的順序……請確認」。
- 已知限制：介紹的順序和小標題順序不同時（例如新娘 4 的公告），兩隻以上對不上就可能對錯，所以一律標出來請管理員確認；有兩串都對得上時不猜。
