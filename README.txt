CAGRI NAS v0.4 - Kurulum
1. server.mjs -> cagri-nas ana klasoru (eski dosyanin uzerine)
2. src/App.tsx ve src/media.css -> cagri-nas/src
3. Vite aciksa yeniden baslatmaya gerek yok; API server terminalinde Ctrl+C yapip node server.mjs ile yeniden baslat.
4. NAS_USER ve NAS_PASSWORD ortam degiskenleri ayni terminalde olmali. Sifreyi kodlara yazmayin.
5. http://localhost:5173/ acin. Resimlerim klasorune gidin.
Guvenlik: Salt okunur GET/PROPFIND. Yalnizca 127.0.0.1 dinleniyor. Tasarim ilk testi Windows icindir.
