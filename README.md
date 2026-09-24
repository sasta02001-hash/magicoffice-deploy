# VX website maintenance

This branch maintains https://vxsagittarius.vercel.app/ without rebuilding its main site or transporting unchanged media.

## Daily check

The existing ChatGPT task owns the daily 09:00 Asia/Taipei schedule. This branch does not add a second scheduler.

Read the latest branch state, then update `vx-maintenance/request.json` with `mode: "check"` and the real current `requestedAt`. The push starts `Repair and verify VX website`. Match the run to the request commit and inspect the job and `vx-maintenance-receipt` artifact.

`check-result.json` records actual execution times, content revision, catalogue count, sitemap pages, media checks, 24 privacy routes and video byte-range delivery. A passed result covers those automated checks. It does not claim physical-device layout testing or full-frame visual privacy verification. A browser should verify representative playback, mirrors, masked eyes, page navigation and catalogue expansion.

The check requires the approved 001–032 catalogue baseline while allowing new unique work IDs, verifies every catalogue work is in the sitemap, and checks each page's canonical URL and all 24 known privacy film routes. Intentional removal of an existing work or changes to the privacy baseline require a recorded approval and matching updates to the baseline constants in `vx-maintenance/check.mjs`; do not weaken these checks to hide an unexplained regression.

The live content health endpoint is `/health.json`; `/api/health` is not this site's endpoint. Hidden error messages in unopened video dialogs are not playback failures. Content revision dates are not inspection timestamps. Browser-extension errors are not VX application errors.

## Repair publication

The repair path is explicit and guarded by current main/content/media deployment IDs and content revision. It reuses the original 24 tracked face masks, with additional mirror-edge corrections for works 005 and 007. It accepts only known source hashes. The renderer validates original resolution, frame count, frame rate, full decoding and copied audio.

Media uploads use the platform file API, then one complete media deployment. The content publisher restores the exact current 18 source files, modifies only the 24 film overrides plus work 009's 榛果粽 → 榛果棕 typo, and preserves approved covers. It checks source paths, media hashes, catalogue/build behavior, concurrency, production aliases, final file hashes and all work pages.

The existing Actions secret `MAGICOFFICE` is used only in publishing steps. Do not print credentials or commit original video files. Only sanitized receipts are artifacts. The root `vercel.json` disables unrelated automatic Git deployment.

Do not reuse an old repair request after a deployment succeeded. Read the receipt and current production IDs first. A post-publication verification failure is recorded with the new deployment ID and must not be reported as success.

## Evidence

The September 23 diagnosis found privacy media stopped at stage 3 of 21 and the catalogue still routed visitors to original videos. The earlier source ZIP was truncated; masks and source hashes allowed deterministic recovery. Current completion evidence belongs in `vx-maintenance/last-verification.json` and the matching Actions receipt. Historical diagnosis alone is not evidence of current health.

## Hair-aware refinement

`refine-preview` renders the same 24 hash-verified original films with face parsing, feature landmarks and feathered masks. Hair is excluded from the reviewed mask region; work 032 masks exposed eyes above the physical face mask. The full decoded outputs, geometry, frame rate and copied audio are validated. Only masked output media and review evidence are stored in the `vx-refined-media` artifact for seven days. This mode has no publishing credentials and never updates production. Review the rendered motion and contact sheets before a separate guarded publication.

Focused previews can reuse an exact successful complete artifact while re-rendering selected IDs; unchanged masked files are hash-checked. Work 026 uses feature tracking for at most four adjacent frames during detector gaps. Work 017 preserves the long fringe over hidden facial features. Overlapping refinement masks blend their blur textures continuously to avoid color seams. `publish-refinement` requires the reviewed artifact revision, original-source hashes, unchanged geometry and copied audio. Explicit color metadata is added without re-encoding and with identical decoded-pixel/audio hashes. Live production IDs and content revision are rechecked before publishing; original URLs are retried for CDN expiry without query-string cache busting.
