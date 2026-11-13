# Mobile layout repair

The late desktop `main` rule restored a 252px left margin after the mobile reset. The remaining mobile content was squeezed into a narrow strip; horizontal-overflow checks alone did not detect the lost usable width. Explicit final mobile shell rules now reset the sidebar space and give the content its available width. Setup cards, button rows, source controls, history, results, and dialogs adapt without hiding content. Account menus scroll within short landscape viewports. Quiz image fitting and original image bytes are unchanged.

The resource interface now exposes its existing `active` function, which navigation already calls. Without this export, connected users were incorrectly redirected away from Sources and Library.

`scripts/browser-mobile-layout-qa.mjs` uses isolated Chrome and synthetic questions/accounts, with mocked remote services. It checks 90 states across 320×568, 390×844, 844×390, 768×1024, and 1440×900, in light/dark themes: navigation to every section, usable shell width, horizontal control bounds, account menu height, and study/exam control visibility before and after answering. Mobile screenshots are saved under ignored `outputs/mobile/`. This emulates mobile viewports; physical iOS/Android devices were not used.

All 139 Node tests and static deployment checks pass. Two older AI tests were updated to mock and assert the already-existing guest AI behavior; no backend runtime or access policy was changed in this repair.
