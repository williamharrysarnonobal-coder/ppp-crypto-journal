// ARBAB heartbeat: run by Claude in the background for the whole session and left running.
// It only says "the VS Code session is alive"; the watcher (wait-msg.cjs) says "Claude is free".
//   alive + watcher running  -> ARBAB shows ONLINE · STANDING BY
//   alive + watcher stopped  -> WORKING… (Claude is busy on a task)
//   not alive                -> OFFLINE
const { setState, sleep } = require('./lib.cjs');
(async () => {
  for (;;) {
    try { await setState({ beat_at: new Date().toISOString() }); } catch { /* offline: try again */ }
    await sleep(5000);
  }
})();
