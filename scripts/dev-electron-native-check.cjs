try {
  require('better-sqlite3');
  console.log('better-sqlite3:ok');

  require('node-pty');
  console.log('node-pty:ok');

  process.exit(0);
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
