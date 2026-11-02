import { useEffect, useMemo, useRef, useState } from 'react'
import { getBridge } from '../app/getBridge'
import type { ComposerDocumentAttachment, WorkspaceEntry, WorkspaceReference } from '../../shared/app-api'
import type { ModelOption } from '../../types'
import {
  closestVisionModel,
  DEFAULT_IMAGE_ATTACHMENT_LIMITS,
  imageAttachmentProblems,
  localizedImageAttachmentError,
  type ComposerImage,
} from './image-attachment-validation'

export type UseComposerAttachmentsOptions = {
  conversationId: string | null | undefined
  model: ModelOption | null
  modelOptions: ModelOption[]
  onInsertReference?: (reference: WorkspaceEntry | WorkspaceReference) => void
  onDraftRevision?: () => void
}

export function useComposerAttachments({
  conversationId,
  model,
  modelOptions,
  onInsertReference,
  onDraftRevision,
}: UseComposerAttachmentsOptions) {
  const [attachments, setAttachments] = useState<ComposerImage[]>([])
  const attachmentsRef = useRef<ComposerImage[]>([])
  const [documents, setDocuments] = useState<ComposerDocumentAttachment[]>([])
  const documentsRef = useRef<ComposerDocumentAttachment[]>([])
  const documentConversationIdRef = useRef(conversationId)
  const conversationIdRef = useRef(conversationId)
  const [imageLimits, setImageLimits] = useState(DEFAULT_IMAGE_ATTACHMENT_LIMITS)
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null)

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  const imageProblems = useMemo(() => imageAttachmentProblems(attachments, imageLimits), [attachments, imageLimits])
  const suggestedVisionModel = useMemo(() => closestVisionModel(modelOptions, model), [modelOptions, model])

  const setComposerImages = (next: ComposerImage[] | ((previous: ComposerImage[]) => ComposerImage[])) => {
    const value = typeof next === 'function' ? next(attachmentsRef.current) : next
    attachmentsRef.current = value
    onDraftRevision?.()
    setAttachments(value)
  }

  const setComposerDocuments = (next: ComposerDocumentAttachment[] | ((previous: ComposerDocumentAttachment[]) => ComposerDocumentAttachment[])) => {
    const value = typeof next === 'function' ? next(documentsRef.current) : next
    documentsRef.current = value
    onDraftRevision?.()
    setDocuments(value)
  }

  const hasAttachments = attachments.length > 0 || documents.length > 0

  useEffect(() => {
    let active = true
    const bridge = getBridge()
    if (bridge?.chat?.getImageLimits) {
      void bridge.chat.getImageLimits(conversationId).then((result) => {
        if (active && result.ok && result.data) setImageLimits(result.data)
      }).catch(() => {})
    }
    return () => {
      active = false
    }
  }, [conversationId])

  const addImagePayload = async (
    payload: { mediaType: string; data: string; name: string; bytes: number },
    targetConversationId = conversationId,
  ) => {
    if (conversationIdRef.current !== targetConversationId) return
    const id = crypto.randomUUID()
    const previewUrl = `data:${payload.mediaType};base64,${payload.data}`
    const current = attachmentsRef.current
    const totalBytes = current.reduce((sum, image) => sum + image.bytes, 0) + payload.bytes
    const loadError = current.length >= imageLimits.maxImagesPerMessage
      ? `每条消息最多添加 ${imageLimits.maxImagesPerMessage} 张图片`
      : payload.bytes > imageLimits.maxImageBytes
        ? `单张图片不能超过 ${Math.ceil(imageLimits.maxImageBytes / (1024 * 1024))} MB`
        : totalBytes > imageLimits.maxMessageImageBytes
          ? `图片总大小不能超过 ${Math.ceil(imageLimits.maxMessageImageBytes / (1024 * 1024))} MB`
          : !imageLimits.mediaTypes.includes(payload.mediaType)
            ? '只支持 PNG、JPEG、WebP 和 GIF 图片'
            : null

    setComposerImages((previous) => [...previous, {
      ...payload,
      id,
      width: 0,
      height: 0,
      previewUrl,
      loading: !loadError,
      ...(loadError ? { loadError } : {}),
    }])
    if (loadError) return

    const image = new Image()
    image.src = previewUrl
    try {
      await image.decode()
      if (conversationIdRef.current !== targetConversationId) return
      setComposerImages((previous) => previous.map((item) => item.id === id
        ? { ...item, width: image.naturalWidth, height: image.naturalHeight, loading: false }
        : item))
    } catch {
      if (conversationIdRef.current !== targetConversationId) return
      setComposerImages((previous) => previous.map((item) => item.id === id
        ? { ...item, loading: false, loadError: '图片无法解码或文件已损坏' }
        : item))
    }
  }

  const addImageFiles = async (files: File[], source: 'paste' | 'drop') => {
    let skipped = 0
    for (const file of files) {
      if (conversationIdRef.current !== conversationId) break
      const current = attachmentsRef.current
      const id = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(file)
      const name = file.name || `粘贴图片-${Date.now()}`
      const placeholder = (loadError: string) => setComposerImages((previous) => [...previous, {
        id,
        mediaType: file.type || 'image/png',
        data: '',
        name,
        bytes: file.size,
        width: 0,
        height: 0,
        previewUrl,
        loadError,
      }])

      if (current.length >= imageLimits.maxImagesPerMessage) {
        skipped += 1
        if (skipped <= 20) placeholder(`每条消息最多添加 ${imageLimits.maxImagesPerMessage} 张图片`)
        else URL.revokeObjectURL(previewUrl)
        continue
      }
      if (file.size > imageLimits.maxImageBytes) {
        placeholder(`单张图片不能超过 ${Math.ceil(imageLimits.maxImageBytes / (1024 * 1024))} MB`)
        continue
      }
      const currentBytes = current.reduce((sum, image) => sum + image.bytes, 0)
      if (currentBytes + file.size > imageLimits.maxMessageImageBytes) {
        placeholder(`图片总大小不能超过 ${Math.ceil(imageLimits.maxMessageImageBytes / (1024 * 1024))} MB`)
        continue
      }
      if (source === 'paste' && file.type && !imageLimits.mediaTypes.includes(file.type)) {
        placeholder('只支持 PNG、JPEG、WebP 和 GIF 图片')
        continue
      }

      try {
        let payload: { mediaType: string; data: string; name: string; bytes: number }
        if (source === 'drop') {
          const bridge = getBridge()
          if (!bridge?.chat?.readDroppedImageFile) throw new Error('主进程图片读取服务不可用')
          const result = await bridge.chat.readDroppedImageFile(file, conversationId)
          if (!result.ok) throw new Error(result.error)
          payload = result.data
        } else {
          const bytes = new Uint8Array(await file.arrayBuffer())
          let binary = ''
          for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
          }
          payload = { mediaType: file.type || 'image/png', data: btoa(binary), name, bytes: bytes.byteLength }
        }
        URL.revokeObjectURL(previewUrl)
        if (conversationIdRef.current === conversationId) await addImagePayload(payload, conversationId)
      } catch (error) {
        if (conversationIdRef.current === conversationId) placeholder(localizedImageAttachmentError(error))
        else URL.revokeObjectURL(previewUrl)
      }
    }
    if (skipped > 0) {
      const remainder = Math.max(0, skipped - 20)
      setAttachmentNotice(`图片最多添加 ${imageLimits.maxImagesPerMessage} 张；${skipped} 张超出限制${remainder ? `，另有 ${remainder} 张未生成预览` : ''}。请移除超限项后发送。`)
    }
  }

  const pickImages = async () => {
    const bridge = getBridge()
    if (!bridge?.chat?.pickImages) {
      setAttachmentNotice('当前环境不支持选择图片附件。')
      return
    }
    try {
      const result = await bridge.chat.pickImages(conversationId)
      if (!result.ok) throw new Error(result.error)
      if (result.data.cancelled) return
      for (const image of result.data.images) await addImagePayload(image, conversationId)
      setAttachmentNotice(null)
    } catch (error) {
      setAttachmentNotice(localizedImageAttachmentError(error))
    }
  }

  const addDocumentPayload = (document: ComposerDocumentAttachment, targetConversationId = conversationId) => {
    if (conversationIdRef.current !== targetConversationId) {
      void getBridge()?.chat?.releaseDocuments?.([document.id], targetConversationId)
      return
    }
    documentConversationIdRef.current = targetConversationId
    setComposerDocuments((previous) => [...previous, document])
  }

  const addDroppedDocumentFile = async (file: File, targetConversationId = conversationId) => {
    const bridge = getBridge()
    if (!bridge?.chat?.stageDroppedDocumentFile) throw new Error('当前环境不支持添加文档附件。')
    const result = await bridge.chat.stageDroppedDocumentFile(file, targetConversationId)
    if (!result.ok) throw new Error(result.error)
    if (result.data.reference) {
      onInsertReference?.(result.data.reference)
    } else if (result.data.document) {
      addDocumentPayload(result.data.document, targetConversationId)
    } else {
      throw new Error('主进程未返回文档附件。')
    }
  }

  const pickAttachments = async () => {
    const bridge = getBridge()
    if (!bridge?.chat?.pickAttachments) {
      if (bridge?.chat?.pickImages) {
        await pickImages()
        return
      }
      setAttachmentNotice('当前环境不支持选择附件。')
      return
    }
    try {
      const result = await bridge.chat.pickAttachments(conversationId)
      if (!result.ok) throw new Error(result.error)
      if (result.data.cancelled) return
      for (const image of result.data.images) await addImagePayload(image, conversationId)
      for (const document of result.data.documents) addDocumentPayload(document, conversationId)
      for (const reference of result.data.references) onInsertReference?.(reference)
      setAttachmentNotice(null)
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const removeImage = (id: string) => {
    const removed = attachmentsRef.current.find((image) => image.id === id)
    if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl)
    setComposerImages((previous) => previous.filter((image) => image.id !== id))
    setAttachmentNotice(null)
  }

  const removeDocument = (id: string) => {
    const targetConversationId = documentConversationIdRef.current
    if (targetConversationId) void getBridge()?.chat?.releaseDocuments?.([id], targetConversationId)
    setComposerDocuments((previous) => previous.filter((document) => document.id !== id))
    setAttachmentNotice(null)
  }

  const clearAttachments = () => {
    for (const image of attachmentsRef.current) {
      if (image.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl)
    }
    setComposerImages([])
    setComposerDocuments([])
  }

  const restoreAttachments = (nextImages: ComposerImage[], nextDocs: ComposerDocumentAttachment[], targetConversationId?: string | null) => {
    setComposerImages(nextImages)
    setComposerDocuments(nextDocs)
    documentConversationIdRef.current = targetConversationId ?? conversationId
  }

  return {
    attachments,
    attachmentsRef,
    documents,
    documentsRef,
    documentConversationIdRef,
    imageLimits,
    imageProblems,
    suggestedVisionModel,
    attachmentNotice,
    setAttachmentNotice,
    hasAttachments,
    setComposerImages,
    setComposerDocuments,
    addImagePayload,
    addImageFiles,
    pickImages,
    pickAttachments,
    addDroppedDocumentFile,
    removeImage,
    removeDocument,
    clearAttachments,
    restoreAttachments,
  }
}
