import SwiftUI
import TWCore

public struct MessageList: View {
    public let messages: [ChatMessageItem]
    public var onRetry: ((ChatMessageItem) -> Void)? = nil

    @State private var autoScroll: Bool = true
    private let bottomAnchorID = "CHAT_BOTTOM_ANCHOR"

    public init(messages: [ChatMessageItem], onRetry: ((ChatMessageItem) -> Void)? = nil) {
        self.messages = messages
        self.onRetry = onRetry
    }

    public var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(messages) { msg in
                        MessageView(message: msg) {
                            onRetry?(msg)
                        }
                        .id(msg.id)
                    }

                    Color.clear
                        .frame(height: 1)
                        .id(bottomAnchorID)
                }
            }
            .onChange(of: messages.count) { _, _ in
                if autoScroll {
                    withAnimation(.easeOut(duration: 0.25)) {
                        proxy.scrollTo(bottomAnchorID, anchor: .bottom)
                    }
                }
            }
            .onChange(of: messages.last?.content) { _, _ in
                if autoScroll {
                    proxy.scrollTo(bottomAnchorID, anchor: .bottom)
                }
            }
            .onAppear {
                proxy.scrollTo(bottomAnchorID, anchor: .bottom)
            }
        }
    }
}
