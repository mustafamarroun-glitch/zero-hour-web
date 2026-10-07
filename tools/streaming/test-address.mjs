import assert from 'node:assert/strict';
import {streamAddress} from '../../public/stream/address.mjs';
assert.equal(streamAddress('https://example.trycloudflare.com').href,'https://example.trycloudflare.com/');
assert.equal(streamAddress('https://192.168.1.67:3001/').host,'192.168.1.67:3001');
assert.equal(streamAddress('https://mustafamarroun-glitch.github.io/zero-hour-web/stream/?host=https%3A%2F%2Fexample.trycloudflare.com').hostname,'example.trycloudflare.com');
for(const value of ['javascript:alert(1)','http://example.com','https://name:password@example.com/','https://example.com/?password=secret','https://example.com/#secret','https://example.com/some-path','https://mustafamarroun-glitch.github.io/zero-hour-web/stream/?host=javascript%3Aalert(1)'])assert.throws(()=>streamAddress(value));
console.log('Stream invite parsing: HTTPS, private LAN, website invites, invalid schemes and credentials passed.');
