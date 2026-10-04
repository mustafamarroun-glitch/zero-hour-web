async function r(t){const n=await crypto.subtle.digest("SHA-256",t);return[...new Uint8Array(n)].map(a=>a.toString(16).padStart(2,"0")).join("")}export{r as sha256Hex};
