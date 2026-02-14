import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

function nowIso() {
  try { return new Date().toISOString() } catch { return String(Date.now()) }
}

function isSceneNode(n) {
  return n && typeof n === 'object' && String(n.kind) === 'scene'
}

function isEndingNode(n) {
  return n && typeof n === 'object' && String(n.kind) === 'ending'
}

function toStr(v) {
  return String(v ?? '')
}

function uniq(arr) {
  return [...new Set(arr)]
}

function bfsOrder(story) {
  const nodes = Array.isArray(story?.nodes) ? story.nodes : []
  const byId = new Map(nodes.map((n) => [toStr(n?.id), n]).filter(([id]) => id))
  const start = toStr(story?.startNodeId)
  const q = []
  const seen = new Set()
  if (start && byId.has(start)) q.push(start)

  const ordered = []
  while (q.length) {
    const id = q.shift()
    if (!id || seen.has(id)) continue
    const n = byId.get(id)
    if (!n) continue
    seen.add(id)
    ordered.push(id)

    const choices = Array.isArray(n?.choices) ? n.choices : []
    for (const c of choices) {
      const to = toStr(c?.toNodeId)
      if (to && !seen.has(to)) q.push(to)
    }
  }

  // append remaining nodes deterministically
  for (const id of [...byId.keys()].sort()) {
    if (!seen.has(id)) ordered.push(id)
  }
  return ordered
}

async function readJson(p) {
  return JSON.parse(await readFile(p, 'utf-8'))
}

async function writeJson(p, obj) {
  await writeFile(p, JSON.stringify(obj, null, 2), 'utf-8')
}

function ensureScriptCardId(node) {
  const existing = toStr(node?.blueprint?.scriptCardId).trim()
  if (existing) return existing
  const id = toStr(node?.id).trim()
  return id ? `sc_${id}` : `sc_${Date.now()}`
}

function normalizeScriptText(node) {
  const bodyText = toStr(node?.body?.text).trim()
  if (bodyText) return bodyText
  return ''
}

function nodePlacementsToActorIds(node) {
  const placements = Array.isArray(node?.visuals?.placements) ? node.visuals.placements : []
  return uniq(placements.map((p) => toStr(p?.characterId)).filter(Boolean))
}

function nodeToBlueprintNode(node, scriptCardId) {
  const id = toStr(node?.id).trim()
  const kind = String(node?.kind) === 'ending' ? 'ending' : 'scene'
  const choicesIn = kind === 'scene' && Array.isArray(node?.choices) ? node.choices : []
  const choices = choicesIn
    .map((c) => ({
      id: toStr(c?.id).trim(),
      text: toStr(c?.text),
      toNodeId: toStr(c?.toNodeId).trim()
    }))
    .filter((c) => c.id && c.toNodeId)

  const actorIds = kind === 'scene' ? nodePlacementsToActorIds(node) : []
  const backgroundId = toStr(node?.visuals?.backgroundAssetId).trim() || undefined
  const eventIds = Array.isArray(node?.blueprint?.eventIds) ? node.blueprint.eventIds.map((x) => toStr(x)).filter(Boolean) : []
  const textDraft = normalizeScriptText(node)

  return {
    id,
    scriptCardId,
    name: toStr(node?.name || id),
    kind,
    textDraft,
    backgroundId,
    actorIds,
    eventIds,
    choices
  }
}

