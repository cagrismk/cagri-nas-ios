import { enrollDevice, hasDevice, loginDevice } from './deviceAuth'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'

type Tab = 'home' | 'files' | 'photos' | 'settings'
type ShareRecord = {id:string;path:string;name:string;paths:string[];names:string[];created:number;expires:number;revoked:boolean}
type Entry = { name: string; path: string; type: 'folder' | 'file'; size: number | null }
const ROOT = '/Dosyalar/'
const PHOTOS_FOLDER_NAME = 'Resimlerim'
const apiListUrl = (folder: string) => {
  const url = new URL('/api/files', window.location.origin)
  url.searchParams.set('path', folder)
  return url.toString()
}
const isImage = (s: string) => /\.(jpe?g|png|gif|webp|avif)$/i.test(s)
const isVideo = (s: string) => /\.(mp4|webm|mov|m4v)$/i.test(s)
const prettySize = (n: number | null) => n == null ? 'Dosya' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : n < 1073741824 ? `${(n/1048576).toFixed(1)} MB` : `${(n/1073741824).toFixed(1)} GB`
const parentPath = (p: string) => { const a=p.slice(ROOT.length).split('/').filter(Boolean); a.pop(); return ROOT + (a.length ? a.join('/')+'/' : '') }
const fileIcon = (e: Entry) => e.type === 'folder' ? '📁' : isImage(e.name) ? '🖼️' : isVideo(e.name) ? '🎞️' : /\.pdf$/i.test(e.name) ? '📕' : '📄'

