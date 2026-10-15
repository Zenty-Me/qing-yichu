import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getAllItems, getAllWearLogs, getItem, saveItem, softDeleteItem, uid } from '../db'
import type { Category, ClothingItem, Season } from '../types'
import {
  CATEGORIES,
  CATEGORY_LABEL,
  COLOR_PRESETS,
  CORE_CATEGORIES,
  SEASONS,
} from '../types'
import { ItemCard } from '../components/ItemCard'
import { EmptyState } from '../components/EmptyState'
import { TodaySuggest } from '../components/TodaySuggest'
import { BatchEditSheet, type BatchPatch } from '../components/BatchEditSheet'
import { buildWearCounts } from '../utils/wearStats'
import { loadSettings, saveSettings, mergeSubcategoryOptions } from '../utils/settings'
import { filterAndSortItems, type SortKey } from '../utils/wardrobeQuery'
import { compressImage } from '../utils/image'
import { Toast } from '../components/Toast'
import { formatYuan, summarizeWardrobeValue } from '../utils/valueStats'
import { seasonReminderMessage } from '../utils/seasonReminder'
import { useBlobUrl } from '../hooks/useBlobUrl'
import { useI18n } from '../i18n/I18nProvider'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'created', label: '最近添加' },
  { key: 'updated', label: '最近更新' },
  { key: 'wear', label: '穿着次数' },
  { key: 'name', label: '名称' },
  { key: 'priceDesc', label: '价格从高到低' },
  { key: 'priceAsc', label: '价格从低到高' },
]

const BATCH_CAP = 30

function RailCard({
  item,
  wearCount,
  onClick,
}: {
  item: ClothingItem
  wearCount?: number
  onClick: () => void
}) {
  const url = useBlobUrl(item.imageBlob, item.updatedAt)
  return (
    <button type="button" className="rail-card" onClick={onClick}>
      <div className="rail-card-img-wrap">
        {url ? <img src={url} alt={item.name || item.category} /> : <div className="rail-card-ph" />}
        {typeof wearCount === 'number' && wearCount > 0 && (
          <span className="wear-pill">穿 {wearCount}</span>
        )}
        {item.needsWash && <span className="laundry-pill">待洗</span>}
        {item.subcategory ? <span className="group-thumb-badge">{item.subcategory}</span> : null}
      </div>
      <div className="rail-card-name">{item.name || CATEGORY_LABEL[item.category] || item.category}</div>
    </button>
  )
}

