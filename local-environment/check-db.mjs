#!/usr/bin/env node
// Is the workshop database reachable from this machine?
//
//     node check-db.mjs
//
// Standard library only, on purpose: at this point you have not chosen a database
// driver yet, and this script must not choose one for you. It checks that something
// is listening on the port the compose file publishes — which is all you need to
// know before you start. Your own connection test comes later, once your design has
// picked a driver.
import net from 'node:net';

const host = process.env.PGHOST ?? '127.0.0.1';
const port = Number(process.env.PGPORT ?? 5432);

const ok = await new Promise((resolve) => {
  const sock = net.createConnection({ host, port });
  sock.setTimeout(4000);
  sock.on('connect', () => (sock.end(), resolve(true)));
  sock.on('timeout', () => (sock.destroy(), resolve(false)));
  sock.on('error', () => resolve(false));
});

if (ok) {
  console.log(`  postgres is accepting connections on ${host}:${port}`);
  console.log(`  connection string: postgres://pointhub:pointhub@${host}:${port}/pointhub`);
  console.log('\ndatabase is up.');
} else {
  console.error(`\nnothing is listening on ${host}:${port}`);
  console.error('\nStart it, from this folder:');
  console.error('    docker compose up -d');
  console.error('`docker compose ps` should show "healthy" before you retry.');
  console.error('If Docker Desktop itself is not running, start that first.');
  process.exitCode = 1;
}
