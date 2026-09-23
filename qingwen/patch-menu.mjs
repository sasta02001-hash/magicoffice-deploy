import assert from 'node:assert/strict';

export async function patchMenu(original) {
  const html = original.get('index.html').toString('utf8');
  const changes = [
    ['青文紅茶', 'QW Black Tea', '$100 / 杯・$190 / 壺', '$100 / 杯・$200 / 壺'],
    ['青文鮮奶茶', 'QW Milk Tea', '$130 / 杯・$220 / 壺', '$130 / 杯・$250 / 壺']
  ];
  let patched = html;
  for (const [name, english, before, after] of changes) {
    const prefix = `<span class="item-name">${name}</span><span class="item-english" lang="en">${english}</span></div><span class="price">`;
    const target = prefix + before + '</span>';
    assert.equal(patched.split(target).length, 2, `TEA_PRICE_CHANGED_${english}`);
    patched = patched.replace(target, prefix + after + '</span>');
  }
  return new Map([['index.html', Buffer.from(patched)]]);
}
