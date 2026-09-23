# Qingwen all-day meal sets

Production: https://qingwen-coffee-menu-vercel.vercel.app/#sets

This isolated branch adds the approved all-day sets to the existing Qingwen menu. The existing MAGICOFFICE Actions secret is used only for deployment to the Qingwen project. The publisher retrieves the exact current production source, applies a guarded patch to index.html, style.css and menu.js, and verifies every other source file remains unchanged, including the standalone Wi-Fi page and QR image.

The menu retains all single-item prices. Sets start at 160 for toast, 200 for bread/bagel and 250 for pizza. The old pizza drink discount and links to superseded downloadable menus are replaced with the approved set menu. Existing assets are preserved.
