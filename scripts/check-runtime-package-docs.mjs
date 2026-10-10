import fs from 'node:fs';
import path from 'node:path';

const runtimeRoot = path.resolve('packages/runtime');
const rootReadme = path.join(runtimeRoot, 'README.md');
const rootChineseReadme = path.join(runtimeRoot, 'README.zh.md');
const errors = [];
let checkedLinks = 0;

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(abs, visit);
    } else {
      visit(abs, entry.name);
    }
  }
}

function readTarget(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    const close = trimmed.indexOf('>');
    if (close > 0) return trimmed.slice(1, close);
  }
  return trimmed.split(/\s+/)[0] ?? '';
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function localLinks(text) {
  const links = [];
  let fenced = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    for (const match of line.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      links.push(readTarget(match[1]));
    }
  }
  return links;
}

function anchorIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/<a\s+id=["']([^"']+)["']\s*><\/a>/gi)) ids.add(match[1]);
  return ids;
}

function expectedRoute(absReadme, packageByDir) {
  const dir = path.dirname(absReadme);
  const pkg = packageByDir.get(path.resolve(dir));
  const family = path.relative(runtimeRoot, dir).split(path.sep)[0];
  if (pkg) return { family, anchor: `pkg-${slug(pkg.name)}` };
  const relativeDir = path.relative(path.join(runtimeRoot, family), dir);
  if (!relativeDir || relativeDir === '.') return { family, anchor: `family-${slug(family)}` };
  return { family, anchor: `doc-${slug(relativeDir.split(path.sep).join('/'))}` };
}

if (!fs.existsSync(rootReadme)) errors.push('missing packages/runtime/README.md');
if (!fs.existsSync(rootChineseReadme)) errors.push('missing packages/runtime/README.zh.md');

const packages = [];
const families = new Set();
walk(runtimeRoot, (abs, base) => {
  if (base !== 'package.json') return;
  const rel = path.relative(runtimeRoot, path.dirname(abs));
  const parts = rel.split(path.sep);
  if (!rel || parts.length > 2) return;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (error) {
    errors.push(`invalid package manifest ${path.relative(process.cwd(), abs)}: ${error.message}`);
    return;
  }
  if (!manifest.name) {
    errors.push(`package manifest has no name: ${path.relative(process.cwd(), abs)}`);
    return;
  }
  const family = parts[0];
  families.add(family);
  packages.push({ name: manifest.name, dir: path.dirname(abs), family });
});

const familyDirs = new Set(families);
for (const entry of fs.readdirSync(runtimeRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || ['node_modules', 'scripts'].includes(entry.name)) continue;
  const dir = path.join(runtimeRoot, entry.name);
  if (fs.existsSync(path.join(dir, 'README.md')) || fs.existsSync(path.join(dir, 'README.zh.md'))) familyDirs.add(entry.name);
}

const packageByDir = new Map(packages.map((pkg) => [path.resolve(pkg.dir), pkg]));
const packageReadmes = new Set();
for (const pkg of packages) {
  const readme = path.join(pkg.dir, 'README.md');
  packageReadmes.add(path.resolve(readme));
  if (!fs.existsSync(readme)) {
    errors.push(`missing package README: ${path.relative(process.cwd(), readme)}`);
    continue;
  }
  const text = fs.readFileSync(readme, 'utf8');
  const lines = text.trim().split(/\r?\n/);
  if (lines.length !== 1) errors.push(`package README must contain exactly one sentence: ${path.relative(process.cwd(), readme)}`);
  const route = expectedRoute(readme, packageByDir);
  const targetDoc = path.join(runtimeRoot, route.family, 'README.zh.md');
  if (!fs.existsSync(targetDoc)) {
    errors.push(`missing family documentation for ${pkg.name}: ${path.relative(process.cwd(), targetDoc)}`);
    continue;
  }
  const hrefMatch = text.match(/\]\(([^)]+)\)/);
  if (!hrefMatch) {
    errors.push(`package README has no family link: ${path.relative(process.cwd(), readme)}`);
    continue;
  }
  const href = readTarget(hrefMatch[1]);
  const hashAt = href.indexOf('#');
  const linkedPath = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const fragment = hashAt >= 0 ? href.slice(hashAt + 1) : '';
  const resolved = path.resolve(path.dirname(readme), safeDecode(linkedPath));
  if (resolved !== path.resolve(targetDoc)) errors.push(`package README points outside its family doc: ${path.relative(process.cwd(), readme)}`);
  if (fragment !== route.anchor) errors.push(`package README points to the wrong package section: ${path.relative(process.cwd(), readme)}`);
  const ids = anchorIds(fs.readFileSync(targetDoc, 'utf8'));
  if (!ids.has(route.anchor)) errors.push(`family doc is missing anchor #${route.anchor}: ${path.relative(process.cwd(), targetDoc)}`);
}