type SessionStatus = 'checking'|'locked'|'unlocked'
type AccessMode = 'web'|'iphone'
// Tüm API istekleri aynı oturum çerezini taşır. 401 cevabı uygulamayı kilitler.
export default function App() {
  const [session,setSession] = useState<SessionStatus>('checking')
  const [accessMode,setAccessMode] = useState<AccessMode>('web')
  const [loginUser,setLoginUser] = useState('')
  const [loginPassword,setLoginPassword] = useState('')
  const [loginError,setLoginError] = useState('')
  const [loginBusy,setLoginBusy] = useState(false)
  const [devicePaired,setDevicePaired] = useState(false)
  const [pairBusy,setPairBusy] = useState(false)
  const loginFetch = async (url:string, options?:RequestInit) => window.fetch(url,options)
  useEffect(()=>{
    let alive=true
    const check=()=>window.fetch('/api/session',{cache:'no-store'}).then(async r=>{
      if(!r.ok) throw Error('Oturum sorgulanamadı')
      const data=await r.json()
      if(alive){
        const iphone=data.mode==='iphone';setAccessMode(iphone?'iphone':'web')
        if(iphone)hasDevice().then(v=>{if(alive)setDevicePaired(v)}).catch(()=>{})
        if(data.authenticated) setSession('unlocked')
        else if(iphone) loginDevice().then(v=>{if(alive)setSession(v?'unlocked':'locked')}).catch(()=>{if(alive)setSession('locked')})
        else setSession('locked')
      }
    }).catch(()=>{if(alive)setSession('locked')})
    check()
    const onVisible=()=>{if(document.visibilityState==='visible')check()}
    document.addEventListener('visibilitychange',onVisible)
    return ()=>{alive=false;document.removeEventListener('visibilitychange',onVisible)}
  },[])
  const signIn=async(e:FormEvent)=>{
    e.preventDefault();setLoginBusy(true);setLoginError('')
    try {
      const r=await loginFetch('/api/session/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:loginUser,password:loginPassword})})
      if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Cloudflare oturumunu yenileyip tekrar deneyin.')
      const data=await r.json()
      if(!r.ok)throw Error(data.error||'Giriş başarısız')
      setLoginPassword('');setSession('unlocked')
    }catch(err){setLoginError(err instanceof Error?err.message:'Giriş başarısız')}
    finally{setLoginBusy(false)}
  }
  const pairThisDevice=async()=>{
    setPairBusy(true);setLoginError('')
    try{await enrollDevice();setDevicePaired(true);setNotice('Cihaz eşleştirildi. Gelecek girişlerde şifre gerekmeyecek.')}
    catch(e){setLoginError(e instanceof Error?e.message:'Eşleştirme başarısız')}
    finally{setPairBusy(false)}
  }
  const signOut=async()=>{
    try{await window.fetch('/api/session/logout',{method:'POST'})}catch{}
    // Both modes sign out of Cloudflare as well, preventing immediate auto-unlock on iPhone.
    window.location.assign('/cdn-cgi/access/logout');
    setSession('locked');setLoginPassword('');setEntries([]);setPhotosEntries([]);setShareRecords([]);setPreview(null);setShareEntries([])
  }

  useEffect(()=>{
    if(session!=='unlocked' || accessMode==='iphone')return
    let lastUserActivity=Date.now()
    let lastServerActivity=Date.now()
    const markActivity=()=>{
      const now=Date.now()
      lastUserActivity=now
      if(now-lastServerActivity>=60000){
        lastServerActivity=now
        window.fetch('/api/session/activity',{method:'POST'}).then(r=>{if(r.status===401)setSession('locked')}).catch(()=>{})
      }
    }
    const timer=window.setInterval(()=>{
      if(Date.now()-lastUserActivity>=30*60*1000) {setSession('locked');setLoginPassword('')}
    },15000)
    const events=['pointerdown','keydown','touchstart'] as const
    events.forEach(event=>window.addEventListener(event,markActivity,{passive:true}))
    return ()=>{window.clearInterval(timer);events.forEach(event=>window.removeEventListener(event,markActivity))}
  },[session,accessMode])
  const apiFetch = async (url: RequestInfo | URL, options?: RequestInit) => {
    const response=await window.fetch(url,options)
    if(response.status===401){setSession('locked');setLoginPassword('')}
    return response
  }
  const [storage, setStorage] = useState<{supported:boolean;total?:number;used?:number;free?:number;reason?:string}|null>(null)
  const [storageLoading, setStorageLoading] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [storageTick, setStorageTick] = useState(0)
  const [tab, setTab] = useState<Tab>('home')
  const [path, setPath] = useState(ROOT)
  const [entries, setEntries] = useState<Entry[]>([])
  const [photosEntries, setPhotosEntries] = useState<Entry[]>([])
  const [photosLoading, setPhotosLoading] = useState(false)
  const [photosError, setPhotosError] = useState('')
  const [photosTick, setPhotosTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [tick, setTick] = useState(0)
  const [preview, setPreview] = useState<Entry | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [shareEntries, setShareEntries] = useState<Entry[]>([])
  const [shareRecords, setShareRecords] = useState<ShareRecord[]>([])
  const [shareRecordsLoading, setShareRecordsLoading] = useState(false)
  const [shareRecordsError, setShareRecordsError] = useState('')
  const [shareRecordsTick, setShareRecordsTick] = useState(0)
  const [shareFilter, setShareFilter] = useState<'active'|'expired'|'revoked'>('active')
  const [photoFilter, setPhotoFilter] = useState<'all'|'photo'|'video'>('all')
  const [shareHours, setShareHours] = useState(24)
  const [shareLink, setShareLink] = useState('')
  const [shareError, setShareError] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareId, setShareId] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const lastRefresh = useRef(0)
  const refresh = () => {
    if (loading) {setNotice('Dosya listesi zaten yükleniyor.');return}
    if (Date.now()-lastRefresh.current < 12000) {setNotice('Yenileme için birkaç saniye bekle.');return}
    lastRefresh.current=Date.now()
    if (tab==='settings') setTab('files')
    setTick(x => x+1)
  }
  const navigate = (p: string) => { setPath(p); setTab('files'); setSearch(''); setSelected([]) }
  const current = path === ROOT ? 'Dosyalar' : path.split('/').filter(Boolean).at(-1) || 'Dosyalar'
  useEffect(() => {
    if(session!=='unlocked' || (tab!=='files' && tab!=='home')) return
    const ctrl = new AbortController()
    setLoading(true); setError('')
    apiFetch(apiListUrl(path), {signal:AbortSignal.any([ctrl.signal, AbortSignal.timeout(18000)])})
      .then(async r => { const j = await r.json(); if(!r.ok || !Array.isArray(j.entries)) throw Error(j.error || 'Klasör okunamadı'); return j.entries as Entry[] })
      .then(setEntries)
      .catch(e => { if(!ctrl.signal.aborted) {setError(String(e.message || e)); setEntries([])} })
      .finally(() => {if(!ctrl.signal.aborted) setLoading(false)})
    return () => ctrl.abort()
  }, [path,tick,tab,session])
  useEffect(() => {
    if(session!=='unlocked'||tab!=='settings') return
    const ctrl=new AbortController()
    setStorageLoading(true);setStorageError('')
    apiFetch('/api/storage',{signal:ctrl.signal})
      .then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Disk sorgusu başarısız');return j})
      .then(setStorage)
      .catch(e=>{if(!ctrl.signal.aborted)setStorageError(String(e.message||e))})
      .finally(()=>{if(!ctrl.signal.aborted)setStorageLoading(false)})
    return ()=>ctrl.abort()
  },[tab,storageTick,session])
  useEffect(()=>{
    if(session!=='unlocked'||tab!=='settings')return
    const ctrl=new AbortController()
    setShareRecordsLoading(true);setShareRecordsError('')
    apiFetch('/api/shares',{signal:ctrl.signal})
      .then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||'Paylaşımlar okunamadı');return j.shares as ShareRecord[]})
      .then(setShareRecords)
      .catch(e=>{if(!ctrl.signal.aborted)setShareRecordsError(String(e.message||e))})
      .finally(()=>{if(!ctrl.signal.aborted)setShareRecordsLoading(false)})
    return ()=>ctrl.abort()
  },[tab,shareRecordsTick,session])
  const cancelShareRecord=async(id:string)=>{
    if(!window.confirm('Bu paylaşımı iptal etmek istiyor musun?'))return
    try{
      const response=await apiFetch('/api/shares?id='+encodeURIComponent(id),{method:'DELETE'})
      if(!response.ok){const j=await response.json();throw Error(j.error||'İptal edilemedi')}
      setShareRecordsTick(x=>x+1);setNotice('Paylaşım iptal edildi')
    }catch(e){setShareRecordsError(e instanceof Error?e.message:'İptal başarısız')}
  }
  const filtered = useMemo(() => entries.filter(e => e.name.toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))),[entries,search])
  useEffect(() => {
    if(session!=='unlocked'||tab !== 'photos') return
    const ctrl = new AbortController()
    setPhotosLoading(true); setPhotosError('')
    // Sunucunun döndürdüğü gerçek klasör yolunu kullan; sabit yol varsayma.
    apiFetch(apiListUrl(ROOT), {signal:ctrl.signal})
      .then(async r => { const j=await r.json(); if(!r.ok || !Array.isArray(j.entries)) throw Error(j.error || 'Ana klasör okunamadı'); return j.entries as Entry[] })
      .then(rootEntries => {
        const folder = rootEntries.find(e => e.type === 'folder' && e.name.trim().toLocaleLowerCase('tr-TR') === PHOTOS_FOLDER_NAME.toLocaleLowerCase('tr-TR'))
        if(!folder) throw Error('Resimlerim klasörü Dosyalar altında bulunamadı.')
        const folderPath = folder.path.endsWith('/') ? folder.path : folder.path + '/'
        return apiFetch(apiListUrl(folderPath), {signal:ctrl.signal})
      })
      .then(async r => { const j=await r.json(); if(!r.ok || !Array.isArray(j.entries)) throw Error(j.error || 'Resimlerim klasörü okunamadı'); return j.entries as Entry[] })
      .then(setPhotosEntries)
      .catch(e=>{if(!ctrl.signal.aborted){setPhotosError(String(e.message||e));setPhotosEntries([])}})
      .finally(()=>{if(!ctrl.signal.aborted)setPhotosLoading(false)})
    return ()=>ctrl.abort()
  },[tab,photosTick,session])
  const media = photosEntries.filter(e => e.type==='file' && (isImage(e.name)||isVideo(e.name)))
  const visibleMedia = media.filter(e => photoFilter==='all' || (photoFilter==='photo' ? isImage(e.name) : isVideo(e.name)))
  const visibleShares = shareRecords.filter(item => shareFilter==='revoked' ? item.revoked : shareFilter==='expired' ? !item.revoked&&item.expires<=Date.now() : !item.revoked&&item.expires>Date.now()).sort((a,b)=>b.created-a.created)
  const mediaUrl = (e: Entry) => '/api/media?path='+encodeURIComponent(e.path)
  const download = async (e: Entry) => {
    if(e.type!=='file') return
    setBusy(true)
    setNotice('Dosya hazırlanıyor…')
    try {
      const response=await apiFetch('/api/download?path='+encodeURIComponent(e.path),{signal:AbortSignal.timeout(120000)})
      if(!response.ok){let msg='İndirme başarısız';try{msg=(await response.json()).error||msg}catch{};throw Error(msg)}
      const blob=await response.blob()
      const file=new File([blob],e.name,{type:blob.type||'application/octet-stream'})
      // iOS: the share sheet offers Save to Files, which works more reliably than WebView downloads.
      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
        try{await navigator.share({files:[file],title:e.name});setNotice('iPhone paylaşım menüsü açıldı. Dosyalar’a Kaydet seçeneğini kullan.');return}
        catch(err){if((err as Error)?.name==='AbortError'){setNotice('Kaydetme iptal edildi.');return}}
      }
      const href=URL.createObjectURL(blob)
      const a=document.createElement('a');a.href=href;a.download=e.name;document.body.appendChild(a);a.click();a.remove()
      setTimeout(()=>URL.revokeObjectURL(href),60000)
      setNotice('İndirme başlatıldı.')
    } catch(err){showError(err)} finally{setBusy(false)}
  }
  const showError = (e: unknown) => setNotice(e instanceof Error ? e.message : 'İşlem başarısız')
  const api = async (url: string, options: RequestInit) => {
    const r = await apiFetch(url, options)
    if(!r.ok) { let message = `Sunucu bu işlemi desteklemiyor (${r.status}).`; try {const j=await r.json(); message=j.error || message}catch{} throw Error(message) }
  }
  const upload = async (files: FileList | null) => {
    if(!files?.length) return
    setBusy(true); setNotice('Dosyalar yükleniyor…')
    try {
      for(const file of Array.from(files)) await api('/api/upload?path='+encodeURIComponent(path)+'&name='+encodeURIComponent(file.name),{method:'PUT',body:file,headers:{'Content-Type':'application/octet-stream'}})
      setNotice(`${files.length} dosya yüklendi`); refresh()
    } catch(e) {showError(e)} finally {setBusy(false); if(picker.current) picker.current.value=''}
  }
  const makeFolder = async () => {
    const name=window.prompt('Yeni klasörün adı:')
    if(!name) return
    if(name==='.' || name==='..' || /[\\/\x00-\x1f]/.test(name)) {setNotice('Geçersiz klasör adı');return}
    setBusy(true)
    try {await api('/api/folder?path='+encodeURIComponent(path)+'&name='+encodeURIComponent(name),{method:'POST'});setNotice('Klasör oluşturuldu');refresh()}
    catch(e){showError(e)}finally{setBusy(false)}
  }
  const deleteSelected = async () => {
    if(!selected.length) {setNotice('Önce Dosyalar ekranından silinecek öğeleri seç.');setTab('files');return}
    if(!window.confirm(`${selected.length} öğeyi NAS üzerinden kalıcı olarak silmek istediğine emin misin?`)) return
    setBusy(true)
    try {for(const item of selected) await api('/api/item?path='+encodeURIComponent(item),{method:'DELETE',headers:{'X-Confirm-Delete':'yes'}});setSelected([]);setNotice('Seçilen öğeler silindi');refresh()}
    catch(e){showError(e)}finally{setBusy(false)}
  }
  const startShare = (items:Entry[]) => {setShareEntries(items);setShareHours(24);setShareLink('');setShareError('');setShareId('')}
  const createShare = async () => {
    if(!shareEntries.length)return
    setShareLoading(true);setShareError('')
    try {
      const response=await apiFetch('/api/shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:shareEntries.map(x=>x.path),hours:shareHours})})
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Bağlantı oluşturulamadı')
      setShareLink(data.url);setShareId(data.id);setShareRecordsTick(x=>x+1)
    }catch(err){setShareError(err instanceof Error?err.message:'Paylaşım oluşturulamadı')}
    finally{setShareLoading(false)}
  }
  const revokeShare = async () => {
    if(!shareId)return
    if(!window.confirm('Paylaşım bağlantısını iptal etmek istiyor musun?'))return
    setShareLoading(true);setShareError('')
    try {
      const response=await apiFetch('/api/shares?id='+encodeURIComponent(shareId),{method:'DELETE'})
      if(!response.ok)throw Error('Bağlantı iptal edilemedi')
      setShareLink('');setShareId('');setShareRecordsTick(x=>x+1);setNotice('Paylaşım bağlantısı iptal edildi')
    }catch(err){setShareError(err instanceof Error?err.message:'Hata')}
    finally{setShareLoading(false)}
  }
  const choose = (p:string) => setSelected(s=>s.includes(p)?s.filter(x=>x!==p):[...s,p])
  const open = (e:Entry) => e.type==='folder'? navigate(e.path) : (isImage(e.name)||isVideo(e.name)) ? setPreview(e) : setNotice('Bu dosya türü için önizleme bulunmuyor.')
  const controls = <div className="quick-actions">
    <button className="action action-blue" disabled={busy} onClick={()=>{setTab('files');picker.current?.click()}}><span className="action-icon">☁️</span><strong>Dosya Yükle</strong><small>NAS'a ekle</small></button>
    <button className="action action-purple" disabled={busy} onClick={makeFolder}><span className="action-icon">📁</span><strong>Yeni Klasör</strong><small>Klasör oluştur</small></button>
    <button className="action action-pink" disabled={busy} onClick={deleteSelected}><span className="action-icon">🗑️</span><strong>Sil</strong><small>Seçilenleri sil</small></button>
    <button className="action action-teal" onClick={()=>{setNotice('Dosyalar bölümünde bir dosyanın yanındaki 🔗 düğmesine dokun.');setTab('files')}}><span className="action-icon">🔗</span><strong>Paylaş</strong><small>Dosya seç</small></button>
  </div>
  const tabs: {key:Tab, emoji:string, label:string}[]=[{key:'home',emoji:'🏠',label:'Ana Sayfa'},{key:'files',emoji:'📁',label:'Dosyalar'},{key:'photos',emoji:'🖼️',label:'Fotoğraflar'},{key:'settings',emoji:'⚙️',label:'Ayarlar'}]
  if(session!=='unlocked') return <div className="session-screen"><div className="session-card"><div className="session-logo">🔐</div><h1>Çağrı NAS</h1><p>{session==='checking'?'Oturum kontrol ediliyor…':'Kişisel bulutuna giriş yap'}</p>{session==='locked'&&<form onSubmit={signIn}><label htmlFor="nas-user">Kullanıcı adı</label><input id="nas-user" autoComplete="username" required value={loginUser} onChange={e=>setLoginUser(e.target.value)} /><label htmlFor="nas-pass">Parola</label><input id="nas-pass" type="password" autoComplete="current-password" required value={loginPassword} onChange={e=>setLoginPassword(e.target.value)}/>{loginError&&<p role="alert" className="error-banner">{loginError}</p>}<button type="submit" disabled={loginBusy}>{loginBusy?'Giriş yapılıyor…':'Giriş Yap'}</button></form>}<small>{accessMode==='web'?'30 dakika işlem yapılmazsa oturum sona erer.':'Cloudflare doğrulaması gereklidir.'}</small></div></div>
  return <div className="nas-app">
    <header className="nas-header"><div className="brand-mark">🗄️</div><div className="brand-text"><h1>Çağrı NAS</h1><p><i className={error?'dot red':'dot'}/> Kişisel bulutun</p></div><div className="avatar">CS<i className="dot"/></div></header>
    <main className="nas-content">
      {tab==='home' && <>
        <section className="hero"><div className="hero-copy"><p className="hero-tag">KİŞİSEL BULUT</p><h2>Dosyaların, <em>her yerde.</em></h2><p>Evdeki Toshiba HDD dosyalarına güvenli bağlantıyla eriş.</p><button className="hero-button" onClick={()=>setTab('files')}>📂 &nbsp; Dosyaları Aç <span>→</span></button></div><div className="hero-art" aria-hidden="true">📁<span>☁️</span></div></section>
        <div className="section-heading"><h2>Hızlı İşlemler</h2><button onClick={()=>setTab('files')}>Tüm işlemler ›</button></div>{controls}
        <div className="info-grid"><div className="info-card"><span>💽</span><div><small>Depolama</small><strong>Toshiba HDD</strong><p>{storage?.supported && storage.total && storage.used!=null ? `${prettySize(storage.used)} / ${prettySize(storage.total)}` : 'Bağlı NAS depolaması'}</p></div></div><div className="info-card"><span>📂</span><div><small>Aktif Klasör</small><strong>{current}</strong><p>{loading?'Yükleniyor…':`${entries.length} öğe`}</p></div></div></div>
        <div className="section-heading"><h2>Son dosyalar</h2><button onClick={()=>setTab('files')}>Tümünü Gör ›</button></div>
        <div className="recent-grid">{entries.filter(e=>e.type==='file').slice(0,6).map(e=><button key={e.path} className="recent-item" onClick={()=>open(e)}><div className="recent-icon">{isImage(e.name)?<img loading="lazy" src={mediaUrl(e)} alt="" />:fileIcon(e)}</div><strong title={e.name}>{e.name}</strong><small>{e.type==='folder'?'Klasör':prettySize(e.size)}</small></button>)}{!loading&&!entries.length&&<p className="muted">Henüz gösterilecek öğe yok.</p>}</div>
      </>}
      {tab==='files' && <>
        <div className="section-heading file-title"><div><small>NAS DOSYALARI</small><h2>{current}</h2><p>{path}</p></div><button onClick={refresh} disabled={loading} aria-label="Yenile">↻ Yenile</button></div>
        <div className="search"><span>⌕</span><input placeholder="Bu klasörde ara…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        {path!==ROOT&&<button className="back-btn" onClick={()=>navigate(parentPath(path))}>← Üst klasöre dön</button>}
        <div className="compact-controls"><button className="tool-upload" onClick={()=>picker.current?.click()}>☁️ Yükle</button><button className="tool-folder" onClick={makeFolder}>📁 Yeni klasör</button><button className="tool-delete" disabled={!selected.length} onClick={deleteSelected}>🗑️ Sil{selected.length?` (${selected.length})`:''}</button><button className="tool-share" disabled={!entries.some(e=>e.type==='file'&&selected.includes(e.path))} onClick={()=>startShare(entries.filter(e=>e.type==='file'&&selected.includes(e.path)))}>🔗 Paylaş ({entries.filter(e=>e.type==='file'&&selected.includes(e.path)).length})</button></div>
        {loading&&<div className="message">Dosyalar yükleniyor…</div>}
        {!loading&&!error&&<div className="file-panel">{filtered.filter(e=>e.name!=='.recycle').length?filtered.filter(e=>e.name!=='.recycle').map(e=><div className="file-row" key={e.path}><input type="checkbox" aria-label={`${e.name} seç`} checked={selected.includes(e.path)} onChange={()=>choose(e.path)}/><button className="file-open" onClick={()=>open(e)}><span className="file-emoji">{fileIcon(e)}</span><span className="file-detail"><strong>{e.name}</strong><small>{e.type==='folder'?'Klasör':prettySize(e.size)}</small></span><span className="chevron">›</span></button>{e.type==='file'&&<button className="download-btn" onClick={()=>startShare([e])} title="Paylaş" aria-label={`${e.name} paylaş`}>🔗</button>}{e.type==='file'&&<button className="download-btn" disabled={busy} onClick={()=>download(e)} aria-label={`${e.name} indir`} title="İndir">⬇</button>}</div>):<div className="message">Bu klasör boş.</div>}</div>}
      </>}
      {tab==='photos'&&<>
        <div className="section-heading photos-heading"><h2>Fotoğraflar</h2><button onClick={()=>setPhotosTick(x=>x+1)}>↻ Yenile</button></div>
        <p className="muted photos-subtitle">Resimlerim klasöründeki fotoğraf ve videolar</p>
        <div className="media-filters" role="group" aria-label="Medya filtresi">
          <button className={photoFilter==='all'?'active':''} onClick={()=>setPhotoFilter('all')}>▦ Tümü</button>
          <button className={photoFilter==='photo'?'active':''} onClick={()=>setPhotoFilter('photo')}>▧ Fotoğraf</button>
          <button className={photoFilter==='video'?'active':''} onClick={()=>setPhotoFilter('video')}>▷ Video</button>
        </div>
        {photosLoading&&<div className="message">Fotoğraflar yükleniyor…</div>}
        {photosError&&<div className="error-banner">⚠️ {photosError}</div>}
        <div className="photo-grid">{visibleMedia.map(e=><button className="photo-tile" key={e.path} onClick={()=>setPreview(e)}>
          <div className="photo-thumb">{isImage(e.name)?<img loading="lazy" src={mediaUrl(e)} alt={e.name}/>:<><video src={mediaUrl(e)+'#t=0.1'} preload="metadata" muted playsInline aria-hidden="true"/><span className="video-play">▶</span></>}</div>
          <div className="photo-caption"><small title={e.name}>{e.name}</small><span>•••</span></div>
        </button>)}</div>
        {!photosLoading&&!photosError&&!visibleMedia.length&&<div className="message">{photoFilter==='all'?'Resimlerim klasöründe fotoğraf veya video bulunamadı.':'Bu filtreye uygun medya bulunamadı.'}</div>}
      </>}
      {tab==='settings'&&<><div className="section-heading"><h2>Ayarlar</h2></div><section className="storage-card"><div className="storage-head"><span className="storage-emoji">💾</span><div><strong>Toshiba HDD</strong><small>Depolama alanı</small></div><button onClick={()=>setStorageTick(x=>x+1)} aria-label="Disk bilgisini yenile">↻</button></div>{storageLoading?<p>Disk bilgileri yükleniyor…</p>:storageError?<p role="status">⚠️ {storageError}</p>:storage?.supported&&storage.total!==undefined&&storage.used!==undefined&&storage.free!==undefined?<><div className="storage-metrics"><div><small>Toplam</small><strong>{prettySize(storage.total)}</strong></div><div><small>Kullanılan</small><strong>{prettySize(storage.used)}</strong></div><div><small>Boş</small><strong>{prettySize(storage.free)}</strong></div></div><div className="storage-track"><div style={{width:`${storage.total>0?Math.min(100,Math.max(0,storage.used/storage.total*100)):0}%`}}/></div><small className="storage-pct">{storage.total>0?(storage.used/storage.total*100).toFixed(1):'0'}% kullanılıyor</small></>:<p>{storage?.reason||'Disk kapasitesi henüz okunamadı.'} Simple NAS kota bilgisini desteklemiyorsa başka veri kaynağı bağlayacağız.</p>}</section><section className="shares-card"><div className="shares-head"><h3>🔗 Paylaşılan Dosyalar</h3><button onClick={()=>setShareRecordsTick(x=>x+1)}>↻ Yenile</button></div>
        <div className="share-filters" role="group" aria-label="Paylaşım durumu">
          <button className={shareFilter==='active'?'active':''} onClick={()=>setShareFilter('active')}>Aktif ({shareRecords.filter(r=>!r.revoked&&r.expires>Date.now()).length})</button>
          <button className={shareFilter==='expired'?'active':''} onClick={()=>setShareFilter('expired')}>Süresi Dolan</button>
          <button className={shareFilter==='revoked'?'active':''} onClick={()=>setShareFilter('revoked')}>İptal Edilen</button>
        </div>
        {shareRecordsLoading&&<p className="muted">Paylaşımlar yükleniyor…</p>}{shareRecordsError&&<p className="error-banner">{shareRecordsError}</p>}
        {!shareRecordsLoading&&!visibleShares.length&&<p className="muted empty-shares">Bu bölümde paylaşım bulunmuyor.</p>}
        {visibleShares.map(item=>{const active=!item.revoked&&item.expires>Date.now();return <div className="share-record" key={item.id}>
          <span className="share-record-icon">{item.names?.length>1?'📁':isImage(item.name)?'🖼️':'📄'}</span>
          <div className="share-record-body"><strong>{item.names?.length>1?`${item.names.length} dosya`:item.name}</strong><small>{(item.names||[item.name]).join(' · ')}</small><small className={active?'share-active':'share-inactive'}>{active?'● Aktif':item.revoked?'● İptal edildi':'◷ Süresi doldu'} · Bitiş: {new Date(item.expires).toLocaleString('tr-TR')}</small></div>
          {active&&<button className="revoke-btn" aria-label={`${item.name} paylaşımını iptal et`} onClick={()=>cancelShareRecord(item.id)}>İptal</button>}
        </div>})}<p className="shares-footnote">Güvenlik nedeniyle geçmiş bağlantı anahtarları tekrar gösterilemez.</p></section>{accessMode==='iphone' && <div className="info-card setting"><span>🔑</span><div><strong>Cihaz eşleştirmesi</strong><p>{devicePaired?'Bu cihaz eşleştirildi':'İlk girişten sonra bu cihazı eşleştir; sonraki girişte ek şifre gerekmez.'}</p>{loginError&&<p className="error-banner">{loginError}</p>}</div>{!devicePaired&&<button disabled={pairBusy} onClick={pairThisDevice}>{pairBusy?'Eşleştiriliyor…':'Bu Cihazı Eşleştir'}</button>}</div>}<div className="info-card setting"><span>🔐</span><div><strong>Güvenli bağlantı</strong><p>Cloudflare Access / NAS erişimi</p></div></div><div className="info-card setting"><span>🔄</span><div><strong>Yenile</strong><p>Dosya listesini tekrar yükle</p></div><button onClick={refresh}>↻</button></div><div className="info-card setting"><span>📱</span><div><strong>iPhone uyumu</strong><p>Dynamic Island ve güvenli alan desteği</p></div></div><button className="logout-btn" onClick={signOut}>🔒 Çıkış Yap</button></>}
      {error&&<div className="error-banner">⚠️ {error}</div>}{notice&&<div role="status" className="notice"><span>{notice}</span><button onClick={()=>setNotice('')}>✕</button></div>}
    </main>
    <input ref={picker} type="file" multiple hidden onChange={e=>upload(e.target.files)}/>
    <nav className="bottom-nav" aria-label="Ana menü">{tabs.map(t=><button key={t.key} className={tab===t.key?'active':''} onClick={()=>{setTab(t.key);setNotice('')}}><span>{t.emoji}</span><small>{t.label}</small></button>)}</nav>
    {shareEntries.length>0&&<div className="share-overlay" onClick={()=>setShareEntries([])}><section className="share-dialog" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Dosya paylaşımı"><h2>🔗 Dosya Paylaş</h2><p className="share-filename">{shareEntries.length===1?shareEntries[0].name:`${shareEntries.length} dosya: ${shareEntries.map(e=>e.name).join(' · ')}`}</p><label htmlFor="share-hours">Bağlantı süresi</label><select id="share-hours" value={shareHours} disabled={shareLoading||!!shareLink} onChange={e=>setShareHours(Number(e.target.value))}><option value={1}>1 saat</option><option value={24}>24 saat</option><option value={168}>7 gün</option></select><p className="muted">Yalnızca seçilen dosyalar indirilebilir. Birden çok dosyada tek bağlantı dosya listesini açar. Bağlantıyı bilen herkes süre dolana kadar erişebilir.</p>{shareError&&<p className="error-banner">{shareError}</p>}{shareLink&&<><input readOnly value={shareLink} aria-label="Paylaşım bağlantısı"/><button onClick={()=>navigator.clipboard.writeText(shareLink).then(()=>setNotice('Bağlantı kopyalandı')).catch(()=>setShareError('Kopyalanamadı'))}>📋 Bağlantıyı kopyala</button><button disabled={shareLoading} onClick={revokeShare}>🗑️ Bağlantıyı iptal et</button></>}{!shareLink&&<button disabled={shareLoading} onClick={createShare}>{shareLoading?'Oluşturuluyor…':'Bağlantı oluştur'}</button>}<button className="share-close" onClick={()=>setShareEntries([])}>Kapat</button></section></div>}
    {preview&&<div className="preview" onClick={()=>setPreview(null)}><div onClick={e=>e.stopPropagation()}><header><strong>{preview.name}</strong><div className="preview-actions"><button onClick={()=>startShare([preview])}>🔗 Paylaş</button><button disabled={busy} onClick={()=>download(preview)}>⬇ İndir</button><button onClick={()=>setPreview(null)}>✕</button></div></header>{isImage(preview.name)?<img src={mediaUrl(preview)} alt={preview.name}/>:<video src={mediaUrl(preview)} controls playsInline/>}</div></div>}
  </div>
}
