import SwiftUI
import AppKit
import TWCore

public struct SidebarView: View {
    @Bindable public var appModel: AppModel
    @State private var searchText: String = ""
    @State private var renamingSessionId: String?
    @State private var newSessionTitle: String = ""
    @State private var showRenameAlert: Bool = false

    public init(appModel: AppModel) {
        self.appModel = appModel
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Header Bar
            HStack {
                Text("会话")
                    .font(.headline)
                Spacer()
                Button {
                    appModel.createSession()
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(.blue)
                }
                .buttonStyle(.plain)
                .help("新建会话")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)

            // Search filter
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 11))
                TextField("搜索会话...", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(6)
            .background(Color(nsColor: .controlBackgroundColor).opacity(0.8), in: RoundedRectangle(cornerRadius: 6))
            .padding(.horizontal, 12)
            .padding(.bottom, 6)

            Divider()

            // Session List
            List(selection: Binding(
                get: { appModel.activeSessionId },
                set: { if let id = $0 { appModel.selectSession(id: id) } }
            )) {
                Section("所有会话 (\(filteredSessions.count))") {
                    ForEach(filteredSessions) { session in
                        HStack(spacing: 8) {
                            if session.isRunning {
                                ProgressView()
                                    .controlSize(.mini)
                            } else {
                                Image(systemName: "bubble.left.and.text.bubble.right")
                                    .font(.system(size: 12))
                                    .foregroundStyle(session.id == appModel.activeSessionId ? .blue : .secondary)
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text(session.title)
                                    .font(.system(size: 12, weight: session.id == appModel.activeSessionId ? .semibold : .regular))
                                    .lineLimit(1)
                                if !session.lastPreview.isEmpty {
                                    Text(session.lastPreview)
                                        .font(.system(size: 10))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                            }
                            Spacer()
                        }
                        .tag(session.id)
                        .padding(.vertical, 3)
                        .contextMenu {
                            Button("重命名") {
                                renamingSessionId = session.id
                                newSessionTitle = session.title
                                showRenameAlert = true
                            }
                            Button("导出为 Markdown (.md)") {
                                exportFile(content: appModel.exportCurrentSessionMarkdown(), filename: "\(session.title).md")
                            }
                            Button("导出为 JSON (.json)") {
                                exportFile(content: appModel.exportCurrentSessionJSON(), filename: "\(session.title).json")
                            }
                            Divider()
                            Button("删除会话", role: .destructive) {
                                appModel.deleteSession(id: session.id)
                            }
                        }
                    }
                }

                Section("DEBUG / 压测工具") {
                    Button {
                        appModel.loadDemoMessages(count: 2000)
                    } label: {
                        Label("载入 2,000 条压测消息", systemImage: "speedometer")
                            .font(.system(size: 11))
                    }
                    .buttonStyle(.plain)

                    Button {
                        appModel.clearMessages()
                    } label: {
                        Label("清空当前消息", systemImage: "trash")
                            .font(.system(size: 11))
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)
                }
            }
            .listStyle(.sidebar)

            Divider()

            // Status bar
            HStack(spacing: 8) {
                Circle()
                    .fill(stateColor)
                    .frame(width: 8, height: 8)
                Text(stateText)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
        .alert("重命名会话", isPresented: $showRenameAlert) {
            TextField("会话标题", text: $newSessionTitle)
            Button("保存") {
                if let id = renamingSessionId, !newSessionTitle.isEmpty {
                    appModel.renameSession(id: id, newTitle: newSessionTitle)
                }
            }
            Button("取消", role: .cancel) {}
        }
    }

    private var filteredSessions: [SessionItem] {
        if searchText.trimmingCharacters(in: .whitespaces).isEmpty {
            return appModel.sessions
        }
        return appModel.sessions.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.lastPreview.localizedCaseInsensitiveContains(searchText)
        }
    }

    private func exportFile(content: String, filename: String) {
        let savePanel = NSSavePanel()
        savePanel.nameFieldStringValue = filename
        savePanel.canCreateDirectories = true
        if savePanel.runModal() == .OK, let url = savePanel.url {
            try? content.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    private var stateColor: Color {
        switch appModel.backendState {
        case .ready: return .green
        case .starting, .restarting: return .yellow
        case .stopped: return .gray
        case .failed: return .red
        }
    }

    private var stateText: String {
        switch appModel.backendState {
        case .ready: return "后端已就绪"
        case .starting: return "正在启动服务…"
        case .restarting: return "正在重启服务…"
        case .stopped: return "未连接"
        case .failed(let err): return "异常: \(err)"
        }
    }
}
