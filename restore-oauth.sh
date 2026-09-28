#!/bin/bash
# 恢复 OAuth 和模型相关文件并重命名品牌

echo "开始恢复文件..."

# 恢复后端核心文件
git checkout HEAD -- \
  electron/backend/codex-oauth.mjs \
  electron/backend/builtin-model-data.mjs \
  electron/backend/context-breakdown.mjs \
  electron/backend/stream-segments.mjs \
  electron/agent/agent-runtime.mjs \
  electron/agent/runtime-types.d.ts \
  electron/backend/register-ipc.mjs

echo "✓ 文件恢复完成"

echo "开始品牌重命名（Pi → TaskWeaver）..."

# 替换 codex-oauth.mjs 中的品牌
sed -i '' 's/<title>Pi · 授权成功<\/title>/<title>TaskWeaver · 授权成功<\/title>/g' electron/backend/codex-oauth.mjs
sed -i '' 's/Pi \&middot; 授权成功/TaskWeaver \&middot; 授权成功/g' electron/backend/codex-oauth.mjs
sed -i '' 's/Pi 已收到你的 Codex 订阅/TaskWeaver 已收到你的 Codex 订阅/g' electron/backend/codex-oauth.mjs
sed -i '' 's/现在可以关闭本页面，回到 Pi 继续使用/现在可以关闭本页面，回到 TaskWeaver 继续使用/g' electron/backend/codex-oauth.mjs

# 替换 agent-runtime 注释中的 pi 引用
sed -i '' 's/pi-coding-agent/taskweaver-agent/g' electron/agent/agent-runtime.mjs
sed -i '' 's/Pi Coding Agent/TaskWeaver Agent/g' electron/agent/agent-runtime.mjs

echo "✓ 品牌重命名完成"

echo ""
echo "验证恢复结果："
ls -lh electron/backend/codex-oauth.mjs
ls -lh electron/agent/agent-runtime.mjs

echo ""
echo "检查品牌替换："
grep -n "TaskWeaver" electron/backend/codex-oauth.mjs | head -5

echo ""
echo "✅ 所有操作完成！"
