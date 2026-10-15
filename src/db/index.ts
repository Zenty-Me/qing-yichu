import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  normalizeInspiration,
  normalizeItem,
  normalizeOutfit,
  normalizeWearLog,
  normalizeWishlist,
  type ClothingItem,
  type Inspiration,
  type Outfit,
  type WearLog,
  type WishlistItem,
} from '../types'

export interface QuotaRecord {
  key: 'usageQuota'
  /** YYYY-MM calendar month in local time */
  month: string
  cutoutUsed: number
  outfitUsed: number
}

interface WardrobeDB extends DBSchema {
  items: {
    key: string
    value: ClothingItem
    indexes: { 'by-category': string; 'by-created': number }
  }
  outfits: {
    key: string
    value: Outfit
    indexes: { 'by-created': number }
  }
  wearLogs: {
    key: string
    value: WearLog
    indexes: { 'by-date': string }
  }
  inspirations: {
    key: string
    value: Inspiration
    indexes: { 'by-created': number }
  }
  wishlist: {
    key: string
    value: WishlistItem
    indexes: { 'by-created': number }
  }
  appMeta: {
    key: string
    value: QuotaRecord
  }
}

const DB_NAME = 'qing-yichu'
const DB_VERSION = 11

let dbPromise: Promise<IDBPDatabase<WardrobeDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<WardrobeDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const items = db.createObjectStore('items', { keyPath: 'id' })
          items.createIndex('by-category', 'category')
          items.createIndex('by-created', 'createdAt')

          const outfits = db.createObjectStore('outfits', { keyPath: 'id' })
          outfits.createIndex('by-created', 'createdAt')

          const logs = db.createObjectStore('wearLogs', { keyPath: 'id' })
          logs.createIndex('by-date', 'date')
        }
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('inspirations')) {
            const insp = db.createObjectStore('inspirations', { keyPath: 'id' })
            insp.createIndex('by-created', 'createdAt')
          }
        }
        // v3: soft fields originalBlob / coverBlob — no store changes; normalize on read
        // v4: extraImages / tempMin / tempMax / status / 连衣裙 category — normalize on read
        // v5: subcategory string — normalize on read
        // v6: color stored as hex — normalizeColorHex on read
        // v7–v9: soft fields
        // v10: seasons[] multi-select — normalizeItem migrates legacy season
        if (oldVersion < 11) {
          if (!db.objectStoreNames.contains('appMeta')) {
            db.createObjectStore('appMeta', { keyPath: 'key' })
          }
        }
      },
    })
  }
  return dbPromise
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function isActive<T extends { deletedAt?: number | null }>(row: T): boolean {
  return !row.deletedAt
}

// —— Items ——
export async function getAllItems(includeDeleted = false): Promise<ClothingItem[]> {
  const db = await getDB()
  const items = (await db.getAllFromIndex('items', 'by-created')).map((i) =>
    normalizeItem(i as ClothingItem),
  )
  const list = includeDeleted ? items : items.filter(isActive)
  return list.reverse()
}

