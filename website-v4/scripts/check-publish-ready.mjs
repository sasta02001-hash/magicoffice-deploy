import fs from 'node:fs';
const registry=JSON.parse(fs.readFileSync(new URL('../content/events.json',import.meta.url),'utf8'));
const event=registry.events.find(e=>e.id==='heartbeat-support');
if(!event?.poster || event.assetReview?.status!=='approved-original') {
  console.error('BLOCKED: restore and verify the originally approved Heartbeat campaign image. Do not use the sakura movie poster or generated substitutes.');
  process.exit(1);
}
console.log('Campaign artwork approval present. Production browser checks are still required.');
