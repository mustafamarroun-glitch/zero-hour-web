export function streamAddress(value,site='https://mustafamarroun-glitch.github.io/zero-hour-web/stream/') {
  if(typeof value!=='string'||value.trim().length>2048)throw Error('Paste the complete HTTPS stream address from your host.');
  let url;
  try{url=new URL(value.trim())}catch{throw Error('Paste a complete address beginning with https://.')}
  const website=new URL(site);
  if(url.origin===website.origin&&url.pathname===website.pathname&&url.searchParams.has('host')){
    try{url=new URL(url.searchParams.get('host'))}catch{throw Error('This invite has an invalid host address. Ask for a new invite.')}
  }
  if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.pathname!=='/'){
    throw Error('Use the host’s HTTPS stream address or website invite. Keep the password separate.');
  }
  return url;
}

// Match complete hostnames: a public domain named localhost.example is remote.
export function streamTransport(url) {
  const host=url.hostname;
  if(host==='localhost'||host==='[::1]')return 'lan';
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(host))return 'internet';
  const [a,b]=host.split('.').map(Number);
  return a===127||a===10||a===192&&b===168||a===172&&b>=16&&b<=31?'lan':'internet';
}
