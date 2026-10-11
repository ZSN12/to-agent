import SwiftUI
import AppKit

public struct ComposerView: View {
    @Binding public var text: String
    @Binding public var attachments: [ComposerAttachment]
    public let isStreaming: Bool
    public var onSend: () -> Void
    public var onStop: () -> Void

    public init(
        text: Binding<String>,
        attachments: Binding<[ComposerAttachment]>,
        isStreaming: Bool = false,
        onSend: @escaping () -> Void,
        onStop: @escaping () -> Void
    ) {
        self._text = text
        self._attachments = attachments
        self.isStreaming = isStreaming
        self.onSend = onSend
        self.onStop = onStop
    }

    public var body: some View {
        VStack(spacing: 6) {
            // Attachments Strip
            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachments) { att in
                            AttachmentThumbnailView(attachment: att) {
                                attachments.removeAll { $0.id == att.id }
                            }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 4)
                }
            }

            // Input field
            ComposerTextView(
                text: $text,
                onCommit: {
                    if !isStreaming { onSend() }
                },
                onImagePasted: { img in
                    handlePastedImage(img)
                },
                onFileDropped: { urls in
                    handleDroppedFiles(urls)
                }
            )
            .frame(minHeight: 36, maxHeight: 140)
            .padding(.horizontal, 8)

            // Bottom toolbar
            HStack(spacing: 12) {
                Button {
                    pickFiles()
                } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("添加附件或图片")

                Text("Enter 发送，Shift+Enter 换行")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)

                Spacer()

                if isStreaming {
                    Button {
                        onStop()
                    } label: {
                        Image(systemName: "stop.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)
                    .help("停止生成")
                } else {
                    Button {
                        onSend()
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(canSend ? Color.blue : Color.secondary.opacity(0.4))
                    }
                    .buttonStyle(.plain)
                    .disabled(!canSend)
                    .help("发送消息")
                }
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 6)
        }
        .background(Color(nsColor: .controlBackgroundColor).opacity(0.6), in: RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var canSend: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty
    }

    private func pickFiles() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = true
        if panel.runModal() == .OK {
            handleDroppedFiles(panel.urls)
        }
    }

    private func handlePastedImage(_ img: NSImage) {
        let att = ComposerAttachment(
            name: "截图-\(Date().formatted(date: .omitted, time: .standard)).png",
            sizeBytes: 1024 * 128,
            isImage: true,
            thumbnail: img
        )
        attachments.append(att)
    }

    private func handleDroppedFiles(_ urls: [URL]) {
        for url in urls {
            let isImg = ["png", "jpg", "jpeg", "webp", "gif"].contains(url.pathExtension.lowercased())
            let thumb = isImg ? NSImage(contentsOf: url) : nil
            let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
            let att = ComposerAttachment(
                name: url.lastPathComponent,
                url: url,
                sizeBytes: size,
                isImage: isImg,
                thumbnail: thumb
            )
            attachments.append(att)
        }
    }
}
