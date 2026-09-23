import assert from 'node:assert/strict';

export async function patchMenu(original) {
  const html = original.get('index.html').toString('utf8');
  const block = '<aside class="bartender"><div><h3>想隨便喝嗎？還是想喝酒？</h3><p class="bartender-subtitle">店員隨便調，你隨便喝。</p><p>想甜一點、酸一點，或什麼都不想決定，都可以交給我們。</p></div><strong>$200</strong></aside>';
  assert.equal(html.split(block).length, 2, 'RANDOM_DRINK_BLOCK_CHANGED');
  const patched = html.replace(block, '');
  assert.ok(!patched.includes('店員隨便調') && !patched.includes('想隨便喝嗎？') && !patched.includes('<aside class="bartender">'), 'RANDOM_DRINK_REMAINED');
  return new Map([['index.html', Buffer.from(patched)]]);
}
