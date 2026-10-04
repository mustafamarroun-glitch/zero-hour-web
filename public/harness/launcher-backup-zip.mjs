// ZIP STORE: keep BIG archives unchanged and reference file-backed Blobs.
// Only small headers and one 4 MiB checksum chunk occupy JavaScript memory.
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
const encoder = new TextEncoder();
const limit = 0xffffffff;
function header(length) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  return { bytes, u16: (at, value) => view.setUint16(at, value, true), u32: (at, value) => view.setUint32(at, value, true) };
}
export function buildArchiveZip(entries, options = {}) {
  return buildZip(entries, options, name => /^[a-z0-9_!. -]+\.big$/i.test(name));
}
// Keep directory structure for complete installation backups. The Zero Hour
// entry point above retains its stricter BIG-only contract.
export function buildFileZip(entries, options = {}) {
  return buildZip(entries, options, name => typeof name === 'string' &&
    !/[\\:\x00-\x1f\x7f]/.test(name) &&
    name.split('/').every(part => part && part !== '.' && part !== '..'));
}
async function buildZip(entries, { onProgress = () => {}, signal } = {}, validName) {
  signal?.throwIfAborted();
  if (!entries.length || entries.length > 65535) throw new Error('Select a folder with 1–65,535 files to create a backup.');
  const names = new Set();
  let expected = 22;
  for (const { name, file } of entries) {
    const key = typeof name === 'string' ? name.normalize('NFC').toLowerCase() : '';
    if (!validName(name) || names.has(key) || encoder.encode(name).length > 65535) throw new Error('Invalid or duplicate backup file path.');
    names.add(key);
    expected += file.size + 76 + encoder.encode(name).length * 2;
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size >= limit || expected >= limit) {
      throw new Error('This folder exceeds the 4 GB limit for a backup ZIP. Keep a copy of the original folder instead.');
    }
  }
  const total = entries.reduce((sum, entry) => sum + entry.file.size, 0);
  const parts = [], central = [];
  let offset = 0, completed = 0;
  for (const { name, file } of entries) {
    let crc = 0xffffffff;
    for (let start = 0; start < file.size; start += 4 * 1024 * 1024) {
      signal?.throwIfAborted();
      const chunk = new Uint8Array(await file.slice(start, start + 4 * 1024 * 1024).arrayBuffer());
      for (const byte of chunk) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      completed += chunk.length;
      onProgress({ name, completed, total });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    signal?.throwIfAborted();
    crc = (crc ^ 0xffffffff) >>> 0;
    const encoded = encoder.encode(name);
    const local = header(30);
    local.u32(0, 0x04034b50); local.u16(4, 20); local.u16(6, 0x800);
    local.u16(12, 33); // January 1, 1980; a valid portable DOS date.
    local.u32(14, crc); local.u32(18, file.size); local.u32(22, file.size); local.u16(26, encoded.length);
    parts.push(local.bytes, encoded, file);
    const record = header(46);
    record.u32(0, 0x02014b50); record.u16(4, 20); record.u16(6, 20); record.u16(8, 0x800);
    record.u16(14, 33); record.u32(16, crc); record.u32(20, file.size); record.u32(24, file.size);
    record.u16(28, encoded.length); record.u32(42, offset);
    central.push(record.bytes, encoded);
    offset += 30 + encoded.length + file.size;
  }
  const centralBytes = central.reduce((sum, item) => sum + item.length, 0);
  const end = header(22);
  end.u32(0, 0x06054b50); end.u16(8, entries.length); end.u16(10, entries.length);
  end.u32(12, centralBytes); end.u32(16, offset);
  return new Blob([...parts, ...central, end.bytes], { type: 'application/zip' });
}
