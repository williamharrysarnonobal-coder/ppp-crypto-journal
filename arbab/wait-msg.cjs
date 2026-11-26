// ARBAB watcher (same job as ANGE's wait-msg.cjs): run by Claude in the background.
// Every 3 s it marks "listening" (Claude is free) and checks for new messages
// from William; on the first one it prints them (with any attached image saved
// locally) and exits, so Claude answers with reply.cjs and starts it again.
const { OWNER_ID, rest, setState, getState, downloadImage, sleep } = require('./lib.cjs');
const { execFile } = require('node:child_process');
const path = require('node:path');
// Voice messages (2026-11-26): voice-<time>-<en|tl>.<ext> → Whisper text,
// written back into the same message so the app shows it, then printed.
const isVoice = p => /\/voice-[^/]+\.(m4a|mp4|webm|ogg|wav|aac)$/i.test(p || '');
function transcribe(file, lang) {
  return new Promise((resolve) => {
    execFile('python', [path.join(__dirname, 'transcribe.py'), file, lang], { timeout: 180000, maxBuffer: 1 << 20, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
      (err, out) => resolve(err ? { error: (err.message || '').split('\n')[0] } : { text: String(out).trim() }));
  });
}
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
          if (isVoice(m.image_path)) {
            // Progress in the chat at every step (owner, 2026-11-26: "so I'm not guessing").
            const progress = (t) => rest('arbab_messages', { method: 'POST', headers: { Prefer: 'return=minimal' },
              body: JSON.stringify([{ user_id: OWNER_ID, role: 'arbab', text: t, progress: true }]) }).catch(() => {});
            const secs = (/\((\d+)s\)/.exec(m.text || '') || [])[1];
            await progress(`🎧 Got your voice message${secs ? ` (${secs}s)` : ''}. Turning it into text…`);
            let text;
            try {
              const file = await downloadImage(m.image_path);
              const lang = /-en\.[a-z0-9]+$/i.test(m.image_path) ? 'en' : 'tl';
              const r = await transcribe(file, lang);
              text = r.error ? null : r.text;
              if (r.error) console.log(`  [voice message: transcription failed: ${r.error}]`);
            } catch (e) { console.log(`  [voice message: could not download: ${e.message}]`); }
            const shown = text ? `🎤 ${text}` : '🎤 Voice message (couldn’t make out the words)';
            try { await rest(`arbab_messages?id=eq.${m.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ text: shown }) }); } catch (e) {}
            await progress(text ? `📝 Heard: “${text}” Working on it…` : 'I couldn’t make out the words. Try again closer to the mic, or type it.');
            console.log(`ARBAB MESSAGE #${m.id} (${new Date(m.created_at).toLocaleTimeString()}): ${shown}  [voice, ${m.image_path.endsWith('-en.' + m.image_path.split('.').pop()) ? 'EN' : 'TL'}]`);
            continue;
          }
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
