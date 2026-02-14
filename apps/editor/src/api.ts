// API client for game_studio editor

import type {
  AiBackgroundRequest,
  BlueprintDocV1,
  DemoItem,
  DemoMeta,
  ProjectV1,
  ScriptDocV1,
  StoryV1
} from '@game-studio/schema'

export type { AiBackgroundRequest, BlueprintDocV1, DemoItem, DemoMeta, ProjectV1, ScriptDocV1, StoryV1 } from '@game-studio/schema'
export type * from '@game-studio/schema'

// ===== HTTP helpers =====
function base() {
  return (import.meta as any).env?.VITE_STUDIO_API_BASE || 'http://localhost:1999'
}

async function j(url: string, init?: RequestInit) {
  const resp = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } })
  const json = (await resp.json().catch(() => null)) as any
  if (!resp.ok || !json || json.success !== true) {
    // Prefer `message` for user-visible errors; `error` is often a short code like "ai_failed".
    const msg = json && (json.message || json.error) ? String(json.message || json.error) : `HTTP ${resp.status}`
    throw new Error(msg)
  }
  return json
}

export function resolveUrl(pathname: string) {
  return `${base()}${pathname}`
}

// ===== Projects =====
export async function listProjects(): Promise<ProjectV1[]> {
  const json = await j(`${base()}/api/projects`, { method: 'GET' })
  return Array.isArray(json.items) ? (json.items as ProjectV1[]) : []
}

export async function createProject(title: string): Promise<ProjectV1> {
  const json = await j(`${base()}/api/projects`, { method: 'POST', body: JSON.stringify({ title }) })
  return json.project as ProjectV1
}

export async function createProjectWithAi(prompt: string, title?: string): Promise<ProjectV1> {
  const json = await j(`${base()}/api/projects/ai/create`, {
    method: 'POST',
    body: JSON.stringify({ prompt, title })
  })
  return json.project as ProjectV1
}

export type AiCreateResult = {
  project: ProjectV1
  scripts: ScriptDocV1
  gen: {
    requestedProvider?: string
    provider: string
    model?: string | null
    api?: string | null
    durationMs?: number
    formula?: { choicePoints?: number; optionsPerChoice?: number; endings?: number; format?: string } | null
    error?: { message?: string; status?: number | null; code?: string | null; cause?: string | null } | null
  }
}

export async function createProjectWithAiDetailed(
  prompt: string,
  title?: string,
  opts?: { choicePoints?: number; optionsPerChoice?: number; endings?: number }
): Promise<AiCreateResult> {
  const json = await j(`${base()}/api/projects/ai/create`, {
    method: 'POST',
    body: JSON.stringify({ prompt, title, ...(opts || {}) })
  })
  return {
    project: json.project as ProjectV1,
    scripts: json.scripts as ScriptDocV1,
    gen: (json.gen as any) || { provider: 'unknown', requestedProvider: 'unknown' }
  }
}

export async function regenerateProjectScriptsWithAiDetailed(
  projectId: string,
  prompt: string,
  title?: string,
  opts?: { choicePoints?: number; optionsPerChoice?: number; endings?: number }
): Promise<AiCreateResult> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/ai/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ prompt, title, ...(opts || {}) })
  })
  return {
    project: json.project as ProjectV1,
    scripts: json.scripts as ScriptDocV1,
    gen: (json.gen as any) || { provider: 'unknown', requestedProvider: 'unknown' }
  }
}

export type AiScriptAnalysis = {
  ok: boolean
  summary: string
  stats?: { cardCount?: number; choiceCount?: number; firstChoiceCard?: number | null; endingCount?: number }
  checks: { id: string; ok: boolean; severity: string; message: string; detail?: any }[]
  suggestions: string[]
  proposedRules?: any
}

export async function analyzeProjectScripts(projectId: string): Promise<AiScriptAnalysis> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/analyze/scripts`, { method: 'POST' })
  return json.analysis as AiScriptAnalysis
}

export async function getGlobalAiRules(): Promise<any | null> {
  const json = await j(`${base()}/api/ai/rules`, { method: 'GET' })
  return (json.rules as any) || null
}

export async function saveGlobalAiRules(rules: any): Promise<any> {
  const json = await j(`${base()}/api/ai/rules`, { method: 'PUT', body: JSON.stringify({ rules }) })
  return json.rules as any
}

export async function getProject(id: string): Promise<{ project: ProjectV1; story: StoryV1 }> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(id)}`, { method: 'GET' })
  return { project: json.project as ProjectV1, story: json.story as StoryV1 }
}

export async function saveProject(id: string, payload: { project?: Partial<ProjectV1>; story?: StoryV1 }): Promise<ProjectV1> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) })
  return json.project as ProjectV1
}

