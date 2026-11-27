// 把 scrape.js / backfill.js 存下來的卡池資料套用到 pools.json 和角色名冊 (characters.json)，並寫出 PR 說明用的 Markdown。
//
// 執行：node scraper/apply-pools.js <卡池資料.json> <說明.md>
//   卡池資料：{ items: [{ event, data }], flags?: [{ event, source, message }] }
//   檔案有變動才會改寫；說明是空的代表沒有任何變動或需要確認的事
// GitHub Actions 會在 pools-update 分支上執行這支程式，再開 PR 給管理員確認 (見 scraper/pool-pr.sh)。
//
// pools.json 的 chars 是名冊的編號。pool-parse.js 內部用名稱比對，所以這裡讀檔時把編號換成名稱、
// 寫檔時換回編號；名冊沒有的名稱 (新角色) 在寫檔時編新的編號。屬性也記在名冊裡。
// 名冊只放卡池裡的角色 (★6 的限定、期間限定、合作)；公告屬性欄的其他角色 (常駐、★5、合作禮包…) 只寫進屬性表 elements.json。
'use strict';

const fs = require('fs');
const path = require('path');
const { planPoolChanges, formatPoolsJson, describePoolChanges, mergeElements } = require('./pool-parse.js');
const R = require('../roster.js');
const { poolKey } = require('../pools.js');

const POOLS_FILE = path.join(__dirname, '..', 'pools.json');
const ROSTER_FILE = path.join(__dirname, '..', 'characters.json');
const ELEMENTS_FILE = path.join(__dirname, '..', 'elements.json');
const OVERRIDES_FILE = path.join(__dirname, 'name-overrides.json');

const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// 純函式：{ pools (編號), roster, elements (elements.json), overrides (name-overrides.json), items } → 要寫的內容與說明
function applyPools({ pools, roster, elements, overrides, items, flags }) {
    const table = (elements && elements.elements) || {};
    const problems = R.indexRoster(roster).problems;
    if (problems.length) throw new Error('角色名冊有問題：\n' + problems.join('\n'));
    const fromRoster = R.rosterOverrides(roster);
    const all = {
        ...(overrides || {}),
        global: { ...fromRoster.global, ...((overrides && overrides.global) || {}) },
        pools: { ...fromRoster.pools, ...((overrides && overrides.pools) || {}) },
        // 名冊的類別 { 比對用名稱: kind }：新系列轉蛋判斷哪些角色是限定 (角色頁標過的以名冊為準)；屬性表 (常駐等) 的名稱算 regular
        kinds: {
            ...Object.fromEntries(Object.keys((elements && elements.elements) || {}).map((n) => [poolKey(n), 'regular'])),
            ...Object.fromEntries((roster.characters || []).filter((c) => c.kind)
                .flatMap((c) => R.namesOf(c).map((n) => [poolKey(n), c.kind])))
        }
    };
    const orphanFlags = [];
    const named = R.poolsToNames(pools, roster, (o) => orphanFlags.push({ event: o.pool, source: '',
        message: `卡池用到名冊沒有的編號 ${o.id}（可能在這個 PR 開著時被合併了），改用原本的名稱「${o.name}」對回名冊；如果下面出現同名的新角色，請改成併進去的那隻` }));
    const result = planPoolChanges(named, items, all);
    result.flags.push(...orphanFlags);
    const known = Object.fromEntries(Object.entries(table).filter(([, e]) => e));
    const merged = mergeElements({ ...known, ...R.rosterElements(roster) }, items, result.data, all);
    const withElements = R.applyElements(roster, merged.elements, table);
    const converted = R.poolsToIds(result.data, withElements.data);
    // 進了卡池 (名冊) 的名稱從屬性表拿掉，屬性帶進名冊
    const inRoster = (n) => R.findCharacter(converted.data, n);
    const nextTable = {};
    Object.entries(withElements.table).forEach(([n, e]) => {
        const c = inRoster(n);
        if (!c) nextTable[n] = e;
        else if (e && !c.element) c.element = e;
    });
    result.flags.push(...merged.flags, ...(Array.isArray(flags) ? flags : []));

    const added = [...converted.added, ...withElements.added];
    const lines = [];
    if (added.length) {
        lines.push('### 角色名冊', '', `- 新角色 ${added.length} 個（characters.json 編了新的編號；如果其實是既有角色的另一種寫法，請不要 Merge，告訴 Claude 是哪一隻）`);
        added.forEach((a) => lines.push(`  - ${a.id} ${a.name}${a.pool ? `（${a.pool}）` : ''}`));
    }
    if (withElements.filled) lines.push(...(added.length ? [] : ['### 角色名冊', '']), `- 補上 ${withElements.filled} 個角色的屬性`);
    if (withElements.others) lines.push(...(added.length || withElements.filled ? [] : ['### 角色名冊', '']), `- 屬性表（elements.json，名冊以外的角色）補上 ${withElements.others} 個名稱的屬性`);
    return {
        poolsText: formatPoolsJson(converted.pools),
        rosterText: R.formatRoster(converted.data),
        elementsText: formatElements({ ...(elements || {}), elements: nextTable }),
        report: describePoolChanges(result) + (lines.length ? lines.join('\n') + '\n' : ''),
        changes: result.changes.length, added: added.length, flags: result.flags.length
    };
}

