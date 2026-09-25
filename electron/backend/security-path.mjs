import path from 'node:path'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'

/**
 * 严格判断 target 是否位于 root 目录内部（或等于 root）
 * 基于 path.relative 彻底杜绝 startsWith 产生的相邻目录前缀碰撞（如 /dir 与 /dir-evil）
 * @param {string} root 根目录绝对路径
 * @param {string} target 目标路径绝对路径
 * @returns {boolean}
 */
export function isPathInside(root, target) {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  const relative = path.relative(resolvedRoot, resolvedTarget)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

/**
 * 递归解析真实路径：即便末尾若干层文件/目录尚未创建，也能解析出其已存在父级的物理真实路径
 * 防止中间存在指向工作区外的软链接目录
 * @param {string} targetPath 待解析的绝对路径
 * @returns {Promise<string>} 解析后的物理真实路径
 */
export async function resolveThroughSymlinks(targetPath) {
  const resolved = path.resolve(targetPath)
  let cursor = resolved
  const suffix = []

  while (true) {
    try {
      const real = await fs.realpath(cursor)
      return path.join(real, ...suffix.reverse())
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
      const parent = path.dirname(cursor)
      if (parent === cursor) return resolved
      suffix.push(path.basename(cursor))
      cursor = parent
    }
  }
}

/**
 * 同步版本的 resolveThroughSymlinks
 * @param {string} targetPath
 * @returns {string}
 */
export function resolveThroughSymlinksSync(targetPath) {
  const resolved = path.resolve(targetPath)
  let cursor = resolved
  const suffix = []

  while (true) {
    try {
      const real = fsSync.realpathSync(cursor)
      return path.join(real, ...suffix.reverse())
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'ENOTDIR') throw error
      const parent = path.dirname(cursor)
      if (parent === cursor) return resolved
      suffix.push(path.basename(cursor))
      cursor = parent
    }
  }
}

/**
 * 针对工作区路径的安全解析与约束校验
 * 防御：
 * 1. 相对路径 '..' 穿越
 * 2. 绝对路径与工作区同前缀兄弟目录混淆碰撞 (/ws vs /ws-other)
 * 3. 符号链接指向外部敏感文件 (symlink -> /etc/passwd)
 * 4. 软链接目录逃逸 (symlink_dir/new_file.txt)
 * 5. 空字节字符截断注入 (\0)
 *
 * @param {string} workspaceRoot 工作区根目录
 * @param {string} candidatePath 待解析的相对或绝对路径
 * @param {object} [options]
 * @param {boolean} [options.mustExist=false] 是否要求文件必须已存在
 * @returns {Promise<{ absolutePath: string, relativePath: string, realPath: string, isDirectory?: boolean }>}
 */
export async function assertSafeWorkspacePath(workspaceRoot, candidatePath, { mustExist = false } = {}) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('工作区根路径无效')
  }
  if (!candidatePath || typeof candidatePath !== 'string' || !candidatePath.trim()) {
    throw new Error('待校验路径无效')
  }
  if (candidatePath.includes('\0')) {
    throw new Error('路径包含非法字符（空字节）')
  }

  // 1. 获取工作区的物理真实路径
  let realRoot
  try {
    realRoot = await fs.realpath(path.resolve(workspaceRoot))
  } catch {
    throw new Error(`工作区目录不存在或无法访问：${workspaceRoot}`)
  }

  // 2. 词法级别预解析并检验
  const lexicalTarget = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(realRoot, candidatePath)

  if (!isPathInside(realRoot, lexicalTarget)) {
    throw new Error('禁止访问工作区范围外的路径（词法越界）')
  }

  // 3. 物理符号链接解析与越界检验
  if (mustExist) {
    let stat
    try {
      stat = await fs.stat(lexicalTarget)
    } catch {
      throw new Error(`目标文件不存在：${candidatePath}`)
    }
    const realTarget = await fs.realpath(lexicalTarget)
    if (!isPathInside(realRoot, realTarget)) {
      throw new Error('禁止通过符号链接访问工作区范围外的路径')
    }
    return {
      absolutePath: lexicalTarget,
      realPath: realTarget,
      relativePath: path.relative(realRoot, realTarget).split(path.sep).join('/'),
      isDirectory: stat.isDirectory(),
    }
  }

  // 文件可能尚不存在（如回退新建或删除操作），向上逐级解析符号链接
  const realTarget = await resolveThroughSymlinks(lexicalTarget)
  if (!isPathInside(realRoot, realTarget)) {
    throw new Error('禁止通过符号链接或上级路径逃逸至工作区范围外')
  }

  return {
    absolutePath: lexicalTarget,
    realPath: realTarget,
    relativePath: path.relative(realRoot, realTarget).split(path.sep).join('/'),
  }
}