export async function deleteProject(id: string): Promise<void> {
  await j(`${base()}/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function exportProject(id: string): Promise<{ buildId: string; distUrl: string }> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(id)}/export`, { method: 'POST' })
  return { buildId: String(json.buildId || ''), distUrl: String(json.distUrl || '') }
}



export async function getScripts(projectId: string): Promise<ScriptDocV1> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/scripts`, { method: 'GET' })
  return json.scripts as ScriptDocV1
}

export async function saveScripts(projectId: string, scripts: ScriptDocV1): Promise<ScriptDocV1> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/scripts`, {
    method: 'PUT',
    body: JSON.stringify({ scripts })
  })
  return json.scripts as ScriptDocV1
}

export async function getBlueprint(projectId: string): Promise<BlueprintDocV1> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/blueprint`, { method: 'GET' })
  return json.blueprint as BlueprintDocV1
}

export async function saveBlueprint(projectId: string, blueprint: BlueprintDocV1): Promise<BlueprintDocV1> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/blueprint`, {
    method: 'PUT',
    body: JSON.stringify({ blueprint })
  })
  return json.blueprint as BlueprintDocV1
}

export type BlueprintCompileResult = {
  blueprint: BlueprintDocV1
  report?: { errors?: any[]; warnings?: any[]; info?: any[] } | null
  validation?: { ok: boolean; errors?: any[]; warnings?: any[]; stats?: any } | null
}

export async function compileBlueprint(projectId: string): Promise<BlueprintDocV1> {
  const res = await compileBlueprintDetailed(projectId)
  return res.blueprint
}

export async function compileBlueprintDetailed(projectId: string): Promise<BlueprintCompileResult> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/compile/blueprint`, {
    method: 'POST',
    body: JSON.stringify({})
  })
  return {
    blueprint: json.blueprint as BlueprintDocV1,
    report: (json.report as any) || null,
    validation: (json.validation as any) || null
  }
}

export async function compileCompose(projectId: string): Promise<{ project: ProjectV1; story: StoryV1 }> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/compile/compose`, {
    method: 'POST',
    body: JSON.stringify({})
  })
  return { project: json.project as ProjectV1, story: json.story as StoryV1 }
}

export type AiBlueprintReview = {
  verdict: 'ok' | 'warn' | 'error'
  summary: string
  rootCauses: string[]
  userFacingExplanation: string[]
  suggestedEdits: { target: string; change: string; example: string | null }[]
}

export async function reviewBlueprintWithAi(projectId: string): Promise<{
  review: AiBlueprintReview
  meta: { provider: string; api?: string; model?: string; durationMs?: number }
  report?: any
  validation?: any
}> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/ai/review/blueprint`, { method: 'POST' })
  return { review: json.review as AiBlueprintReview, meta: (json.meta as any) || { provider: 'unknown' }, report: json.report, validation: json.validation }
}

export async function getCachedBlueprintReview(projectId: string): Promise<any | null> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/ai/review/blueprint`, { method: 'GET' })
  return (json.cached as any) || null
}

export async function fixScriptsWithAi(projectId: string): Promise<{
  scripts: ScriptDocV1
  meta: { provider: string; api?: string; model?: string; durationMs?: number }
  before?: { report?: any; validation?: any }
  after?: { blueprint?: BlueprintDocV1; report?: any; validation?: any }
}> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/ai/fix/scripts`, { method: 'POST' })
  return {
    scripts: json.scripts as ScriptDocV1,
    meta: (json.meta as any) || { provider: 'unknown' },
    before: json.before,
    after: json.after
  }
}

// ===== Demo library (read-only templates) =====
export async function listDemos(): Promise<DemoItem[]> {
  const json = await j(`${base()}/api/demos`, { method: 'GET' })
  return Array.isArray(json.items) ? (json.items as DemoItem[]) : []
}

export async function getDemo(id: string): Promise<{ demo: DemoMeta; project: ProjectV1 | null; story: StoryV1 }> {
  const json = await j(`${base()}/api/demos/${encodeURIComponent(id)}`, { method: 'GET' })
  return {
    demo: json.demo as DemoMeta,
    project: (json.project as ProjectV1 | null) ?? null,
    story: json.story as StoryV1
  }
}

// ===== AI (background image) =====
export async function generateBackgroundAi(
  projectId: string,
  payload: AiBackgroundRequest
): Promise<{ assetPath: string; url: string; provider: string; remoteUrl?: string }> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/ai/background`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  return {
    assetPath: String(json.assetPath || ''),
    url: String(json.url || ''),
    provider: String(json.provider || ''),
    remoteUrl: String(json.remoteUrl || '').trim() || undefined
  }
}

