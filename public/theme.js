// Read the existing product namespace before first paint; dark is the default.
(()=>{let dark=true;try{const key=document.documentElement.dataset.game==='yuri'?'zhweb-yuri-settings-v1':'zhweb-settings-v2';const p=JSON.parse(localStorage.getItem('zero-hour-web-v1:'+key)||'{}');dark=p.dark!==false}catch{}document.documentElement.dataset.theme=dark?'dark':'light'})();
