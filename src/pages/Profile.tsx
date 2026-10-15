import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  clearAllData,
  countInspirations,
  countOutfits,
  countWearLogs,
  getAllInspirations,
  getAllItems,
  getAllOutfits,
  getAllWearLogs,
  importAllData,
  getAllWishlist,
} from '../db'
import {
  normalizeInspiration,
  normalizeItem,
  normalizeOutfit,
  normalizeWearLog,
  type BackupData,
  type BackupDataV7,
  type ClothingItem,
  type Inspiration,
  type Outfit,
  type SeasonFilter,
  type WearLog,
  type WishlistItem,
  normalizeWishlist,
  SEASON_FILTERS,
} from '../types'
import { base64ToBlob, blobToBase64 } from '../utils/image'
import { rankItemsByWear, type ItemWearStat } from '../utils/wearStats'
import { loadSettings, saveSettings, type AppSettings } from '../utils/settings'
import { WearInsight } from '../components/WearInsight'
import { Toast } from '../components/Toast'
import { openTaobao, openPinduoduo } from '../utils/shop'
import { downloadTextFile, itemsToCsv } from '../utils/csvExport'
import { APP_VERSION } from '../version'
import {
  fetchRemoteVersion,
  getLocalVersion,
  isNativePlatform,
  isNewerVersion,
  markAutoChecked,
  openUpdateAction,
  type RemoteAppVersion,
} from '../utils/appUpdate'
import { useI18n } from '../i18n/I18nProvider'
import {
  formatYuan,
  summarizeWardrobeValue,
  summarizeWishlistValue,
  type WardrobeValueSummary,
} from '../utils/valueStats'

