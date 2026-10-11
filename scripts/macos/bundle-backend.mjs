import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// build-app.sh copies this directory to Contents/Resources/backend.
const requestedStageDir = process.env.TASKWEAVER_STAGE_DIR;
const stageDir = path.resolve(requestedStageDir || path.join(rootDir, 'apps/macos/build/stage/backend'));
const appDir = path.join(stageDir, 'app');
const embeddedNode = path.resolve(process.env.TASKWEAVER_NODE_PATH || path.join(rootDir, 'apps/macos/build/node/bin/node'));
const runtimeSrc = path.resolve(process.env.TASKWEAVER_RUNTIME_DIR || path.join(rootDir, 'vendor/taskweaver-z-runtime'));

if (requestedStageDir) {
  const matchesPackageStage = (parentDir) => {
    const relative = path.relative(parentDir, stageDir);
    const segments = relative.split(path.sep);
    return !relative.startsWith('..') && !path.isAbsolute(relative)
      && /^taskweaver-macos-package\.[A-Za-z0-9]+$/.test(segments[0] || '')
      && segments.length === 3 && segments[1] === 'stage' && segments[2] === 'backend';
  };
  const workspaceBuildDir = path.join(rootDir, 'apps/macos/build');
  if (!matchesPackageStage(os.tmpdir()) && !matchesPackageStage(workspaceBuildDir)) {
    throw new Error(`TASKWEAVER_STAGE_DIR must be stage/backend inside a dedicated taskweaver-macos-package.* directory under ${os.tmpdir()} or ${workspaceBuildDir}`);
  }
}

console.log('📦 Starting backend bundling...');

if (!fs.existsSync(embeddedNode)) {
  console.error(`❌ Embedded node not found at: ${embeddedNode}. Run scripts/macos/fetch-node.sh first.`);
  process.exit(1);
}

function assertRuntimeDeployTree(runtimeRoot) {
  const entryCandidates = [
    path.join(runtimeRoot, 'lib/entry.js'),
    path.join(runtimeRoot, 'lib/bin.js'),
  ];
  if (!entryCandidates.some((entry) => fs.existsSync(entry))) {
    throw new Error(`Z runtime deploy tree is missing lib/entry.js and lib/bin.js: ${runtimeRoot}`);
  }
  if (!fs.existsSync(path.join(runtimeRoot, 'runtime-packages'))
    && !fs.existsSync(path.join(runtimeRoot, 'node_modules'))) {
    throw new Error(`Z runtime deploy tree is missing runtime-packages: ${runtimeRoot}`);
  }
}

try {
  assertRuntimeDeployTree(runtimeSrc);
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}

// Ensure clean stage directory
if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(appDir, { recursive: true });

// Canonical bundle layout:
// Resources/backend/node
// Resources/backend/app/{backend,contract,node_modules,...}
// Resources/backend/runtime
const targetNode = path.join(stageDir, 'node');
fs.copyFileSync(embeddedNode, targetNode);
fs.chmodSync(targetNode, 0o755);
console.log(`✅ Embedded node placed at: ${targetNode}`);

const copyItems = [
  { src: 'backend', dest: 'backend', appRelative: true },
  { src: 'contract', dest: 'contract', appRelative: true },
  { src: 'registry', dest: 'registry', appRelative: true },
  { src: 'pricing', dest: 'pricing', appRelative: true },
  { src: 'runtime-lock.json', dest: 'runtime-lock.json', appRelative: true },
  { src: 'vendor/opencodex', dest: 'vendor/opencodex', appRelative: true },
  { src: 'package.json', dest: 'package.json', appRelative: true },
  { src: 'pnpm-lock.yaml', dest: 'pnpm-lock.yaml', appRelative: true },
  { src: 'pnpm-workspace.yaml', dest: 'pnpm-workspace.yaml', appRelative: true },
];

for (const item of copyItems) {
  const srcPath = path.join(rootDir, item.src);
  const parent = item.appRelative ? appDir : stageDir;
  const destPath = path.join(parent, item.dest);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Required backend bundle input is missing: ${srcPath}`);
  }
  const stat = fs.statSync(srcPath);
  if (stat.isDirectory()) {
    fs.cpSync(srcPath, destPath, {
      recursive: true,
      dereference: true,
      filter: (src) => {
        const basename = path.basename(src);
        if (basename === '.git' || basename === '.DS_Store') return false;
        if (basename.endsWith('.map') || basename.endsWith('.test.mjs') || basename.endsWith('.spec.mjs')) return false;
        return true;
      },
    });
  } else {
    fs.copyFileSync(srcPath, destPath);
  }
  console.log(`  - Copied ${item.src} -> ${path.relative(stageDir, destPath)}`);
}

// Reuse the already-built deployment tree. The source package is not a runnable
// Host and copying packages/runtime here would omit the deployed lib entry and
// runtime dependency layout.
const runtimeDest = path.join(stageDir, 'runtime');
fs.cpSync(runtimeSrc, runtimeDest, {
  recursive: true,
  dereference: true,
  filter: (src) => {
    const basename = path.basename(src);
    if (basename === '.git' || basename === '.DS_Store') return false;
    if (basename.endsWith('.map') || basename.endsWith('.test.mjs') || basename.endsWith('.spec.mjs')) return false;
    return true;
  },
});
assertRuntimeDeployTree(runtimeDest);
console.log(`  - Copied ${path.relative(rootDir, runtimeSrc)} -> ${path.relative(stageDir, runtimeDest)}`);

// Copy the production dependencies already provisioned for the app into the
// app subtree so Node's normal upward ESM resolution finds them from backend/.
const nodeModulesSrc = path.join(rootDir, 'node_modules');
if (fs.existsSync(nodeModulesSrc)) {
  const nodeModulesDest = path.join(appDir, 'node_modules');
  console.log('  - Linking or copying critical node_modules...');
  const criticalModules = ['undici', 'ws', 'dotenv', 'koffi', 'node-pty', 'tree-sitter'];
  fs.mkdirSync(nodeModulesDest, { recursive: true });
  for (const mod of criticalModules) {
    const modSrc = path.join(nodeModulesSrc, mod);
    if (!fs.existsSync(modSrc)) continue;
    try {
      fs.cpSync(modSrc, path.join(nodeModulesDest, mod), { recursive: true, dereference: true });
    } catch (error) {
      console.warn(`    ⚠️ Warning copying ${mod}:`, error.message);
    }
  }
}

// Verify the executable itself without launching the backend or mutating runtime data.
console.log('🔍 Verifying embedded node execution...');
try {
  const out = execFileSync(targetNode, ['-e', "console.log('Embedded node verified successfully: ' + process.version)"], {
    encoding: 'utf8',
  });
  console.log(`  ${out.trim()}`);
} catch (error) {
  console.error('❌ Failed to run embedded node:', error.message);
  process.exit(1);
}

function getDirSize(dirPath) {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) size += getDirSize(full);
    else if (entry.isFile()) size += fs.statSync(full).size;
  }
  return size;
}

function cleanBrokenSymlinks(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      try {
        fs.statSync(full);
      } catch {
        try { fs.unlinkSync(full); } catch {}
      }
    } else if (entry.isDirectory()) cleanBrokenSymlinks(full);
  }
}

cleanBrokenSymlinks(stageDir);
const totalMB = (getDirSize(stageDir) / (1024 * 1024)).toFixed(2);
console.log(`🎉 Backend bundled into stage directory: ${stageDir} (${totalMB} MB)`);
