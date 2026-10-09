import type { DiffHunk, EditResult, InlinePreview } from './types';
export declare class DiffGenerator {
    /**
     * 生成优化的 diff，包含上下文行
     */
    static generateDiff(oldContent: string, newContent: string, contextLines?: number): {
        hunks: DiffHunk[];
        preview: InlinePreview;
    };
    /**
     * 应用 diff 补丁
     */
    static applyPatch(original: string, hunks: DiffHunk[]): EditResult;
    /**
     * 计算两个文本之间的变化
     */
    private static computeChanges;
    /**
     * 最长公共子序列（用于 diff 计算）
     */
    private static longestCommonSubsequence;
    /**
     * 将变化分组为 hunks
     */
    private static groupIntoHunks;
    /**
     * 生成内联预览
     */
    private static generateInlinePreview;
    /**
     * 格式化 diff 为 unified diff 格式
     */
    static formatUnifiedDiff(oldFile: string, newFile: string, hunks: DiffHunk[]): string;
}
//# sourceMappingURL=diff-generator.d.ts.map