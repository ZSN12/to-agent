import SwiftUI
import TWCore
import TWContract
import TWMarkdown

public struct MainView: View {
    @State private var appModel = AppModel.shared
    @State private var inputText: String = ""
    @State private var attachments: [ComposerAttachment] = []

    public init() {}

    public var body: some View {
        NavigationSplitView {
            SidebarView(appModel: appModel)
                .navigationSplitViewColumnWidth(min: 220, ideal: 260, max: 320)
        } detail: {
            detailContent
        }
        .task {
            await appModel.boot()
        }
        .sheet(isPresented: $appModel.showFirstRunNotice) {
            FirstRunNoticeSheet(
                items: appModel.firstRunNoticeItems,
                onGoToSettings: {
                    Task {
                        await appModel.dismissFirstRunNotice()
                    }
                    appModel.showSettingsSheet = true
                },
                onDismiss: {
                    Task {
                        await appModel.dismissFirstRunNotice()
                    }
                }
            )
        }
        .sheet(isPresented: $appModel.showSettingsSheet) {
            ModelSettingsView(appModel: appModel)
        }
        .alert("对话失败", isPresented: Binding(
            get: { appModel.errorMessage != nil },
            set: { if !$0 { appModel.errorMessage = nil } }
        )) {
            Button("确定", role: .cancel) { appModel.errorMessage = nil }
        } message: {
            Text(appModel.errorMessage ?? "未知错误")
        }
    }

    // MARK: - Detail Chat View

    private var detailContent: some View {
        VStack(spacing: 0) {
            // Header Bar
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(currentSessionTitle)
                        .font(.system(size: 14, weight: .semibold))
                    Text("架构: 原生 macOS (SwiftUI) + Stdio JSON-RPC 2.0")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                ModelPickerMenu(appModel: appModel)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(nsColor: .windowBackgroundColor).opacity(0.8))

            PromptBudgetBar(usedPercent: 0.28, limitText: appModel.selectedModel.contextWindow)

            Divider()

            // Chat Message Stream
            if appModel.messages.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 40))
                        .foregroundStyle(.purple.gradient)
                    Text("开始与 TaskWeaver Agent 对话")
                        .font(.title3.bold())
                    Text("支持 Markdown 流式解析、语法高亮代码块、附件拖放、IME 输入法保护与 Keychain 密钥安全管理")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                MessageList(messages: appModel.messages)
            }

            Divider()

            // Usage Footer
            UsageFooter(promptTokens: 1420, completionTokens: 580, costFormatted: "$0.006")

            // Composer Input Area
            ComposerView(
                text: $inputText,
                attachments: $attachments,
                isStreaming: appModel.isStreaming,
                onSend: {
                    handleSendMessage()
                },
                onStop: {
                    appModel.finishStreaming()
                }
            )
        }
    }

    private var currentSessionTitle: String {
        if let activeId = appModel.activeSessionId,
           let session = appModel.sessions.first(where: { $0.id == activeId }) {
            return session.title
        }
        return "当前主会话"
    }

    private func handleSendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !attachments.isEmpty else { return }
        guard attachments.isEmpty else {
            appModel.errorMessage = "原生聊天的附件上传尚未接通，请先移除附件后发送文本。"
            return
        }
        guard !text.isEmpty else { return }
        inputText = ""
        Task {
            await appModel.sendChatMessage(text: text)
        }
    }
}

public struct FirstRunNoticeSheet: View {
    public let items: [AppModel.FirstRunNoticeItem]
    public let onGoToSettings: () -> Void
    public let onDismiss: () -> Void

    public init(
        items: [AppModel.FirstRunNoticeItem],
        onGoToSettings: @escaping () -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.items = items
        self.onGoToSettings = onGoToSettings
        self.onDismiss = onDismiss
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "key.fill")
                    .font(.title)
                    .foregroundStyle(.yellow)
                Text("迁移到原生版密钥重新录入提示")
                    .font(.headline)
            }

            Text("为保障系统安全性，原生版本接入了系统 macOS Keychain 安全存储。旧版安全存储中的凭据无法自动解密，请重新保存以下密钥：")
                .font(.body)
                .foregroundStyle(.secondary)

            List(items) { item in
                HStack {
                    Image(systemName: "lock.shield")
                        .foregroundStyle(.blue)
                    VStack(alignment: .leading) {
                        Text(item.label)
                            .font(.headline)
                        Text(item.kind)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(height: 180)

            HStack {
                Button("前往设置") {
                    onGoToSettings()
                }
                .buttonStyle(.borderedProminent)

                Spacer()

                Button("知道了") {
                    onDismiss()
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(24)
        .frame(width: 480, height: 380)
    }
}
