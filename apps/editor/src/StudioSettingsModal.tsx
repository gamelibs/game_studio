import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { diagnoseStudio, getAiStatus, getStudioSettings, saveStudioSettings, type StudioEffectiveConfig, type StudioSettings } from './api'

type Props = {
  open: boolean
  onClose: () => void
}

function safeBool(v: any, fallback: boolean) {
  return typeof v === 'boolean' ? v : fallback
}

function normalizeDraft(settings: StudioSettings | null): StudioSettings {
  const s = settings && typeof settings === 'object' ? settings : {}
  return {
    enabled: {
      scripts: safeBool(s.enabled?.scripts, true),
      prompt: safeBool(s.enabled?.prompt, true),
      image: safeBool(s.enabled?.image, true),
      tts: safeBool(s.enabled?.tts, false)
    },
    scripts: { provider: s.scripts?.provider || '', model: s.scripts?.model || '' },
    prompt: { provider: s.prompt?.provider || '', model: s.prompt?.model || '' },
    image: {
      provider: s.image?.provider || '',
      model: s.image?.model || '',
      apiUrl: s.image?.apiUrl || '',
      size: s.image?.size || '',
      sdwebuiBaseUrl: s.image?.sdwebuiBaseUrl || ''
    },
    tts: { provider: s.tts?.provider || '', model: s.tts?.model || '', apiUrl: s.tts?.apiUrl || '' },
    network: { proxyUrl: s.network?.proxyUrl || '' }
  }
}

