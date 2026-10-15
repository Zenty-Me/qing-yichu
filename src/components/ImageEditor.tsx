import { useEffect, useRef, useState } from 'react'
import { cropImage, rotateImage } from '../utils/image'
import { useBlobUrl } from '../hooks/useBlobUrl'
import {
  cutoutBusyMessage,
  cutoutErrorMessage,
  removeImageBackground,
  yieldToUi,
} from '../utils/cutout'
import { useI18n } from '../i18n/I18nProvider'

interface Props {
  blob: Blob
  onChange: (next: Blob) => void
  /** Snapshot taken before edits so 「恢复原图」 works */
  originalBlob?: Blob | null
  onOriginalChange?: (blob: Blob) => void
  enableCutout?: boolean
}

type Rect = { x: number; y: number; w: number; h: number }
type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

const MIN = 0.08
const DEFAULT_CROP: Rect = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }

function clampRect(r: Rect): Rect {
  let { x, y, w, h } = r
  w = Math.max(MIN, Math.min(1, w))
  h = Math.max(MIN, Math.min(1, h))
  x = Math.max(0, Math.min(1 - w, x))
  y = Math.max(0, Math.min(1 - h, y))
  return { x, y, w, h }
}

export function ImageEditor({
  blob,
  onChange,
  originalBlob,
  onOriginalChange,
  enableCutout = true,
}: Props) {
  const { t } = useI18n()
  const url = useBlobUrl(blob)
  const stageRef = useRef<HTMLDivElement>(null)
  const [cropping, setCropping] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [rect, setRect] = useState<Rect>(DEFAULT_CROP)
  const dragRef = useRef<{
    handle: Handle
    startX: number
    startY: number
    origin: Rect
  } | null>(null)

  useEffect(() => {
    setError('')
  }, [blob])

  const rotate = async () => {
    setBusy(t('editor.rotating'))
    try {
      const next = await rotateImage(blob, 1)
      onChange(next)
    } catch {
      setError(t('editor.rotateFail'))
    }
    setBusy('')
  }

  const pointInStage = (clientX: number, clientY: number) => {
    const el = stageRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return null
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
    }
  }

  const beginCrop = () => {
    setRect(DEFAULT_CROP)
    setCropping(true)
    setError('')
  }

  const onPointerDown = (e: React.PointerEvent, handle: Handle) => {
    if (!cropping) return
    e.preventDefault()
    e.stopPropagation()
    const p = pointInStage(e.clientX, e.clientY)
    if (!p) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      handle,
      startX: p.x,
      startY: p.y,
      origin: { ...rect },
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!cropping || !d) return
    const p = pointInStage(e.clientX, e.clientY)
    if (!p) return
    const dx = p.x - d.startX
    const dy = p.y - d.startY
    const o = d.origin
    let next: Rect = { ...o }

    switch (d.handle) {
      case 'move':
        next = { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h }
        break
      case 'n':
        next = { x: o.x, y: o.y + dy, w: o.w, h: o.h - dy }
        break
      case 's':
        next = { x: o.x, y: o.y, w: o.w, h: o.h + dy }
        break
      case 'w':
        next = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h }
        break
      case 'e':
        next = { x: o.x, y: o.y, w: o.w + dx, h: o.h }
        break
      case 'nw':
        next = { x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy }
        break
      case 'ne':
        next = { x: o.x, y: o.y + dy, w: o.w + dx, h: o.h - dy }
        break
      case 'sw':
        next = { x: o.x + dx, y: o.y, w: o.w - dx, h: o.h + dy }
        break
      case 'se':
        next = { x: o.x, y: o.y, w: o.w + dx, h: o.h + dy }
        break
    }

    // Normalize inverted drags
    if (next.w < 0) {
      next.x += next.w
      next.w = Math.abs(next.w)
    }
    if (next.h < 0) {
      next.y += next.h
      next.h = Math.abs(next.h)
    }
    setRect(clampRect(next))
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const applyCrop = async () => {
    if (rect.w < MIN || rect.h < MIN) {
      setError(t('editor.cropHint'))
      return
    }
    setBusy(t('editor.cropping'))
    try {
      if (onOriginalChange && !originalBlob) onOriginalChange(blob)
      const next = await cropImage(blob, rect)
      onChange(next)
      setCropping(false)
    } catch {
      setError(t('editor.cropFail'))
    }
    setBusy('')
  }

  const cutout = async () => {
    setBusy(cutoutBusyMessage(0))
    setError('')
    await yieldToUi()
    try {
      if (onOriginalChange && !originalBlob) onOriginalChange(blob)
      const raw = await removeImageBackground(blob, {
        onProgress: (p) => setBusy(cutoutBusyMessage(p.percent)),
      })
      onChange(raw)
    } catch (err) {
      console.error(err)
      setError(cutoutErrorMessage(err))
    }
    setBusy('')
  }

  const restore = () => {
    if (!originalBlob) return
    onChange(originalBlob)
  }

  const handles: Handle[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']

  return (
    <div className="image-editor">
      <div
        ref={stageRef}
        className={`image-editor-stage${cropping ? ' cropping' : ''}`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {url && (
          <img className="image-preview" src={url} alt={t('editor.preview')} draggable={false} />
        )}
        {cropping && (
          <>
            <div className="crop-shade" aria-hidden>
              <div
                className="crop-shade-hole"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                }}
              />
            </div>
            <div
              className="crop-box crop-box-interactive"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
              onPointerDown={(e) => onPointerDown(e, 'move')}
            >
              <div className="crop-grid" aria-hidden />
              {handles.map((h) => (
                <span
                  key={h}
                  className={`crop-handle crop-handle-${h}`}
                  onPointerDown={(e) => onPointerDown(e, h)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="image-editor-tools">
        <button type="button" className="chip" disabled={!!busy || cropping} onClick={() => void rotate()}>
          {t('editor.rotate')}
        </button>
        {!cropping ? (
          <button type="button" className="chip" disabled={!!busy} onClick={beginCrop}>
            {t('editor.crop')}
          </button>
        ) : (
          <>
            <button type="button" className="chip active" disabled={!!busy} onClick={() => void applyCrop()}>
              {t('editor.confirmCrop')}
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setCropping(false)
                setError('')
              }}
            >
              {t('editor.cancel')}
            </button>
          </>
        )}
        {enableCutout && (
          <button type="button" className="chip" disabled={!!busy || cropping} onClick={() => void cutout()}>
            {t('cutout.btn')}
          </button>
        )}
        {originalBlob && (
          <button type="button" className="chip" disabled={!!busy || cropping} onClick={restore}>
            {t('editor.restore')}
          </button>
        )}
      </div>
      {cropping && !busy && !error && (
        <p className="editor-status">{t('editor.cropDragHint')}</p>
      )}
      {busy && <p className="editor-status">{busy}</p>}
      {error && <p className="editor-status error">{error}</p>}
    </div>
  )
}
