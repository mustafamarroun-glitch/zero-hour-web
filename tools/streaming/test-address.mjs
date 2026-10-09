import assert from 'node:assert/strict';
import {streamAddress,streamTransport} from '../../public/stream/address.mjs';
assert.equal(streamAddress('https://example.trycloudflare.com').href,'https://example.trycloudflare.com/');
assert.equal(streamAddress('https://192.168.1.67:3001/').host,'192.168.1.67:3001');
assert.equal(streamAddress('https://mustafamarroun-glitch.github.io/zero-hour-web/stream/?host=https%3A%2F%2Fexample.trycloudflare.com').hostname,'example.trycloudflare.com');
for(const value of ['javascript:alert(1)','http://example.com','https://name:password@example.com/','https://example.com/?password=secret','https://example.com/#secret','https://example.com/some-path','https://mustafamarroun-glitch.github.io/zero-hour-web/stream/?host=javascript%3Aalert(1)'])assert.throws(()=>streamAddress(value));
console.log('Stream invite parsing: HTTPS, private LAN, website invites, invalid schemes and credentials passed.');

for(const host of ['localhost','127.0.0.1','127.1.2.3','10.0.0.1','192.168.1.67','172.16.0.1','172.31.255.255','[::1]'])assert.equal(streamTransport(streamAddress('https://'+host+'/')),'lan',host);
for(const host of ['localhost.example.com','localhostevil.com','127.example.com','10.example.com','192.168.example.com','172.15.0.1','172.32.0.1','192.169.0.1','8.8.8.8','example.trycloudflare.com','[2001:db8::1]'])assert.equal(streamTransport(streamAddress('https://'+host+'/')),'internet',host);
console.log('Stream transport: private IPv4, loopback IPv6, public hosts and misleading domain prefixes passed.');
