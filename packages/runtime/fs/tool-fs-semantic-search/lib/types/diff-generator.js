export class DiffGenerator {
    /**
     * 生成优化的 diff，包含上下文行
     */
    static generateDiff(oldContent, newContent, contextLines = 3) {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        // 使用简单的 LCS 算法计算 diff
        const changes = this.computeChanges(oldLines, newLines);
        // 生成 hunks
        const hunks = this.groupIntoHunks(changes, contextLines);
        // 生成内联预览
        const preview = this.generateInlinePreview(changes, contextLines);
        return { hunks, preview };
    }
    /**
     * 应用 diff 补丁
     */
    static applyPatch(original, hunks) {
        const lines = original.split('\n');
        const result = [];
        let currentLine = 0;
        let bytesChanged = 0;
        let linesChanged = 0;
        for (const hunk of hunks) {
            // 复制到 hunk 开始之前的行
            while (currentLine < hunk.oldStart - 1) {
                result.push(lines[currentLine]);
                currentLine++;
            }
            // 应用 hunk 的更改
            for (const change of hunk.changes) {
                if (change.type === 'add') {
                    result.push(change.content);
                    bytesChanged += change.content.length;
                    linesChanged++;
                }
                else if (change.type === 'delete') {
                    currentLine++;
                    bytesChanged += change.content.length;
                    linesChanged++;
                }
                else {
                    result.push(change.content);
                    currentLine++;
                }
            }
        }
        // 复制剩余的行
        while (currentLine < lines.length) {
            result.push(lines[currentLine]);
            currentLine++;
        }
        return {
            success: true,
            file: '',
            bytesChanged,
            linesChanged,
            diff: {
                old: original,
                new: result.join('\n'),
                hunks
            }
        };
    }
    /**
     * 计算两个文本之间的变化
     */
    static computeChanges(oldLines, newLines) {
        const changes = [];
        // 简单的逐行比较（生产环境应使用更高效的算法如 Myers diff）
        const lcs = this.longestCommonSubsequence(oldLines, newLines);
        let i = 0;
        let j = 0;
        let lcsIndex = 0;
        while (i < oldLines.length || j < newLines.length) {
            if (lcsIndex < lcs.length) {
                const [lcsOldIdx, lcsNewIdx] = lcs[lcsIndex];
                // 处理删除
                while (i < lcsOldIdx) {
                    changes.push({
                        type: 'delete',
                        line: oldLines[i],
                        oldIndex: i,
                        newIndex: -1
                    });
                    i++;
                }
                // 处理添加
                while (j < lcsNewIdx) {
                    changes.push({
                        type: 'add',
                        line: newLines[j],
                        oldIndex: -1,
                        newIndex: j
                    });
                    j++;
                }
                // 处理匹配行
                changes.push({
                    type: 'context',
                    line: oldLines[i],
                    oldIndex: i,
                    newIndex: j
                });
                i++;
                j++;
                lcsIndex++;
            }
            else {
                // LCS 结束后的剩余行
                if (i < oldLines.length) {
                    changes.push({
                        type: 'delete',
                        line: oldLines[i],
                        oldIndex: i,
                        newIndex: -1
                    });
                    i++;
                }
                if (j < newLines.length) {
                    changes.push({
                        type: 'add',
                        line: newLines[j],
                        oldIndex: -1,
                        newIndex: j
                    });
                    j++;
                }
            }
        }
        return changes;
    }
    /**
     * 最长公共子序列（用于 diff 计算）
     */
    static longestCommonSubsequence(a, b) {
        const m = a.length;
        const n = b.length;
        const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
        // 构建 DP 表
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                }
                else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        // 回溯找到 LCS
        const lcs = [];
        let i = m;
        let j = n;
        while (i > 0 && j > 0) {
            if (a[i - 1] === b[j - 1]) {
                lcs.unshift([i - 1, j - 1]);
                i--;
                j--;
            }
            else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            }
            else {
                j--;
            }
        }
        return lcs;
    }
    /**
     * 将变化分组为 hunks
     */
    static groupIntoHunks(changes, contextLines) {
        const hunks = [];
        let currentHunk = null;
        let contextCount = 0;
        for (let i = 0; i < changes.length; i++) {
            const change = changes[i];
            if (change.type === 'context') {
                if (currentHunk) {
                    // 在 hunk 内部的上下文
                    contextCount++;
                    if (contextCount > contextLines * 2) {
                        // 上下文太长，结束当前 hunk
                        // 保留前 contextLines 行
                        const trimmedChanges = currentHunk.changes.slice(0, -contextCount + contextLines);
                        currentHunk.changes = trimmedChanges;
                        currentHunk.oldLines = trimmedChanges.filter(c => c.type !== 'add').length;
                        currentHunk.newLines = trimmedChanges.filter(c => c.type !== 'delete').length;
                        hunks.push(currentHunk);
                        currentHunk = null;
                        contextCount = 0;
                    }
                    else {
                        currentHunk.changes.push({
                            type: 'context',
                            content: change.line,
                            lineNumber: change.oldIndex + 1
                        });
                        currentHunk.oldLines++;
                        currentHunk.newLines++;
                    }
                }
            }
            else {
                // 开始或继续 hunk
                if (!currentHunk) {
                    // 添加前面的上下文行
                    const startContext = Math.max(0, i - contextLines);
                    currentHunk = {
                        oldStart: changes[startContext].oldIndex >= 0 ? changes[startContext].oldIndex + 1 : 1,
                        oldLines: 0,
                        newStart: changes[startContext].newIndex >= 0 ? changes[startContext].newIndex + 1 : 1,
                        newLines: 0,
                        changes: []
                    };
                    for (let j = startContext; j < i; j++) {
                        if (changes[j].type === 'context') {
                            currentHunk.changes.push({
                                type: 'context',
                                content: changes[j].line,
                                lineNumber: changes[j].oldIndex + 1
                            });
                            currentHunk.oldLines++;
                            currentHunk.newLines++;
                        }
                    }
                }
                contextCount = 0;
                if (change.type === 'add') {
                    currentHunk.changes.push({
                        type: 'add',
                        content: change.line,
                        lineNumber: change.newIndex + 1
                    });
                    currentHunk.newLines++;
                }
                else {
                    currentHunk.changes.push({
                        type: 'delete',
                        content: change.line,
                        lineNumber: change.oldIndex + 1
                    });
                    currentHunk.oldLines++;
                }
            }
        }
        if (currentHunk) {
            hunks.push(currentHunk);
        }
        return hunks;
    }
    /**
     * 生成内联预览
     */
    static generateInlinePreview(changes, contextLines) {
        // 找到第一个变化
        const firstChangeIndex = changes.findIndex(c => c.type !== 'context');
        if (firstChangeIndex === -1) {
            return {
                context_before: [],
                old_content: [],
                new_content: [],
                context_after: []
            };
        }
        // 找到最后一个变化
        let lastChangeIndex = changes.length - 1;
        while (lastChangeIndex >= 0 && changes[lastChangeIndex].type === 'context') {
            lastChangeIndex--;
        }
        // 提取上下文和变化
        const contextBefore = changes
            .slice(Math.max(0, firstChangeIndex - contextLines), firstChangeIndex)
            .map(c => c.line);
        const changedRegion = changes.slice(firstChangeIndex, lastChangeIndex + 1);
        const oldContent = changedRegion.filter(c => c.type !== 'add').map(c => c.line);
        const newContent = changedRegion.filter(c => c.type !== 'delete').map(c => c.line);
        const contextAfter = changes
            .slice(lastChangeIndex + 1, Math.min(changes.length, lastChangeIndex + 1 + contextLines))
            .map(c => c.line);
        return {
            context_before: contextBefore,
            old_content: oldContent,
            new_content: newContent,
            context_after: contextAfter
        };
    }
    /**
     * 格式化 diff 为 unified diff 格式
     */
    static formatUnifiedDiff(oldFile, newFile, hunks) {
        const lines = [];
        lines.push(`--- ${oldFile}`);
        lines.push(`+++ ${newFile}`);
        for (const hunk of hunks) {
            lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
            for (const change of hunk.changes) {
                const prefix = change.type === 'add' ? '+' : change.type === 'delete' ? '-' : ' ';
                lines.push(`${prefix}${change.content}`);
            }
        }
        return lines.join('\n');
    }
}
//# sourceMappingURL=diff-generator.js.map