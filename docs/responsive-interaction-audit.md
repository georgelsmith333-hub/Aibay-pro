# Responsive and Interaction Audit

## Screen-size targets

| Viewport range | Target behavior | Current risk to address |
| --- | --- | --- |
| 320–479 px | Single-column content, reachable controls, no horizontal overflow, accessible drawer navigation. | Dense header controls and long workspace content can compete for width. |
| 480–767 px | Single-column workspace, stacked action groups, readable comparison cards. | Variant, comparison, and optimization controls need larger touch targets. |
| 768–1023 px | Collapsible navigation, two-column content only where cards retain practical width. | Desktop spacing can waste horizontal room. |
| 1024–1439 px | Persistent sidebar and balanced product/evidence grid. | Large hero and card groups must not create excessive empty space. |
| 1440 px and above | Bounded readable content width, rather than stretched line lengths. | Visual hierarchy should remain clear on wide monitors. |

## Interaction gaps found

The workspace contained presentational buttons with no visible action, including the guide, notification control, product media shortcut, media thumbnails, and evidence-detail shortcut. The revised implementation will make each trigger navigation, select content, or present a short truthful status message. No control will imply external data, provider connectivity, listing publication, or image generation where that capability is not available.

## Responsive acceptance criteria

The application must retain a 44 px minimum actionable height for primary touch controls; keep forms and cards inside the viewport at 320 px; use a drawer for navigation below the desktop breakpoint; stack grids before any card becomes cramped; honour reduced-motion preferences; and retain keyboard-visible focus states. The public provider panel must use clear available, unavailable, or local-mode labels rather than an ambiguous loading or connected state.

## Initial visual check

The tablet-sized capture showed collapsed navigation, compact top-bar actions, stacked hero content, a full-width local capability panel, and a usable import card. The first phone capture indicated that the headless browser was not applying the intended CSS viewport size consistently, so it is not being treated as a pass. The next validation step will explicitly verify the browser-reported CSS viewport before assessing the 390 px layout.

## Corrected phone validation

The 390 px capture now passes the initial viewport check: the mobile drawer is off-canvas rather than reserving sidebar width; the top bar remains reachable; hero content, trust signals, capability panel, and import card fill the available viewport; and no horizontal clipping was visible in the tested first-screen flow. The tablet capture remains compatible with the collapsed navigation and full-width card layout.
