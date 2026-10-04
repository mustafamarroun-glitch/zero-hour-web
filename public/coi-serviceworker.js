/* Copyright (C) 2026 New Shoes and Zero Hour Web contributors.
 * SPDX-License-Identifier: GPL-3.0-or-later
 * No response cache. Only responses inside this standalone site scope change.
 */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
 if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||(request.cache==='only-if-cached'&&request.mode!=='same-origin'))return;
 event.respondWith(fetch(request).then(response=>{
  if(response.status===0)return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy','same-origin');headers.set('Cross-Origin-Embedder-Policy','require-corp');headers.set('Cross-Origin-Resource-Policy','same-origin');headers.set('X-Content-Type-Options','nosniff');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }));
});
