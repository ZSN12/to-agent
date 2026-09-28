import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  isPathInside,
  resolveThroughSymlinks,
  assertSafeWorkspacePath,
} from '../electron/backend/security-path.mjs'

async function runTests() {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-sec-path-'))

  try {
    const ws = path.join(testRoot, 'workspace')
    const wsEvil = path.join(testRoot, 'workspace-evil')
    const outside = path.join(testRoot, 'outside')
    await fs.mkdir(ws, { recursive: true })
    await fs.mkdir(wsEvil, { recursive: true })
    await fs.mkdir(outside, { recursive: true })

    // 1. isPathInside 纯词法判定与相邻前缀攻击测试
    assert.equal(isPathInside(ws, path.join(ws, 'a', 'b.txt')), true, '合法子路径应返回 true')
    assert.equal(isPathInside(ws, ws), true, '根目录自身应返回 true')
    assert.equal(isPathInside(ws, wsEvil), false, '必须拦截相邻前缀目录 /workspace-evil')
    assert.equal(isPathInside(ws, path.join(wsEvil, 'payload.js')), false, '必须拦截相邻前缀目录下的文件')
    assert.equal(isPathInside(ws, path.join(ws, '..', 'workspace-evil')), false, '必须拦截 .. 相对段逃逸')
    assert.equal(isPathInside(ws, path.join(ws, 'sub', '..', '..', 'outside')), false, '多重 .. 逃逸必须被拦截')

    // 2. 真实文件与符号链接构造
    const outsideSecret = path.join(outside, 'secret.txt')
    await fs.writeFile(outsideSecret, 'super-secret-data')
    await fs.symlink(outsideSecret, path.join(ws, 'symlink-file.txt'))
    await fs.symlink(outside, path.join(ws, 'symlink-dir'))

    const insideFile = path.join(ws, 'hello.txt')
    await fs.writeFile(insideFile, 'hello inside')

    // 3. 合法路径访问（mustExist = true 与 false）
    const safeRes = await assertSafeWorkspacePath(ws, 'hello.txt', { mustExist: true })
    assert.equal(safeRes.relativePath, 'hello.txt', '相对路径应正确计算')
    assert.equal(safeRes.isDirectory, false, '应正确识别文件类型')

    const safeNonExist = await assertSafeWorkspacePath(ws, 'subdir/new-file.txt', { mustExist: false })
    assert.equal(safeNonExist.relativePath, 'subdir/new-file.txt')

    // 4. 相邻前缀绝对路径绕过拦截
    await assert.rejects(
      () => assertSafeWorkspacePath(ws, path.join(wsEvil, 'file.txt')),
      /词法越界/,
      '必须阻断相邻前缀绝对路径'
    )

    // 5. 符号链接穿透拦截（指向外部现有文件，mustExist = true）
    await assert.rejects(
      () => assertSafeWorkspacePath(ws, 'symlink-file.txt', { mustExist: true }),
      /符号链接/,
      '必须阻断符号链接穿透已存在文件'
    )

    // 6. 符号链接父级穿透拦截（指向外部未存在文件，mustExist = false）
    await assert.rejects(
      () => assertSafeWorkspacePath(ws, 'symlink-dir/new-file.txt', { mustExist: false }),
      /逃逸至工作区范围外/,
      '必须阻断通过软链接目录新建或修改外部文件'
    )

    // 7. 空字节防御
    await assert.rejects(
      () => assertSafeWorkspacePath(ws, 'hello.txt\0.js'),
      /非法字符/,
      '必须拦截包含空字节的恶意路径'
    )

    // 8. 必须存在检查（目标不存在时抛出正确异常）
    await assert.rejects(
      () => assertSafeWorkspacePath(ws, 'not-found.txt', { mustExist: true }),
      /目标文件不存在/,
      'mustExist: true 下未找到文件应明确报错'
    )

    console.log('✓ 安全路径工具库 (security-path.mjs) 所有安全测试用例通过！')
  } finally {
    await fs.rm(testRoot, { recursive: true, force: true }).catch(() => {})
  }
}

runTests().catch((err) => {
  console.error('测试失败:', err)
  process.exit(1)
})
