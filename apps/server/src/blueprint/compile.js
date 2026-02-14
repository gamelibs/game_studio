import { genId } from '../ai/scripts.js'

function nowIso() {
  try { return new Date().toISOString() } catch (_) { return String(Date.now()) }
}

function normLines(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function splitLines(s) {
  return normLines(s).split('\n')
}

function pickOptions(text) {
  const lines = splitLines(text).map((x) => x.trim()).filter(Boolean)
  const opts = []
  for (const ln of lines) {
    const m = ln.match(/^选项([A-Z]|\d{1,2})：\s*(.+)\s*$/i)
    if (m) {
      const rawKey = String(m[1])
      const key = /^\d/.test(rawKey) ? rawKey : rawKey.toUpperCase()
      opts.push({ key, text: m[2] })
    }
  }
  if (opts.length >= 2) return opts

  // Fallback: inline "选项A：... 选项B：..." in a single paragraph.
  const raw = normLines(text)
  const re = /选项([A-Z]|\d{1,2})：/gi
  const hits = []
  let m = null
  while ((m = re.exec(raw))) {
    const rawKey = String(m[1])
    const key = /^\d/.test(rawKey) ? rawKey : rawKey.toUpperCase()
    hits.push({ key, idx: m.index + m[0].length })
  }
  if (hits.length < 2) return []
  const out = []
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx
    const end = i + 1 < hits.length ? hits[i + 1].idx - (`选项${hits[i + 1].key}：`.length) : raw.length
    const chunk = raw.slice(start, end).trim()
    const cleaned = chunk
      .replace(/^[：:;\s]+/, '')
      .replace(/\s+/g, ' ')
      .replace(/[。；;]+$/, '')
      .trim()
    if (cleaned) out.push({ key: hits[i].key, text: cleaned })
  }
  // De-dup by key, keep first.
  const seen = new Set()
  return out.filter((o) => (seen.has(o.key) ? false : (seen.add(o.key), true)))
}

function looksLikeConsequence(name) {
  const s = String(name || '').trim()
  const m = s.match(/^([A-Z])后果(?:[:：]\s*)?/i)
  return m ? String(m[1]).toUpperCase() : null
}

function numericConsequenceKey(name, choicePointNo) {
  const s = String(name || '').trim()
  const m = s.match(/^(\d{1,2})后果(\d{1,2})(?:[:：]\s*)?/)
  if (!m) return null
  const i = Number(m[1])
  const k = String(m[2])
  if (!Number.isFinite(i) || i !== Number(choicePointNo)) return null
  return k
}

function parseNumericConsequence(name) {
  const s = String(name || '').trim()
  const m = s.match(/^(\d{1,2})后果(\d{1,2})(?:[:：]\s*)?/)
  if (!m) return null
  const i = Number(m[1])
  const k = String(m[2])
  if (!Number.isFinite(i)) return null
  return { i, k }
}

function endingKey(name) {
  const s = String(name || '').trim()
  const m = s.match(/^结局(\d{1,2})\b/)
  if (!m) return null
  return String(Number(m[1]))
}

function optionKeyToEndingKey(key) {
  const s = String(key || '').trim().toUpperCase()
  if (!s) return null
  if (/^\d{1,2}$/.test(s)) return s
  if (/^[A-Z]$/.test(s)) return String(s.charCodeAt(0) - 64)
  return null
}

function matchOptionKeyForEnding(optionKeys, endKey) {
  const target = String(endKey || '').trim()
  if (!target) return null
  for (const k of optionKeys || []) {
    const mapped = optionKeyToEndingKey(k)
    if (mapped && mapped === target) return String(k)
  }
  return null
}

function buildEndingIndexMap({ cards, fromIndex, maxLookahead }) {
  const m = new Map()
  const max = Math.min(cards.length, fromIndex + Math.max(1, Number(maxLookahead || 0) || 80))
  for (let j = Math.max(0, fromIndex); j < max; j++) {
    const k = endingKey(cards[j]?.name)
    if (!k) continue
    if (m.has(k)) continue
    m.set(k, j)
  }
  return m
}

