import SwiftUI

public struct PromptBudgetBar: View {
    public let usedPercent: Double
    public let limitText: String

    public init(usedPercent: Double, limitText: String) {
        self.usedPercent = max(0.0, min(1.0, usedPercent))
        self.limitText = limitText
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text("上下文窗口预算")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(Int(usedPercent * 100))% / \(limitText)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.secondary.opacity(0.15))
                    RoundedRectangle(cornerRadius: 2)
                        .fill(budgetColor)
                        .frame(width: geo.size.width * usedPercent)
                }
            }
            .frame(height: 4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    private var budgetColor: Color {
        if usedPercent > 0.9 { return .red }
        if usedPercent > 0.75 { return .orange }
        return .blue
    }
}

public struct InterruptedTurnBanner: View {
    public let message: String
    public var onRetry: () -> Void

    public init(message: String, onRetry: @escaping () -> Void) {
        self.message = message
        self.onRetry = onRetry
    }

    public var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.octagon.fill")
                .foregroundStyle(.orange)
                .font(.system(size: 13))

            Text(message)
                .font(.system(size: 12))

            Spacer()

            Button("恢复重试") {
                onRetry()
            }
            .font(.system(size: 11, weight: .medium))
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .controlSize(.small)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }
}
