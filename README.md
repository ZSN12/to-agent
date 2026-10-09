# TaskWeaver

TaskWeaver 是一款智能多智能体研发辅助平台，通过解耦的插件化架构和强大的多 Agent 协作调度系统，为现代软件工程提供从需求拆解、架构设计到代码生成与测试验收的全链路研发赋能。

## 特性亮点
- 基于微内核的灵活插件化架构 (Cordis)。
- 安全可靠的运行沙箱 (Seatbelt, 只读与可写隔离)。
- 高效的多智能体 DAG 任务编排与调度机制。
- Git 快照式防破坏重构工作流。

## 安装指南
项目采用 pnpm 作为包管理器，请确保已安装 Node.js (推荐 v18+) 以及 pnpm。

```bash
# 克隆仓库并进入项目根目录
cd TaskWeaver

# 安装所有依赖
pnpm install
```

## 开发构建
```bash
# 本地启动进行开发调试
pnpm run dev

# 构建生产环境资源
pnpm run build
```

## 测试
```bash
# 运行全部单元测试及集成测试
pnpm run test

# 查看测试覆盖率
pnpm run test:coverage
```

## 运行指南
开发完成后，通过构建命令生成包。在启动应用时可使用不同环境变量控制模型配置：
```bash
pnpm start
```
