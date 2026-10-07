#!/bin/bash
# 快速启动 TaskWeaver 并显示测试提示

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 启动 TaskWeaver（带工具缓存）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

APP_PATH="/Users/zsn/Documents/毕设/release/mac-arm64/TaskWeaver.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ 应用不存在: $APP_PATH"
    exit 1
fi

echo "✅ 启动应用..."
open "$APP_PATH"

sleep 2

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 测试提示词（复制粘贴到应用中）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "【测试 1：基础缓存命中】"
echo "请帮我做以下操作：1. 读取 package.json 文件 2. 分析其中的依赖关系 3. 再读一遍 package.json 确认版本信息"
echo
echo "预期：第 3 步会命中缓存，瞬间返回 ⚡️"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "【测试 2：搜索去重】"
echo "帮我搜索项目中所有包含 React 的文件，然后再搜一次确认没有遗漏"
echo
echo "预期：第 2 次搜索会命中缓存，秒级响应 ⚡️"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "📚 完整文档："
echo "   /Users/zsn/Documents/毕设/docs/IMPLEMENTATION-COMPLETE.md"
echo
echo "🎯 观察要点："
echo "   • 首次工具调用：正常耗时"
echo "   • 重复工具调用：<10ms 瞬时返回"
echo "   • 缓存命中时工具结果前会有 [cached] 标记"
echo
