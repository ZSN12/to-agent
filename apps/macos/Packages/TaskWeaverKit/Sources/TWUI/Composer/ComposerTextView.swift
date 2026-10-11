import SwiftUI
import AppKit

public struct ComposerTextView: NSViewRepresentable {
    @Binding public var text: String
    public var onCommit: () -> Void
    public var onImagePasted: ((NSImage) -> Void)?
    public var onFileDropped: (([URL]) -> Void)?

    public init(
        text: Binding<String>,
        onCommit: @escaping () -> Void,
        onImagePasted: ((NSImage) -> Void)? = nil,
        onFileDropped: (([URL]) -> Void)? = nil
    ) {
        self._text = text
        self.onCommit = onCommit
        self.onImagePasted = onImagePasted
        self.onFileDropped = onFileDropped
    }

    public func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    public func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true

        let textView = CustomNSTextView()
        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.font = .systemFont(ofSize: 13)
        textView.textColor = .textColor
        textView.backgroundColor = .clear
        textView.drawsBackground = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.allowsUndo = true
        textView.isHorizontallyResizable = false
        textView.isVerticallyResizable = true
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.containerSize = NSSize(width: scrollView.contentSize.width, height: CGFloat.greatestFiniteMagnitude)
        textView.textContainerInset = NSSize(width: 4, height: 6)

        textView.onCommit = onCommit
        textView.onImagePasted = onImagePasted
        textView.onFileDropped = onFileDropped

        scrollView.documentView = textView
        context.coordinator.textView = textView

        return scrollView
    }

    public func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let textView = nsView.documentView as? CustomNSTextView else { return }
        if textView.string != text {
            textView.string = text
        }
        textView.onCommit = onCommit
        textView.onImagePasted = onImagePasted
        textView.onFileDropped = onFileDropped
    }

    public final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ComposerTextView
        weak var textView: CustomNSTextView?

        init(_ parent: ComposerTextView) {
            self.parent = parent
        }

        public func textDidChange(_ notification: Notification) {
            guard let tv = textView else { return }
            self.parent.text = tv.string
        }
    }
}

final class CustomNSTextView: NSTextView {
    var onCommit: (() -> Void)?
    var onImagePasted: ((NSImage) -> Void)?
    var onFileDropped: (([URL]) -> Void)?

    override func keyDown(with event: NSEvent) {
        // Return key pressed
        if event.keyCode == 36 {
            // CRITICAL S8 REQUIREMENT:
            // If IME is currently composing (e.g. typing Chinese characters), do NOT send!
            if hasMarkedText() {
                super.keyDown(with: event)
                return
            }

            // If Shift is pressed, insert newline
            if event.modifierFlags.contains(.shift) {
                insertNewlineIgnoringFieldEditor(nil)
                return
            }

            // Normal Return -> Commit send
            onCommit?()
            return
        }

        super.keyDown(with: event)
    }

    override func paste(_ sender: Any?) {
        let pasteboard = NSPasteboard.general

        // Check image pasteboard first
        if let image = NSImage(pasteboard: pasteboard) {
            onImagePasted?(image)
            return
        }

        // Check file URLs
        if let urls = pasteboard.readObjects(forClasses: [NSURL.self], options: nil) as? [URL], !urls.isEmpty {
            onFileDropped?(urls)
            return
        }

        super.paste(sender)
    }

    override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
        if sender.draggingPasteboard.canReadObject(forClasses: [NSURL.self], options: nil) {
            return .copy
        }
        return super.draggingEntered(sender)
    }

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        if let urls = sender.draggingPasteboard.readObjects(forClasses: [NSURL.self], options: nil) as? [URL], !urls.isEmpty {
            onFileDropped?(urls)
            return true
        }
        return super.performDragOperation(sender)
    }
}
