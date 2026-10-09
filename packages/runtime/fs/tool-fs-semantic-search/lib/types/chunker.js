export class CodeChunker {
    async chunk(file, content, language) {
        const chunks = [];
        // 根据语言选择不同的分块策略
        switch (language) {
            case 'typescript':
            case 'javascript':
                chunks.push(...this.chunkJavaScript(file, content));
                break;
            case 'python':
                chunks.push(...this.chunkPython(file, content));
                break;
            default:
                // 通用分块：按函数和类
                chunks.push(...this.chunkGeneric(file, content, language));
        }
        return chunks;
    }
    chunkJavaScript(file, content) {
        const chunks = [];
        const lines = content.split('\n');
        // 简单的正则匹配（生产环境应该使用 Tree-sitter）
        const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/;
        const classRegex = /^(?:export\s+)?class\s+(\w+)/;
        const methodRegex = /^\s+(?:async\s+)?(\w+)\s*\(/;
        const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)/;
        let currentClass = null;
        let blockStart = -1;
        let blockType = 'function';
        let blockName = '';
        let braceCount = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // 检测函数
            const funcMatch = line.match(functionRegex);
            if (funcMatch && blockStart === -1) {
                blockStart = i;
                blockType = 'function';
                blockName = funcMatch[1];
                braceCount = 0;
            }
            // 检测类
            const classMatch = line.match(classRegex);
            if (classMatch && blockStart === -1) {
                blockStart = i;
                blockType = 'class';
                blockName = classMatch[1];
                currentClass = classMatch[1];
                braceCount = 0;
            }
            // 检测接口
            const interfaceMatch = line.match(interfaceRegex);
            if (interfaceMatch && blockStart === -1) {
                blockStart = i;
                blockType = 'interface';
                blockName = interfaceMatch[1];
                braceCount = 0;
            }
            // 检测方法（在类内部）
            if (currentClass && line.match(methodRegex) && blockStart === -1) {
                const methodMatch = line.match(methodRegex);
                if (methodMatch) {
                    blockStart = i;
                    blockType = 'method';
                    blockName = `${currentClass}.${methodMatch[1]}`;
                    braceCount = 0;
                }
            }
            // 统计大括号
            if (blockStart !== -1) {
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;
                // 块结束
                if (braceCount === 0 && line.includes('}')) {
                    const blockContent = lines.slice(blockStart, i + 1).join('\n');
                    const comments = this.extractComments(lines, blockStart);
                    chunks.push({
                        id: `${file}:${blockName}:${blockStart + 1}`,
                        file,
                        language: 'typescript',
                        type: blockType,
                        name: blockName,
                        content: blockContent,
                        startLine: blockStart + 1,
                        endLine: i + 1,
                        metadata: {
                            comments,
                            imports: this.extractImports(content)
                        }
                    });
                    blockStart = -1;
                    if (blockType !== 'class') {
                        currentClass = null;
                    }
                }
            }
        }
        return chunks;
    }
    chunkPython(file, content) {
        const chunks = [];
        const lines = content.split('\n');
        const functionRegex = /^def\s+(\w+)/;
        const classRegex = /^class\s+(\w+)/;
        const methodRegex = /^\s+def\s+(\w+)/;
        let currentClass = null;
        let blockStart = -1;
        let blockType = 'function';
        let blockName = '';
        let blockIndent = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const indent = line.search(/\S/);
            // 检测函数
            const funcMatch = line.match(functionRegex);
            if (funcMatch && blockStart === -1) {
                blockStart = i;
                blockType = 'function';
                blockName = funcMatch[1];
                blockIndent = indent;
            }
            // 检测类
            const classMatch = line.match(classRegex);
            if (classMatch && blockStart === -1) {
                blockStart = i;
                blockType = 'class';
                blockName = classMatch[1];
                currentClass = classMatch[1];
                blockIndent = indent;
            }
            // 检测方法
            if (currentClass && line.match(methodRegex) && blockStart === -1) {
                const methodMatch = line.match(methodRegex);
                if (methodMatch) {
                    blockStart = i;
                    blockType = 'method';
                    blockName = `${currentClass}.${methodMatch[1]}`;
                    blockIndent = indent;
                }
            }
            // 检测块结束（缩进回退）
            if (blockStart !== -1 && i > blockStart) {
                if (line.trim() && indent <= blockIndent) {
                    const blockContent = lines.slice(blockStart, i).join('\n');
                    const comments = this.extractComments(lines, blockStart);
                    chunks.push({
                        id: `${file}:${blockName}:${blockStart + 1}`,
                        file,
                        language: 'python',
                        type: blockType,
                        name: blockName,
                        content: blockContent,
                        startLine: blockStart + 1,
                        endLine: i,
                        metadata: {
                            comments
                        }
                    });
                    blockStart = -1;
                    if (blockType !== 'class') {
                        currentClass = null;
                    }
                }
            }
        }
        // 处理最后一个块
        if (blockStart !== -1) {
            const blockContent = lines.slice(blockStart).join('\n');
            const comments = this.extractComments(lines, blockStart);
            chunks.push({
                id: `${file}:${blockName}:${blockStart + 1}`,
                file,
                language: 'python',
                type: blockType,
                name: blockName,
                content: blockContent,
                startLine: blockStart + 1,
                endLine: lines.length,
                metadata: {
                    comments
                }
            });
        }
        return chunks;
    }
    chunkGeneric(file, content, language) {
        // 通用分块策略：按空行分割
        const chunks = [];
        const lines = content.split('\n');
        let blockStart = 0;
        let blockLines = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === '') {
                if (blockLines.length > 5) { // 只保留足够大的块
                    const blockContent = blockLines.join('\n');
                    const firstLine = blockLines[0].trim();
                    const name = firstLine.slice(0, 50); // 使用第一行作为名称
                    chunks.push({
                        id: `${file}:${name}:${blockStart + 1}`,
                        file,
                        language,
                        type: 'block',
                        name,
                        content: blockContent,
                        startLine: blockStart + 1,
                        endLine: i,
                        metadata: {}
                    });
                }
                blockStart = i + 1;
                blockLines = [];
            }
            else {
                blockLines.push(line);
            }
        }
        // 处理最后一个块
        if (blockLines.length > 5) {
            const blockContent = blockLines.join('\n');
            const firstLine = blockLines[0].trim();
            const name = firstLine.slice(0, 50);
            chunks.push({
                id: `${file}:${name}:${blockStart + 1}`,
                file,
                language,
                type: 'block',
                name,
                content: blockContent,
                startLine: blockStart + 1,
                endLine: lines.length,
                metadata: {}
            });
        }
        return chunks;
    }
    extractComments(lines, beforeLine) {
        const comments = [];
        // 向前查找注释
        for (let i = beforeLine - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('//') || line.startsWith('#')) {
                comments.unshift(line);
            }
            else if (line.startsWith('/*') || line.startsWith('"""')) {
                // 多行注释
                comments.unshift(line);
                for (let j = i - 1; j >= 0; j--) {
                    comments.unshift(lines[j].trim());
                    if (lines[j].trim().endsWith('*/') || lines[j].trim().endsWith('"""')) {
                        break;
                    }
                }
                break;
            }
            else if (line !== '') {
                break;
            }
        }
        return comments.join('\n');
    }
    extractImports(content) {
        const imports = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('import ') || line.trim().startsWith('from ')) {
                imports.push(line.trim());
            }
        }
        return imports;
    }
}
//# sourceMappingURL=chunker.js.map