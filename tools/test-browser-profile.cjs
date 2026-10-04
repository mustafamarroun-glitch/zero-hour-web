// Own only profiles created by this test run. Never sweep pre-existing directories.
const fs = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const projectRoot = path.resolve(__dirname, '..');
const profileRoot = path.join(projectRoot, '.local', 'test-browser-profiles');
const markerName = '.zero-hour-test-profile.json';
const active = new Set();

async function assertNoLinks(target) {
  const relative = path.relative(projectRoot, target);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw Error('Test profile must be inside this project');
  }
  let current = projectRoot;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const entry = await fs.lstat(current).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (entry?.isSymbolicLink() || (entry && !entry.isDirectory())) {
      throw Error(`Refusing linked or non-directory test profile path: ${current}`);
    }
  }
}

async function launchTestContext(chromium, label, options, configuration = {}) {
  const reuse = configuration.reuseProfile === undefined ? process.env.ZH_PROFILE : configuration.reuseProfile;
  const retain = configuration.retain === undefined ? process.env.ZH_KEEP_TEST_PROFILE === '1' : configuration.retain;
  let directory, token;
  if (reuse) {
    directory = path.resolve(projectRoot, reuse);
    const relative = path.relative(profileRoot, directory);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw Error('ZH_PROFILE must name an existing retained profile under .local/test-browser-profiles');
    }
    await assertNoLinks(directory);
    if (!(await fs.stat(directory)).isDirectory()) throw Error('Test profile is missing');
    const marker = JSON.parse(await fs.readFile(path.join(directory, markerName), 'utf8'));
    if (!marker.token || !marker.created) throw Error('Not a managed test profile');
  } else {
    await assertNoLinks(profileRoot);
    await fs.mkdir(profileRoot, {recursive: true});
    const name = path.basename(label).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 60) || 'test';
    directory = await fs.mkdtemp(path.join(profileRoot, name + '-'));
    token = randomUUID();
    await fs.writeFile(path.join(directory, markerName), JSON.stringify({token, created: new Date().toISOString()}));
  }
  const metadata = {path: directory, owned: !!token, retained: !token || retain, removed: false};
  const removeOwned = async (failedLaunch = false) => {
    if (!token || (retain && !failedLaunch) || metadata.removed) return;
    await assertNoLinks(directory);
    if (path.dirname(directory) !== profileRoot) throw Error('Refusing deletion outside the test profile root');
    const marker = JSON.parse(await fs.readFile(path.join(directory, markerName), 'utf8'));
    if (marker.token !== token) throw Error('Refusing deletion: test profile ownership marker changed');
    await fs.rm(directory, {recursive: true, force: false, maxRetries: 5, retryDelay: 200});
    metadata.removed = true;
  };
  let context;
  try {
    context = await chromium.launchPersistentContext(directory, options);
  } catch (error) {
    // Playwright tears down its browser process when launching fails.
    // Even debug retention should not leave a failed-launch profile behind.
    if (token) await removeOwned(true);
    throw error;
  }
  const closeBrowser = context.close.bind(context);
  let closing;
  context.testProfile = metadata;
  context.close = () => {
    if (!closing) closing = (async () => {
      await closeBrowser(); // A close error leaves the directory for inspection.
      await removeOwned();
      active.delete(context);
    })().catch(error => { closing = null; throw error; });
    return closing;
  };
  active.add(context);
  console.log(`Test profile: ${directory} (${metadata.retained ? 'retained explicitly; close does not delete it' : 'removed automatically after close'})`);
  return context;
}

async function closeActiveContexts() {
  const results = await Promise.allSettled([...active].map(context => context.close()));
  const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Test browser cleanup failed');
}

function runBrowserTest(test) {
  let exiting = false;
  const interrupted = async signal => {
    if (exiting) return;
    exiting = true;
    try { await closeActiveContexts(); } catch (error) { console.error(error); }
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  const fatal = async error => {
    if (exiting) return;
    exiting = true;
    console.error(error);
    try { await closeActiveContexts(); } catch (cleanupError) { console.error(cleanupError); }
    process.exit(1);
  };
  const onInterrupt = () => interrupted('SIGINT');
  const onTerminate = () => interrupted('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  process.once('unhandledRejection', fatal);
  process.once('uncaughtException', fatal);
  return (async () => {
    try { await test(); } finally { await closeActiveContexts(); }
  })().catch(error => {
    console.error(error);
    // Entry-point failures can leave a test progress timer/server running.
    process.exitCode = 1;
    process.exit(1);
  }).finally(() => {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    process.removeListener('unhandledRejection', fatal);
    process.removeListener('uncaughtException', fatal);
  });
}

module.exports = {launchTestContext, runBrowserTest, closeActiveContexts, profileRoot};