export function Wardrobe() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<ClothingItem[]>([])
  const [wearMap, setWearMap] = useState<Map<string, number>>(() => new Map())
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [color, setColor] = useState<string | '全部'>('全部')
  const [season, setSeason] = useState<Season | '全部'>('全部')
  const [sort, setSort] = useState<SortKey>('created')
  const [showMoreFilters, setShowMoreFilters] = useState(false)
  const [settings, setSettings] = useState(() => loadSettings())
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const batchRef = useRef<HTMLInputElement>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [showBatchEdit, setShowBatchEdit] = useState(false)
  const [laundryOnly, setLaundryOnly] = useState(false)
  /** per-category subcategory filter; '' = 全部 */
  const [subFilter, setSubFilter] = useState<Partial<Record<Category, string>>>({})
  /** optional one-shot focus from ?category= deep link */
  const [focusCategory, setFocusCategory] = useState<Category | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [list, logs] = await Promise.all([getAllItems(), getAllWearLogs()])
    setItems(list)
    const counts = buildWearCounts(logs)
    const map = new Map<string, number>()
    counts.forEach((v, k) => map.set(k, v.count))
    setWearMap(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const location = useLocation()

  // Reload list when returning to wardrobe so edited imageBlob thumbnails stay in sync
  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '') {
      void load()
    }
  }, [location.pathname, location.key, load])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const onPageShow = () => void load()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [load])

  useEffect(() => {
    const cat = searchParams.get('category')
    if (cat && (CATEGORIES as readonly string[]).includes(cat)) {
      setFocusCategory(cat as Category)
      const next = new URLSearchParams(searchParams)
      next.delete('category')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const filtered = useMemo(
    () =>
      filterAndSortItems(items, {
        search,
        category: focusCategory ?? '全部',
        color,
        season,
        sort,
        seasonMode: settings.seasonMode,
        currentSeasonFilter: settings.currentSeasonFilter,
        wearCounts: wearMap,
        laundryOnly,
      }),
    [items, search, focusCategory, color, season, sort, settings, wearMap, laundryOnly],
  )

  const valueSummary = useMemo(
    () => summarizeWardrobeValue(items, { includeRetired: settings.includeRetiredInValue }),
    [items, settings.includeRetiredInValue],
  )

  const seasonBanner = useMemo(() => seasonReminderMessage(settings), [settings])

  /** Non-empty category sections only (empty sections hidden). */
  const sections = useMemo(() => {
    const byCat = new Map<Category, ClothingItem[]>()
    for (const c of CATEGORIES) byCat.set(c, [])
    for (const it of filtered) {
      byCat.get(it.category)?.push(it)
    }
    const result: { cat: Category; list: ClothingItem[] }[] = []
    const pushIfNonEmpty = (c: Category) => {
      const list = byCat.get(c) ?? []
      if (list.length > 0) result.push({ cat: c, list })
    }
    for (const c of CORE_CATEGORIES) pushIfNonEmpty(c)
    for (const c of CATEGORIES) {
      if (CORE_CATEGORIES.includes(c)) continue
      pushIfNonEmpty(c)
    }
    return result
  }, [filtered])

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
    setShowBatchEdit(false)
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onBatchImport = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (!list.length) {
      setToast('请选择图片文件')
      return
    }
    if (list.length > BATCH_CAP) {
      setToast(`一次最多导入 ${BATCH_CAP} 张`)
      return
    }
    setBatchBusy(true)
    let ok = 0
    for (let i = 0; i < list.length; i++) {
      setToast(`导入中 ${i + 1}/${list.length}…`)
      try {
        const imageBlob = await compressImage(list[i])
        const now = Date.now()
        await saveItem({
          id: uid(),
          name: '',
          category: '其他',
          color: '#bbb5a8',
          seasons: ['四季'],
          notes: '',
          brand: '',
          price: null,
          size: '',
          location: '',
          tags: [],
          purchaseDate: '',
          purchaseLink: '',
          imageBlob,
          originalBlob: imageBlob,
          extraImages: [],
          tempMin: null,
          tempMax: null,
          status: '使用中',
          needsWash: false,
          subcategory: '',
          createdAt: now + i,
          updatedAt: now + i,
          deletedAt: null,
        })
        ok++
      } catch {
        /* skip */
      }
    }
    setBatchBusy(false)
    await load()
    setToast(`已导入 ${ok} 件。点「选择」可批量改分类`)
  }

  const applyBatchPatch = async (patch: BatchPatch) => {
    const ids = [...selected]
    const now = Date.now()
    for (const id of ids) {
      const item = await getItem(id)
      if (!item || item.deletedAt) continue
      const tags =
        patch.addTags?.length ? Array.from(new Set([...item.tags, ...patch.addTags])) : item.tags
      await saveItem({
        ...item,
        category: patch.category ?? item.category,
        subcategory: patch.subcategory !== undefined ? patch.subcategory : item.subcategory,
        seasons: patch.seasons ?? item.seasons,
        color: patch.color ?? item.color,
        brand: patch.brand !== undefined ? patch.brand : item.brand,
        location: patch.location !== undefined ? patch.location : item.location,
        size: patch.size !== undefined ? patch.size : item.size,
        tags,
        updatedAt: now,
      })
    }
    exitSelect()
    await load()
    setToast(`已更新 ${ids.length} 件`)
  }

  const batchSoftDelete = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!confirm(`将 ${ids.length} 件移入回收站？`)) return
    for (const id of ids) await softDeleteItem(id)
    exitSelect()
    await load()
    setToast(`已移入回收站 ${ids.length} 件`)
  }

  return (
    <div className={`page-with-fab${selectMode ? ' page-selecting' : ''}`}>
      <header className="wardrobe-topbar">
        <span className="icon-btn" aria-hidden style={{ visibility: 'hidden' }}>
          ▦
        </span>
        <h1 className="wardrobe-title">{t('wardrobe.title')}</h1>
        <div className="wardrobe-topbar-right">
          <button
            type="button"
            className="icon-btn"
            aria-label="搜索"
            onClick={() => setShowSearch((v) => !v)}
          >
            ⌕
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="更多"
            onClick={() => setShowMoreMenu((v) => !v)}
          >
            ⋯
          </button>
        </div>
      </header>

      {seasonBanner && (
        <div className="season-banner">
          <span>{seasonBanner}</span>
          <button type="button" className="btn-text" onClick={() => navigate('/me')}>
            设置
          </button>
        </div>
      )}

      {items.length > 0 && (
        <button type="button" className="value-chip" onClick={() => navigate('/me')}>
          衣橱估值 {formatYuan(valueSummary.totalValue)}
          <span className="value-chip-sub">{valueSummary.pricedCount}/{valueSummary.itemCount} 件有价</span>
        </button>
      )}

      {showMoreMenu && (
        <div className="more-menu">
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false)
              if (selectMode) exitSelect()
              else {
                setSelectMode(true)
                setSelected(new Set())
              }
            }}
          >
            {selectMode ? '退出选择' : '选择'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false)
              const next = { ...settings, seasonMode: !settings.seasonMode }
              setSettings(next)
              saveSettings(next)
              setToast(next.seasonMode ? `季节模式：${next.currentSeasonFilter}` : '已关闭季节模式')
            }}
          >
            季节模式
          </button>
          <button
            type="button"
            disabled={batchBusy}
            onClick={() => {
              setShowMoreMenu(false)
              batchRef.current?.click()
            }}
          >
            批量导入
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false)
              setLaundryOnly((v) => !v)
              setToast(laundryOnly ? '已关闭待洗筛选' : '仅显示待洗')
            }}
          >
            {laundryOnly ? '关闭待洗筛选' : '仅看待洗'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false)
              navigate('/laundry')
            }}
          >
            待洗列表
          </button>
          <button
            type="button"
            onClick={() => {
              setShowMoreMenu(false)
              navigate('/categories')
            }}
          >
            管理分类
          </button>
          <button type="button" onClick={() => { setShowMoreMenu(false); navigate('/me') }}>
            我的 / 回收站
          </button>
        </div>
      )}

      {laundryOnly && (
        <div className="filter-banner">
          正在筛选待洗单品
          <button type="button" className="btn-text" onClick={() => setLaundryOnly(false)}>清除</button>
        </div>
      )}

      {focusCategory && (
        <div className="filter-banner">
          仅看「{CATEGORY_LABEL[focusCategory]}」
          <button type="button" className="btn-text" onClick={() => setFocusCategory(null)}>
            显示全部分类
          </button>
        </div>
      )}

      {showSearch && (
        <input
          className="form-input search-input"
          type="search"
          placeholder="搜索名称、品牌、备注、标签…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      )}

      {!loading && !selectMode && items.length >= 2 && <TodaySuggest items={items} />}

      {selectMode && (
        <div className="toolbar-row">
          <button type="button" className="btn-text" onClick={() => setSelected(new Set(filtered.map((i) => i.id)))}>
            全选当前列表
          </button>
          <button type="button" className="btn-text" onClick={() => setSelected(new Set())}>
            清空选择
          </button>
          <span className="page-sub" style={{ margin: 0 }}>
            已选 {selected.size}
          </span>
        </div>
      )}

      {items.length > 0 && !selectMode && (
        <>
          <div className="toolbar-row">
            <select className="form-select sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button type="button" className="btn-text" onClick={() => setShowMoreFilters((v) => !v)}>
              {showMoreFilters ? '收起筛选' : '更多筛选'}
            </button>
          </div>
          {showMoreFilters && (
            <div className="more-filters">
              <div className="form-label">颜色</div>
              <div className="filter-row">
                <button type="button" className={`chip${color === '全部' ? ' active' : ''}`} onClick={() => setColor('全部')}>全部</button>
                {COLOR_PRESETS.map((p) => (
                  <button
                    key={p.hex}
                    type="button"
                    className={`chip chip-swatch${color === p.hex ? ' active' : ''}`}
                    onClick={() => setColor(p.hex)}
                    title={p.label}
                    aria-label={p.label}
                  >
                    <span className="chip-swatch-dot" style={{ background: p.hex }} />
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="form-label">季节</div>
              <div className="filter-row">
                <button type="button" className={`chip${season === '全部' ? ' active' : ''}`} onClick={() => setSeason('全部')}>全部</button>
                {SEASONS.map((s) => (
                  <button key={s} type="button" className={`chip${season === s ? ' active' : ''}`} onClick={() => setSeason(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {loading ? null : items.length === 0 ? (
        <EmptyState
          icon="👗"
          title={t('wardrobe.empty')}
          description={t('wardrobe.emptyHint')}
          actionLabel="添加单品"
          onAction={() => navigate('/items/new')}
        />
      ) : selectMode ? (
        filtered.length === 0 ? (
          <EmptyState icon="👗" title="没有符合条件的单品" description="试试调整筛选" />
        ) : (
          <div className="item-grid">
            {filtered.map((item) => (
              <ItemCard
                key={`${item.id}-${item.updatedAt}`}
                item={item}
                wearCount={wearMap.get(item.id)}
                selectMode
                selected={selected.has(item.id)}
                onClick={() => toggleSelect(item.id)}
              />
            ))}
          </div>
        )
      ) : sections.length === 0 ? (
        <EmptyState icon="👗" title="没有符合条件的单品" description="试试调整筛选" />
      ) : (
        <div className="category-sections">
          {sections.map(({ cat, list }) => (
            <section key={cat} className="category-card" id={`cat-${cat}`}>
              <div className="category-card-head">
                <div className="category-card-title">
                  {CATEGORY_LABEL[cat]}
                  <span className="category-count">({list.length})</span>
                </div>
                <div className="category-card-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`添加${CATEGORY_LABEL[cat]}`}
                    onClick={() => navigate(`/items/new?category=${encodeURIComponent(cat)}`)}
                  >
                    +
                  </button>
                </div>
              </div>
              {(() => {
                const used = list.map((i) => i.subcategory).filter(Boolean)
                const chips = mergeSubcategoryOptions(settings, cat, used)
                const active = subFilter[cat] ?? ''
                const shown =
                  !active
                    ? list
                    : active === '__none__'
                      ? list.filter((i) => !i.subcategory)
                      : list.filter((i) => i.subcategory === active)
                const hasAnySub = list.some((i) => Boolean(i.subcategory))
                return (
                  <>
                    {hasAnySub && (
                      <div className="subcat-filter-row">
                        <button
                          type="button"
                          className={`chip chip-sm${!active ? ' active' : ''}`}
                          onClick={() => setSubFilter((s) => ({ ...s, [cat]: '' }))}
                        >
                          全部
                        </button>
                        {list.some((i) => !i.subcategory) && (
                          <button
                            type="button"
                            className={`chip chip-sm${active === '__none__' ? ' active' : ''}`}
                            onClick={() => setSubFilter((s) => ({ ...s, [cat]: '__none__' }))}
                          >
                            未分
                          </button>
                        )}
                        {chips.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`chip chip-sm${active === s ? ' active' : ''}`}
                            onClick={() => setSubFilter((prev) => ({ ...prev, [cat]: s }))}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="category-rail">
                      {shown.length === 0 ? (
                        <p className="subcat-empty-hint">该子分类下暂无单品</p>
                      ) : (
                        shown.map((it) => (
                          <RailCard
                            key={`${it.id}-${it.updatedAt}`}
                            item={it}
                            wearCount={wearMap.get(it.id)}
                            onClick={() => navigate(`/items/${it.id}`)}
                          />
                        ))
                      )}
                    </div>
                  </>
                )
              })()}
            </section>
          ))}
        </div>
      )}

      <input
        ref={batchRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          void onBatchImport(e.target.files)
          e.target.value = ''
        }}
      />

      {selectMode ? (
        <div className="batch-action-bar">
          <button type="button" className="btn btn-secondary" disabled={!selected.size} onClick={() => setShowBatchEdit(true)}>
            批量修改
          </button>
          <button type="button" className="btn btn-danger" disabled={!selected.size} onClick={() => void batchSoftDelete()}>
            移入回收站
          </button>
          <button type="button" className="btn btn-ghost" onClick={exitSelect}>
            取消
          </button>
        </div>
      ) : (
        <div className="fab-cluster">
          <button type="button" className="fab" aria-label={t('wardrobe.add')} onClick={() => navigate('/items/new')}>
            +
          </button>
        </div>
      )}

      {showBatchEdit && selected.size > 0 && (
        <BatchEditSheet
          count={selected.size}
          onClose={() => setShowBatchEdit(false)}
          onApply={(p) => void applyBatchPatch(p)}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
