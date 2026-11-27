// 執行：node --test tests/
// Firestore 共用資料的每日備份與還原 (scraper/snapshot.js、scraper/restore.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../scraper/snapshot.js');
const { parseArgs } = require('../scraper/restore.js');

// 假的 Firestore Timestamp：有 toDate() 就當成時間
const fakeTs = (iso) => ({ toDate: () => new Date(iso), iso });

test('時間存成 ISO 字串，欄位依名稱排序，陣列順序不動', () => {
    const data = { updatedAt: fakeTs('2026-11-27T04:00:00.000Z'), events: [{ event: 'b', date: '2026-11-02' }, { date: '2026-11-01', event: 'a' }] };
    assert.equal(S.format(data), JSON.stringify({
        events: [{ date: '2026-11-02', event: 'b' }, { date: '2026-11-01', event: 'a' }],
        updatedAt: { __timestamp__: '2026-11-27T04:00:00.000Z' }
    }, null, 2) + '\n');
});

test('還原時時間轉回 Timestamp，其他值原樣', () => {
    const backup = JSON.parse(S.format({ updatedAt: fakeTs('2026-11-27T04:00:00.000Z'), fixes: { a: 'b' }, n: 0, x: null }));
    const out = S.decode(backup, (d) => fakeTs(d.toISOString()));
    assert.equal(out.updatedAt.iso, '2026-11-27T04:00:00.000Z');
    assert.deepEqual({ ...out, updatedAt: null }, { fixes: { a: 'b' }, n: 0, x: null, updatedAt: null });
});

test('備份再還原一次，內容不變 (同樣的 format 結果)', () => {
    const data = { events: [{ event: '2026-11月 激獸神祭', aliases: ['舊名'], tag: 'honke' }], updatedAt: fakeTs('2026-01-01T00:00:00.000Z') };
    const text = S.format(data);
    assert.equal(S.format(S.decode(JSON.parse(text), (d) => fakeTs(d.toISOString()))), text);
});

test('文件不存在存成 null', () => {
    assert.equal(S.format(undefined), 'null\n');
    assert.equal(S.format(null), 'null\n');
    assert.equal(S.decode(null, () => { throw new Error('不該呼叫'); }), null);
});

test('摘要：陣列寫筆數、物件寫項數、時間寫 ISO', () => {
    const backup = JSON.parse(S.format({ events: [1, 2, 3], fixes: { a: 1, b: 2 }, updatedAt: fakeTs('2026-11-27T04:00:00.000Z') }));
    assert.equal(S.summarize(backup), 'events: 3 筆、fixes: 2 項、updatedAt: 2026-11-27T04:00:00.000Z');
    assert.equal(S.summarize(null), '（文件不存在）');
});

test('還原的參數：只接受三份文件、--ref 和 --file 不能一起用', () => {
    assert.deepEqual(parseArgs(['events', '--ref', 'HEAD~1', '--yes']), { name: 'events', ref: 'HEAD~1', file: null, yes: true });
    assert.equal(parseArgs(['roster']).yes, false);
    assert.throws(() => parseArgs(['admins']), /第一個參數/);
    assert.throws(() => parseArgs(['events', '--ref', 'a', '--file', 'b']), /只能選一個/);
    assert.throws(() => parseArgs(['events', '--force']), /看不懂/);
});

test('陣列和巢狀物件裡的時間也會來回轉換', () => {
    const data = { events: [{ updatedAt: fakeTs('2026-11-01T00:00:00.000Z'), log: [fakeTs('2026-11-02T00:00:00.000Z')] }] };
    const backup = JSON.parse(S.format(data));
    assert.deepEqual(backup.events[0].log, [{ __timestamp__: '2026-11-02T00:00:00.000Z' }]);
    const out = S.decode(backup, (d) => fakeTs(d.toISOString()));
    assert.equal(out.events[0].updatedAt.iso, '2026-11-01T00:00:00.000Z');
    assert.equal(out.events[0].log[0].iso, '2026-11-02T00:00:00.000Z');
});

test('只有 __timestamp__ 一個欄位才當成時間', () => {
    const value = { __timestamp__: '2026-11-01T00:00:00.000Z', note: 'x' };
    assert.deepEqual(S.decode(value, () => { throw new Error('不該呼叫'); }), value);
});

test('比較：一樣、不一樣、文件不存在、寫入檢查', () => {
    const { compare } = require('../scraper/restore.js');
    const toTs = (d) => fakeTs(d.toISOString());
    const backup = JSON.parse(S.format({ events: [{ event: 'a' }], updatedAt: fakeTs('2026-11-27T04:00:00.000Z') }));
    assert.deepEqual(compare(S.format(backup), backup, toTs), { same: true, writable: true });
    assert.deepEqual(compare(S.format({ events: [] }), backup, toTs), { same: false, writable: true });
    assert.deepEqual(compare(S.format(null), null, toTs), { same: true, writable: true });
    assert.equal(compare(S.format(backup), backup, () => fakeTs('1999-01-01T00:00:00.000Z')).writable, false);
});

test('還原的參數：--ref、--file 後面一定要有值', () => {
    assert.deepEqual(parseArgs(['characters', '--file', 'x.json']), { name: 'characters', ref: null, file: 'x.json', yes: false });
    assert.throws(() => parseArgs(['events', '--ref']), /後面要接 commit/);
    assert.throws(() => parseArgs(['events', '--file', '--yes']), /後面要接檔案路徑/);
});
