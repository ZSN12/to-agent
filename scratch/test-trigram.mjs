import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert';

// 使用内存数据库自测 FTS5 trigram 分词与 LIKE 降级
const db = new DatabaseSync(':memory:');

// 模拟 schema.ts 中的定义
db.exec("CREATE VIRTUAL TABLE persisted_docs USING fts5(text, tokenize = 'trigram remove_diacritics 1')");

const text1 = "这是一段中文测试文本，测试了session-query的功能。";
const text2 = "This is an English test document for session search.";

db.prepare("INSERT INTO persisted_docs(text) VALUES (?)").run(text1);
db.prepare("INSERT INTO persisted_docs(text) VALUES (?)").run(text2);

console.log("正在执行全文检索自测...\n");

// 1. 英文检索测试
const qEng = db.prepare("SELECT text FROM persisted_docs WHERE persisted_docs MATCH ?").all('"English test"');
assert(qEng.length === 1);
console.log("✅ 英文全文检索测试通过 (MATCH):", qEng[0].text);

// 2. 中文检索测试 (>= 3个字符，走 Trigram MATCH)
const qChi = db.prepare("SELECT text FROM persisted_docs WHERE persisted_docs MATCH ?").all('"中文测试"');
assert(qChi.length === 1);
console.log("✅ 中文检索(>=3字符)测试通过 (MATCH):", qChi[0].text);

// 3. 中文短词检索测试 (< 3个字符，走 LIKE 降级)
const qChiShort = db.prepare("SELECT text FROM persisted_docs WHERE text LIKE ?").all('%测试%');
assert(qChiShort.length === 1);
console.log("✅ 中文短词检索(<3字符)测试通过 (LIKE 降级):", qChiShort[0].text);

console.log("\n自测脚本运行成功，全部通过！");