// elements.json：名冊以外的角色 (常駐、★5、合作禮包…) 的屬性，只用來替名稱上色、認得抽卡紀錄裡的名稱。屬性不知道時是 ""
const ELEMENTS_NOTE = '名冊以外的角色 (常駐、★5、合作禮包…) 的屬性：{ 名稱: 屬性 (火水木光闇，不知道時是空字串) }。網頁用來替名稱上色、認得抽卡紀錄裡的名稱；爬蟲從公告的屬性欄補上，角色頁編輯模式標成常駐的名稱也寫在這裡。名冊 (characters.json) 只放 ★6 的限定、期間限定、合作 (轉蛋) 角色。';
function formatElements(data) {
    const entries = Object.entries((data && data.elements) || {}).sort(([a], [b]) => a.localeCompare(b, 'zh-Hant'));
    return ['{', `  "說明": ${JSON.stringify((data && data['說明']) || ELEMENTS_NOTE)},`, '  "elements": {',
        entries.map(([n, e]) => `    ${JSON.stringify(n)}: ${JSON.stringify(e)}`).join(',\n'), '  }', '}', ''].join('\n');
}

function main() {
    const [itemsFile, reportFile] = process.argv.slice(2);
    if (!itemsFile || !reportFile) {
        console.error('用法：node scraper/apply-pools.js <卡池資料.json> <說明.md>');
        process.exit(1);
    }
    const input = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
    const poolsBefore = readText(POOLS_FILE);
    const rosterBefore = readText(ROSTER_FILE);
    const elementsBefore = fs.existsSync(ELEMENTS_FILE) ? readText(ELEMENTS_FILE) : '';
    const out = applyPools({
        pools: JSON.parse(poolsBefore),
        roster: JSON.parse(rosterBefore),
        elements: elementsBefore ? JSON.parse(elementsBefore) : {},
        overrides: fs.existsSync(OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) : {},
        items: Array.isArray(input.items) ? input.items : [],
        flags: input.flags
    });
    if (out.poolsText !== poolsBefore) fs.writeFileSync(POOLS_FILE, out.poolsText);
    if (out.rosterText !== rosterBefore) fs.writeFileSync(ROSTER_FILE, out.rosterText);
    if (out.elementsText !== elementsBefore) fs.writeFileSync(ELEMENTS_FILE, out.elementsText);
    fs.writeFileSync(reportFile, out.report);
    console.log(`卡池：變動 ${out.changes} 筆，新角色 ${out.added} 個，需要確認 ${out.flags} 項`);
}

if (require.main === module) main();
module.exports = { applyPools, formatElements };
