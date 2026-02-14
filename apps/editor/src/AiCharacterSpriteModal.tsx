import React from 'react'

export type AiCharacterSpriteDraft = {
  globalPrompt: string
  fingerprintPrompt: string
  posePrompt: string
  negativePrompt: string
  style: 'picture_book' | 'cartoon' | 'national_style' | 'watercolor'
  width: number
  height: number
  steps: number
  cfgScale: number
  keyThreshold: number
  keyFeather: number
  crop: boolean
  padding: number
}

export default function AiCharacterSpriteModal(props: {
  open: boolean
  title?: string
  value: AiCharacterSpriteDraft
  busy: boolean
  error: string
  green?: null | { url?: string; assetPath?: string; provider?: string; remoteUrl?: string }
  transparentPreviewUrl?: string
  onChange: (next: AiCharacterSpriteDraft) => void
  onClose: () => void
  onGenerateGreen: () => void
  onApplyTransparent: () => void
}) {
  const v = props.value
  const g = props.green || null
  if (!props.open) return null

  return (
    <div className="ai-modal" role="dialog" aria-modal="true">
      <div
        className="ai-modal-card ai-character-modal-card"
        style={{ width: 'min(1040px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 24px)' }}
      >
        <div className="ai-modal-head">
          <div className="ai-modal-title" style={{ marginBottom: 0 }}>{props.title || 'AI 生成角色 PNG（透明）'}</div>
          <button
            type="button"
            className="icon-btn"
            onClick={props.onClose}
            disabled={props.busy}
            aria-label="关闭"
            title="关闭"
          >
            ✕
          </button>
        </div>

        <div className="ai-modal-row">
          <label>全局设定（可选）</label>
          <textarea
            rows={3}
            value={v.globalPrompt || ''}
            onChange={(e) => props.onChange({ ...v, globalPrompt: e.target.value })}
            placeholder="例如：古代中国寓言，绘本插画风格，色彩柔和，低饱和，高质量细节"
          />
        </div>

        <div className="ai-modal-row">
          <label>角色设定（指纹）</label>
          <textarea
            rows={3}
            value={v.fingerprintPrompt || ''}
            onChange={(e) => props.onChange({ ...v, fingerprintPrompt: e.target.value })}
            placeholder="例如：角色设定：中年农夫，稀疏胡须，头戴布巾，粗布麻衣，皮肤黝黑，朴实气质…"
          />
        </div>

        <div className="ai-modal-row">
          <label>姿势/动作（增量）</label>
          <textarea
            rows={4}
            value={v.posePrompt || ''}
            onChange={(e) => props.onChange({ ...v, posePrompt: e.target.value })}
            placeholder="例如：全身，站立，微笑，手持锄头，单人，居中"
          />
        </div>

        <div className="ai-modal-row">
          <label>负面（可选）</label>
          <input
            value={v.negativePrompt || ''}
            onChange={(e) => props.onChange({ ...v, negativePrompt: e.target.value })}
            placeholder="例如：变脸,换装,多角色,多只动物"
          />
        </div>

        <div className="ai-modal-grid">
          <div className="ai-modal-row">
            <label>风格</label>
            <select
              className="sel"
              value={v.style || 'picture_book'}
              onChange={(e) => props.onChange({ ...v, style: e.target.value as any })}
            >
              <option value="picture_book">绘本（picture_book）</option>
              <option value="cartoon">卡通（cartoon）</option>
              <option value="national_style">国风（national_style）</option>
              <option value="watercolor">水彩（watercolor）</option>
            </select>
          </div>
          <div className="ai-modal-row">
            <label>宽</label>
            <input type="number" value={v.width} onChange={(e) => props.onChange({ ...v, width: Number(e.target.value) })} />
          </div>
          <div className="ai-modal-row">
            <label>高</label>
            <input type="number" value={v.height} onChange={(e) => props.onChange({ ...v, height: Number(e.target.value) })} />
          </div>
          <div className="ai-modal-row">
            <label>步数</label>
            <input type="number" value={v.steps} onChange={(e) => props.onChange({ ...v, steps: Number(e.target.value) })} />
          </div>
          <div className="ai-modal-row">
            <label>CFG</label>
            <input type="number" value={v.cfgScale} onChange={(e) => props.onChange({ ...v, cfgScale: Number(e.target.value) })} />
          </div>
        </div>

        <div className="hr" />

        <div className="ai-modal-grid">
          <div className="ai-modal-row">
            <label>抠图容差</label>
            <input
              type="number"
              value={v.keyThreshold}
              onChange={(e) => props.onChange({ ...v, keyThreshold: Number(e.target.value) })}
              title="越大越容易把绿色背景抠掉，但也可能误伤角色的绿色区域"
            />
          </div>
          <div className="ai-modal-row">
            <label>边缘柔化</label>
            <input type="number" value={v.keyFeather} onChange={(e) => props.onChange({ ...v, keyFeather: Number(e.target.value) })} />
          </div>
          <div className="ai-modal-row">
            <label>自动裁剪</label>
            <select className="sel" value={v.crop ? '1' : '0'} onChange={(e) => props.onChange({ ...v, crop: e.target.value === '1' })}>
              <option value="1">开启</option>
              <option value="0">关闭</option>
            </select>
          </div>
          <div className="ai-modal-row">
            <label>裁剪边距</label>
            <input type="number" value={v.padding} onChange={(e) => props.onChange({ ...v, padding: Number(e.target.value) })} />
          </div>
        </div>

        <div className="ai-modal-hint">
          说明：服务端先生成“纯绿背景”的角色图，前端再自动抠图并上传为透明 PNG（可用于角色摆放/覆盖）。
        </div>

        <div className="hr" />

        <div className="ai-modal-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>绿幕预览</div>
            {g?.url ? (
              <img
                alt="greenscreen"
                src={String(g.url)}
                style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(148,163,184,0.18)' }}
              />
            ) : (
              <div className="hint">尚未生成</div>
            )}
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>透明 PNG 预览</div>
            {props.transparentPreviewUrl ? (
              <div
                style={{
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.18)',
                  padding: 10,
                  background:
                    'linear-gradient(45deg, rgba(148,163,184,0.16) 25%, transparent 25%),' +
                    'linear-gradient(-45deg, rgba(148,163,184,0.16) 25%, transparent 25%),' +
                    'linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.16) 75%),' +
                    'linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.16) 75%)',
                  backgroundSize: '20px 20px',
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                }}
              >
                <img alt="transparent" src={props.transparentPreviewUrl} style={{ width: '100%' }} />
              </div>
            ) : (
              <div className="hint">尚未抠图</div>
            )}
          </div>
        </div>

        {props.error ? <div className="ai-modal-err">{props.error}</div> : null}

        <div className="ai-modal-actions" style={{ marginTop: 12 }}>
          <button onClick={props.onGenerateGreen} disabled={props.busy || !String(v.fingerprintPrompt || v.posePrompt || '').trim()}>
            {props.busy ? '处理中…' : '生成绿幕图'}
          </button>
          <button onClick={props.onApplyTransparent} disabled={props.busy || !String(g?.url || '').trim()}>
            {props.busy ? '处理中…' : '抠图并应用'}
          </button>
        </div>
      </div>
    </div>
  )
}

