#!/usr/bin/env node
// Prints the development packs certificate's notAfter and exits 1 once it is 14 days away or
// less, so dev-key-expiry.yml goes red in time to renew it as keys/dev/README.md shows.
//
//   node tools/release/dev-key-expiry.mjs [--now <instant>]
//
// --now replaces the clock, for tests. Exit 2 on a usage error.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CERT = new URL('../../keys/dev/packs.cert.json', import.meta.url);
const WARN_MS = 14 * 86400e3;

export function expiryVerdict(certificate, now) {
  const { notAfter } = JSON.parse(Buffer.from(certificate.payload, 'base64url').toString('utf8'));
  const left = Date.parse(notAfter) - now.getTime();
  return { notAfter, days: Math.floor(left / 86400e3), renew: left <= WARN_MS };
}

function main(args) {
  let now = new Date();
  if (args.length === 2 && args[0] === '--now') now = new Date(Date.parse(args[1]));
  else if (args.length) now = new Date(NaN);
  if (Number.isNaN(now.getTime())) {
    console.error('usage: dev-key-expiry.mjs [--now <instant>] (--now must be a date)');
    return 2;
  }
  const v = expiryVerdict(JSON.parse(readFileSync(CERT, 'utf8')), now);
  if (!v.renew) {
    console.log(`the development packs certificate expires ${v.notAfter}, in ${v.days} days`);
    return 0;
  }
  console.log(`::error::the development packs certificate expires ${v.notAfter} (${v.days} days); renew it as keys/dev/README.md shows`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
