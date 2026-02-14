/*
  apps/server/src/ai/blueprintReviewLocal.js

  说明：本模块提供本地化蓝图审查逻辑（不依赖 AI），针对由脚本生成的
  蓝图报告（report）和验证结果（validation）给出可读的根因、修正建议与
  最终判定（verdict）。用于在编辑器中为作者展示为何蓝图可能不可用或需修正。
*/

// 数组去重并过滤空字符串，常用于去重提示项。
function dedupe(arr) {
  return Array.from(new Set((arr || []).map((x) => String(x || '').trim()).filter(Boolean)))
}

// 对蓝图结果做本地 review，输入为：
// - formula: 结构公式（例如预期的结局数等）
// - report: 报告对象（包含 warnings）
// - validation: 蓝图验证结果（包含 warnings/errors）
// 返回：{ verdict, summary, rootCauses, userFacingExplanation, suggestedEdits }
export function reviewBlueprintLocally({ formula, report, validation }) {
  const warnings = Array.isArray(report?.warnings) ? report.warnings : []
  const valWarn = Array.isArray(validation?.warnings) ? validation.warnings : []
  const valErr = Array.isArray(validation?.errors) ? validation.errors : []

  const unreachable = valWarn.find((w) => String(w?.code || '') === 'unreachable_nodes')
  const unreachableMsg = unreachable && unreachable.message ? String(unreachable.message) : ''

  const rootCauses = []
  const userFacingExplanation = []
  const suggestedEdits = []

  // 将 report 中常见的警告代码转为易懂的根因描述
  for (const w of warnings) {
    const code = String(w?.code || '')
    if (code === 'missing_consequence') rootCauses.push('选择点缺少对应后果卡（i后果k）')
    if (code === 'consequence_index_mismatch') rootCauses.push('后果卡编号与“第几个选择点”不一致')
    if (code.startsWith('formula_')) rootCauses.push('结构公式与实际脚本不一致')
  }
  if (unreachableMsg) rootCauses.push('存在不可达节点（通常是结局未被任何分支指向）')
  if (valErr.length) rootCauses.push('蓝图存在硬错误（选项跳转目标不存在等）')

  userFacingExplanation.push('本次分析基于本地规则（非 AI），按“选项1..N / i后果k / 结局k”约定解析脚本生成蓝图。')

  // 根据不同问题给出面向用户的修改建议
  if (unreachableMsg) {
    userFacingExplanation.push(unreachableMsg)
    suggestedEdits.push({
      target: '结局卡',
      change: '确保每个结局都能从某个分支到达；常见做法是让“最后一个选择点”的不同选项分别落到 结局1/结局2/结局3。',
      example: '例如：把“2后果2”之后的承接改为进入“结局2”，或把“2后果2”的下一卡直接改名为“结局2”。'
    })
  }

  for (const w of warnings) {
    const code = String(w?.code || '')
    if (code === 'consequence_index_mismatch') {
      suggestedEdits.push({
        target: '后果卡命名',
        change: '后果卡 name 的 i 表示“第几个选择点”，不是卡片序号；请把后果卡改名为 i后果k（例如 1后果2、2后果1）。',
        example: '如果第一个选择点后果写成“3后果1/3后果2”，应改为“1后果1/1后果2”。'
      })
    }
    if (code === 'missing_consequence') {
      suggestedEdits.push({
        target: '后果卡缺失',
        change: '每个选择点的每个选项都需要 1 张对应后果卡（i后果k）。缺失会导致系统临时跳转收束，分支不清晰。',
        example: '若选择点有选项1/2，则至少需要 i后果1、i后果2 两张卡。'
      })
    }
    if (code === 'formula_endings_too_few') {
      const exp = formula && formula.endings ? Number(formula.endings) : null
      suggestedEdits.push({
        target: '结局数量',
        change: `结构公式要求结局数量为 ${exp || 'N'}，请补齐“结局1..结局N”并确保可达。`,
        example: '结局卡 name 建议写成：结局1、结局2（并从分支指向）。'
      })
    }
  }

  const verdict = valErr.length ? 'error' : (warnings.length || valWarn.length ? 'warn' : 'ok')
  const summary =
    verdict === 'ok'
      ? '结构与连线看起来合理。'
      : (valErr.length ? '存在会阻止运行的结构错误，需要先修正。' : '存在结构提示/不一致项，建议修正后再深入蓝图层。')

  return {
    verdict,
    summary,
    rootCauses: dedupe(rootCauses).slice(0, 12),
    userFacingExplanation: dedupe(userFacingExplanation).slice(0, 12),
    suggestedEdits: dedupe(suggestedEdits.map((x) => JSON.stringify(x))).map((s) => JSON.parse(s)).slice(0, 24)
  }
}