const readmes = [];
walk(runtimeRoot, (abs, base) => {
  if (base === 'README.md' && abs !== rootReadme) readmes.push(abs);
});
for (const family of familyDirs) {
  const doc = path.join(runtimeRoot, family, 'README.zh.md');
  if (!fs.existsSync(doc)) {
    errors.push(`missing family README.zh.md: ${path.relative(process.cwd(), doc)}`);
    continue;
  }
  const text = fs.readFileSync(doc, 'utf8');
  for (const heading of ['## 职责与边界', '## 包清单', '## API、扩展点与限制']) {
    if (!text.includes(heading)) errors.push(`family doc lacks “${heading}”: ${path.relative(process.cwd(), doc)}`);
  }
  for (const pkg of packages.filter((item) => item.family === family)) {
    const anchor = `pkg-${slug(pkg.name)}`;
    if (!anchorIds(text).has(anchor)) errors.push(`family doc missing package anchor #${anchor}: ${path.relative(process.cwd(), doc)}`);
  }
}

for (const readme of readmes) {
  const text = fs.readFileSync(readme, 'utf8');
  if (text.trim().split(/\r?\n/).length !== 1) {
    errors.push(`runtime README must be a one-line route to its family doc: ${path.relative(process.cwd(), readme)}`);
  }
  const route = expectedRoute(readme, packageByDir);
  const targetDoc = path.join(runtimeRoot, route.family, 'README.zh.md');
  const match = text.match(/\]\(([^)]+)\)/);
  if (!match) {
    errors.push(`runtime README has no family-document link: ${path.relative(process.cwd(), readme)}`);
    continue;
  }
  const href = readTarget(match[1]);
  const hashAt = href.indexOf('#');
  const linkedPath = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const fragment = hashAt >= 0 ? href.slice(hashAt + 1) : '';
  if (path.resolve(path.dirname(readme), safeDecode(linkedPath)) !== path.resolve(targetDoc)) {
    errors.push(`runtime README link does not resolve to its family doc: ${path.relative(process.cwd(), readme)}`);
  }
  if (fragment !== route.anchor) errors.push(`runtime README links to the wrong family section: ${path.relative(process.cwd(), readme)}`);
}

const markdownFiles = [rootReadme, rootChineseReadme, ...readmes];
for (const family of familyDirs) markdownFiles.push(path.join(runtimeRoot, family, 'README.zh.md'));
const uniqueMarkdownFiles = [...new Set(markdownFiles.filter((file) => fs.existsSync(file)))];

for (const markdownFile of uniqueMarkdownFiles) {
  const text = fs.readFileSync(markdownFile, 'utf8');
  for (const target of localLinks(text)) {
    if (!target || /^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(target)) continue;
    const hashAt = target.indexOf('#');
    const queryAt = target.indexOf('?');
    const pathEnd = [hashAt, queryAt].filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? target.length;
    const rawPath = target.slice(0, pathEnd);
    const fragment = hashAt >= 0 ? safeDecode(target.slice(hashAt + 1).split('?')[0]) : '';
    const targetPath = rawPath ? path.resolve(path.dirname(markdownFile), safeDecode(rawPath)) : path.resolve(markdownFile);
    checkedLinks += 1;
    if (!fs.existsSync(targetPath)) {
      errors.push(`broken local link in ${path.relative(process.cwd(), markdownFile)}: ${target}`);
      continue;
    }
    if (!fragment || !targetPath.startsWith(runtimeRoot) || !targetPath.endsWith('.md') || !fs.statSync(targetPath).isFile()) continue;
    const ids = anchorIds(fs.readFileSync(targetPath, 'utf8'));
    if (!ids.has(fragment)) errors.push(`broken local fragment in ${path.relative(process.cwd(), markdownFile)}: ${target}`);
  }
}

if (errors.length) {
  console.error(`check-runtime-package-docs: failed with ${errors.length} issue(s)`);
  for (const error of errors.slice(0, 160)) console.error(`- ${error}`);
  if (errors.length > 160) console.error(`- … and ${errors.length - 160} more`);
  process.exitCode = 1;
} else {
  console.log(`check-runtime-package-docs: ok (${packages.length} packages, ${familyDirs.size} family docs, ${readmes.length} README routes, ${checkedLinks} local links)`);
}
