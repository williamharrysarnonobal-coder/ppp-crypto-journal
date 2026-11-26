// ARBAB answer: node reply.cjs <text-file> [--progress]
//   --progress  a "working on it" update; ARBAB keeps showing PROCESSING until a final answer.
// The text is read from a file (UTF-8) so Tagalog, quotes and new lines survive the shell.
const fs = require('node:fs');
const { OWNER_ID, rest } = require('./lib.cjs');
(async () => {
  const file = process.argv[2];
  if (!file) { console.log('usage: node reply.cjs <text-file> [--progress]'); return; }
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').trim().slice(0, 12000);
  await rest('arbab_messages', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{ user_id: OWNER_ID, role: 'arbab', text, progress: process.argv.includes('--progress') }])
  });
  console.log('sent');
})().catch((e) => console.log('error', e.message));
