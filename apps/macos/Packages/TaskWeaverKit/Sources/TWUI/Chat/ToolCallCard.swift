import SwiftUI
import TWCore

public struct ToolCallCard: View {
    public let name: String
    public let arguments: String
    public let status: ToolCallStatus
    public let output: String?
    @State private var isExpanded: Bool = false

    public init(name: String, arguments: String, status: ToolCallStatus = .success, output: String? = nil) {
        self.name = name
        self.arguments = arguments
        self.status = status
        self.output = output
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    statusIcon

                    Text(name)
                        .font(.system(size: 12, weight: .semibold, design: .monospaced))

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    if !arguments.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("参数:")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.secondary)
                            Text(arguments)
                                .font(.system(size: 11, design: .monospaced))
                                .textSelection(.enabled)
                                .padding(6)
                                .background(Color.secondary.opacity(0.05), in: RoundedRectangle(cornerRadius: 4))
                        }
                    }

                    if let output, !output.isEmpty {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("输出结果:")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(.secondary)
                            Text(output)
                                .font(.system(size: 11, design: .monospaced))
                                .textSelection(.enabled)
                                .padding(6)
                                .background(Color.secondary.opacity(0.05), in: RoundedRectangle(cornerRadius: 4))
                        }
                    }
                }
                .padding(8)
                .background(Color.secondary.opacity(0.04), in: RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch status {
        case .executing:
            ProgressView()
                .controlSize(.mini)
        case .success:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .font(.system(size: 12))
        case .failure:
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(.red)
                .font(.system(size: 12))
        }
    }
}
