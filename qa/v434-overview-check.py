import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ['CHECK_URL']
RELEASE = 'magicoffice-v4.3.4-overview-merged-2026-09-03'
OUT = Path('v434-overview-evidence')
OUT.mkdir(exist_ok=True)
report = {
    'attempted': True,
    'url': URL.split('?_vercel_share=')[0].split('?verify=')[0],
    'environment': 'GitHub Actions Ubuntu; actual deployed page in Chrome stable and Linux WebKit. Not physical iPhone, Android, LINE or Instagram.',
    'cases': [],
    'failures': [],
}

with sync_playwright() as p:
    engines = [
        ('chrome', lambda: p.chromium.launch(channel='chrome', headless=True)),
        ('webkit', lambda: p.webkit.launch(headless=True)),
    ]
    for engine, launch in engines:
        browser = launch()
        for width, height in ((1440, 900), (390, 844)):
            label = f'{engine}-{width}'
            row = {'engine': engine, 'browserVersion': browser.version, 'width': width, 'height': height, 'checks': {}}
            context = browser.new_context(
                viewport={'width': width, 'height': height},
                device_scale_factor=2 if width < 961 else 1,
                is_mobile=width < 961,
                has_touch=width < 961,
                reduced_motion='reduce',
            )
            page = context.new_page()
            page.set_default_timeout(18000)
            errors, bad = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('response', lambda response: bad.append({'url': response.url, 'status': response.status}) if response.status >= 400 else None)
            try:
                page.goto(URL, wait_until='domcontentloaded', timeout=60000)
                page.wait_for_selector('#worlds.mo-overview-section')
                page.wait_for_selector('[data-profile-id]')
                page.wait_for_timeout(1200)
                page.evaluate("""async () => {
                    await document.fonts.ready;
                    for (const image of document.querySelectorAll('#worlds img')) {
                        image.loading = 'eager';
                        await image.decode().catch(() => {});
                    }
                }""")
                state = page.evaluate("""() => {
                    const overview = document.querySelector('#worlds');
                    const brandAnchor = document.querySelector('#brand-origin');
                    const roster = document.querySelector('#roster');
                    const sectionsBeforeRoster = [...document.querySelector('main').children]
                        .filter((node) => node.tagName === 'SECTION' && (!roster || node.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING));
                    const headingOverflow = [...document.querySelectorAll('#worlds h1,#worlds h2,#worlds h3')]
                        .filter((node) => node.getClientRects().length)
                        .map((node) => {
                            const range = document.createRange();
                            range.selectNodeContents(node);
                            const rect = range.getBoundingClientRect();
                            return {text: node.textContent.trim(), left: rect.left, right: rect.right};
                        })
                        .filter((item) => item.left < -0.5 || item.right > innerWidth + 0.5);
                    return {
                        release: document.documentElement.dataset.release,
                        overviewCount: document.querySelectorAll('section#worlds.mo-overview-section').length,
                        separateBrandSectionCount: document.querySelectorAll('section#brand-origin').length,
                        anchorInsideOverview: Boolean(brandAnchor && brandAnchor.closest('#worlds') === overview),
                        introCount: document.querySelectorAll('#worlds .mo-overview-intro').length,
                        worldCards: document.querySelectorAll('#worlds .mo-world-grid--overview .mo-world-card').length,
                        sectionsBeforeRoster: sectionsBeforeRoster.length,
                        overviewHeight: overview.getBoundingClientRect().height,
                        overflow: document.documentElement.scrollWidth - innerWidth,
                        headingOverflow,
                        brokenOverviewImages: [...document.querySelectorAll('#worlds img')].filter((image) => !image.naturalWidth).map((image) => image.currentSrc || image.src),
                        rosterCards: document.querySelectorAll('[data-profile-id]').length,
                        eventCards: document.querySelectorAll('[data-event-grid] [data-event-id]').length,
                        menuTabs: document.querySelectorAll('[data-menu-tab]').length,
                        quickLinks: document.querySelectorAll('.mo-mobile-bar > *').length,
                    };
                }""")
                checks = row['checks']
                checks['release'] = state['release'] == RELEASE
                checks['singleMergedSection'] = state['overviewCount'] == 1 and state['separateBrandSectionCount'] == 0
                checks['compatibleAnchor'] = state['anchorInsideOverview']
                checks['contentPreserved'] = state['introCount'] == 1 and state['worldCards'] == 3
                checks['oneScreenSequence'] = state['sectionsBeforeRoster'] == 2
                checks['compactHeight'] = state['overviewHeight'] < (1100 if width >= 961 else 1500)
                checks['noHorizontalOverflow'] = state['overflow'] <= 1 and not state['headingOverflow']
                checks['overviewImages'] = not state['brokenOverviewImages']
                checks['smokeCounts'] = state['rosterCards'] == 16 and state['eventCards'] == 3 and state['menuTabs'] == 2 and state['quickLinks'] == 6
                row['state'] = state
                page.locator('#worlds').screenshot(path=str(OUT / f'{label}-merged-overview.png'))
                page.screenshot(path=str(OUT / f'{label}-top.png'))
            except Exception as error:
                row['exception'] = str(error)
                report['failures'].append(f'{label}: test exception')
            row['pageErrors'] = errors
            row['badResponses'] = bad
            row['checks']['noScriptErrors'] = not errors
            row['checks']['noHttpErrors'] = not bad
            report['failures'].extend(f'{label}: {name}' for name, ok in row['checks'].items() if not ok)
            report['cases'].append(row)
            context.close()
            (OUT / 'browser-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        browser.close()

print(json.dumps({'cases': len(report['cases']), 'failures': report['failures']}, ensure_ascii=False, indent=2))
if report['failures']:
    raise SystemExit(1)
