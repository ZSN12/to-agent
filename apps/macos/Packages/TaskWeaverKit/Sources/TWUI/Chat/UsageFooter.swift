import SwiftUI

public struct UsageFooter: View {
    public let promptTokens: Int
    public let completionTokens: Int
    public let costFormatted: String?

    public init(promptTokens: Int, completionTokens: Int, costFormatted: String? = nil) {
        self.promptTokens = promptTokens
        self.completionTokens = completionTokens
        self.costFormatted = costFormatted
    }

    public var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                Image(systemName: "number.circle")
                    .font(.system(size: 11))
                Text("输入: \(promptTokens) / 输出: \(completionTokens) tokens")
                    .font(.system(size: 11))
            }

            if let costFormatted {
                Text("•")
                Text("预估费用: \(costFormatted)")
                    .font(.system(size: 11))
            }

            Spacer()
        }
        .foregroundStyle(.secondary)
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(Color(nsColor: .windowBackgroundColor).opacity(0.6))
    }
}
