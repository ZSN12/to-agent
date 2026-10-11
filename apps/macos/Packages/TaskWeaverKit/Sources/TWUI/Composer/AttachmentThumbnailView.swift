import SwiftUI
import AppKit

public struct ComposerAttachment: Identifiable, Sendable {
    public let id: UUID
    public let name: String
    public let url: URL?
    public let sizeBytes: Int
    public let isImage: Bool
    public let thumbnail: NSImage?

    public init(id: UUID = UUID(), name: String, url: URL? = nil, sizeBytes: Int = 0, isImage: Bool = false, thumbnail: NSImage? = nil) {
        self.id = id
        self.name = name
        self.url = url
        self.sizeBytes = sizeBytes
        self.isImage = isImage
        self.thumbnail = thumbnail
    }

    public var sizeFormatted: String {
        if sizeBytes < 1024 { return "\(sizeBytes) B" }
        if sizeBytes < 1024 * 1024 { return "\(sizeBytes / 1024) KB" }
        return "\(sizeBytes / (1024 * 1024)) MB"
    }
}

public struct AttachmentThumbnailView: View {
    public let attachment: ComposerAttachment
    public var onRemove: () -> Void

    public init(attachment: ComposerAttachment, onRemove: @escaping () -> Void) {
        self.attachment = attachment
        self.onRemove = onRemove
    }

    public var body: some View {
        HStack(spacing: 6) {
            if let image = attachment.thumbnail {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 24, height: 24)
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            } else {
                Image(systemName: attachment.isImage ? "photo.fill" : "doc.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(.blue)
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(attachment.name)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                Text(attachment.sizeFormatted)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: 100, alignment: .leading)

            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
    }
}
