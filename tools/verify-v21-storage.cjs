const {launchTestContext,runBrowserTest}=require('./test-browser-profile.cjs');
// Isolated, small storage fixtures. Gameplay is verified separately with retail files.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
runBrowserTest(async()=>{
  const report={checks:[],errors:[],started:new Date().toISOString()};
  const context=await launchTestContext(chromium,path.resolve('.local/v21-storage-browser'),{channel:'chrome',headless:true,viewport:{width:1440,height:900}});
  const page=context.pages()[0];page.on('pageerror',e=>report.errors.push(e.message));
  try{
    await page.goto('http://localhost:8094/zero-hour.html');await page.waitForFunction(()=>!!window.ZeroHAssetLibrary);
    const recovery=await page.evaluate(async()=>{
      const lib=window.ZeroHAssetLibrary,root=await navigator.storage.getDirectory(),parent=await root.getDirectoryHandle('cnc-library',{create:true}),folder=await parent.getDirectoryHandle('install-storage-fixture',{create:true});
      const names=window.ZeroHArchiveSpecs.map(a=>a.name),key='zeroh-installed-library.combined.v6';
      for(const name of names){const writer=await(await folder.getFileHandle(name,{create:true})).createWritable();await writer.write(new Uint8Array(32));await writer.close();}
      const manifest={version:6,game:'zeroHour',root:'cnc-library/install-storage-fixture',preparedAt:Date.now(),totalBytes:32*names.length,includeVideos:false,archives:names.map(name=>({name,bytes:32,entryCount:1,opfsPath:`cnc-library/install-storage-fixture/${name}`})),videos:[],cursorAsset:null};
      localStorage.setItem(key,JSON.stringify(manifest));lib.preparedArchives=manifest.archives;
      const original=FileSystemDirectoryHandle.prototype.getFileHandle;
      FileSystemDirectoryHandle.prototype.getFileHandle=function(name,options){if(this.name===folder.name&&name===names[0])return Promise.reject(new DOMException('Temporary read failure','NotAllowedError'));return original.call(this,name,options);};
      let failed;
      try{failed=await lib.verifyInstalledLibrary();}finally{FileSystemDirectoryHandle.prototype.getFileHandle=original;}
      const preserved=localStorage.getItem(key)===JSON.stringify(manifest)&&!!await parent.getDirectoryHandle(folder.name),notReady=!lib.summary().ready&&!lib.preparedArchives;
      const retried=!!await lib.verifyInstalledLibrary();
      manifest.archives[0].bytes++;manifest.totalBytes++;localStorage.setItem(key,JSON.stringify(manifest));
      const mismatch=await lib.verifyInstalledLibrary(),mismatchKept=!!localStorage.getItem(key)&&!!await folder.getFileHandle(names[0]);
      localStorage.setItem(key,'{corrupt');const corrupt=await lib.verifyInstalledLibrary();let cleanupBlocked=false;
      try{await lib.cleanUnusedStorage();}catch{cleanupBlocked=true;}
      const corruptKept=!!await parent.getDirectoryHandle(folder.name);
      const entry=(await lib.managedStorageInventory()).entries.find(e=>e.path===manifest.root);
      let release,locked;const entered=new Promise(r=>locked=r),held=navigator.locks.request('cnc-port-opfs-install:install-storage-fixture',{mode:'shared'},async()=>{locked();await new Promise(r=>release=r);});await entered;
      let removalBlocked=false;try{await lib.removeInstalledLibrary();}catch{removalBlocked=localStorage.getItem(key)==='{corrupt';}finally{release();await held;}
      return {failed:failed===null,preserved,notReady,retried,mismatch:mismatch===null,mismatchKept,corrupt:corrupt===null,cleanupBlocked,corruptKept,recoveryInventory:entry.state==='recovery'&&!entry.deletable,removalBlocked};
    });
    Object.values(recovery).forEach(value=>assert.equal(value,true));report.checks.push('Transient failure, file-size mismatch and corrupt record retain archives; cached launch blocked; retry succeeds; ambiguous cleanup blocked');
    await page.locator('#openSettings').click();await page.locator('#settingsRemoveLibrary').click();await page.locator('#confirmProceed').click();
    await page.waitForFunction(()=>!localStorage.getItem('zeroh-installed-library.combined.v6'));
    assert.equal(await page.evaluate(async()=>{try{await(await(await navigator.storage.getDirectory()).getDirectoryHandle('cnc-library')).getDirectoryHandle('install-storage-fixture');return true;}catch{return false;}}),false);
    report.checks.push('Settings removal explicitly recovers corrupt installation record and deletes only managed archives');
    const isolated=await page.evaluate(async()=>{
      const open=(name,store,options)=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store,options);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const put=async(name,store,value,key,options)=>{const db=await open(name,store,options);await new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();};
      const get=async(name,store,key)=>{const db=await open(name,store);const value=await new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error);});db.close();return value;};
      await put('zeroh-asset-handles.combined.v1','sources','other-source','active');
      await put('zero-hour-web-v1:asset-handles.combined.v1','sources','our-source','active');
      await put('zeroh-retail-presentation','art',{key:'other',value:'other-art'},undefined,{keyPath:'key'});
      await put('zero-hour-web-v1:retail-presentation','art',{key:'our',value:'our-art'},undefined,{keyPath:'key'});
      await window.ZeroHAssetLibrary.clearRememberedHandles();await(await import('./harness/launcher-retail-presentation.mjs')).clearRetailPresentationCache();
      return {otherSource:await get('zeroh-asset-handles.combined.v1','sources','active'),ourSource:await get('zero-hour-web-v1:asset-handles.combined.v1','sources','active'),otherArt:await get('zeroh-retail-presentation','art','other'),ourArt:await get('zero-hour-web-v1:retail-presentation','art','our')};
    });
    assert.equal(isolated.otherSource,'other-source');assert.equal(isolated.ourSource,null);assert.equal(isolated.otherArt.value,'other-art');assert.equal(isolated.ourArt,null);
    report.checks.push('Source-handle and artwork cleanup clears only product-scoped IndexedDB; shared legacy sentinels remain');
    const inventory=await page.evaluate(async()=>{
      const parent=await(await navigator.storage.getDirectory()).getDirectoryHandle('archive-staging',{create:true});
      const folder=await parent.getDirectoryHandle('extract-storage-fixture',{create:true}),writer=await(await folder.getFileHandle('staged.bin',{create:true})).createWritable();await writer.write(new Uint8Array(1048576));await writer.close();
      return (await window.ZeroHAssetLibrary.managedStorageInventory()).entries.find(e=>e.path==='archive-staging/extract-storage-fixture');
    });
    assert.equal(inventory.totalBytes,1048576);assert.equal(inventory.state,'stale');assert.equal(inventory.deletable,true);
    await page.locator('#openSettings').click();await page.locator('#settingsCleanStorage').click();await page.waitForFunction(()=>document.getElementById('settingsStorageStatus').textContent.includes('Removed'));
    assert.equal(await page.evaluate(async()=>{try{await(await(await navigator.storage.getDirectory()).getDirectoryHandle('archive-staging')).getDirectoryHandle('extract-storage-fixture');return true;}catch{return false;}}),false);
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){await page.setViewportSize(viewport);await page.locator('#settings').evaluate(el=>el.scrollTop=el.scrollHeight);assert.equal(await page.locator('#closeSettings').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`output/playwright/v21-recovery-${viewport.width}.png`});}
    report.checks.push('Extraction bytes included in storage inventory, actual cleanup reclaims folder; expanded recovery Settings fits desktop and mobile');
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.failure=error.stack;process.exitCode=1;}
  finally{await fs.writeFile('.local/version-21-storage-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await context.close();}
});
