import SwiftUI

public struct CodeExecutionResultCard: View {
    public let exitCode: Int
    public let output: String

    public init(exitCode: Int, output: String) {
        self.exitCode = exitCode
        self.output = output
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: exitCode == 0 ? "terminal.fill" : "exclamationmark.triangle.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(exitCode == 0 ? Color.secondary : Color.orange)

                Text(exitCode == 0 ? "命令执行完成" : "执行退出码: \(exitCode)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(exitCode == 0 ? Color.secondary : Color.orange)
            }

            if !output.isEmpty {
                Text(output)
                    .font(.system(size: 11, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(nsColor: .textBackgroundColor).opacity(0.4), in: RoundedRectangle(cornerRadius: 4))
            }
        }
        .padding(8)
        .background(Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 6))
        .padding(.vertical, 2)
    }
}
