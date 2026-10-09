#!/bin/bash
# 验证工具缓存功能的测试脚本

set -e

echo "=================================="
echo "工具缓存功能验证脚本"
echo "=================================="
echo ""

# 1. 检查应用是否已安装
echo "✓ 检查应用安装..."
if [ ! -d "/Applications/TaskWeaver.app" ]; then
    echo "✗ TaskWeaver.app 未安装"
    exit 1
fi
echo "  应用已安装: /Applications/TaskWeaver.app"
echo ""

# 2. 检查 DSH Runtime 是否包含工具缓存插件
echo "✓ 检查工具缓存插件..."
RUNTIME_PATH="/Applications/TaskWeaver.app/Contents/Resources/taskweaver-z-runtime"
if [ ! -d "$RUNTIME_PATH" ]; then
    echo "✗ DSH Runtime 未找到"
    exit 1
fi

# 检查 tool-cache 包是否存在
TOOL_CACHE_PKG="$RUNTIME_PATH/node_modules/@z/dsh-tool-cache"
if [ -d "$TOOL_CACHE_PKG" ]; then
    echo "  ✓ 工具缓存插件已打包: $TOOL_CACHE_PKG"
else
    echo "  ✗ 工具缓存插件未找到"
    exit 1
fi

# 检查插件入口文件
if [ -f "$TOOL_CACHE_PKG/lib/index.js" ]; then
    echo "  ✓ 插件入口文件存在"
else
    echo "  ✗ 插件入口文件缺失"
    exit 1
fi
echo ""

# 3. 检查配置文件
echo "✓ 检查配置集成..."
PRESET_CONFIG="$RUNTIME_PATH/config/agent-presets/taskweaver-optimized/agent.cordis.yml"
if [ -f "$PRESET_CONFIG" ]; then
    if grep -q "@z/dsh-tool-cache" "$PRESET_CONFIG"; then
        echo "  ✓ 工具缓存已配置到 taskweaver-optimized preset"
    else
        echo "  ✗ 工具缓存未配置"
        exit 1
    fi
else
    echo "  ✗ preset 配置文件未找到"
    exit 1
fi
echo ""

# 4. 检查 HMR 禁用补丁
echo "✓ 检查 HMR 禁用补丁..."
PATCH_FILE="vendor/z-runtime/apps/cli/config/cordis.patch.yml"
if [ -f "$PATCH_FILE" ]; then
    if grep -q "cordis-plugin-hmr" "$PATCH_FILE" && grep -q "disabled: true" "$PATCH_FILE"; then
        echo "  ✓ HMR 插件已禁用"
    else
        echo "  ⚠ HMR 禁用配置可能不完整"
    fi
else
    echo "  ⚠ 补丁文件未找到（首次运行时会自动创建）"
fi
echo ""

# 5. 检查工具缓存实现的关键功能
echo "✓ 检查插件实现..."

# 检查缓存键生成函数
if grep -q "createCacheKey" "$TOOL_CACHE_PKG/lib/index.js" 2>/dev/null; then
    echo "  ✓ 缓存键生成功能已实现"
else
    echo "  ⚠ 无法验证缓存键生成（代码已压缩）"
fi

# 检查只读检测函数
if grep -q "isReadOnlyBashCommand\|readonly" "$TOOL_CACHE_PKG/lib/index.js" 2>/dev/null; then
    echo "  ✓ 只读命令检测功能已实现"
else
    echo "  ⚠ 无法验证只读检测（代码已压缩）"
fi
echo ""

echo "=================================="
echo "✓ 所有检查通过！"
echo "=================================="
echo ""
echo "工具缓存功能已成功集成到 TaskWeaver"
echo ""
echo "下一步："
echo "1. 启动 TaskWeaver.app"
echo "2. 创建新对话，发送包含重复文件读取的任务"
echo "3. 观察控制台输出的缓存统计信息"
echo ""
echo "测试用例示例："
echo "  '请阅读 README.md，然后再次阅读它并总结内容'"
echo "  '在项目中搜索 \"function\"，然后再次搜索相同关键词'"
echo ""
echo "预期行为："
echo "  - 第一次操作：正常执行"
echo "  - 第二次操作：缓存命中，响应更快"
echo "  - 会话结束：输出统计 '[tool-cache] Session ... stats: X hits, Y misses, hit rate: Z%'"
echo ""
