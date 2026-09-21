# Qingwen Wi-Fi publishing

This isolated branch publishes only to `prj_ivj29hH4VhtflaVtGapoPLR1RnOi` in the `magicoffice` Vercel team. It does not modify the repository's main branch or other websites.

The GitHub Actions workflow uses the existing `MAGICOFFICE` Actions secret without exposing its value. It retrieves the exact current Qingwen deployment, preserves every existing source file, adds the approved Wi-Fi HTML and QR image, and verifies production content. It stops before publication if the production deployment or menu content has changed.

Production URL: https://qingwen-coffee-menu-vercel.vercel.app/wifi/

The menu and Wi-Fi page contain no links to each other. The web page records a click on the Google review link, not the submission or rating of a review. Actual Wi-Fi joining remains controlled by iOS; desktop browser verification does not establish that iPhone image recognition will join the network.

Root `vercel.json` disables unrelated automatic Git deployments of this branch. The publication workflow uses the existing Qingwen source in a separate temporary directory.
