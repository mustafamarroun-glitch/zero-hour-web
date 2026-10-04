import { validateBigReader } from './mod-package-format.mjs';

export async function validateTransferredArchive(file, expectedCount = null) {
  const first = new Uint8Array(await file.slice(0,16).arrayBuffer());
  if (first.byteLength < 16 || new TextDecoder().decode(first.subarray(0,4)) !== 'BIGF') {
    throw new Error(`${file.name}: missing BIGF header`);
  }
  const view = new DataView(first.buffer);
  const count = view.getUint32(8);
  if (!count || count > 200000 || (expectedCount !== null && count !== expectedCount)) {
    throw new Error(`${file.name}: invalid archive entry count`);
  }
  // The inspected combined installation contains a BIGF with a big-endian size.
  // Normalize only the validation copy when either encoding exactly matches.
  const bigEndianSize = view.getUint32(4) === file.size && view.getUint32(4,true) !== file.size;
  const directoryLimit = Math.min(file.size,16 + count * 269);
  return validateBigReader({size:file.size,read:async(offset,length)=>{
    const bytes = new Uint8Array(await file.slice(offset,Math.min(offset+length,directoryLimit)).arrayBuffer());
    if (offset === 0 && bigEndianSize) new DataView(bytes.buffer).setUint32(4,file.size,true);
    return bytes;
  }},file.name);
}
