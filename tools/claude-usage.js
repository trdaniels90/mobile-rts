#!/usr/bin/env node
// Claude token tracker (Stop hook, see .claude/settings.json).
// Reads this session's transcript, sums each Claude reply's token use and sends the
// rows to Supabase (log_claude_usage, supabase/claude-usage.sql). Replies are keyed by
// message id, so sending the whole session again each turn is harmless.
// Run by hand: node tools/claude-usage.js [transcript.jsonl]   (prints a summary, sends nothing
// with --dry). Never fails the hook: every error is swallowed.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const URL = 'https://yorrgemlhoxbxvyvzcwe.supabase.co/rest/v1/rpc/log_claude_usage';
const KEY = 'sb_publishable_FkCzdcgsEyqNy_UwmajBiQ_kp8V2Vi6'; // public key, same as src/report.js

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

function transcripts(main) {
  const list = [main];
  const dir = main.replace(/\.jsonl$/, '');
  const walk = d => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) list.push(p); // subagent transcripts
    }
  };
  walk(dir);
  return list;
}

function collect(files, session) {
  const rows = new Map();
  for (const f of files) {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const line of text.split('\n')) {
      if (!line.includes('"usage"')) continue;
      let j;
      try { j = JSON.parse(line); } catch (e) { continue; }
      const m = j.message;
      if (!m || m.role !== 'assistant' || !m.usage || !m.id) continue;
      const u = m.usage;
      // A reply is written once per content block with the same usage; the last one wins.
      rows.set(m.id, {
        id: m.id, s: j.sessionId || session, t: j.timestamp || new Date().toISOString(),
        m: m.model, i: u.input_tokens || 0, o: u.output_tokens || 0,
        cr: u.cache_read_input_tokens || 0, cw: u.cache_creation_input_tokens || 0,
        sc: !!j.isSidechain || f !== files[0], b: j.gitBranch || null,
      });
    }
  }
  return [...rows.values()];
}

function send(rows) {
  for (let i = 0; i < rows.length; i += 1000) {
    const body = JSON.stringify({ rows: rows.slice(i, i + 1000) });
    // curl, because it follows the session's HTTPS proxy settings.
    execFileSync('curl', ['-sS', '-m', '8', '-o', '/dev/null', '-X', 'POST', URL,
      '-H', 'apikey: ' + KEY, '-H', 'Content-Type: application/json', '--data-binary', '@-'],
      { input: body, stdio: ['pipe', 'ignore', 'ignore'] });
  }
}

try {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  let file = args.find(a => !a.startsWith('--'));
  let session = null;
  if (!file) {
    const raw = readStdin();
    const hook = raw ? JSON.parse(raw) : {};
    file = hook.transcript_path;
    session = hook.session_id;
  }
  if (file && fs.existsSync(file)) {
    const rows = collect(transcripts(file), session || path.basename(file, '.jsonl'));
    if (dry || process.stdout.isTTY) {
      const t = rows.reduce((a, r) => (a.i += r.i, a.o += r.o, a.cr += r.cr, a.cw += r.cw, a), { i: 0, o: 0, cr: 0, cw: 0 });
      const k = n => (n / 1000).toFixed(1) + 'k';
      console.log(`${rows.length} replies  input ${k(t.i)}  output ${k(t.o)}  cache read ${k(t.cr)}  cache write ${k(t.cw)}`);
    }
    if (!dry && rows.length) send(rows);
  }
} catch (e) { /* never block Claude */ }
process.exit(0);
