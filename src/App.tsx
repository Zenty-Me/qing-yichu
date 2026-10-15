import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Wardrobe } from './pages/Wardrobe'
import { ItemForm } from './pages/ItemForm'
import { ItemDetail } from './pages/ItemDetail'
import { Outfits } from './pages/Outfits'
import { OutfitForm } from './pages/OutfitForm'
import { OutfitDetail } from './pages/OutfitDetail'
import { Calendar } from './pages/Calendar'
import { Profile } from './pages/Profile'
import { Inspire } from './pages/Inspire'
import { InspireForm } from './pages/InspireForm'
import { RecycleBin } from './pages/RecycleBin'
import { CategoryManage } from './pages/CategoryManage'
import { Wishlist } from './pages/Wishlist'
import { Laundry } from './pages/Laundry'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Wardrobe />} />
          <Route path="items/new" element={<ItemForm />} />
          <Route path="items/:id/edit" element={<ItemForm />} />
          <Route path="items/:id" element={<ItemDetail />} />
          <Route path="outfits" element={<Outfits />} />
          <Route path="outfits/new" element={<OutfitForm />} />
          <Route path="outfits/:id/edit" element={<OutfitForm />} />
          <Route path="outfits/:id" element={<OutfitDetail />} />
          <Route path="inspire" element={<Inspire />} />
          <Route path="inspire/:id" element={<InspireForm />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="me" element={<Profile />} />
          <Route path="recycle" element={<RecycleBin />} />
          <Route path="categories" element={<CategoryManage />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="laundry" element={<Laundry />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
