import { useEffect, useMemo, useState } from 'react'

import { Capacitor } from '@capacitor/core'

const API_BASE = Capacitor.isNativePlatform()
  ? 'http://100.81.27.80:3100'
  : ''

import './App.css'
import './media.css'

type TabKey = 'home' | 'files' | 'photos' | 'settings'
type Entry = { name: string; path: string; type: 'folder' | 'file'; size: number | null }
type FileResponse = { path: string; entries: Entry[] }
const ROOT = '/Dosyalar/'

function App() {
  const [tab, setTab] = useState<TabKey>('files')
  const [path, setPath] = useState(ROOT)
  const [entries, setEntries] = useState<Entry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [preview, setPreview] = useState<Entry | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/api/files?path=${encodeURIComponent(path)}`, { signal: controller.signal })

      .then(async (r) => {
        const data = await r.json() as FileResponse & { error?: string }
        if (!r.ok) throw new Error(data.error || `Sunucu hatası: ${r.status}`)
        if (!Array.isArray(data.entries)) throw new Error('Beklenmeyen API yanıtı')
        setEntries(data.entries)
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Bağlantı kurulamadı')
        setEntries([])
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [path, reload])

  const filtered = useMemo(() => entries.filter((e) =>
    e.name.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))
  ), [entries, search])
  const folders = entries.filter((e) => e.type === 'folder').length
  const files = entries.length - folders
  const parent = path === ROOT ? ROOT : (() => {
    const bits = path.slice(ROOT.length).split('/').filter(Boolean)
    bits.pop()
    return ROOT + (bits.length ? bits.join('/') + '/' : '')
  })()
  const label = path === ROOT ? 'Dosyalar' : decodeURIComponent(path.split('/').filter(Boolean).at(-1) || 'Dosyalar')
  const formatSize = (size: number | null) => size === null ? 'Boyut bilinmiyor' : size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`
  const navigate = (newPath: string) => { setPath(newPath); setSearch(''); setTab('files') }

  const isImage = (name: string) => /\.(jpe?g|png|gif|webp|avif)$/i.test(name)
  const isVideo = (name: string) => /\.(mp4|webm|mov|m4v)$/i.test(name)
  const mediaUrl = (entry: Entry) => `${API_BASE}/api/media?path=${encodeURIComponent(entry.path)}`
  const mediaFiles = filtered.filter(e => e.type === 'file' && (isImage(e.name) || isVideo(e.name)))
  const renderMediaGrid = (items: Entry[]) => <div className="nas-gallery">{items.map(entry =>
    <button className="nas-tile" key={entry.path} onClick={() => setPreview(entry)}>
      {isImage(entry.name) ? <img loading="lazy" src={mediaUrl(entry)} alt={entry.name} /> : <div className="nas-video-icon">▶</div>}
      <span title={entry.name}>{entry.name}</span>
    </button>
  )}</div>
  const navigation: {key: TabKey; icon: string; label: string}[] = [
    { key: 'home', icon: '⌂', label: 'Ana Sayfa' },
    { key: 'files', icon: '📁', label: 'Dosyalar' },
    { key: 'photos', icon: '🖼️', label: 'Fotoğraflar' },
    { key: 'settings', icon: '⚙️', label: 'Ayarlar' },
  ]
  const renderNav = (mobile: boolean) => navigation.map((item) =>
    <button key={item.key} onClick={() => setTab(item.key)} className={mobile ? `mobile-nav-btn${tab === item.key ? ' active' : ''}` : `nav-btn${tab === item.key ? ' active' : ''}`}>
      <span>{item.icon}</span> {mobile ? <small>{item.label}</small> : item.label}
    </button>
  )
  const fileListing = (
    <>
      <div className="section-head">
        <div>
          <p className="eyebrow">GERÇEK NAS • SADECE OKUMA</p>
          <h1>{label}</h1>
          <p className="muted">{path} • {folders} klasör, {files} dosya</p>
        </div>
        <button className="secondary-btn" onClick={() => setReload((x) => x + 1)}>↻ Yenile</button>
      </div>
      {path !== ROOT && <div><button className="secondary-btn" onClick={() => navigate(parent)}>← Üst klasör</button></div>}
      <div className="search-row"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bu klasörde ara..." /></div>
      {loading && <p className="muted">NAS klasörleri okunuyor...</p>}
      {error && <div className="panel-card"><strong>Bağlantı hatası</strong><p className="muted">{error}</p><p className="muted">Node.js sunucusunun 3001 portunda çalıştığını ve Tailscale bağlantısını kontrol et.</p></div>}
      {!loading && !error && <div className="panel-card"><div className="file-list">
        {filtered.length === 0 ? <p className="muted">Bu klasörde gösterilecek öğe bulunamadı.</p> : filtered.map((entry) =>
          <div className="file-row" key={entry.path}>
            <div className="file-left">
              <div className="file-icon">{entry.type === 'folder' ? '📁' : isImage(entry.name) ? '🖼️' : isVideo(entry.name) ? '🎬' : '📄'}</div>
              <div className="file-meta"><strong>{entry.name}</strong><span>{entry.type === 'folder' ? 'Klasör' : formatSize(entry.size)}</span></div>
            </div>
            {entry.type === 'folder' ? <button className="row-action" aria-label={`${entry.name} klasörünü aç`} onClick={() => navigate(entry.path)}>›</button> : (isImage(entry.name) || isVideo(entry.name)) ? <button className="row-action" aria-label={`${entry.name} önizleme`} onClick={() => setPreview(entry)}>👁</button> : <span className="muted">Önizleme yok</span>}
          </div>
        )}
      </div></div>}
      {!loading && !error && mediaFiles.length > 0 && <><h2>Bu klasördeki medya</h2>{renderMediaGrid(mediaFiles)}</>}
    </>
  )
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-logo">C</div><div><h3>Çağrı NAS</h3><p>Kişisel bulut alanım</p></div></div>
      <nav className="sidebar-nav">{renderNav(false)}</nav>
      <div className="storage-card"><p>Gerçek dosya erişimi</p><strong>Salt okunur</strong><small>Dosya değiştirme kapalı</small></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><h2>Çağrı NAS</h2><p>Tailscale üzerinden kişisel bulut</p></div><div className="topbar-badge">CS</div></header>
      <section className="content-area"><div className="page-section">
        {tab === 'files' && fileListing}
        {tab === 'home' && <>
          <div className="hero-card"><div><p className="eyebrow">ÇAĞRI NAS V0.3</p><h1>Ana Sayfa</h1><p className="muted">Evdeki Toshiba HDD klasörlerini güvenli bağlantı üzerinden görüntüle.</p></div><div className="hero-actions"><button className="primary-btn" onClick={() => setTab('files')}>Dosyaları Aç</button></div></div>
          <div className="stats-grid"><div className="stat-card"><span className="stat-title">API</span><strong>{error ? 'Bağlantı hatası' : loading ? 'Kontrol ediliyor' : 'Yanıt alındı'}</strong><small>Yerel Node.js sunucusu</small></div><div className="stat-card"><span className="stat-title">Aktif klasör</span><strong>{label}</strong><small>{entries.length} öğe</small></div></div>
        </>}
        {tab === 'photos' && <><p className="eyebrow">GALERİ V0.4</p><h1>Fotoğraf ve videolar</h1><p className="muted">Önizlemeler seçili klasörden okunuyor. Resimlerim klasörünü açıp galeri görünümünü kullanabilirsin.</p><button className="primary-btn" onClick={() => navigate('/Dosyalar/Resimlerim/')}>Resimlerim klasörünü aç</button>{loading ? <p className="muted">Yükleniyor...</p> : renderMediaGrid(mediaFiles)}</>}
        {tab === 'settings' && <><p className="eyebrow">AYARLAR</p><h1>Bağlantı</h1><div className="settings-grid"><div className="setting-card"><strong>NAS erişimi</strong><span>Node.js API + Tailscale WebDAV</span></div><div className="setting-card"><strong>Güvenlik</strong><span>Yalnızca klasör listesi • Dosya silme/yükleme kapalı</span></div></div></>}
      </div></section>
      {preview && <div className="nas-modal" role="dialog" aria-modal="true" aria-label="Medya önizleme" onClick={() => setPreview(null)}>
        <div className="nas-modal-inner" onClick={e => e.stopPropagation()}>
          <div className="nas-modal-header"><strong>{preview.name}</strong><button onClick={() => setPreview(null)} aria-label="Kapat">✕</button></div>
          {isImage(preview.name) ? <img src={mediaUrl(preview)} alt={preview.name} /> : <video src={mediaUrl(preview)} controls playsInline preload="metadata" />}
          {isVideo(preview.name) && <p className="muted">Video oynatımı tarayıcı ve dosyanın codec desteğine bağlıdır.</p>}
        </div>
      </div>}
      <nav className="mobile-bottom-nav">{renderNav(true)}</nav>
    </main>
  </div>
}
export default App
