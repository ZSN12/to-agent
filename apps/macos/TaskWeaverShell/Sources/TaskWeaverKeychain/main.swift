import Foundation
import Security
import Darwin

private let serviceName = "com.taskweaver.desktop"

private struct Request: Decodable {
    let action: String
    let account: String?
    let value: String?
    let prefix: String?
}

private struct Response: Encodable {
    let ok: Bool
    let value: Payload?
    let error: String?

    enum Payload: Encodable {
        case string(String)
        case strings([String])
        case null

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch self {
            case .string(let value): try container.encode(value)
            case .strings(let value): try container.encode(value)
            case .null: try container.encodeNil()
            }
        }
    }
}

private enum KeychainFailure: Error {
    case invalidRequest
    case status(OSStatus)
}

private func emit(_ response: Response) {
    guard let data = try? JSONEncoder().encode(response) else {
        FileHandle.standardOutput.write(Data("{\"ok\":false,\"error\":\"encoding\"}".utf8))
        return
    }
    FileHandle.standardOutput.write(data)
}

private func isValidName(_ name: String, allowEmpty: Bool) -> Bool {
    (allowEmpty || !name.isEmpty)
        && name.utf8.count <= 512
        && !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
}

private func run(_ request: Request) throws -> Response {
    let serviceQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: serviceName,
    ]

    if request.action == "list" {
        let prefix = request.prefix ?? ""
        guard isValidName(prefix, allowEmpty: true) else { throw KeychainFailure.invalidRequest }
        var lookup = serviceQuery
        lookup[kSecReturnAttributes as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitAll
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound {
            return Response(ok: true, value: .strings([]), error: nil)
        }
        guard status == errSecSuccess, let records = result as? [[String: Any]] else {
            throw KeychainFailure.status(status)
        }
        let accounts = records.compactMap { $0[kSecAttrAccount as String] as? String }
            .filter { prefix.isEmpty || $0.hasPrefix(prefix) }
        return Response(ok: true, value: .strings(accounts), error: nil)
    }

    guard let account = request.account, isValidName(account, allowEmpty: false)
    else { throw KeychainFailure.invalidRequest }

    var query = serviceQuery
    query[kSecAttrAccount as String] = account

    switch request.action {
    case "get":
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound {
            return Response(ok: true, value: .null, error: nil)
        }
        guard status == errSecSuccess, let data = result as? Data,
              let secret = String(data: data, encoding: .utf8)
        else { throw KeychainFailure.status(status) }
        return Response(ok: true, value: .string(secret), error: nil)

    case "set":
        guard let secret = request.value else { throw KeychainFailure.invalidRequest }
        let data = Data(secret.utf8)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var addition = query
            attributes.forEach { addition[$0.key] = $0.value }
            let addStatus = SecItemAdd(addition as CFDictionary, nil)
            guard addStatus == errSecSuccess else { throw KeychainFailure.status(addStatus) }
        } else if updateStatus != errSecSuccess {
            throw KeychainFailure.status(updateStatus)
        }
        return Response(ok: true, value: .null, error: nil)

    case "delete":
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainFailure.status(status)
        }
        return Response(ok: true, value: .null, error: nil)

    default:
        throw KeychainFailure.invalidRequest
    }
}

let input = FileHandle.standardInput.readDataToEndOfFile()
do {
    let request = try JSONDecoder().decode(Request.self, from: input)
    emit(try run(request))
} catch let KeychainFailure.status(status) {
    emit(Response(ok: false, value: nil, error: "security-status-\(status)"))
    exit(1)
} catch {
    emit(Response(ok: false, value: nil, error: "invalid-request"))
    exit(1)
}
