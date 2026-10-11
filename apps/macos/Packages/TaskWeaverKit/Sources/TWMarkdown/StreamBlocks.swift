import Foundation

public enum StreamBlockKind: Sendable, Hashable {
    case paragraph(String)
    case heading(level: Int, text: String)
    case code(lang: String, code: String)
    case quote(String)
    case raw(String)
}

public struct StreamBlock: Identifiable, Sendable, Hashable {
    public let id: String
    public let kind: StreamBlockKind
    public let rawText: String
    public let isStable: Bool

    public init(id: String = UUID().uuidString, kind: StreamBlockKind, rawText: String, isStable: Bool = true) {
        self.id = id
        self.kind = kind
        self.rawText = rawText
        self.isStable = isStable
    }
}

public enum StreamBlockSplitter {
    private struct Fence {
        let marker: Character
        let length: Int
    }

    /// Accurate Swift port of markdown-stream-blocks.ts
    public static func splitToRawBlocks(source: String) -> (stableBlocks: [String], tail: String) {
        let lines = source.components(separatedBy: "\n")
        var stableBlocks: [String] = []
        var blockStart = 0
        var activeFence: Fence? = nil

        let fenceRegex = try? NSRegularExpression(pattern: #"^ {0,3}(`{3,}|~{3,})"#)
        let blockStartRegex = try? NSRegularExpression(pattern: #"^ {0,3}(?:#{1,6}(?:\s|$)|>|(?:[-+*]|\d+[.)])\s+|-{3,}|\*{3,}|_{3,})"#)

        func checkFenceMatch(_ line: String) -> (Character, Int)? {
            let nsLine = line as NSString
            guard let match = fenceRegex?.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) else {
                return nil
            }
            let markerStr = nsLine.substring(with: match.range(at: 1))
            guard let first = markerStr.first else { return nil }
            return (first, markerStr.count)
        }

        func isFenceClose(_ line: String, fence: Fence) -> Bool {
            guard let (char, len) = checkFenceMatch(line) else { return false }
            return char == fence.marker && len >= fence.length
        }

        func canSeparateBlock(_ block: String, _ nextLine: String) -> Bool {
            let trimmedNext = nextLine.trimmingCharacters(in: .whitespaces)
            if trimmedNext.isEmpty { return false }
            if nextLine.hasPrefix(" ") || nextLine.hasPrefix("\t") { return false }
            return true
        }

        var index = 0
        while index < lines.count {
            let line = lines[index]
            let fenceMatch = checkFenceMatch(line)

            if let fence = activeFence {
                if !isFenceClose(line, fence: fence) {
                    index += 1
                    continue
                }
                let completed = lines[blockStart...index].joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                if !completed.isEmpty {
                    stableBlocks.append(completed)
                }
                var next = index + 1
                while next < lines.count && lines[next].trimmingCharacters(in: .whitespaces).isEmpty {
                    next += 1
                }
                blockStart = next
                index = next
                activeFence = nil
                continue
            }

            if let (marker, len) = fenceMatch {
                let prevLines = lines[blockStart..<index]
                let previous = prevLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                if !previous.isEmpty && canSeparateBlock(previous, line) {
                    stableBlocks.append(previous)
                    blockStart = index
                }
                activeFence = Fence(marker: marker, length: len)
                index += 1
                continue
            }

            if index > blockStart && !line.trimmingCharacters(in: .whitespaces).isEmpty {
                let nsLine = line as NSString
                if blockStartRegex?.firstMatch(in: line, range: NSRange(location: 0, length: nsLine.length)) != nil {
                    let prevLines = lines[blockStart..<index]
                    let previous = prevLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                    if !previous.isEmpty && canSeparateBlock(previous, line) {
                        stableBlocks.append(previous)
                        blockStart = index
                    }
                }
            }

            if !line.trimmingCharacters(in: .whitespaces).isEmpty {
                index += 1
                continue
            }

            var next = index + 1
            while next < lines.count && lines[next].trimmingCharacters(in: .whitespaces).isEmpty {
                next += 1
            }
            if next >= lines.count {
                index += 1
                continue
            }

            let prevLines = lines[blockStart..<index]
            let block = prevLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if block.isEmpty || !canSeparateBlock(block, lines[next]) {
                index += 1
                continue
            }
            stableBlocks.append(block)
            blockStart = next
            index = next
        }

        let tail = lines[blockStart..<lines.count].joined(separator: "\n")
        return (stableBlocks, tail)
    }

    /// Classify a single markdown block text into a typed StreamBlock
    public static func classify(raw: String, isStable: Bool) -> StreamBlock {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        // Code block
        if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
            let lines = trimmed.components(separatedBy: "\n")
            let firstLine = lines.first ?? ""
            let lang = String(firstLine.drop { $0 == "`" || $0 == "~" || $0.isWhitespace })
            let body = lines.dropFirst().dropLast().joined(separator: "\n")
            return StreamBlock(kind: .code(lang: lang, code: body), rawText: raw, isStable: isStable)
        }

        // Heading
        if trimmed.hasPrefix("#") {
            var level = 0
            for char in trimmed {
                if char == "#" { level += 1 } else { break }
            }
            if level >= 1 && level <= 6 {
                let text = String(trimmed.dropFirst(level)).trimmingCharacters(in: .whitespaces)
                return StreamBlock(kind: .heading(level: level, text: text), rawText: raw, isStable: isStable)
            }
        }

        // Quote
        if trimmed.hasPrefix(">") {
            let quoteContent = trimmed.components(separatedBy: "\n")
                .map { $0.replacingOccurrences(of: #"^>\s?"#, with: "", options: .regularExpression) }
                .joined(separator: "\n")
            return StreamBlock(kind: .quote(quoteContent), rawText: raw, isStable: isStable)
        }

        return StreamBlock(kind: .paragraph(trimmed), rawText: raw, isStable: isStable)
    }

    /// Parse full stream into a list of parsed StreamBlock
    public static func parseStream(markdown: String) -> [StreamBlock] {
        if markdown.isEmpty { return [] }
        let (stables, tail) = splitToRawBlocks(source: markdown)
        var results: [StreamBlock] = stables.map { classify(raw: $0, isStable: true) }
        let trimmedTail = tail.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedTail.isEmpty {
            results.append(classify(raw: tail, isStable: false))
        }
        return results
    }
}