export async function analyzeBackgroundPromptAi(
  projectId: string,
  payload: Pick<AiBackgroundRequest, 'userInput' | 'globalPrompt' | 'globalNegativePrompt' | 'aspectRatio' | 'style'>
): Promise<{
  result: {
    globalPrompt: string
    globalNegativePrompt: string
    prompt: string
    negativePrompt: string
    finalPrompt?: string
    finalNegativePrompt?: string
    aspectRatio: string
    style: string
  }
  meta: any
}> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/ai/background/prompt`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  return {
    result: json.result as any,
    meta: (json.meta as any) || null
  }
}

// ===== AI (character) =====
export type AiCharacterFingerprintResult = {
  fingerprintPrompt: string
  negativePrompt: string
}

export async function analyzeCharacterFingerprintAi(
  projectId: string,
  payload: {
    storyTitle?: string
    characterName: string
    contextText?: string
    globalPrompt?: string
    style?: string
  }
): Promise<{ result: AiCharacterFingerprintResult; meta: any }> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/ai/character/fingerprint`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  return { result: (json.result as any) || { fingerprintPrompt: '', negativePrompt: '' }, meta: (json.meta as any) || null }
}

export type AiCharacterSpriteRequest = {
  globalPrompt?: string
  fingerprintPrompt?: string
  posePrompt?: string
  negativePrompt?: string
  style?: string
  width?: number
  height?: number
  steps?: number
  cfgScale?: number
  guidanceScale?: number
  sequentialImageGeneration?: string
}

export async function generateCharacterSpriteAi(
  projectId: string,
  payload: AiCharacterSpriteRequest
): Promise<{ assetPath: string; url: string; provider: string; remoteUrl?: string; prompt?: string; negativePrompt?: string }> {
  const json = await j(`${base()}/api/projects/${encodeURIComponent(projectId)}/ai/character/sprite`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  return {
    assetPath: String(json.assetPath || ''),
    url: String(json.url || ''),
    provider: String(json.provider || ''),
    remoteUrl: String(json.remoteUrl || '').trim() || undefined,
    prompt: typeof json.prompt === 'string' ? json.prompt : undefined,
    negativePrompt: typeof json.negativePrompt === 'string' ? json.negativePrompt : undefined
  }
}

// ===== Assets (upload local image) =====
export async function uploadProjectImage(
  projectId: string,
  file: File
): Promise<{ assetPath: string; url: string }> {
  const form = new FormData()
  form.append('file', file)
  const resp = await fetch(`${base()}/api/projects/${encodeURIComponent(projectId)}/assets/upload`, {
    method: 'POST',
    body: form
  })
  const json = (await resp.json().catch(() => null)) as any
  if (!resp.ok || !json || json.success !== true) {
    const msg = json && (json.error || json.message) ? String(json.error || json.message) : `HTTP ${resp.status}`
    throw new Error(msg)
  }
  return { assetPath: String(json.assetPath || ''), url: String(json.url || '') }
}

// ===== Studio settings (AI providers/models) =====
export type StudioSettings = {
  schemaVersion?: string
  updatedAt?: string
  enabled?: { scripts?: boolean; prompt?: boolean; image?: boolean; tts?: boolean }
  scripts?: { provider?: string | null; model?: string | null }
  prompt?: { provider?: string | null; model?: string | null }
  image?: { provider?: string | null; model?: string | null; apiUrl?: string | null; size?: string | null; sdwebuiBaseUrl?: string | null }
  tts?: { provider?: string | null; model?: string | null; apiUrl?: string | null }
  network?: { proxyUrl?: string | null }
}

export type StudioEffectiveConfig = {
  enabled: { scripts: boolean; prompt: boolean; image: boolean; tts: boolean }
  scripts: { provider: string; model: string | null }
  prompt: { provider: string; model: string | null }
  image: { provider: string; model: string | null; apiUrl: string | null; size: string | null; sdwebuiBaseUrl: string | null }
  tts: { provider: string; model: string | null; apiUrl: string | null }
  network: { proxyUrl: string | null }
}

export async function getStudioSettings(): Promise<{ settings: StudioSettings | null; effective: StudioEffectiveConfig }> {
  const json = await j(`${base()}/api/studio/settings`, { method: 'GET' })
  return { settings: (json.settings as any) || null, effective: json.effective as StudioEffectiveConfig }
}

export async function saveStudioSettings(settings: StudioSettings): Promise<StudioSettings> {
  const json = await j(`${base()}/api/studio/settings`, { method: 'PUT', body: JSON.stringify({ settings }) })
  return json.settings as StudioSettings
}

export async function diagnoseStudio(opts?: { deepText?: boolean; deepImages?: boolean; timeoutMs?: number }): Promise<any> {
  const json = await j(`${base()}/api/studio/diagnose`, { method: 'POST', body: JSON.stringify(opts || {}) })
  return json.diagnostics as any
}

export async function getAiStatus(): Promise<any> {
  const json = await j(`${base()}/api/ai/status`, { method: 'GET' })
  return json.ai as any
}
