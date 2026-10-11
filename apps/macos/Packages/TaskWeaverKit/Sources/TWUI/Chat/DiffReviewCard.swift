import SwiftUI

public struct DiffReviewCard: View {
    public let filePath: String
    public let additions: Int
    public let deletions: Int

    public init(filePath: String, additions: Int, deletions: Int) {
        self.filePath = filePath
        self.additions = additions
        self.deletions = deletions
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "doc.badge.gearshape")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)

            Text(filePath)
                .font(.system(size: 12, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.middle)

            Spacer()

            HStack(spacing: 6) {
                if additions > 0 {
                    Text("+\(additions)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.green)
                }
                if deletions > 0 {
                    Text("-\(deletions)")
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.red)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
        .padding(.vertical, 2)
    }
}
