import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'

const SHA256_HEX = /^[0-9a-f]{64}$/

/**
 * Decide whether a tool-created file can be removed as its revert. Only an
 * unchanged regular file qualifies; a missing file is an already-completed
 * revert, and anything else is refused rather than deleted.
 */
export async function inspectCreatedFileForRevert(realPath, expectedSha256) {
  if (typeof expectedSha256 !== 'string' || !SHA256_HEX.test(expectedSha256)) {
    throw new TypeError('新建文件的内容指纹无效')
  }
  let stat
  try {
    stat = await fs.lstat(realPath)
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing'
    throw error
  }
  if (!stat.isFile()) throw new Error('目标已不是普通文件，无法安全删除；请先检查该路径')
  const actual = createHash('sha256').update(await fs.readFile(realPath)).digest('hex')
  if (actual !== expectedSha256) {
    throw new Error('新建文件在创建后已被修改，无法安全还原；请先检查文件内容')
  }
  return 'unchanged'
}

function countMatches(text, needle) {
  if (!needle) return 0
  let count = 0
  let offset = 0
  while (true) {
    const index = text.indexOf(needle, offset)
    if (index < 0) return count
    count += 1
    offset = index + 1
  }
}

/** Apply contextual reverse edits only when each target is unique and intact. */
export function applyReverseDiffEdits(currentContent, reverseEdits) {
  if (typeof currentContent !== 'string') throw new TypeError('文件内容必须是文本')
  if (!Array.isArray(reverseEdits) || reverseEdits.length === 0) {
    throw new TypeError('缺少有效的撤销变更块')
  }

  let content = currentContent
  let reverted = 0
  let alreadyReverted = 0
  for (const edit of reverseEdits) {
    if (!edit || typeof edit.oldText !== 'string'
      || typeof edit.newText !== 'string' || edit.oldText === edit.newText) {
      throw new TypeError('撤销变更块格式无效')
    }

    if (edit.oldText === '') {
      if (reverseEdits.length !== 1) {
        throw new Error('空文件撤销只能单独执行，无法安全定位变更块')
      }
      if (content === edit.newText) {
        alreadyReverted += 1
        continue
      }
      if (content !== '') {
        throw new Error('文件内容已变化，无法安全撤销此变更块；请刷新 Diff 后重试')
      }
      content = edit.newText
      reverted += 1
      continue
    }

    const targetCount = countMatches(content, edit.oldText)
    if (targetCount === 1) {
      const index = content.indexOf(edit.oldText)
      content = `${content.slice(0, index)}${edit.newText}${content.slice(index + edit.oldText.length)}`
      reverted += 1
      continue
    }
    if (targetCount > 1) {
      throw new Error('撤销目标在文件中出现多次，无法安全判断位置；请先检查文件内容')
    }

    // A prior hunk action or a refreshed card may retry an already completed
    // reversal. Treat the exact unique pre-change context as idempotent.
    if ((edit.newText && countMatches(content, edit.newText) === 1)
      || (edit.newText === '' && content === '')) {
      alreadyReverted += 1
      continue
    }
    throw new Error('文件内容已变化，无法安全撤销此变更块；请刷新 Diff 后重试')
  }

  return { content, reverted, alreadyReverted, changed: reverted > 0 }
}
