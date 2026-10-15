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

export function ImageEditor({
  blob,
  onChange,
  originalBlob,
  onOriginalChange,
  enableCutout = true,
}: Props) {
  const { t } = useI18n()
  const url = useBlobUrl(blob)
  const imgRef = useRef<HTMLImageElement>(null)
  const [cropping, setCropping] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

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

  const pointInImage = (clientX: number, clientY: number) => {
    const img = imgRef.current
    if (!img) return null
    const r = img.getBoundingClientRect()
    const x = (clientX - r.left) / r.width
    const y = (clientY - r.top) / r.height
    if (x < 0 || y < 0 || x > 1 || y > 1) return null
    return { x, y }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!cropping) return
    const p = pointInImage(e.clientX, e.clientY)
    if (!p) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    start.current = p
    setDrag({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!cropping || !start.current) return
    const p = pointInImage(e.clientX, e.clientY)
    if (!p) return
    const x = Math.min(start.current.x, p.x)
    const y = Math.min(start.current.y, p.y)
    setDrag({
      x,
      y,
      w: Math.abs(p.x - start.current.x),
      h: Math.abs(p.y - start.current.y),
    })
  }

  const onPointerUp = () => {
    start.current = null
  }

  const applyCrop = async () => {
    if (!drag || drag.w < 0.05 || drag.h < 0.05) {
      setError(t('editor.cropHint'))
      return
    }
    setBusy(t('editor.cropping'))
    try {
      const next = await cropImage(blob, drag)
      onChange(next)
      setCropping(false)
      setDrag(null)
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

  return (
    <div className="image-editor">
      <div
        className={`image-editor-stage${cropping ? ' cropping' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {url && (
          <img ref={imgRef} className="image-preview" src={url} alt={t('editor.preview')} draggable={false} />
        )}
        {cropping && drag && drag.w > 0 && (
          <div
            className="crop-box"
            style={{
              left: `${drag.x * 100}%`,
              top: `${drag.y * 100}%`,
              width: `${drag.w * 100}%`,
              height: `${drag.h * 100}%`,
            }}
          />
        )}
      </div>

      <div className="image-editor-tools">
        <button type="button" className="chip" disabled={!!busy} onClick={() => void rotate()}>
          {t('editor.rotate')}
        </button>
        {!cropping ? (
          <button type="button" className="chip" disabled={!!busy} onClick={() => setCropping(true)}>
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
                setDrag(null)
              }}
            >
              {t('editor.cancel')}
            </button>
          </>
        )}
        {enableCutout && (
          <button type="button" className="chip" disabled={!!busy} onClick={() => void cutout()}>
            {t('cutout.btn')}
          </button>
        )}
        {originalBlob && (
          <button type="button" className="chip" disabled={!!busy} onClick={restore}>
            {t('editor.restore')}
          </button>
        )}
      </div>
      {busy && <p className="editor-status">{busy}</p>}
      {error && <p className="editor-status error">{error}</p>}
    </div>
  )
}
