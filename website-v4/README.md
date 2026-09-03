# MagicOffice official website source

This is the actual v4.3.3 responsive-feedback source. Do not run the obsolete root/rebuild-v43 builders; those recreate the wrong campaign graphic and low-resolution assets.

Build: `npm run check && npm run test:data && npm run build:offline`.

Edit `src/index.template.html`, `assets/css/usability-v4.3.3.css`, and `assets/js/app.js`. The shared `assets/js/menu-view.js` must render both initial HTML and live CMS updates.

Roster: `content/roster.json`. Events: `content/events.json`. Site links and Google Sheets settings: `content/site.json`. Keep six mobile shortcuts in their published order; expose two complete time-period menu pages while retaining all three CMS worlds internally.

The genuine original Heartbeat v7 PNG is 595x335, SHA256 `228cfbf667e636dc95bb3b3195f8c9d43e168c573e6e10b463b306dfbfb1f6e3`. Keep this image unmodified. Never replace it with the movie poster.

Source archive SHA256: `71c0e9c575d1b9708a059265b594e51f6b1cdf37f95928937c875e31141ddb88`.

## v4.3.4 merged overview

The former second and third homepage screens are one section: `#worlds` contains the Brand Origin copy and the three state cards. Keep the compatibility anchor `#brand-origin`, but do not recreate it as a separate section.
## v4.3.5 homepage video filename caption

The homepage video source is `assets/video/MagicOffice_FINAL_LARGE_SLOW_SUBTITLES_720p48_UNDER300MB.mp4`. Large MP4 bytes stay outside Git and are reconstructed from the SHA-verified parts in `content/hero-video-source.json` by `npm run media:fetch`. The visible caption immediately below the video must always be the exact Google Drive filename, including capitalization, underscores, and extension. `assets/js/app.js` derives the caption from `data-source-filename` or the video URL filename, so later replacements must update the hosted filename and `data-source-filename` together rather than writing a marketing caption.

## v4.3.11 audible-first playback

The hero video attempts autoplay with sound at volume 0.7. Do not add the HTML `muted` attribute and do not retry in muted mode. Browsers may block audible autoplay; in that case the official poster remains visible and the native controls start playback with sound after a user gesture.
