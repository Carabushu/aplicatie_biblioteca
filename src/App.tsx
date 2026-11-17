import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import ChooseProfile from './pages/ChooseProfile'
import Library from './pages/Library'
import BookDetail from './pages/BookDetail'
import AddBook from './pages/AddBook'
import HaveIt from './pages/HaveIt'
import Settings from './pages/Settings'
import ShelfImport from './pages/ShelfImport'
import SchoolLists from './pages/SchoolLists'
import Loans from './pages/Loans'
import Wishlist from './pages/Wishlist'
import MyProfile from './pages/MyProfile'
import WhatNext from './pages/WhatNext'

function Gate() {
  const { session, authLoading, activeMember, members } = useApp()
  if (authLoading) return <div className="flex min-h-dvh items-center justify-center text-stone-500">Se încarcă…</div>
  if (!session) return <Login />
  const needsProfile = !activeMember && members.length > 0
  return (
    <Routes>
      <Route path="/profil" element={<ChooseProfile />} />
      {needsProfile ? (
        <Route path="*" element={<Navigate to="/profil" replace />} />
      ) : (
        <Route element={<Layout />}>
          <Route index element={<Library />} />
          <Route path="/carte/:id" element={<BookDetail />} />
          <Route path="/adauga" element={<AddBook />} />
          <Route path="/avem" element={<HaveIt />} />
          <Route path="/setari" element={<Settings />} />
          <Route path="/raft" element={<ShelfImport />} />
          <Route path="/lecturi" element={<SchoolLists />} />
          <Route path="/imprumuturi" element={<Loans />} />
          <Route path="/dorinte" element={<Wishlist />} />
          <Route path="/eu" element={<MyProfile />} />
          <Route path="/ce-citesc" element={<WhatNext />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AppProvider>
  )
}
