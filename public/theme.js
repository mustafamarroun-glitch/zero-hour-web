// Read the existing product namespace before first paint; dark is the default.
(()=>{let dark=true;try{const p=JSON.parse(localStorage.getItem('zero-hour-web-v1:zhweb-settings-v2')||'{}');dark=p.dark!==false}catch{}document.documentElement.dataset.theme=dark?'dark':'light'})();
