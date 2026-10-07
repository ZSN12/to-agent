# Preset 优化测试计划

## 已完成的更改

1. ✅ 创建 `taskweaver-optimized` preset
   - 位置: `vendor/z-runtime/apps/cli/config/agent-presets/taskweaver-optimized/`
   - 已复制到: `vendor/taskweaver-z-runtime/config/agent-presets/taskweaver-optimized/`

2. ✅ 修改 TaskWeaver preset 选择逻辑
   - 文件: `electron/backend/primary-agent-preset.mjs`
   - 所有路径现在返回 `taskweaver-optimized` 而不是 `standard`

3. ✅ Preset 优化重点：
   - 明确"先窄搜后宽搜"策略
   - 批量关键词搜索（一次 grep 多个 -e 模式）
   - 更强的"不重复搜索"/"不重读文件"指导
   - 每 3 个工具调用输出一次进度检查点

## 测试方法

### 重启应用
```bash
# 杀掉现有进程
pkill -f TaskWeaver

# 重新启动开发模式
cd /Users/zsn/Documents/毕设
npm run dev
```

### 对照测试

使用相同的问题测试 2 轮：

**测试问题:**
"electron/agent/dsh-host/spawn-host.mjs 中的 ensureTaskWeaverDshHomePatch 函数是如何工作的？"

**预期改进:**
- 基线（standard preset）: ~11 steps, ~31 工具调用
- 优化（taskweaver-optimized）: 目标 <8 steps, <20 工具调用

**观察指标:**
1. 首次文本出现时间（从提交到看到正文，不含 Think）
2. 总 step 数
3. 总工具调用数
4. 是否有重复的文件读取
5. 是否有冗余的搜索（相似关键词多次搜索）

### 验证点

打开开发者控制台，观察：
1. Session 创建时 preset 是否为 `taskweaver-optimized`
2. System prompt 是否包含新的搜索策略指导
3. 工具调用是否减少
4. 进度反馈是否更频繁（每 3 个工具调用）

## 预期结果

**成功标准:**
- [ ] 工具调用数减少 30%+（31 → <22）
- [ ] Step 数减少 20%+（11 → <9）
- [ ] 无明显的重复文件读取
- [ ] 搜索关键词合并（一次 grep 而不是多次）
- [ ] 更频繁的进度更新

**如果效果不明显:**
1. 检查 preset 是否正确加载（控制台日志）
2. 检查 system prompt 是否包含优化指导
3. 可能需要进一步调整 prompt 强度
4. 可能需要切换到更强的模型（o1/o3）

## 性能基线参考

基于之前的 5 轮配对实验：
- TaskWeaver 服务层开销：**可忽略（-7% 实际略快）**
- 首次文本延迟中位数：**102.9 秒**
- 主要瓶颈：**模型多轮工具调用策略**

优化方向正确：通过更好的 prompt 引导减少工具调用轮次。