function isEndingCard(card) {
  const name = String(card?.name || '').trim()
  return /^结局/.test(name) || name.includes('结局')
}

function nodeIdForCard(cardId) {
  return `bn_${String(cardId)}`
}

function autoContinueChoiceId(cardId) {
  return `bc_${String(cardId)}`
}

function isAutoContinueChoice(choice, cardId) {
  if (!choice) return false
  return String(choice.id || '') === autoContinueChoiceId(cardId) && String(choice.text || '') === '继续'
}

function isCompilerChoiceId(choiceId, cardId) {
  const cid = String(choiceId || '')
  return cid === autoContinueChoiceId(cardId) || cid.startsWith(`bc_${String(cardId)}_`)
}

function makeContinueChoice(cardId, toNodeId) {
  return { id: autoContinueChoiceId(cardId), text: '继续', toNodeId: String(toNodeId || '') }
}

function makeChoice(cardId, key, text, toNodeId) {
  return { id: `bc_${String(cardId)}_${String(key)}`, text: String(text || ''), toNodeId: String(toNodeId || '') }
}

function preserveOrReplaceChoices({ prevNode, cardId, nodeName, nextChoices, report }) {
  const prevChoices = Array.isArray(prevNode?.choices) ? prevNode.choices : []
  if (!prevChoices.length) return nextChoices

  // If all previous choices look compiler-generated, replace.
  const allCompiler = prevChoices.every((c) => isCompilerChoiceId(c?.id, cardId))
  if (allCompiler) return nextChoices

  // If previous is single auto-continue, replace.
  if (prevChoices.length === 1 && isAutoContinueChoice(prevChoices[0], cardId)) return nextChoices

  // Otherwise, preserve manual edits and warn.
  report.warnings.push({
    code: 'preserve_manual_choices',
    message: `节点「${String(nodeName || '') || nodeIdForCard(cardId)}」检测到手工“选项”，编译时已保留（未覆盖）。`
  })
  return prevChoices.map((c) => ({
    id: String(c?.id || genId('bc')),
    text: String(c?.text || ''),
    toNodeId: String(c?.toNodeId || '')
  }))
}

function buildConsequenceGroup({ cards, choiceIndex, optionKeys, choicePointNo, allowEndingAsOutcome }) {
  const map = new Map()
  let lastIdx = choiceIndex
  for (let j = choiceIndex + 1; j < Math.min(cards.length, choiceIndex + 40); j++) {
    const k =
      (choicePointNo ? numericConsequenceKey(cards[j]?.name, choicePointNo) : null) ||
      (allowEndingAsOutcome ? matchOptionKeyForEnding(optionKeys, endingKey(cards[j]?.name)) : null) ||
      looksLikeConsequence(cards[j]?.name)
    if (k && optionKeys.includes(k) && !map.has(k)) {
      map.set(k, j)
      lastIdx = Math.max(lastIdx, j)
    }
    // stop early if we already found all consequences
    if (map.size === optionKeys.length) break
  }
  const joinIndex = (lastIdx + 1 < cards.length) ? (lastIdx + 1) : null
  return { consequenceIndexByKey: map, joinIndex }
}

