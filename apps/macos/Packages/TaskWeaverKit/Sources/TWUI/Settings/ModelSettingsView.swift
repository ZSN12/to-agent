import SwiftUI
import AppKit
import TWCore
import TWPlatform

public struct ModelSettingsView: View {
    @Bindable public var appModel: AppModel
    @State private var selectedProviderId: String = "anthropic"
    @State private var apiKeyInput: String = ""
    @State private var hasKeyInKeychain: Bool = false
    @State private var saveStatusMessage: String?

    public init(appModel: AppModel) {
        self.appModel = appModel
    }

    public var body: some View {
        NavigationSplitView {
            List(ModelCatalog.standardProviders, selection: $selectedProviderId) { provider in
                HStack(spacing: 8) {
                    Image(systemName: provider.iconName)
                        .font(.system(size: 13))
                        .foregroundStyle(.blue)
                        .frame(width: 20)

                    Text(provider.name)
                        .font(.system(size: 13))

                    Spacer()

                    if isConfigured(provider) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(.green)
                    }
                }
                .tag(provider.id)
                .padding(.vertical, 4)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 200, max: 240)
        } detail: {
            if let provider = currentProvider {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        Image(systemName: provider.iconName)
                            .font(.system(size: 24))
                            .foregroundStyle(.purple)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(provider.name)
                                .font(.title3.bold())
                            Text(provider.requiresApiKey ? "需要配置 API 密钥并加密存入系统安全 Keychain" : "支持本地或扩展无密钥接入")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Divider()

                    if provider.requiresApiKey {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("API 密钥 (API Key)")
                                .font(.system(size: 12, weight: .semibold))

                            HStack {
                                SecureField("sk-...", text: $apiKeyInput)
                                    .textFieldStyle(.roundedBorder)

                                Button("保存至 Keychain") {
                                    saveKey(for: provider)
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(apiKeyInput.trimmingCharacters(in: .whitespaces).isEmpty)

                                if hasKeyInKeychain {
                                    Button("清除", role: .destructive) {
                                        deleteKey(for: provider)
                                    }
                                }
                            }

                            if let msg = saveStatusMessage {
                                Text(msg)
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            }

                            HStack(spacing: 4) {
                                Image(systemName: hasKeyInKeychain ? "lock.shield.fill" : "exclamationmark.shield")
                                    .font(.system(size: 11))
                                    .foregroundStyle(hasKeyInKeychain ? .green : .secondary)
                                Text(hasKeyInKeychain ? "已在系统安全 Keychain (com.taskweaver.desktop.secrets) 中保存" : "尚未配置 API Key")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("已接入本地/扩展上下文")
                                .font(.headline)
                            Text("此提供方无需在系统 Keychain 单独保存 API 密钥，可在工作区中直接发起调用。")
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Divider()

                    Text("包含模型:")
                        .font(.system(size: 12, weight: .semibold))

                    let models = ModelCatalog.standardModels.filter { $0.providerId == provider.id }
                    ForEach(models) { m in
                        HStack {
                            Text(m.displayName)
                                .font(.system(size: 12, weight: .medium))
                            if m.isThinkingSupported {
                                Text("支持思维链")
                                    .font(.system(size: 10))
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color.blue.opacity(0.12), in: RoundedRectangle(cornerRadius: 3))
                            }
                            Spacer()
                            Text(m.contextWindow)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }

                    Spacer()
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .onAppear {
                    refreshKeyStatus(for: provider)
                }
                .onChange(of: selectedProviderId) { _, _ in
                    if let p = currentProvider {
                        refreshKeyStatus(for: p)
                    }
                }
            }
        }
        .frame(minWidth: 560, minHeight: 400)
        .onAppear {
            if let focused = appModel.focusedProviderId {
                selectedProviderId = focused
            }
        }
    }

    private var currentProvider: ProviderItem? {
        ModelCatalog.standardProviders.first { $0.id == selectedProviderId }
    }

    private func isConfigured(_ provider: ProviderItem) -> Bool {
        if !provider.requiresApiKey { return true }
        return KeychainHelper.shared.get(for: provider.apiKeyAccount) != nil
    }

    private func refreshKeyStatus(for provider: ProviderItem) {
        if let stored = KeychainHelper.shared.get(for: provider.apiKeyAccount) {
            hasKeyInKeychain = true
            apiKeyInput = stored
        } else {
            hasKeyInKeychain = false
            apiKeyInput = ""
        }
        saveStatusMessage = nil
    }

    private func saveKey(for provider: ProviderItem) {
        let key = apiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else { return }
        do {
            try KeychainHelper.shared.set(key, for: provider.apiKeyAccount)
            hasKeyInKeychain = true
            saveStatusMessage = "✅ 密钥已安全存入 macOS Keychain"
        } catch {
            saveStatusMessage = "❌ 保存失败: \(error.localizedDescription)"
        }
    }

    private func deleteKey(for provider: ProviderItem) {
        do {
            try KeychainHelper.shared.delete(for: provider.apiKeyAccount)
            hasKeyInKeychain = false
            apiKeyInput = ""
            saveStatusMessage = "已清除密钥"
        } catch {
            saveStatusMessage = "❌ 清除失败: \(error.localizedDescription)"
        }
    }
}
