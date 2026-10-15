import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllItems, getAllOutfits, getItemsByIds, saveOutfit, uid } from '../db'
import type { ClothingItem, Outfit } from '../types'
import { OCCASIONS } from '../types'
import { EmptyState } from '../components/EmptyState'
import { useBlobUrl } from '../hooks/useBlobUrl'
import { randomOutfit } from '../utils/randomOutfit'
import { loadSettings } from '../utils/settings'
import { Toast } from '../components/Toast'
import { useI18n } from '../i18n/I18nProvider'

function OutfitThumb({ item }: { item: ClothingItem }) {
  const url = useBlobUrl(item.imageBlob)
  return url ? (
    <img className="outfit-thumb" src={url} alt={item.name || item.category} />
  ) : (
    <div className="outfit-thumb" />
  )
}

function OutfitCard({ outfit, onClick, unnamed }: { outfit: Outfit; onClick: () => void; unnamed: string }) {
  const [items, setItems] = useState<ClothingItem[]>([])
  const coverUrl = useBlobUrl(outfit.coverBlob ?? null)
  const { t } = useI18n()
  useEffect(() => {
    void getItemsByIds(outfit.itemIds).then(setItems)
  }, [outfit.itemIds])
  return (
    <button type="button" className="outfit-card" onClick={onClick}>
      {coverUrl && <img className="outfit-cover" src={coverUrl} alt="" />}
      <div className="outfit-card-title">{outfit.name || unnamed}</div>
      {outfit.occasion && <div className="outfit-card-occ">{outfit.occasion}</div>}
      <div className="outfit-thumbs">
        {items.slice(0, 6).map((it) => (
          <OutfitThumb key={it.id} item={it} />
        ))}
        {items.length === 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{t('outfits.noItems')}</span>
        )}
      </div>
    </button>
  )
}

export function Outfits() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [outfits, setOutfits] = useState<Outfit[]>([])
  const [allItems, setAllItems] = useState<ClothingItem[]>([])
  const [randomPicks, setRandomPicks] = useState<ClothingItem[]>([])
  const [showRandom, setShowRandom] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [occasionFilter, setOccasionFilter] = useState<string | '全部'>('全部')

  const load = useCallback(async () => {
    setLoading(true)
    const [o, items] = await Promise.all([getAllOutfits(), getAllItems()])
    setOutfits(o)
    setAllItems(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const occasionOptions = useMemo(() => {
    const set = new Set<string>()
    for (const o of OCCASIONS) set.add(o)
    for (const o of outfits) {
      const x = o.occasion.trim()
      if (x) set.add(x)
    }
    return ['全部', ...set]
  }, [outfits])

  const filteredOutfits = useMemo(() => {
    if (occasionFilter === '全部') return outfits
    return outfits.filter((o) => o.occasion.trim() === occasionFilter)
  }, [outfits, occasionFilter])

  const rollRandom = async () => {
    const settings = loadSettings()
    const season = settings.seasonMode ? settings.currentSeasonFilter : null
    const picks = randomOutfit(allItems, season)
    setRandomPicks(picks)
    setShowRandom(true)
    if (picks.length === 0) {
      setToast(t('outfits.needMore'))
    }
  }

  const saveRandom = async () => {
    if (randomPicks.length === 0) return
    setSaving(true)
    const now = Date.now()
    const id = uid()
    await saveOutfit({
      id,
      name: t('outfits.random'),
      occasion: '日常',
      itemIds: randomPicks.map((p) => p.id),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    setSaving(false)
    setToast(t('outfits.saved'))
    setShowRandom(false)
    await load()
    navigate(`/outfits/${id}`)
  }

  return (
    <div className="page-with-fab">
      <h1 className="page-title">{t('outfits.title')}</h1>
      <p className="page-sub">
        {outfits.length > 0 ? t('outfits.count', { n: outfits.length }) : t('outfits.sub')}
      </p>

      {outfits.length > 0 && (
        <div className="chip-select" style={{ marginBottom: 14 }}>
          {occasionOptions.map((o) => (
            <button
              key={o}
              type="button"
              className={`chip${occasionFilter === o ? ' active' : ''}`}
              onClick={() => setOccasionFilter(o)}
            >
              {o === '全部' ? t('common.all') : o}
            </button>
          ))}
        </div>
      )}

      {allItems.length >= 2 && (
        <>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginBottom: 8 }}
            onClick={() => void rollRandom()}
          >
            {t('outfits.random')}
          </button>
        </>
      )}

      {showRandom && randomPicks.length > 0 && (
        <section className="suggest-card">
          <div className="suggest-head">
            <h3>{t('outfits.randomGroup')}</h3>
            <button type="button" className="btn-text" onClick={() => void rollRandom()}>
              {t('outfits.reroll')}
            </button>
          </div>
          <div className="suggest-thumbs">
            {randomPicks.map((it) => (
              <button
                key={it.id}
                type="button"
                className="suggest-thumb-wrap"
                onClick={() => navigate(`/items/${it.id}`)}
              >
                <OutfitThumb item={it} />
                <span>{it.category}</span>
              </button>
            ))}
          </div>
          <div className="suggest-actions">
            <button
              type="button"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => setShowRandom(false)}
            >
              {t('outfits.close')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={saving}
              onClick={() => void saveRandom()}
            >
              {t('outfits.saveAs')}
            </button>
          </div>
        </section>
      )}

      {loading ? null : outfits.length === 0 ? (
        <EmptyState
          icon="✨"
          title={t('outfits.empty')}
          description={t('outfits.emptyHint')}
          actionLabel={t('outfits.create')}
          onAction={() => navigate('/outfits/new')}
        />
      ) : filteredOutfits.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title={t('outfits.empty')}
          description=""
          actionLabel={t('common.all')}
          onAction={() => setOccasionFilter('全部')}
        />
      ) : (
        <div className="outfit-list">
          {filteredOutfits.map((o) => (
            <OutfitCard
              key={o.id}
              outfit={o}
              unnamed={t('outfits.unnamed')}
              onClick={() => navigate(`/outfits/${o.id}`)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="fab"
        aria-label={t('outfits.create')}
        onClick={() => navigate('/outfits/new')}
      >
        +
      </button>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