export function Profile() {
  const navigate = useNavigate()
  const { t, lang, setLang } = useI18n()
  const [itemCount, setItemCount] = useState(0)
  const [outfitCount, setOutfitCount] = useState(0)
  const [logCount, setLogCount] = useState(0)
  const [inspCount, setInspCount] = useState(0)
  const [valueSummary, setValueSummary] = useState<WardrobeValueSummary | null>(null)
  const [wishEstimate, setWishEstimate] = useState({ openCount: 0, openEstimate: 0 })
  const [shopKw, setShopKw] = useState(() => loadSettings().shopSearchKeyword)
  const [top, setTop] = useState<ItemWearStat[]>([])
  const [forgotten, setForgotten] = useState<ItemWearStat[]>([])
  const [idleHighPrice, setIdleHighPrice] = useState<ItemWearStat[]>([])
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<RemoteAppVersion | null>(null)
  const [updateMsg, setUpdateMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const checkUpdate = async (manual = false) => {
    setUpdateBusy(true)
    setUpdateMsg(manual ? t('profile.checkingManual') : '')
    setUpdateInfo(null)
    try {
      const remote = await fetchRemoteVersion()
      markAutoChecked()
      if (!remote) {
        setUpdateMsg(manual ? t('profile.updateFailNet') : '')
      } else if (isNewerVersion(remote)) {
        setUpdateInfo(remote)
        setUpdateMsg(t('profile.updateFound', { v: remote.version }))
      } else {
        setUpdateMsg(manual ? t('profile.updateLatest', { v: getLocalVersion().version }) : '')
      }
    } catch {
      setUpdateMsg(manual ? t('profile.updateFail') : '')
    }
    setUpdateBusy(false)
  }


  const refresh = useCallback(async () => {
    const [items, logs, oc, lc, ic, wishlist] = await Promise.all([
      getAllItems(),
      getAllWearLogs(),
      countOutfits(),
      countWearLogs(),
      countInspirations(),
      getAllWishlist(),
    ])
    setItemCount(items.length)
    setOutfitCount(oc)
    setLogCount(lc)
    setInspCount(ic)
    const ranked = rankItemsByWear(items, logs)
    setTop(ranked.top)
    setForgotten(ranked.forgotten)
    setIdleHighPrice(ranked.idleHighPrice)
    setValueSummary(
      summarizeWardrobeValue(items, { includeRetired: loadSettings().includeRetiredInValue }),
    )
    setWishEstimate(summarizeWishlistValue(wishlist))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateSettings = (patch: Partial<AppSettings>) => {
    // Merge from disk so language toggled elsewhere is not overwritten
    const next = { ...loadSettings(), ...settings, ...patch, language: lang }
    setSettings(next)
    saveSettings(next)
    if ('includeRetiredInValue' in patch || 'shopSearchKeyword' in patch) {
      void refresh()
      if ('shopSearchKeyword' in patch) setShopKw(next.shopSearchKeyword)
    }
  }

  const exportBackup = async () => {
    setBusy(true)
    try {
      const [items, outfits, wearLogs, inspirations, wishlist] = await Promise.all([
        getAllItems(true),
        getAllOutfits(true),
        getAllWearLogs(),
        getAllInspirations(true),
        getAllWishlist(),
      ])
      const exportedItems = await Promise.all(
        items.map(async (it) => {
          const { imageBlob, originalBlob, extraImages, ...rest } = it
          return {
            ...rest,
            imageBase64: await blobToBase64(imageBlob),
            originalBase64: originalBlob ? await blobToBase64(originalBlob) : undefined,
            extraImagesBase64: extraImages?.length
              ? await Promise.all(extraImages.map((b) => blobToBase64(b)))
              : undefined,
          }
        }),
      )
      const exportedOutfits = await Promise.all(
        outfits.map(async (o) => {
          const { coverBlob, ...rest } = o
          return {
            ...rest,
            coverBase64: coverBlob ? await blobToBase64(coverBlob) : undefined,
          }
        }),
      )
      const exportedLogs = await Promise.all(
        wearLogs.map(async (l) => {
          const { photoBlob, ...rest } = l
          return {
            ...rest,
            photoBase64: photoBlob ? await blobToBase64(photoBlob) : undefined,
          }
        }),
      )
      const exportedInsp = await Promise.all(
        inspirations.map(async (i) => {
          const { imageBlob, ...rest } = i
          return { ...rest, imageBase64: await blobToBase64(imageBlob) }
        }),
      )
      const exportedWish = await Promise.all(
        wishlist.map(async (w) => {
          const { imageBlob, ...rest } = w
          return {
            ...rest,
            imageBase64: imageBlob ? await blobToBase64(imageBlob) : undefined,
          }
        }),
      )
      const data: BackupDataV7 = {
        version: 7,
        exportedAt: new Date().toISOString(),
        items: exportedItems,
        outfits: exportedOutfits,
        wearLogs: exportedLogs,
        inspirations: exportedInsp,
        subcategoryTaxonomy: loadSettings().subcategoryTaxonomy,
        wishlist: exportedWish,
      }
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qing-yichu-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setToast(t('profile.exportDone'))
    } catch {
      setToast(t('profile.exportFail'))
    }
    setBusy(false)
  }

  const importBackup = async (file: File) => {
    setBusy(true)
    try {
      const data = JSON.parse(await file.text()) as BackupData
      if (!data || ![1, 2, 3, 4, 5, 6, 7].includes(data.version) || !Array.isArray(data.items)) {
        throw new Error('invalid')
      }
      if (
        !confirm(
          `将导入 ${data.items.length} 件单品、${data.outfits?.length ?? 0} 套搭配。同 ID 会覆盖，确定继续？`,
        )
      ) {
        setBusy(false)
        return
      }
      const items: ClothingItem[] = await Promise.all(
        data.items.map(async (it) => {
          const raw = it as {
            imageBase64: string
            originalBase64?: string
            extraImagesBase64?: string[]
          } & ClothingItem
          const { imageBase64, originalBase64, extraImagesBase64, ...rest } = raw
          return normalizeItem({
            ...(rest as ClothingItem),
            imageBlob: await base64ToBlob(imageBase64),
            originalBlob: originalBase64 ? await base64ToBlob(originalBase64) : undefined,
            extraImages: extraImagesBase64?.length
              ? await Promise.all(extraImagesBase64.map((b) => base64ToBlob(b)))
              : [],
            createdAt: (rest as ClothingItem).createdAt ?? Date.now(),
            updatedAt: (rest as ClothingItem).updatedAt ?? Date.now(),
            category: (rest as ClothingItem).category,
            color: (rest as ClothingItem).color,
            seasons: (rest as ClothingItem).seasons,
            season: (rest as { season?: string }).season as never,
            id: (rest as ClothingItem).id,
          })
        }),
      )
      const outfits = await Promise.all(
        (data.outfits ?? []).map(async (o) => {
          const raw = o as Outfit & { coverBase64?: string }
          const { coverBase64, ...rest } = raw
          return normalizeOutfit({
            ...rest,
            coverBlob: coverBase64 ? await base64ToBlob(coverBase64) : rest.coverBlob,
          })
        }),
      )
      const wearLogs: WearLog[] = await Promise.all(
        (data.wearLogs ?? []).map(async (l) => {
          const photoBase64 = 'photoBase64' in l ? l.photoBase64 : undefined
          const { photoBase64: _p, ...rest } = l as WearLog & { photoBase64?: string }
          return normalizeWearLog({
            ...rest,
            photoBlob: photoBase64 ? await base64ToBlob(photoBase64) : undefined,
            id: rest.id,
            date: rest.date,
            itemIds: rest.itemIds ?? [],
            createdAt: rest.createdAt ?? Date.now(),
          })
        }),
      )
      let inspirations: Inspiration[] = []
      if ((data.version === 2 || data.version === 3 || data.version === 4 || data.version === 5 || data.version === 6 || data.version === 7) && 'inspirations' in data && Array.isArray(data.inspirations)) {
        inspirations = await Promise.all(
          data.inspirations.map(async (i) => {
            const { imageBase64, ...rest } = i
            return normalizeInspiration({
              ...rest,
              imageBlob: await base64ToBlob(imageBase64),
              id: rest.id,
              createdAt: rest.createdAt,
              updatedAt: rest.updatedAt,
            })
          }),
        )
      }
      let wishlistRows: WishlistItem[] = []
      if ((data.version === 6 || data.version === 7) && 'wishlist' in data && Array.isArray(data.wishlist)) {
        wishlistRows = await Promise.all(
          data.wishlist.map(async (w) => {
            const { imageBase64, ...rest } = w
            return normalizeWishlist({
              ...rest,
              imageBlob: imageBase64 ? await base64ToBlob(imageBase64) : undefined,
              id: rest.id,
              createdAt: rest.createdAt,
              updatedAt: rest.updatedAt,
            })
          }),
        )
      }
      await importAllData(items, outfits, wearLogs, inspirations, wishlistRows)
      if ((data.version === 5 || data.version === 6 || data.version === 7) && 'subcategoryTaxonomy' in data && data.subcategoryTaxonomy) {
        const cur = loadSettings()
        const merged = { ...cur.subcategoryTaxonomy }
        for (const [k, list] of Object.entries(data.subcategoryTaxonomy)) {
          if (!Array.isArray(list)) continue
          const prev = merged[k as keyof typeof merged] ?? []
          merged[k as keyof typeof merged] = [...new Set([...prev, ...list.map((s) => String(s).trim()).filter(Boolean)])]
        }
        const next = { ...cur, subcategoryTaxonomy: merged }
        saveSettings(next)
        setSettings(next)
      }
      await refresh()
      setToast(t('profile.importDone'))
    } catch {
      setToast(t('profile.importFail'))
    }
    setBusy(false)
  }

  const exportCsv = async () => {
    setBusy(true)
    try {
      const items = await getAllItems(true)
      downloadTextFile(
        `qing-yichu-items-${new Date().toISOString().slice(0, 10)}.csv`,
        itemsToCsv(items),
      )
      setToast(t('profile.csvDone'))
    } catch {
      setToast(t('profile.exportFail'))
    }
    setBusy(false)
  }

  const clearData = async () => {
    if (!confirm(t('profile.clearConfirm1'))) return
    if (!confirm(t('profile.clearConfirm2'))) return
    await clearAllData()
    await refresh()
    setToast(t('profile.cleared'))
  }

  return (
    <div>
      <h1 className="page-title">{t('profile.title')}</h1>
      <p className="page-sub">{t('profile.sub')}</p>

      <div className="stat-grid stat-grid-4">
        <div className="stat-card">
          <div className="stat-num">{itemCount}</div>
          <div className="stat-label">{t('profile.stat.items')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{outfitCount}</div>
          <div className="stat-label">{t('profile.stat.outfits')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{logCount}</div>
          <div className="stat-label">{t('profile.stat.wears')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-num">{inspCount}</div>
          <div className="stat-label">{t('profile.stat.inspire')}</div>
        </div>
      </div>

      <section className="insight-section">
        <h3 className="insight-title">{t('profile.language')}</h3>
        <div className="lang-switch">
          <button
            type="button"
            className={`chip${lang === 'zh' ? ' active' : ''}`}
            onClick={() => setLang('zh')}
          >
            {t('profile.langZh')}
          </button>
          <button
            type="button"
            className={`chip${lang === 'en' ? ' active' : ''}`}
            onClick={() => setLang('en')}
          >
            {t('profile.langEn')}
          </button>
        </div>
      </section>

      <section className="insight-section">
        <h3 className="insight-title">{t('profile.season')}</h3>
        <p className="insight-hint">{t('profile.seasonHint')}</p>
        <label className="toggle-row">
          <span>{t('profile.seasonMode')}</span>
          <input
            type="checkbox"
            checked={settings.seasonMode}
            onChange={(e) => updateSettings({ seasonMode: e.target.checked })}
          />
        </label>
        <label className="toggle-row">
          <span>{t('profile.seasonReminder')}</span>
          <input
            type="checkbox"
            checked={settings.seasonReminder}
            onChange={(e) => updateSettings({ seasonReminder: e.target.checked })}
          />
        </label>
        <div className="chip-select" style={{ marginTop: 10 }}>
          {SEASON_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip${settings.currentSeasonFilter === s ? ' active' : ''}`}
              onClick={() => updateSettings({ currentSeasonFilter: s as SeasonFilter })}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      
      {valueSummary && valueSummary.itemCount > 0 && (
        <section className="insight-section value-section">
          <h3 className="insight-title">衣橱估值</h3>
          <div className="value-hero">{formatYuan(valueSummary.totalValue)}</div>
          <p className="insight-hint">
            {valueSummary.itemCount} 件，{valueSummary.pricedCount} 件有价，均价{' '}
            {valueSummary.pricedCount ? formatYuan(valueSummary.avgPrice) : '—'}
          </p>
          <label className="toggle-row">
            <span>含已淘汰</span>
            <input
              type="checkbox"
              checked={settings.includeRetiredInValue}
              onChange={(e) => updateSettings({ includeRetiredInValue: e.target.checked })}
            />
          </label>
          {wishEstimate.openCount > 0 && (
            <p className="insight-hint" style={{ marginTop: 8 }}>
              想买未购 {wishEstimate.openCount} 件
              {wishEstimate.openEstimate > 0 ? `，备注估价约 ${formatYuan(wishEstimate.openEstimate)}` : ''}
            </p>
          )}
          <div className="value-cat-list">
            {valueSummary.byCategory.map((row) => (
              <button
                key={row.category}
                type="button"
                className="value-cat-row"
                onClick={() => navigate(`/?category=${encodeURIComponent(row.category)}`)}
              >
                <span>{row.label}</span>
                <span className="value-cat-meta">
                  {row.count} 件
                  {row.pricedCount ? `  ${formatYuan(row.total)}` : ''}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="insight-section">
        <h3 className="insight-title">购物</h3>
        <p className="insight-hint">快捷打开淘宝 / 拼多多（优先唤起 App，失败则打开网页）</p>
        <div className="form-group">
          <label className="form-label">默认搜索词（可选）</label>
          <input
            className="form-input"
            value={shopKw}
            onChange={(e) => setShopKw(e.target.value)}
            onBlur={() => updateSettings({ shopSearchKeyword: shopKw.trim() })}
            placeholder="例如：白衬衫"
          />
        </div>
        <div className="shop-actions-row">
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => openTaobao(shopKw)}>
            打开淘宝
          </button>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => openPinduoduo(shopKw)}>
            打开拼多多
          </button>
        </div>
      </section>

      {itemCount > 0 && <WearInsight top={top} forgotten={forgotten} idleHighPrice={idleHighPrice} />}

      <div className="menu-list">
        <button type="button" className="menu-item" onClick={() => navigate('/wishlist')}>
          <span>想买</span>
          <span>心愿单</span>
        </button>
        <button type="button" className="menu-item" onClick={() => navigate('/laundry')}>
          <span>待洗</span>
          <span>洗衣篮</span>
        </button>
        <button type="button" className="menu-item" onClick={() => navigate('/categories')}>
          <span>管理分类</span>
          <span>子分类</span>
        </button>
        <button type="button" className="menu-item" onClick={() => navigate('/recycle')}>
          <span>回收站</span>
          <span>恢复 / 彻底删除</span>
        </button>
        <button type="button" className="menu-item" disabled={busy} onClick={() => void exportBackup()}>
          <span>{t('profile.export')}</span>
          <span>{t('profile.exportMeta')}</span>
        </button>
        <button type="button" className="menu-item" disabled={busy} onClick={() => void exportCsv()}>
          <span>{t('profile.exportCsv')}</span>
          <span>{t('profile.exportCsvMeta')}</span>
        </button>
        <button type="button" className="menu-item" disabled={busy} onClick={() => fileRef.current?.click()}>
          <span>{t('profile.import')}</span>
          <span>{t('profile.importMeta')}</span>
        </button>
        <button type="button" className="menu-item" onClick={() => void clearData()}>
          <span style={{ color: 'var(--danger)' }}>{t('profile.clear')}</span>
          <span />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importBackup(f)
          e.target.value = ''
        }}
      />


      <section className="insight-section">
        <h3 className="insight-title">{t('profile.version')}</h3>
        <p className="insight-hint">
          {t('profile.versionHint', {
            v: APP_VERSION,
            plat: isNativePlatform() ? t('profile.platNative') : t('profile.platWeb'),
          })}
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={updateBusy}
          onClick={() => void checkUpdate(true)}
        >
          {updateBusy ? t('profile.checking') : t('profile.checkUpdate')}
        </button>
        {updateMsg && <p className="insight-hint" style={{ marginTop: 8 }}>{updateMsg}</p>}
        {updateInfo && (
          <div className="help-box" style={{ marginTop: 12 }}>
            <h4>{t('profile.newVersion', { v: updateInfo.version })}</h4>
            {updateInfo.notes ? <p style={{ marginBottom: 8 }}>{updateInfo.notes}</p> : null}
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => openUpdateAction(updateInfo)}
            >
              {isNativePlatform() ? t('profile.downloadApk') : t('profile.refreshWeb')}
            </button>
          </div>
        )}
      </section>

      <div className="help-box">
        <h4>{t('profile.pwaHelpTitle')}</h4>
        <p style={{ marginBottom: 8 }}>{t('profile.pwaHelp')}</p>
        <ol>
          <li>
            <strong>iPhone（Safari）</strong>：分享 →「添加到主屏幕」
          </li>
          <li>
            <strong>Android（Chrome）</strong>：菜单 →「添加到主屏幕」
          </li>
        </ol>
        <p style={{ marginTop: 12, color: 'var(--muted)' }}>
          {t('profile.privacyHint')}
        </p>
      </div>

      <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.75rem', color: 'var(--muted)' }}>
        {t('app.name') + ' v' + APP_VERSION}
      </p>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </div>
  )
}
