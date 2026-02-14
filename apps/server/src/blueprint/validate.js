function makeItem(code, message, detail) {
  return { code: String(code || ''), message: String(message || ''), ...(detail ? { detail } : {}) }
}

export function validateBlueprintDoc(blueprint) {
  const errors = []
  const warnings = []
  const info = []

  const nodes = Array.isArray(blueprint?.nodes) ? blueprint.nodes : []
  const idSet = new Set()
  const byId = new Map()

  for (const n of nodes) {
    const id = String(n?.id || '')
    if (!id) {
      errors.push(makeItem('node_missing_id', '存在节点缺少 id'))
      continue
    }
    if (idSet.has(id)) errors.push(makeItem('node_duplicate_id', `节点 id 重复：${id}`))
    idSet.add(id)
    byId.set(id, n)
  }

  const startNodeId = String(blueprint?.startNodeId || '')
  if (!startNodeId) errors.push(makeItem('missing_startNodeId', 'blueprint.startNodeId 为空'))
  else if (!byId.has(startNodeId)) errors.push(makeItem('start_not_found', `startNodeId 不存在：${startNodeId}`))

  const nodeName = (id) => {
    const n = byId.get(String(id || '')) || null
    const name = n && n.name ? String(n.name) : ''
    return name || String(id || '')
  }

  // Choice target checks
  for (const n of nodes) {
    const nid = String(n?.id || '')
    const kind = String(n?.kind || 'scene')
    const choices = Array.isArray(n?.choices) ? n.choices : []
    if (kind !== 'ending' && choices.length === 0) warnings.push(makeItem('scene_no_choices', `场景「${nodeName(nid)}」没有选项`))
    if (kind === 'ending' && choices.length) warnings.push(makeItem('ending_has_choices', `结局「${nodeName(nid)}」不应有选项`))

    for (const c of choices) {
      const cid = String(c?.id || '')
      const text = String(c?.text || '').trim()
      const toNodeId = String(c?.toNodeId || '')
      if (!cid) warnings.push(makeItem('choice_missing_id', `「${nodeName(nid)}」存在选项缺少 id`))
      if (!text) warnings.push(makeItem('choice_missing_text', `「${nodeName(nid)}」存在选项缺少文本（${cid || '无ID'}）`))
      if (!toNodeId) errors.push(makeItem('choice_missing_to', `「${nodeName(nid)}」的选项缺少跳转目标（${text || cid || '未知选项'}）`))
      else if (!byId.has(toNodeId)) {
        errors.push(makeItem('choice_to_not_found', `「${nodeName(nid)}」的选项「${text || cid || '未知选项'}」指向不存在节点：${toNodeId}`))
      }
    }
  }

  // Reachability
  const reachable = new Set()
  const stack = []
  if (startNodeId && byId.has(startNodeId)) stack.push(startNodeId)
  while (stack.length) {
    const id = stack.pop()
    if (!id || reachable.has(id)) continue
    reachable.add(id)
    const n = byId.get(id)
    const choices = Array.isArray(n?.choices) ? n.choices : []
    for (const c of choices) {
      const to = String(c?.toNodeId || '')
      if (to && byId.has(to) && !reachable.has(to)) stack.push(to)
    }
  }

  const unreachable = []
  for (const n of nodes) {
    const id = String(n?.id || '')
    if (id && !reachable.has(id)) unreachable.push(id)
  }
  if (unreachable.length) {
    const names = unreachable.map((id) => nodeName(id))
    warnings.push(makeItem('unreachable_nodes', `存在不可达节点：${names.slice(0, 24).join('、')}${names.length > 24 ? ` 等 ${names.length} 个` : ''}`, { ids: unreachable }))
  }

  const endingReachable = nodes.some((n) => String(n?.kind || '') === 'ending' && reachable.has(String(n?.id || '')))
  if (!endingReachable) warnings.push(makeItem('no_reachable_endings', '从 startNodeId 出发无法到达任何结局节点'))

  const ok = errors.length === 0
  return { ok, errors, warnings, info, stats: { nodes: nodes.length, reachable: reachable.size } }
}
