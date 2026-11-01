// Cihaz anahtarı tarayıcının IndexedDB alanında saklanır; Keychain entegrasyonu değildir.
// Özel anahtar dışarı aktarılamaz. iOS WebView verileri silinirse tekrar eşleştirme gerekir.
const DB='cagri-nas-device-v1';
const STORE='identity';
const openDb=()=>new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});
const getValue=async <T,>(name:string):Promise<T|null>=>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');
    const r=tx.objectStore(STORE).get(name);
    r.onsuccess=()=>resolve((r.result??null) as T|null);
    r.onerror=()=>reject(r.error);
    tx.oncomplete=()=>db.close();
  });
};
const putValue=async(name:string,value:unknown)=>{
  const db=await openDb();
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(value,name);
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>reject(tx.error);
  });
};
const base64url=(buf:ArrayBuffer)=>{
  const bytes=new Uint8Array(buf);let binary='';
  for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
export const hasDevice=async()=>Boolean(await getValue<string>('id') && await getValue<CryptoKey>('key'));
export const enrollDevice=async()=>{
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
  const res=await fetch('/api/device/enroll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicKey})});
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'Cihaz eşleştirilemedi');
  await putValue('key',pair.privateKey);
  await putValue('id',data.deviceId);
};
export const loginDevice=async()=>{
  const id=await getValue<string>('id');
  const key=await getValue<CryptoKey>('key');
  if(!id || !key)return false;
  const r=await fetch('/api/device/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:id})});
  if(!r.ok)return false;
  const {challenge}=await r.json();
  const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(challenge));
  const v=await fetch('/api/device/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId:id,challenge,signature:base64url(signature)})});
  return v.ok;
};
