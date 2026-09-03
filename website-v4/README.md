# MagicOffice official website source

This is the actual v4.3.3 responsive-feedback source. Do not run the obsolete root/rebuild-v43 builders; those recreate the wrong campaign graphic and low-resolution assets.

Build: `npm run check && npm run test:data && npm run build:offline`.

Edit `src/index.template.html`, `assets/css/usability-v4.3.3.css`, and `assets/js/app.js`. The shared `assets/js/menu-view.js` must render both initial HTML and live CMS updates.

Roster: `content/roster.json`. Events: `content/events.json`. Site links and Google Sheets settings: `content/site.json`. Keep six mobile shortcuts in their published order; expose two complete time-period menu pages while retaining all three CMS worlds internally.

The genuine original Heartbeat v7 PNG is 595x335, SHA256 `228cfbf667e636dc95bb3b3195f8c9d43e168c573e6e10b463b306dfbfb1f6e3`. Keep this image unmodified. Never replace it with the movie poster.

Source archive SHA256: `71c0e9c575d1b9708a059265b594e51f6b1cdf37f95928937c875e31141ddb88`.