export default function StudioSettingsModal(props: Props) {
  const [tab, setTab] = useState<'config' | 'diagnose'>('config')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [savedAt, setSavedAt] = useState('')

  const [effective, setEffective] = useState<StudioEffectiveConfig | null>(null)
  const [draft, setDraft] = useState<StudioSettings>(() => normalizeDraft(null))

  const [diagBusy, setDiagBusy] = useState(false)
  const [diagDeepText, setDiagDeepText] = useState(false)
  const [diagDeepImages, setDiagDeepImages] = useState(false)
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [aiStatus, setAiStatus] = useState<any>(null)

  async function refresh() {
    setBusy(true)
    setErr('')
    try {
      const [s, st] = await Promise.all([getStudioSettings(), getAiStatus().catch(() => null)])
      setDraft(normalizeDraft(s.settings))
      setEffective(s.effective)
      setAiStatus(st)
      setSavedAt('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!props.open) return
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open])

  const effectiveSummary = useMemo(() => {
    if (!effective) return ''
    const lines: string[] = []
    lines.push(`写故事：${effective.enabled.scripts ? '启用' : '关闭'} / ${effective.scripts.provider}${effective.scripts.model ? ` / ${effective.scripts.model}` : ''}`)
    lines.push(`提示词：${effective.enabled.prompt ? '启用' : '关闭'} / ${effective.prompt.provider}${effective.prompt.model ? ` / ${effective.prompt.model}` : ''}`)
    lines.push(`出图：${effective.enabled.image ? '启用' : '关闭'} / ${effective.image.provider}${effective.image.model ? ` / ${effective.image.model}` : ''}`)
    if (effective.image.provider === 'doubao') {
      if (effective.image.apiUrl) lines.push(`  imagesUrl：${effective.image.apiUrl}`)
      if (effective.image.size) lines.push(`  size：${effective.image.size}`)
    }
    if (effective.image.provider === 'sdwebui' && effective.image.sdwebuiBaseUrl) lines.push(`  sdwebui：${effective.image.sdwebuiBaseUrl}`)
    if (effective.network.proxyUrl) lines.push(`代理：${effective.network.proxyUrl}`)
    return lines.join('\n')
  }, [effective])

  async function save() {
    setBusy(true)
    setErr('')
    try {
      const next = await saveStudioSettings(draft)
      setDraft(normalizeDraft(next))
      const s = await getStudioSettings()
      setEffective(s.effective)
      setSavedAt(new Date().toLocaleString())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runDiagnose() {
    setDiagBusy(true)
    setErr('')
    try {
      const res = await diagnoseStudio({ deepText: diagDeepText, deepImages: diagDeepImages, timeoutMs: 12000 })
      setDiagnostics(res)
      if (res && res.effective) setEffective(res.effective)
      setTab('diagnose')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDiagBusy(false)
    }
  }

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) props.onClose()
  }

  if (!props.open) return null

  return (
    <div className="ai-modal" role="dialog" aria-modal="true" aria-label="工具设置" onClick={onOverlayClick}>
      <div className="ai-modal-card" style={{ width: 920, maxHeight: 'calc(100vh - 24px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="ai-modal-title" style={{ marginBottom: 0 }}>设置</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className={`btn secondary ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')} disabled={busy}>
              参数
            </button>
            <button className={`btn secondary ${tab === 'diagnose' ? 'active' : ''}`} onClick={() => setTab('diagnose')} disabled={busy}>
              检测
            </button>
            <button className="btn secondary" onClick={props.onClose} disabled={busy}>
              关闭
            </button>
          </div>
        </div>

        <div className="hr" />

        {tab === 'config' ? (
          <>
            <div className="ai-modal-row">
              <div>快速检测</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={diagDeepText} onChange={(e) => setDiagDeepText(e.target.checked)} /> 深度验证文本
                </label>
                <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={diagDeepImages} onChange={(e) => setDiagDeepImages(e.target.checked)} /> 深度验证出图（会消耗额度）
                </label>
                <button className="btn secondary" onClick={() => runDiagnose()} disabled={busy || diagBusy}>
                  {diagBusy ? '检测中…' : '运行检测'}
                </button>
              </div>
            </div>

            <div className="ai-modal-row">
              <div>当前生效</div>
              <textarea value={effectiveSummary || '(加载中…)'} readOnly style={{ minHeight: 94, resize: 'none' }} />
            </div>

            <div className="ai-modal-row">
              <div>代理</div>
              <input
                value={String(draft.network?.proxyUrl || '')}
                placeholder="http://127.0.0.1:7890（可选）"
                onChange={(e) => setDraft((d) => ({ ...d, network: { ...(d.network || {}), proxyUrl: e.target.value } }))}
              />
            </div>

            <div className="ai-modal-grid">
              <div className="subfold">
                <div className="subfold-head">
                  <div className="subfold-title">写故事（脚本）</div>
                </div>
                <div className="subfold-body">
                  <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={safeBool(draft.enabled?.scripts, true)}
                      onChange={(e) => setDraft((d) => ({ ...d, enabled: { ...(d.enabled || {}), scripts: e.target.checked } }))}
                    />
                    启用
                  </label>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Provider</div>
                    <select
                      className="sel"
                      value={String(draft.scripts?.provider || '')}
                      onChange={(e) => setDraft((d) => ({ ...d, scripts: { ...(d.scripts || {}), provider: e.target.value } }))}
                    >
                      <option value="">跟随环境变量</option>
                      <option value="local">local</option>
                      <option value="openai">openai</option>
                      <option value="doubao">doubao</option>
                    </select>
                  </div>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Model</div>
                    <input
                      value={String(draft.scripts?.model || '')}
                      placeholder="如 doubao-1-5-pro-32k-250115（可留空）"
                      onChange={(e) => setDraft((d) => ({ ...d, scripts: { ...(d.scripts || {}), model: e.target.value } }))}
                    />
                  </div>
                </div>
              </div>

              <div className="subfold">
                <div className="subfold-head">
                  <div className="subfold-title">提示词（Seedream）</div>
                </div>
                <div className="subfold-body">
                  <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={safeBool(draft.enabled?.prompt, true)}
                      onChange={(e) => setDraft((d) => ({ ...d, enabled: { ...(d.enabled || {}), prompt: e.target.checked } }))}
                    />
                    启用
                  </label>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Provider</div>
                    <select
                      className="sel"
                      value={String(draft.prompt?.provider || '')}
                      onChange={(e) => setDraft((d) => ({ ...d, prompt: { ...(d.prompt || {}), provider: e.target.value } }))}
                    >
                      <option value="">自动</option>
                      <option value="openai">openai</option>
                      <option value="doubao">doubao</option>
                    </select>
                  </div>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Model</div>
                    <input
                      value={String(draft.prompt?.model || '')}
                      placeholder="如 doubao-1-5-pro-32k-250115（可留空）"
                      onChange={(e) => setDraft((d) => ({ ...d, prompt: { ...(d.prompt || {}), model: e.target.value } }))}
                    />
                  </div>
                </div>
              </div>

              <div className="subfold">
                <div className="subfold-head">
                  <div className="subfold-title">出图（背景图）</div>
                </div>
                <div className="subfold-body">
                  <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={safeBool(draft.enabled?.image, true)}
                      onChange={(e) => setDraft((d) => ({ ...d, enabled: { ...(d.enabled || {}), image: e.target.checked } }))}
                    />
                    启用
                  </label>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Provider</div>
                    <select
                      className="sel"
                      value={String(draft.image?.provider || '')}
                      onChange={(e) => setDraft((d) => ({ ...d, image: { ...(d.image || {}), provider: e.target.value } }))}
                    >
                      <option value="">跟随环境变量</option>
                      <option value="sdwebui">sdwebui</option>
                      <option value="doubao">doubao</option>
                    </select>
                  </div>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Model</div>
                    <input
                      value={String(draft.image?.model || '')}
                      placeholder="如 doubao-seedream-4-0-250828（可留空）"
                      onChange={(e) => setDraft((d) => ({ ...d, image: { ...(d.image || {}), model: e.target.value } }))}
                    />
                  </div>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Size</div>
                    <input
                      value={String(draft.image?.size || '')}
                      placeholder='如 1024x1024（可选）'
                      onChange={(e) => setDraft((d) => ({ ...d, image: { ...(d.image || {}), size: e.target.value } }))}
                    />
                  </div>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Ark URL</div>
                    <input
                      value={String(draft.image?.apiUrl || '')}
                      placeholder="https://ark.../api/v3/images/generations（可选）"
                      onChange={(e) => setDraft((d) => ({ ...d, image: { ...(d.image || {}), apiUrl: e.target.value } }))}
                    />
                  </div>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>SDWebUI</div>
                    <input
                      value={String(draft.image?.sdwebuiBaseUrl || '')}
                      placeholder="http://127.0.0.1:7860（可选）"
                      onChange={(e) => setDraft((d) => ({ ...d, image: { ...(d.image || {}), sdwebuiBaseUrl: e.target.value } }))}
                    />
                  </div>
                </div>
              </div>

              <div className="subfold">
                <div className="subfold-head">
                  <div className="subfold-title">语音（TTS）</div>
                </div>
                <div className="subfold-body">
                  <div className="hint" style={{ marginBottom: 8 }}>当前项目尚未实现语音生成接口，这里先预留配置。</div>
                  <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={safeBool(draft.enabled?.tts, false)}
                      onChange={(e) => setDraft((d) => ({ ...d, enabled: { ...(d.enabled || {}), tts: e.target.checked } }))}
                    />
                    启用
                  </label>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Provider</div>
                    <select
                      className="sel"
                      value={String(draft.tts?.provider || '')}
                      onChange={(e) => setDraft((d) => ({ ...d, tts: { ...(d.tts || {}), provider: e.target.value } }))}
                    >
                      <option value="">none</option>
                      <option value="doubao">doubao</option>
                      <option value="openai">openai</option>
                    </select>
                  </div>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>Model</div>
                    <input
                      value={String(draft.tts?.model || '')}
                      placeholder="可留空"
                      onChange={(e) => setDraft((d) => ({ ...d, tts: { ...(d.tts || {}), model: e.target.value } }))}
                    />
                  </div>
                  <div className="ai-modal-row" style={{ gridTemplateColumns: '110px 1fr' }}>
                    <div>API URL</div>
                    <input
                      value={String(draft.tts?.apiUrl || '')}
                      placeholder="可留空"
                      onChange={(e) => setDraft((d) => ({ ...d, tts: { ...(d.tts || {}), apiUrl: e.target.value } }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            {err ? <div className="ai-modal-err">{err}</div> : null}
            {savedAt ? <div className="ai-modal-ok" style={{ marginTop: 10, opacity: 0.95 }}>已保存：{savedAt}</div> : null}

            <div className="ai-modal-actions" style={{ marginTop: 12 }}>
              <button className="btn secondary" onClick={() => refresh()} disabled={busy}>
                重新加载
              </button>
              <button className="btn" onClick={() => save()} disabled={busy}>
                保存并应用
              </button>
            </div>

            {aiStatus ? (
              <div className="ai-modal-hint">
                服务器 AI 状态（环境变量快照）：{String(aiStatus?.provider || '')}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="hint" style={{ marginBottom: 10 }}>
              “深度验证出图”会触发一次真实的 Doubao 生图请求（仅取 URL，不下载），可能消耗额度。
            </div>
            <div className="ai-modal-row">
              <div>操作</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={diagDeepText} onChange={(e) => setDiagDeepText(e.target.checked)} /> 深度验证文本
                </label>
                <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={diagDeepImages} onChange={(e) => setDiagDeepImages(e.target.checked)} /> 深度验证出图
                </label>
                <button className="btn secondary" onClick={() => runDiagnose()} disabled={busy || diagBusy}>
                  {diagBusy ? '检测中…' : '重新检测'}
                </button>
              </div>
            </div>
            <div className="ai-modal-row">
              <div>结果</div>
              <textarea value={diagnostics ? JSON.stringify(diagnostics, null, 2) : '(未检测)'} readOnly style={{ minHeight: 320 }} />
            </div>
            {err ? <div className="ai-modal-err">{err}</div> : null}
          </>
        )}
      </div>
    </div>
  )
}
