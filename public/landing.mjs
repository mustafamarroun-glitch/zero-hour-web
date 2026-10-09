// Older ZeroHour room invites used the site root. Preserve the complete invite.
if(new URLSearchParams(location.search).has('room')){
 const gameURL=new URL('./zero-hour/',location.href);
 gameURL.search=location.search;gameURL.hash=location.hash;
 location.replace(gameURL.href);
}
const themeButton=document.getElementById('landingTheme');
const preferenceKey='zero-hour-web-v1:zhweb-settings-v2';
function savedPreferences(){
 try{const saved=JSON.parse(localStorage.getItem(preferenceKey)||'{}');return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{return {};}
}
function updateThemeButton(){
 const dark=document.documentElement.dataset.theme==='dark';
 themeButton.setAttribute('aria-pressed',String(dark));themeButton.textContent=dark?'Dark mode: on':'Dark mode: off';
}
function restoreTheme(){document.documentElement.dataset.theme=savedPreferences().dark===false?'light':'dark';updateThemeButton();}
updateThemeButton();themeButton.hidden=false;
themeButton.addEventListener('click',()=>{
 const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';
 // Preserve gameplay settings and recover malformed theme preferences.
 try{localStorage.setItem(preferenceKey,JSON.stringify({...savedPreferences(),dark}));}catch{}
 updateThemeButton();
});
// A returned tab and another game tab can both change the saved theme.
window.addEventListener('pageshow',event=>{if(event.persisted)restoreTheme();});
window.addEventListener('storage',event=>{if(event.key===preferenceKey||event.key===null)restoreTheme();});
