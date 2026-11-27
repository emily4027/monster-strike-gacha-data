// 執行：node --test tests/
// 歷史卡池回補 (scraper/backfill.js)：活動清單開始之前的合作公告
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../scraper/backfill.js');

const article = (date, event, title, tag = 'collab', collab = [{ gachaName: 'x', rows: [] }]) => ({
    scraped: { event, date, tag, source: `https://example.com/${date}` }, title, data: { limited: [], collab }
});

test('合作祭典的公告改用「激獸神祭×作品」，作品取自標題', () => {
    assert.equal(B.collabEventName('2023-04月 激獸神祭', '【怪物彈珠×輝夜姬想讓人告白】合作活動將於4月8日起開跑！'), '2023-04月 激獸神祭×輝夜姬想讓人告白');
    assert.equal(B.collabEventName('2023-06月 超獸神祭', '【地獄樂×怪物彈珠】合作活動將於6月24日起開跑！'), '2023-06月 超獸神祭×地獄樂');
    assert.equal(B.collabEventName('2023-07月 鬼滅之刃', '【鬼滅之刃×怪物彈珠】'), '2023-07月 鬼滅之刃');
    assert.equal(B.collabEventName('2023-04月 激獸神祭', '沒有括號的標題'), '2023-04月 激獸神祭');
});

test('活動清單開始之前的合作公告直接用，之後的要對到活動才用', () => {
    const events = [{ event: '2023-09月 某合作', date: '2023-09-13', tag: 'collab' }];
    const parsed = [
        article('2023-04-08', '2023-04月 激獸神祭', '【怪物彈珠×輝夜姬想讓人告白】合作活動'),
        article('2023-02-11', '2023-02月 鋼之鍊金術師', '【鋼之鍊金術師×怪物彈珠】'),
        article('2022-09-20', '2022-09月 太早的', '【太早×怪物彈珠】'),
        article('2023-10-01', '2023-10月 清單開始之後', '【之後×怪物彈珠】'),
        article('2023-03-01', '2023-03月 沒有角色表', '【沒表×怪物彈珠】', 'collab', [])
    ];
    const { items } = B.buildItems(events, parsed, '2022-10-01');
    assert.deepEqual(items.filter((i) => i.event.unlogged && i.event.tag === 'collab').map((i) => i.event.event),
        ['2023-04月 激獸神祭×輝夜姬想讓人告白', '2023-02月 鋼之鍊金術師']);
});
