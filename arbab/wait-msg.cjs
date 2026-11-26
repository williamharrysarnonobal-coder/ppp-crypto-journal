// ARBAB watcher (same job as ANGE's wait-msg.cjs): run by Claude in the background.
// Every 3 s it marks "listening" (Claude is free) and checks for new messages
// from William; on the first one it prints them (with any attached image saved
// locally) and exits, so Claude answers with reply.cjs and starts it again.
const { OWNER_ID, rest, setState, getState, downloadImage, sleep } = require('./lib.cjs');
(async () => {
  for (;;) {
    try {
      const now = new Date().toISOString();
      await setState({ beat_at: now, listen_at: now });
      const { seen_id } = await getState();
      const msgs = await rest(`arbab_messages?user_id=eq.${OWNER_ID}&role=eq.user&id=gt.${seen_id || 0}&order=id.asc&select=id,text,image_path,created_at`);
      if (msgs && msgs.length) {
        await setState({ seen_id: msgs[msgs.length - 1].id });
        for (const m of msgs) {
          console.log(`ARBAB MESSAGE #${m.id} (${new Date(m.created_at).toLocaleTimeString()}): ${m.text || ''}`);
          if (m.image_path) {
            try { console.log(`  [image attached: ${await downloadImage(m.image_path)} ]`); }
            catch (e) { console.log(`  [image attached but could not download: ${e.message}]`); }
          }
        }
        break;   // clean return so the process exits 0 (process.exit crashes libuv on Windows)
      }
    } catch (e) { /* offline or table missing: keep trying */ }
    await sleep(3000);
  }
})();
