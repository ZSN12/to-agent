import fs from 'node:fs/promises'
import path from 'node:path'
import { Document, parseDocument } from 'yaml'

const DOCUMENT_VERSION = 1
export const PI_AI_RECORD_SCOPE = 'llm-pi-ai'

/** @param {string} providerId pi-ai provider id (e.g. openai-codex) */
export function piAiRecordKey(providerId) {
  return `${PI_AI_RECORD_SCOPE}/${providerId}`
}

export function resolveDshHome(userDataPath) {
  return path.join(userDataPath, 'dsh')
}

function credentialsFile(dshHome) {
  return path.join(dshHome, '.credentials.yaml')
}

function mutableDocument(text) {
  const document = text === undefined ? new Document({}) : parseDocument(text)
  document.setIn(['version'], DOCUMENT_VERSION)
  return document
}

/**
 * Read a pi-ai OAuth grant from DSH's local credential store ($DSH_HOME/.credentials.yaml).
 * @returns {Record<string, unknown> | undefined}
 */
export async function readPiAiGrant(dshHome, providerId) {
  const file = credentialsFile(dshHome)
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
  const root = parseDocument(text).toJS() ?? {}
  const record = root?.records?.[piAiRecordKey(providerId)]
  if (record?.kind === 'grant' && record.payload && typeof record.payload === 'object') {
    return record.payload
  }
  return undefined
}

export async function hasPiAiGrant(dshHome, providerId) {
  const grant = await readPiAiGrant(dshHome, providerId)
  if (!grant) return false
  if (grant.type === 'oauth') {
    return Boolean(grant.access && grant.refresh && typeof grant.expires === 'number')
  }
  return true
}

/**
 * Write OAuth grant in the format llm-pi-ai expects ({ kind: 'grant', payload }).
 */
export async function writePiAiGrant(dshHome, providerId, payload) {
  const file = credentialsFile(dshHome)
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    text = undefined
  }
  const document = mutableDocument(text)
  document.setIn(['records', piAiRecordKey(providerId)], { kind: 'grant', payload })
  const next = document.toString()
  await fs.mkdir(dshHome, { recursive: true })
  const tmp = `${file}.taskweaver-${process.pid}`
  await fs.writeFile(tmp, next, { mode: 0o600 })
  await fs.rename(tmp, file)
}

export async function deletePiAiGrant(dshHome, providerId) {
  const file = credentialsFile(dshHome)
  let text
  try {
    text = await fs.readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  const document = mutableDocument(text)
  const key = piAiRecordKey(providerId)
  if (document.getIn(['records', key]) === undefined) return
  document.deleteIn(['records', key])
  const next = document.toString()
  const tmp = `${file}.taskweaver-${process.pid}`
  await fs.writeFile(tmp, next, { mode: 0o600 })
  await fs.rename(tmp, file)
}
