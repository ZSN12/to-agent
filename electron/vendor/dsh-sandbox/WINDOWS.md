# Windows 沙箱

TaskWeaver 在 macOS（`sandbox-exec`）与 Linux（`bwrap` / Landlock）使用 vendored DSH 沙箱配置。

**Windows** 支持可选的 DSH `windows-acl` runner（受限令牌 + 工作区 Write SID）：

1. 在本机克隆 DSH 源码后执行：`npm run sync:dsh-windows-acl`  
   （或设置 `DSH_WINDOWS_ACL_SRC` 指向 `sandbox-windows-acl/lib`）
2. 文件会落到 `electron/vendor/dsh-sandbox/windows/`（含 `runner.js` 与依赖 chunk）
3. `probeSandboxSupport()` 在 `win32` 上检测到 runner 后，`confineArgv` / bash 包装会经 runner 启动子进程

未同步 runner 时行为与此前相同：应用层权限 + 路径围栏；`probe` 的 `note` 会提示运行 sync 脚本。

参考：`deepseek/dsh-source/packages/sandbox/sandbox-windows-acl/`