async function syncProject(projectDir) {
  const storyPath = path.join(projectDir, 'story.json')
  const projectPath = path.join(projectDir, 'project.json')
  const scriptsPath = path.join(projectDir, 'scripts.json')
  const blueprintPath = path.join(projectDir, 'blueprint.json')
  const prevBlueprintPath = path.join(projectDir, 'blueprint.json.bak')

  const story = await readJson(storyPath)
  const project = await readJson(projectPath)

  // best-effort backup (ignored by git)
  try {
    const prev = await readFile(blueprintPath, 'utf-8')
    await writeFile(prevBlueprintPath, prev, 'utf-8')
  } catch {}

  const nodes = Array.isArray(story?.nodes) ? story.nodes : []
  const nodeById = new Map(nodes.map((n) => [toStr(n?.id), n]).filter(([id]) => id))

  const orderIds = bfsOrder(story)
  const sceneIds = orderIds.filter((id) => isSceneNode(nodeById.get(id)))
  const endingIds = orderIds.filter((id) => isEndingNode(nodeById.get(id)))

  const scriptsCards = []
  const blueprintNodes = []

  const seenScriptIds = new Set()
  let order = 1
  for (const id of [...sceneIds, ...endingIds]) {
    const n = nodeById.get(id)
    if (!n) continue
    const scriptCardId = ensureScriptCardId(n)

    blueprintNodes.push(nodeToBlueprintNode(n, scriptCardId))

    // scripts: only scenes as "cards" (endings are still structure, but not part of Script layer)
    if (isSceneNode(n) && !seenScriptIds.has(scriptCardId)) {
      seenScriptIds.add(scriptCardId)
      scriptsCards.push({
        id: scriptCardId,
        name: toStr(n?.name || `场景${order}`),
        order,
        text: normalizeScriptText(n),
        updatedAt: nowIso()
      })
      order += 1
    }
  }

  const scripts = { schemaVersion: '1.0', cards: scriptsCards, updatedAt: nowIso() }

  const placeholders = []
  const placeholderIds = new Set()
  const chars = Array.isArray(project?.characters) ? project.characters : []
  for (const ch of chars) {
    const id = toStr(ch?.id).trim()
    if (!id) continue
    placeholders.push({ id, kind: 'actor', name: toStr(ch?.name || id), tags: [] })
    placeholderIds.add(id)
  }
  const assets = Array.isArray(project?.assets) ? project.assets : []
  for (const a of assets) {
    const id = toStr(a?.id).trim()
    if (!id) continue
    if (String(a?.kind) !== 'image') continue
    placeholders.push({ id, kind: 'background', name: toStr(a?.name || id), tags: [] })
    placeholderIds.add(id)
  }
  const events = Array.isArray(project?.events) ? project.events : []
  for (const ev of events) {
    const id = toStr(ev?.id).trim()
    if (!id) continue
    placeholders.push({ id, kind: 'event', name: toStr(ev?.name || id), tags: [] })
    placeholderIds.add(id)
  }

  // ensure referenced placeholders exist (e.g. legacy event ids)
  for (const bn of blueprintNodes) {
    for (const aid of Array.isArray(bn.actorIds) ? bn.actorIds : []) {
      const id = toStr(aid).trim()
      if (id && !placeholderIds.has(id)) {
        placeholders.push({ id, kind: 'actor', name: id, tags: [] })
        placeholderIds.add(id)
      }
    }
    const bg = toStr(bn.backgroundId).trim()
    if (bg && !placeholderIds.has(bg)) {
      placeholders.push({ id: bg, kind: 'background', name: bg, tags: [] })
      placeholderIds.add(bg)
    }
    for (const eid of Array.isArray(bn.eventIds) ? bn.eventIds : []) {
      const id = toStr(eid).trim()
      if (id && !placeholderIds.has(id)) {
        placeholders.push({ id, kind: 'event', name: id, tags: [] })
        placeholderIds.add(id)
      }
    }
  }

  const blueprint = {
    schemaVersion: '1.0',
    startNodeId: toStr(story?.startNodeId).trim(),
    placeholders,
    nodes: blueprintNodes,
    updatedAt: nowIso()
  }

  await writeJson(scriptsPath, scripts)
  await writeJson(blueprintPath, blueprint)

  return { scriptsCards: scriptsCards.length, blueprintNodes: blueprintNodes.length }
}

async function main() {
  const projectId = process.argv[2]
  if (!projectId) {
    console.error('Usage: node tools/syncFromCompose.mjs <projectId> [storageRoot]')
    process.exit(2)
  }
  const storageRoot = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve('storage')
  const projectDir = path.join(storageRoot, 'projects', String(projectId))
  const { scriptsCards, blueprintNodes } = await syncProject(projectDir)
  console.log(`[syncFromCompose] ok: project=${projectId} scripts=${scriptsCards} blueprintNodes=${blueprintNodes}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