export async function getDeletedItems(): Promise<ClothingItem[]> {
  const db = await getDB()
  const items = (await db.getAll('items')).map((i) => normalizeItem(i as ClothingItem))
  return items
    .filter((i) => Boolean(i.deletedAt))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

export async function getItem(id: string): Promise<ClothingItem | undefined> {
  const db = await getDB()
  const item = await db.get('items', id)
  return item ? normalizeItem(item as ClothingItem) : undefined
}

export async function getItemsByIds(ids: string[], includeDeleted = false): Promise<ClothingItem[]> {
  const db = await getDB()
  const result: ClothingItem[] = []
  for (const id of ids) {
    const item = await db.get('items', id)
    if (!item) continue
    const n = normalizeItem(item as ClothingItem)
    if (!includeDeleted && !isActive(n)) continue
    result.push(n)
  }
  return result
}

export async function saveItem(item: ClothingItem): Promise<void> {
  const db = await getDB()
  await db.put('items', normalizeItem(item))
}

export async function softDeleteItem(id: string): Promise<void> {
  const db = await getDB()
  const item = await db.get('items', id)
  if (!item) return
  const n = normalizeItem(item as ClothingItem)
  n.deletedAt = Date.now()
  n.updatedAt = Date.now()
  await db.put('items', n)
}

export async function restoreItem(id: string): Promise<void> {
  const db = await getDB()
  const item = await db.get('items', id)
  if (!item) return
  const n = normalizeItem(item as ClothingItem)
  n.deletedAt = null
  n.updatedAt = Date.now()
  await db.put('items', n)
}

/** Permanent delete + scrub outfit / inspiration refs */
export async function hardDeleteItem(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('items', id)
  const outfits = await db.getAll('outfits')
  for (const o of outfits) {
    if (o.itemIds.includes(id)) {
      o.itemIds = o.itemIds.filter((x) => x !== id)
      o.updatedAt = Date.now()
      await db.put('outfits', o)
    }
  }
  if (db.objectStoreNames.contains('inspirations')) {
    const list = await db.getAll('inspirations')
    for (const insp of list) {
      if (insp.relatedItemIds?.includes(id)) {
        insp.relatedItemIds = insp.relatedItemIds.filter((x) => x !== id)
        insp.updatedAt = Date.now()
        await db.put('inspirations', insp)
      }
    }
  }
}

/** @deprecated use softDeleteItem — kept for call sites during migration */
export async function deleteItem(id: string): Promise<void> {
  await softDeleteItem(id)
}

export async function countItems(): Promise<number> {
  const items = await getAllItems(false)
  return items.length
}

// —— Outfits ——
export async function getAllOutfits(includeDeleted = false): Promise<Outfit[]> {
  const db = await getDB()
  const list = (await db.getAllFromIndex('outfits', 'by-created')).map(normalizeOutfit)
  const filtered = includeDeleted ? list : list.filter(isActive)
  return filtered.reverse()
}

export async function getDeletedOutfits(): Promise<Outfit[]> {
  const db = await getDB()
  return (await db.getAll('outfits'))
    .map(normalizeOutfit)
    .filter((o) => Boolean(o.deletedAt))
    .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
}

export async function getOutfit(id: string): Promise<Outfit | undefined> {
  const db = await getDB()
  const o = await db.get('outfits', id)
  return o ? normalizeOutfit(o) : undefined
}

export async function saveOutfit(outfit: Outfit): Promise<void> {
  const db = await getDB()
  await db.put('outfits', normalizeOutfit(outfit))
}

export async function softDeleteOutfit(id: string): Promise<void> {
  const db = await getDB()
  const o = await db.get('outfits', id)
  if (!o) return
  const n = normalizeOutfit(o)
  n.deletedAt = Date.now()
  n.updatedAt = Date.now()
  await db.put('outfits', n)
}

export async function restoreOutfit(id: string): Promise<void> {
  const db = await getDB()
  const o = await db.get('outfits', id)
  if (!o) return
  const n = normalizeOutfit(o)
  n.deletedAt = null
  n.updatedAt = Date.now()
  await db.put('outfits', n)
}

export async function hardDeleteOutfit(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('outfits', id)
}

export async function deleteOutfit(id: string): Promise<void> {
  await softDeleteOutfit(id)
}

export async function countOutfits(): Promise<number> {
  return (await getAllOutfits(false)).length
}

// —— Wear logs ——
export async function getAllWearLogs(): Promise<WearLog[]> {
  const db = await getDB()
  return (await db.getAllFromIndex('wearLogs', 'by-date')).map((l) =>
    normalizeWearLog(l as WearLog),
  )
}

export async function getWearLogByDate(date: string): Promise<WearLog | undefined> {
  const db = await getDB()
  const logs = await db.getAllFromIndex('wearLogs', 'by-date', date)
  return logs[0] ? normalizeWearLog(logs[0] as WearLog) : undefined
}

export async function getWearLogsInMonth(year: number, month: number): Promise<WearLog[]> {
  const all = await getAllWearLogs()
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return all.filter((l) => l.date.startsWith(prefix))
}

export async function getWearLogsInRange(start: string, end: string): Promise<WearLog[]> {
  const all = await getAllWearLogs()
  return all.filter((l) => l.date >= start && l.date <= end)
}

export async function saveWearLog(log: WearLog): Promise<void> {
  const db = await getDB()
  const existing = await getWearLogByDate(log.date)
  if (existing && existing.id !== log.id) {
    await db.delete('wearLogs', existing.id)
  }
  await db.put('wearLogs', normalizeWearLog(log))
}

export async function deleteWearLog(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('wearLogs', id)
}

export async function countWearLogs(): Promise<number> {
  const db = await getDB()
  return db.count('wearLogs')
}

// —— Inspirations ——
export async function getAllInspirations(includeDeleted = false): Promise<Inspiration[]> {
  const db = await getDB()
  const list = (await db.getAllFromIndex('inspirations', 'by-created')).map((i) =>
    normalizeInspiration(i as Inspiration),
  )
  const filtered = includeDeleted ? list : list.filter(isActive)
  return filtered.reverse()
}

export async function getInspiration(id: string): Promise<Inspiration | undefined> {
  const db = await getDB()
  const row = await db.get('inspirations', id)
  return row ? normalizeInspiration(row as Inspiration) : undefined
}

export async function saveInspiration(insp: Inspiration): Promise<void> {
  const db = await getDB()
  await db.put('inspirations', normalizeInspiration(insp))
}

export async function deleteInspiration(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('inspirations', id)
}

export async function countInspirations(): Promise<number> {
  return (await getAllInspirations(false)).length
}

export async function clearAllData(): Promise<void> {
  const db = await getDB()
  await db.clear('items')
  await db.clear('outfits')
  await db.clear('wearLogs')
  if (db.objectStoreNames.contains('inspirations')) await db.clear('inspirations')
  if (db.objectStoreNames.contains('wishlist')) await db.clear('wishlist')
}

// —— Wishlist ——
export async function getAllWishlist(): Promise<WishlistItem[]> {
  const db = await getDB()
  if (!db.objectStoreNames.contains('wishlist')) return []
  const list = (await db.getAllFromIndex('wishlist', 'by-created')).map((w) =>
    normalizeWishlist(w as WishlistItem),
  )
  return list.reverse()
}

export async function getWishlistItem(id: string): Promise<WishlistItem | undefined> {
  const db = await getDB()
  if (!db.objectStoreNames.contains('wishlist')) return undefined
  const row = await db.get('wishlist', id)
  return row ? normalizeWishlist(row as WishlistItem) : undefined
}

export async function saveWishlistItem(item: WishlistItem): Promise<void> {
  const db = await getDB()
  await db.put('wishlist', normalizeWishlist(item))
}

export async function deleteWishlistItem(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('wishlist', id)
}

export async function countWishlist(): Promise<number> {
  return (await getAllWishlist()).length
}

export async function getLaundryItems(): Promise<ClothingItem[]> {
  return (await getAllItems()).filter((i) => i.needsWash)
}

export async function importAllData(
  items: ClothingItem[],
  outfits: Outfit[],
  wearLogs: WearLog[],
  inspirations: Inspiration[] = [],
  wishlist: WishlistItem[] = [],
): Promise<void> {
  const db = await getDB()
  const names: Array<'items' | 'outfits' | 'wearLogs' | 'inspirations' | 'wishlist'> = [
    'items',
    'outfits',
    'wearLogs',
    'inspirations',
  ]
  if (db.objectStoreNames.contains('wishlist')) names.push('wishlist')
  const tx = db.transaction(names, 'readwrite')
  const ops: Promise<unknown>[] = [
    ...items.map((i) => tx.objectStore('items').put(normalizeItem(i))),
    ...outfits.map((o) => tx.objectStore('outfits').put(normalizeOutfit(o))),
    ...wearLogs.map((l) => tx.objectStore('wearLogs').put(normalizeWearLog(l))),
    ...inspirations.map((i) => tx.objectStore('inspirations').put(normalizeInspiration(i))),
  ]
  if (db.objectStoreNames.contains('wishlist')) {
    ops.push(...wishlist.map((w) => tx.objectStore('wishlist').put(normalizeWishlist(w))))
  }
  ops.push(tx.done)
  await Promise.all(ops)
}

