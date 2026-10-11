import SwiftUI
import AppKit
import TWMarkdown
import TWCore

public struct MessageView: View {
    public let message: ChatMessageItem
    public var onRetry: (() -> Void)? = nil

    public init(message: ChatMessageItem, onRetry: (() -> Void)? = nil) {
        self.message = message
        self.onRetry = onRetry
    }

    public var body: some View {
        HStack(alignment: .top, spacing: 12) {
            avatarView

            VStack(alignment: .leading, spacing: 8) {
                headerView

                // Thinking Content
                if let thinking = message.thinking, !thinking.isEmpty {
                    ThinkingDisclosure(content: thinking, isStreaming: message.isStreaming && message.content.isEmpty)
                }

                // Tool Calls
                ForEach(message.toolCalls) { tool in
                    ToolCallCard(
                        name: tool.name,
                        arguments: tool.arguments,
                        status: tool.status,
                        output: tool.output
                    )
                }

                // Markdown Content
                contentBlocksView

                // Footer Actions
                if message.role == .assistant && !message.isStreaming {
                    actionsBarView
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(message.role == .user ? Color.secondary.opacity(0.04) : Color.clear)
    }

    @ViewBuilder
    private var avatarView: some View {
        if message.role == .user {
            Circle()
                .fill(Color.blue.gradient)
                .frame(width: 28, height: 28)
                .overlay(
                    Image(systemName: "person.fill")
                        .font(.system(size: 13))
                        .foregroundStyle(.white)
                )
        } else {
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.purple.gradient)
                .frame(width: 28, height: 28)
                .overlay(
                    Image(systemName: "sparkles")
                        .font(.system(size: 13))
                        .foregroundStyle(.white)
                )
        }
    }

    private var headerView: some View {
        HStack(spacing: 8) {
            Text(message.role == .user ? "你" : "TaskWeaver Agent")
                .font(.system(size: 13, weight: .semibold))

            Text(message.timestamp, style: .time)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)

            Spacer()
        }
    }

    @ViewBuilder
    private var contentBlocksView: some View {
        let blocks = StreamBlockSplitter.parseStream(markdown: message.content)
        if blocks.isEmpty && message.content.isEmpty && message.isStreaming {
            ProgressView()
                .controlSize(.small)
                .padding(.vertical, 4)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(blocks) { block in
                    switch block.kind {
                    case .paragraph(let text):
                        Text(text)
                            .font(.system(size: 13))
                            .textSelection(.enabled)
                            .lineSpacing(3)
                    case .heading(let level, let text):
                        Text(text)
                            .font(.system(size: headingSize(for: level), weight: .bold))
                            .padding(.top, 4)
                    case .code(let lang, let code):
                        CodeBlockView(language: lang, code: code)
                    case .quote(let text):
                        HStack(spacing: 8) {
                            Rectangle()
                                .fill(Color.secondary.opacity(0.4))
                                .frame(width: 3)
                            Text(text)
                                .font(.system(size: 13))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    case .raw(let raw):
                        Text(raw)
                            .font(.system(size: 13))
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }

    private func headingSize(for level: Int) -> CGFloat {
        switch level {
        case 1: return 18
        case 2: return 16
        case 3: return 15
        default: return 14
        }
    }

    private var actionsBarView: some View {
        HStack(spacing: 12) {
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(message.content, forType: .string)
            } label: {
                Label("复制", systemImage: "doc.on.doc")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)

            if let onRetry {
                Button {
                    onRetry()
                } label: {
                    Label("重新生成", systemImage: "arrow.clockwise")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Spacer()
        }
        .padding(.top, 4)
    }
}
