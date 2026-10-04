const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {launchTestContext, profileRoot} = require('./test-browser-profile.cjs');
const fakeChrome = {async launchPersistentContext(directory) {
  await fs.writeFile(path.join(directory, 'fixture-game-data.bin'), Buffer.alloc(1024));
  return {async close() {}};
}};
const options = {reuseProfile: null, retain: false};
const exists = filename => fs.stat(filename).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});

test('fresh profiles are unique; close deletes only its own profile and is idempotent', async () => {
  const first = await launchTestContext(fakeChrome, 'unit-first', {}, options);
  const second = await launchTestContext(fakeChrome, 'unit-second', {}, options);
  try {
    assert.notEqual(first.testProfile.path, second.testProfile.path);
    await Promise.all([first.close(), first.close()]);
    assert.equal(await exists(first.testProfile.path), false);
    assert.equal(await exists(second.testProfile.path), true);
    assert.equal(first.testProfile.removed, true);
  } finally { await first.close(); await second.close(); }
});

test('launch failure removes its own partial profile, including with debug retention requested', async () => {
  let directory;
  const failing = {async launchPersistentContext(location) {
    directory = location;
    await fs.writeFile(path.join(location, 'partial.bin'), 'partial');
    throw Error('launch failed');
  }};
  await assert.rejects(launchTestContext(failing, 'unit-launch-failure', {}, {...options, retain: true}), /launch failed/);
  assert.equal(await exists(directory), false);
});

test('retention and explicit reuse preserve test data', async () => {
  const original = await launchTestContext(fakeChrome, 'unit-retained', {}, {...options, retain: true});
  const directory = original.testProfile.path;
  try {
    await original.close();
    assert.equal(await exists(directory), true);
    const reused = await launchTestContext(fakeChrome, 'unused-label', {}, {reuseProfile: directory, retain: false});
    assert.equal(reused.testProfile.owned, false);
    await reused.close();
    assert.equal(await exists(directory), true);
  } finally {
    await original.close();
    // This fixture was created by this test, not a pre-existing user profile.
    await fs.rm(directory, {recursive: true});
  }
});

test('missing, ordinary-browser and protected packaging paths are refused before launch', async () => {
  const shouldNotLaunch = {async launchPersistentContext() { throw Error('browser must not launch'); }};
  for (const directory of [path.join(profileRoot, 'missing-unit-profile'), path.resolve('.local/packaging'), path.resolve('..', 'normal-browser')]) {
    await assert.rejects(launchTestContext(shouldNotLaunch, 'unused', {}, {reuseProfile: directory}), /ENOENT|existing retained profile/);
  }
});

test('changed ownership marker blocks cleanup; restoring it permits cleanup', async () => {
  const context = await launchTestContext(fakeChrome, 'unit-marker', {}, options);
  const marker = path.join(context.testProfile.path, '.zero-hour-test-profile.json');
  const original = await fs.readFile(marker, 'utf8');
  try {
    await fs.writeFile(marker, JSON.stringify({token: 'not-this-run'}));
    await assert.rejects(context.close(), /ownership marker changed/);
    assert.equal(await exists(context.testProfile.path), true);
  } finally { await fs.writeFile(marker, original); await context.close(); }
});

test('close failure leaves profile intact and allows a later retry', async () => {
  let closes = 0;
  const context = await launchTestContext({async launchPersistentContext() {
    return {async close() { if (++closes === 1) throw Error('browser still open'); }};
  }}, 'unit-close-failure', {}, options);
  try {
    await assert.rejects(context.close(), /browser still open/);
    assert.equal(await exists(context.testProfile.path), true);
  } finally { await context.close(); }
  assert.equal(await exists(context.testProfile.path), false);
});

test('linked directory is refused and its target survives', async () => {
  const target = await launchTestContext(fakeChrome, 'unit-link-target', {}, options);
  const link = path.join(profileRoot, 'unit-link-' + path.basename(target.testProfile.path));
  try {
    await fs.symlink(target.testProfile.path, link, 'junction');
    await assert.rejects(launchTestContext(fakeChrome, 'unused', {}, {reuseProfile: link}), /Refusing linked/);
    assert.equal(await exists(path.join(target.testProfile.path, 'fixture-game-data.bin')), true);
  } finally { await fs.unlink(link).catch(error => {if (error.code !== 'ENOENT') throw error;}); await target.close(); }
});

for (const mode of ['uncaught failure', 'report-write failure', 'signal-handler interruption', 'timer exception', 'timer rejection']) {
  test(`entrypoint cleans active profiles after ${mode}`, async () => {
    const helper = JSON.stringify(require.resolve('./test-browser-profile.cjs'));
    const operation = mode === 'signal-handler interruption' ? "process.emit('SIGINT'); await new Promise(()=>{});" :
      mode === 'report-write failure' ? "await fs.writeFile(path.join(context.testProfile.path,'missing','report.json'),'report');" :
      mode === 'timer exception' ? "setTimeout(()=>{throw Error('progress timer failed');},0);await new Promise(()=>{});" :
      mode === 'timer rejection' ? "setTimeout(async()=>{throw Error('progress report failed');},0);await new Promise(()=>{});" : "throw Error('failed before inner finally');";
    const source = `const fs=require('node:fs/promises'),path=require('node:path');const {launchTestContext,runBrowserTest}=require(${helper});runBrowserTest(async()=>{const context=await launchTestContext({async launchPersistentContext(){return {async close(){}};}},'unit-entrypoint',{}, {reuseProfile:null,retain:false});console.log('CREATED='+context.testProfile.path);${operation}});`;
    const child = spawn(process.execPath, ['-e', source], {stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', bytes => stdout += bytes);
    child.stderr.on('data', bytes => stderr += bytes);
    const code = await new Promise((resolve, reject) => {child.once('error', reject); child.once('close', resolve);});
    assert.equal(code, mode === 'signal-handler interruption' ? 130 : 1, stderr);
    const directory = stdout.match(/CREATED=(.+)/)?.[1].trim();
    assert.ok(directory, stdout + stderr);
    assert.equal(await exists(directory), false);
  });
}
