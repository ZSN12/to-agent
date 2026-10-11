import SwiftUI
import TWCore

public struct ModelPickerMenu: View {
    @Bindable public var appModel: AppModel

    public init(appModel: AppModel) {
        self.appModel = appModel
    }

    public var body: some View {
        Menu {
            ForEach(ModelCatalog.standardProviders) { provider in
                let models = ModelCatalog.standardModels.filter { $0.providerId == provider.id }
                if !models.isEmpty {
                    Section(provider.name) {
                        ForEach(models) { model in
                            Button {
                                appModel.selectedModelId = model.id
                            } label: {
                                HStack {
                                    if model.id == appModel.selectedModelId {
                                        Image(systemName: "checkmark")
                                    }
                                    Text(model.displayName)
                                    if model.isThinkingSupported {
                                        Text("(思考)")
                                    }
                                    Text("[\(model.contextWindow)]")
                                }
                            }
                        }
                    }
                }
            }

            Divider()

            Button("打开模型设置与 API 密钥管理...") {
                appModel.showSettingsSheet = true
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(.system(size: 11))
                    .foregroundStyle(.purple)

                Text(appModel.selectedModel.displayName)
                    .font(.system(size: 12, weight: .medium))

                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
        }
        .menuStyle(.borderlessButton)
    }
}
