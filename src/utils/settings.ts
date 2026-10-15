import type { Category, SeasonFilter } from '../types'
import { CATEGORIES } from '../types'
import { currentSeason } from './suggest'

const KEY = 'qing-yichu-settings'

export type SubcategoryTaxonomy = Partial<Record<Category, string[]>>

export interface AppSettings {
  /** When true, wardrobe filters to 四季 + currentSeasonFilter */
  seasonMode: boolean
  currentSeasonFilter: SeasonFilter
  /** Custom subcategory labels per main category */
  subcategoryTaxonomy: SubcategoryTaxonomy
  /** 衣橱估值是否含已淘汰 */
  includeRetiredInValue: boolean
  /** 购物快捷搜索默认关键词 */
  shopSearchKeyword: string
  /** 换季提醒横幅 */
  seasonReminder: boolean
  /** UI language; default zh for existing users */
  language: 'zh' | 'en'
}

function defaults(): AppSettings {
  return {
    seasonMode: false,
    currentSeasonFilter: currentSeason(),
    subcategoryTaxonomy: {},
    includeRetiredInValue: false,
    shopSearchKeyword: '',
    seasonReminder: true,
    language: 'zh',
  }
}

function normalizeTaxonomy(raw: unknown): SubcategoryTaxonomy {
  if (!raw || typeof raw !== 'object') return {}
  const out: SubcategoryTaxonomy = {}
  for (const c of CATEGORIES) {
    const list = (raw as SubcategoryTaxonomy)[c]
    if (!Array.isArray(list)) continue
    const cleaned = [
      ...new Set(
        list
          .map((s) => (typeof s === 'string' ? s.trim() : ''))
          .filter(Boolean),
      ),
    ]
    if (cleaned.length) out[c] = cleaned
  }
  return out
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults()
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const base = defaults()
    return {
      seasonMode: Boolean(parsed.seasonMode),
      currentSeasonFilter:
        parsed.currentSeasonFilter && ['春', '夏', '秋', '冬'].includes(parsed.currentSeasonFilter)
          ? parsed.currentSeasonFilter
          : base.currentSeasonFilter,
      subcategoryTaxonomy: normalizeTaxonomy(parsed.subcategoryTaxonomy),
      includeRetiredInValue: Boolean(parsed.includeRetiredInValue),
      shopSearchKeyword: typeof parsed.shopSearchKeyword === 'string' ? parsed.shopSearchKeyword : '',
      seasonReminder: parsed.seasonReminder !== false,
      language: parsed.language === 'en' ? 'en' : 'zh',
    }
  } catch {
    return defaults()
  }
}

export function saveSettings(next: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function getSubcategories(settings: AppSettings, category: Category): string[] {
  return settings.subcategoryTaxonomy[category] ?? []
}

/** Merge taxonomy labels with names already used on items */
export function mergeSubcategoryOptions(
  settings: AppSettings,
  category: Category,
  usedOnItems: string[] = [],
): string[] {
  const set = new Set<string>()
  for (const s of getSubcategories(settings, category)) set.add(s)
  for (const s of usedOnItems) {
    const t = s.trim()
    if (t) set.add(t)
  }
  return [...set]
}

export function addSubcategoryLabel(
  settings: AppSettings,
  category: Category,
  name: string,
): AppSettings {
  const n = name.trim()
  if (!n) return settings
  const prev = getSubcategories(settings, category)
  if (prev.includes(n)) return settings
  return {
    ...settings,
    subcategoryTaxonomy: {
      ...settings.subcategoryTaxonomy,
      [category]: [...prev, n],
    },
  }
}

export function removeSubcategoryLabel(
  settings: AppSettings,
  category: Category,
  name: string,
): AppSettings {
  const prev = getSubcategories(settings, category).filter((s) => s !== name)
  const taxonomy = { ...settings.subcategoryTaxonomy }
  if (prev.length) taxonomy[category] = prev
  else delete taxonomy[category]
  return { ...settings, subcategoryTaxonomy: taxonomy }
}

export function renameSubcategoryLabel(
  settings: AppSettings,
  category: Category,
  from: string,
  to: string,
): AppSettings {
  const n = to.trim()
  if (!n || n === from) return settings
  const prev = getSubcategories(settings, category).map((s) => (s === from ? n : s))
  const unique = [...new Set(prev)]
  return {
    ...settings,
    subcategoryTaxonomy: {
      ...settings.subcategoryTaxonomy,
      [category]: unique,
    },
  }
}
