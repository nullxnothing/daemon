import WebSocket from 'ws';
const WS = process.argv[2];
const ws = new WebSocket(WS);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
ws.on('open', async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  try {
    await send('Runtime.enable');
    console.log('title:', await evalJs('document.title'));
    console.log('readyState:', await evalJs('document.readyState'));
    console.log('daemon bridge:', await evalJs('typeof window.daemon'));
    console.log('window.minimize fn:', await evalJs('typeof window.daemon?.window?.minimize'));

    const initMax = await evalJs('window.daemon.window.isMaximized()');
    console.log('initial isMaximized:', initMax);

    console.log('-> maximize()');
    await evalJs('window.daemon.window.maximize()');
    await sleep(700);
    console.log('   isMaximized now:', await evalJs('window.daemon.window.isMaximized()'));

    console.log('-> maximize() again (should toggle off)');
    await evalJs('window.daemon.window.maximize()');
    await sleep(700);
    console.log('   isMaximized now:', await evalJs('window.daemon.window.isMaximized()'));

    console.log('-> minimize()');
    const beforeMin = Date.now();
    await evalJs('window.daemon.window.minimize()');
    await sleep(500);
    console.log('   visibilityState:', await evalJs('document.visibilityState'));
    console.log('   minimize round trip ms:', Date.now() - beforeMin);

    console.log('-> errors logged in renderer:');
    console.log(await evalJs('JSON.stringify((window.__errors||[]).slice(0,5))'));

    console.log('OK');
  } catch (e) {
    console.error('FAIL:', e.message);
  } finally {
    ws.close();
  }
});
ws.on('error', (e) => { console.error('WS error:', e.message); process.exit(1); });
