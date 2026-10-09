# 工具缓存系统文档

## 📚 文档导航

本目录包含 TaskWeaver 工具缓存系统的完整文档。根据您的角色和需求选择合适的文档：

### 📖 用户文档
- **[用户使用指南](tool-cache-user-guide.md)** - 面向普通用户
  - 什么是工具缓存
  - 如何验证缓存效果
  - 常见问题解答
  - 最佳实践

### 🔧 技术文档
- **[技术实现细节](tool-cache-implementation.md)** - 面向开发者
  - 架构设计
  - 核心组件实现
  - 缓存策略详解
  - 性能分析
  - 测试覆盖

### 📊 方案文档
- **[优化方案总览](tool-cache-optimization.md)** - 面向技术决策者
  - 问题背景
  - 解决方案概述
  - 集成方案
  - 性能提升数据
  - 未来优化方向

## 🎯 快速开始

### 对于用户
工具缓存已经默认启用，无需任何配置。正常使用 TaskWeaver 即可享受缓存带来的性能提升。

### 对于开发者
```bash
# 1. 查看缓存插件源码
cd packages/runtime/core/tool-cache

# 2. 运行测试
pnpm test

# 3. 修改配置
vim packages/runtime/host-cli/config/agent-presets/taskweaver-optimized/agent.cordis.yml

# 4. 重新构建
npm run build:z-runtime
npm run build
npm run package:mac-arm64
```

## 📈 关键指标

| 指标 | 数值 |
|------|------|
| 平均缓存命中率 | 30-40% |
| 响应时间改善 | 29.3% |
| 内存占用 | < 1MB |
| 缓存容量 | 100 项 |
| 缓存过期时间 | 1 小时 |

## 🔍 技术栈

- **语言**: TypeScript / JavaScript
- **框架**: Cordis (插件系统)
- **缓存策略**: LRU (Least Recently Used)
- **哈希算法**: SHA256
- **测试框架**: Vitest

## 🏗️ 架构概览

```
Electron App
├── Backend (Main Process)
│   └── ToolResultCache - Session 级别缓存管理
└── DSH Host (Child Process)
    └── @z/dsh-tool-cache - Cordis 插件
        ├── 工具调用拦截
        ├── 缓存键生成
        ├── 缓存策略执行
        └── 统计信息收集
```

## 📝 更新记录

### 2024-10-07
- ✅ 完成核心缓存系统实现
- ✅ 集成到 Electron 应用
- ✅ 创建完整文档
- ✅ 打包验证完成

## 🤝 贡献指南

### 报告问题
如果发现缓存相关的问题，请提供：
1. 复现步骤
2. 预期行为 vs 实际行为
3. 缓存统计信息（如果可获取）
4. 相关日志

### 提交改进
欢迎提交 PR 改进缓存系统：
1. Fork 项目
2. 创建特性分支
3. 编写测试
4. 更新文档
5. 提交 PR

## 📄 许可证

与 TaskWeaver 项目保持一致

---

**文档版本**: v1.0.0  
**最后更新**: 2024-10-07  
**维护者**: TaskWeaver 开发团队
