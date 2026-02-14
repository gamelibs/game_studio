import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function nowIso() {
  try { return new Date().toISOString() } catch (_) { return String(Date.now()) }
}

export function rulesFilePath(storageRoot) {
  const root = String(storageRoot || '').trim()
  if (!root) throw new Error('missing_storage_root')
  return path.join(root, '_config', 'ai_rules.json')
}

export async function readGlobalRules(storageRoot) {
  const p = rulesFilePath(storageRoot)
  try {
    const raw = await readFile(p, 'utf-8')
    const json = JSON.parse(raw)
    if (!json || typeof json !== 'object') return null
    return json
  } catch (_) {
    return null
  }
}

export async function writeGlobalRules(storageRoot, rules) {
  const p = rulesFilePath(storageRoot)
  const dir = path.dirname(p)
  await mkdir(dir, { recursive: true })
  const next = {
    schemaVersion: '1.0',
    updatedAt: nowIso(),
    ...(rules && typeof rules === 'object' ? rules : { rules })
  }
  await writeFile(p, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

