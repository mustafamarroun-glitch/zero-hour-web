// Keep saved links and room invites working at the old launcher address.
(() => {
  const gameURL = new URL('./zero-hour/', location.href);
  gameURL.search = location.search;
  gameURL.hash = location.hash;
  location.replace(gameURL.href);
})();