export function compileBlueprintFromScripts({ scripts, prevBlueprint, expectedFormula }) {
  const report = { errors: [], warnings: [], info: [] }

  const prevNodes = Array.isArray(prevBlueprint?.nodes) ? prevBlueprint.nodes : []
  const prevById = new Map(prevNodes.map((n) => [String(n?.id || ''), n]).filter(([id]) => id))

  const cards = Array.isArray(scripts?.cards) ? scripts.cards.slice() : []
  cards.sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
  const scriptCardIdSet = new Set(cards.map((c) => String(c?.id || '')).filter(Boolean))

  // If no formula is provided, treat the last detected choice point as the "last",
  // so we can map to endings and avoid leaving extra endings unreachable.
  const choiceCardIndices = []
  for (let i = 0; i < cards.length; i++) {
    try {
      const opts = pickOptions(cards[i]?.text || '')
      if (opts.length >= 2) choiceCardIndices.push(i)
    } catch (_) {}
  }
  const lastChoiceCardIndex = choiceCardIndices.length ? choiceCardIndices[choiceCardIndices.length - 1] : -1

  const hasAnyEnding = cards.some((c) => isEndingCard(c))
  const terminalCardId = cards.length ? String(cards[cards.length - 1]?.id || '') : ''

  const nodes = []
  const nodeByCardId = new Map()
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i] || {}
    const cardId = String(c.id || '')
    if (!cardId) continue
    const nid = nodeIdForCard(cardId)
    const prev = prevById.get(nid) || null
    // If the script has no explicit ending cards, treat the last card as the terminal ending.
    const kind = (isEndingCard(c) || (!hasAnyEnding && cardId && cardId === terminalCardId)) ? 'ending' : 'scene'
    const node = {
      id: nid,
      scriptCardId: cardId,
      name: String(c.name || `脚本${i + 1}`),
      kind,
      textDraft: String(c.text || ''),
      backgroundId: prev?.backgroundId ? String(prev.backgroundId) : undefined,
      actorIds: Array.isArray(prev?.actorIds) ? prev.actorIds.map((x) => String(x)) : [],
      eventIds: Array.isArray(prev?.eventIds) ? prev.eventIds.map((x) => String(x)) : [],
      choices: []
    }
    nodes.push(node)
    nodeByCardId.set(cardId, node)
  }

  // Build choices with parsing.
  const indexByCardId = new Map(cards.map((c, i) => [String(c?.id || ''), i]).filter(([id]) => id))
  const nodeById = new Map(nodes.map((n) => [String(n?.id || ''), n]).filter(([id]) => id))
  const nodeNameById = (id) => {
    const n = nodeById.get(String(id || '')) || null
    return n && n.name ? String(n.name) : String(id || '')
  }

  const terminalNodeId = terminalCardId ? nodeIdForCard(terminalCardId) : ''
  if (!terminalNodeId && cards.length) {
    report.errors.push({ code: 'missing_terminal', message: '无法推断终止节点：最后一张卡缺少 id' })
  }

  // Consequence nodes are assigned by a choice point; do not re-overwrite their choices later in the main loop.
  const consequenceCardIds = new Set()

  let choicePointNo = 0
  const detectedChoicePoints = []
  const expChoicePoints = expectedFormula && typeof expectedFormula === 'object' ? (Number(expectedFormula.choicePoints || 0) || 0) : 0

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i] || {}
    const cardId = String(c.id || '')
    if (!cardId) continue
    const node = nodeByCardId.get(cardId)
    if (!node) continue
    if (node.kind === 'ending') continue
    if (consequenceCardIds.has(cardId)) continue

    const opts = pickOptions(c.text || '')
    const optionKeys = opts.map((o) => o.key)
    const prev = prevById.get(node.id) || null

    if (opts.length >= 2) {
      choicePointNo += 1
      detectedChoicePoints.push({ index: choicePointNo, cardIndex: i + 1, nodeName: node.name, options: optionKeys.slice() })
      const isLastChoicePoint = expChoicePoints ? (choicePointNo === expChoicePoints) : (i === lastChoiceCardIndex)
      const endingIndexByKey = isLastChoicePoint ? buildEndingIndexMap({ cards, fromIndex: i + 1, maxLookahead: 120 }) : new Map()

      const group = buildConsequenceGroup({ cards, choiceIndex: i, optionKeys, choicePointNo, allowEndingAsOutcome: isLastChoicePoint })
      const joinNodeId = group.joinIndex != null && cards[group.joinIndex]
        ? nodeIdForCard(String(cards[group.joinIndex].id || ''))
        : terminalNodeId
      const joinNodeName = nodeNameById(joinNodeId)

      const choices = []
      const missingKeys = []
      for (const o of opts) {
        const consIdx = group.consequenceIndexByKey.get(o.key)
        const consCard = (consIdx != null) ? cards[consIdx] : null
        let toNodeId = consCard && consCard.id ? nodeIdForCard(String(consCard.id)) : joinNodeId
        if (!consCard && isLastChoicePoint) {
          const endKey = optionKeyToEndingKey(o.key)
          const endIdx = endKey ? endingIndexByKey.get(String(endKey)) : null
          const endCard = (endIdx != null) ? cards[endIdx] : null
          if (endCard && endCard.id) toNodeId = nodeIdForCard(String(endCard.id))
        }
        if (!consCard) {
          missingKeys.push(o.key)
          report.warnings.push({
            code: 'missing_consequence',
            message: `选择点「${node.name}」缺少 ${o.key} 后果卡，已临时跳转到「${joinNodeName}」`
          })
        }
        choices.push(makeChoice(cardId, o.key, o.text, toNodeId))
      }

      // Common authoring mistake: consequence cards exist, but their i-prefix doesn't match the choicePointNo.
      // Example: first choice point used "3后果1/3后果2".
      if (missingKeys.length) {
        const mismatched = []
        for (let j = i + 1; j < Math.min(cards.length, i + 40); j++) {
          const p = parseNumericConsequence(cards[j]?.name)
          if (!p) continue
          if (!missingKeys.includes(String(p.k))) continue
          if (p.i === choicePointNo) continue
          mismatched.push({ found: `${p.i}后果${p.k}`, expected: `${choicePointNo}后果${p.k}`, cardName: String(cards[j]?.name || '') })
        }
        if (mismatched.length) {
          report.warnings.push({
            code: 'consequence_index_mismatch',
            message: `选择点「${node.name}」的后果卡编号与结构公式不一致（应使用“${choicePointNo}后果k”）。`,
            detail: mismatched.slice(0, 12)
          })
        }
      }

      node.choices = preserveOrReplaceChoices({ prevNode: prev, cardId, nodeName: node.name, nextChoices: choices, report })

      // Force consequence cards to skip over other consequences and converge to joinNodeId.
      for (const [k, idx] of group.consequenceIndexByKey.entries()) {
        const consCard = cards[idx]
        const consId = String(consCard?.id || '')
        const consNode = nodeByCardId.get(consId)
        if (!consNode) continue
        consequenceCardIds.add(consId)
        if (consNode.kind === 'ending') continue

        const consPrev = prevById.get(consNode.id) || null
        const endKey = isLastChoicePoint ? optionKeyToEndingKey(k) : null
        const endIdx = isLastChoicePoint && endKey ? endingIndexByKey.get(String(endKey)) : null
        const endCard = (endIdx != null) ? cards[endIdx] : null
        const toNodeId = endCard && endCard.id ? nodeIdForCard(String(endCard.id)) : joinNodeId
        const nextChoices = [makeContinueChoice(consId, toNodeId)]
        consNode.choices = preserveOrReplaceChoices({ prevNode: consPrev, cardId: consId, nodeName: consNode.name, nextChoices, report })
      }

      continue
    }

    // Default linear continue.
    const nextCard = cards[i + 1] || null
    const toNodeId = nextCard && nextCard.id ? nodeIdForCard(String(nextCard.id)) : terminalNodeId
    const nextChoices = [makeContinueChoice(cardId, toNodeId)]
    node.choices = preserveOrReplaceChoices({ prevNode: prev, cardId, nodeName: node.name, nextChoices, report })
  }

  // Keep existing extra nodes (manual branch scenes, manual endings) without deleting user work.
  const desiredIds = new Set(nodes.map((n) => String(n?.id || '')).filter(Boolean))
  for (const n of prevNodes) {
    const nid = String(n?.id || '')
    if (!nid) continue
    // Legacy auto-ending node (no longer used).
    if (nid === 'ending_auto') continue
    if (desiredIds.has(nid)) continue

    // Drop nodes that were previously generated from script cards that no longer exist.
    // This prevents stale nodes (e.g. deleted "结局2") from lingering and showing as unreachable.
    const prevScriptCardId = String(n?.scriptCardId || '')
    if (prevScriptCardId && nid === nodeIdForCard(prevScriptCardId) && !scriptCardIdSet.has(prevScriptCardId)) {
      continue
    }

    nodes.push({
      id: nid,
      scriptCardId: String(n?.scriptCardId || ''),
      name: String(n?.name || nid),
      kind: String(n?.kind || 'scene'),
      textDraft: typeof n?.textDraft === 'string' ? String(n.textDraft) : '',
      backgroundId: n?.backgroundId ? String(n.backgroundId) : undefined,
      actorIds: Array.isArray(n?.actorIds) ? n.actorIds.map((x) => String(x)) : [],
      eventIds: Array.isArray(n?.eventIds) ? n.eventIds.map((x) => String(x)) : [],
      choices: Array.isArray(n?.choices)
        ? n.choices.map((c) => ({ id: String(c?.id || ''), text: String(c?.text || ''), toNodeId: String(c?.toNodeId || '') }))
        : []
    })
  }

  const allIds = new Set(nodes.map((n) => String(n?.id || '')).filter(Boolean))
  const prevStart = prevBlueprint?.startNodeId ? String(prevBlueprint.startNodeId) : ''
  const firstCardId = cards[0] && cards[0].id ? String(cards[0].id) : ''
  const fallbackStart = firstCardId ? nodeIdForCard(firstCardId) : ''
  const startNodeId = prevStart && allIds.has(prevStart) ? prevStart : fallbackStart
  if (!startNodeId) {
    report.errors.push({ code: 'missing_start', message: '无法推断 startNodeId：scripts.cards 为空或 card.id 缺失' })
  }

  try {
    if (detectedChoicePoints.length) {
      report.info.push({
        code: 'choices_detected',
        message: `识别到选择点 ${detectedChoicePoints.length} 个：` + detectedChoicePoints.map((x) => `「${x.nodeName}」(${x.options.length}选)`).join('、'),
        detail: detectedChoicePoints
      })
    } else {
      report.info.push({ code: 'choices_detected', message: '未识别到选择点（没有发现“选项1/2..”格式）。' })
    }
  } catch (_) {}

  // Formula-based checks (if provided by AI generation)
  try {
    const f = expectedFormula && typeof expectedFormula === 'object' ? expectedFormula : null
    if (f) {
      const expChoicePoints = Number(f.choicePoints || 0) || 0
      const expOptions = Number(f.optionsPerChoice || 0) || 0
      const expEndings = Number(f.endings || 0) || 0

      if (expChoicePoints && detectedChoicePoints.length !== expChoicePoints) {
        report.warnings.push({
          code: 'formula_choicePoints_mismatch',
          message: `结构公式要求选择点 ${expChoicePoints} 个，但实际识别到 ${detectedChoicePoints.length} 个。`
        })
      }

      if (expOptions) {
        for (const cp of detectedChoicePoints) {
          if (cp.options.length !== expOptions) {
            report.warnings.push({
              code: 'formula_optionsPerChoice_mismatch',
              message: `结构公式要求每个选择点 ${expOptions} 个选项，但「${cp.nodeName}」识别到 ${cp.options.length} 个。`
            })
          }
        }
      }

      if (expEndings) {
        const endingCount = nodes.filter((n) => String(n?.kind || '') === 'ending').length
        if (endingCount < expEndings) {
          report.warnings.push({
            code: 'formula_endings_too_few',
            message: `结构公式要求结局 ${expEndings} 个，但蓝图当前结局节点只有 ${endingCount} 个。`
          })
        }
      }
    }
  } catch (_) {}

  return {
    blueprint: {
      schemaVersion: '1.0',
      startNodeId,
      placeholders: Array.isArray(prevBlueprint?.placeholders) ? prevBlueprint.placeholders : [],
      nodes,
      updatedAt: nowIso()
    },
    report,
    debug: { indexByCardId }
  }
}
