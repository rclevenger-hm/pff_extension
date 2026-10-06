# Interface design

The panel is a football research companion alongside the page being read. Keep identity checks, primary actions, and source context clear at 280–600 CSS pixels. Use progressive disclosure for controls that are not part of every lookup.

## Current information architecture

| View | Purpose | Main actions |
| --- | --- | --- |
| Research | Find, identify, and investigate a player | Search, refine matches, select a player, open favorites, revisit recent players |
| Sources | Build a research routine | Open a destination for the current player; set favorites |
| Settings | Control the experience and local data | Appearance, download status/recovery, remove data, privacy, shortcuts |

Search stays available in Research and Sources. Switching views preserves the selected player. Settings hides search to keep configuration focused. The bottom navigation stays reachable; active state has both color and `aria-current`. Recent players live in session storage per window, while appearance and filters are local preferences. A new highlighted-name request clears position/team filters; older consumed requests do not replace subsequent manual research.

## Visual system

`sidepanel.css` owns semantic color variables for surfaces, text, borders, accent, focus, warning, and danger. Light, dark, and system modes share the same component geometry. Field green, warm neutral surfaces, and modest typography establish a football identity while keeping names and actions dominant.

Use the existing card, candidate, quick-source, source-row, notice, section-head, and settings-card classes. Keep small SVG symbols in `lib/ui.js`; they ship with the extension and do not make network requests. The field route in the player hero is decorative and hidden from assistive technology. Avoid player photography or team logos unless source rights, accessibility, and graceful fallback have been handled.

## Interaction and accessibility

- Native buttons, links, labeled inputs, lists, and disclosure controls are the default. Links open in another tab and keep their destination purpose clear.
- Enter opens a unique full-name match. Initials, typos, and ambiguous names remain selectable candidates with team, position, and match reason.
- Keyboard shortcuts supplement ordinary Tab navigation. Slash focuses search, arrow keys traverse matches, and Escape closes the current filter/profile state. Focus moves to a usable control when a control disappears.
- Use visible focus outlines, polite status text, a dismissible error alert, non-color state indicators, and reduced-motion/forced-color support.
- Keep empty states actionable: adjust filters, enable profiles, or research the typed name through external sources. Preserve cached results during a failed refresh and expose retrieval time.
- Player availability text says “Listed active/inactive.” It must never imply a current injury or fantasy start/sit recommendation.
- Test at 280px width and both color schemes. Browser automation verifies core interactions and overflow; native side-panel lifecycle, permission dialogs, and screen-reader audits remain release smoke checks tracked in issue #20.

## Extending the product

Only implemented capabilities appear in navigation. Extend the `views` registry and matching navigation/section when the feature is usable; do not add disabled placeholders.

| Planned feature | Where it fits | Required behavior |
| --- | --- | --- |
| Watchlists and notes (#11) | A Saved view and a player-file action | Stable player IDs, clear saved state, explicit local retention controls |
| Comparisons (#12) | A Compare view with player selection | Shared metric definitions, scoring context, and empty selection guidance |
| League/scoring context (#13) | Settings plus a compact context line in Research | Visible league/scoring mode; preserve provider authorization boundaries |
| Stats, injuries, news (#14) | Sections following identity in the player file | Provider and timestamp per data group; distinguish missing, loading, stale, and unavailable data |
| Recommendations (#15) | Research sections only once league/data prerequisites exist | Show inputs, freshness, rationale, and uncertainty |
| Alerts (#16) | Saved player controls and notification preferences | Explicit opt-in, readable change history, actionable links |
| Draft/dynasty tools (#17) | A dedicated view once substantial enough | Reuse player selection and scoring context |

Keep identity, provider data, link construction, and UI primitives separate. A new data provider should be added through a tested module and explicit permission design, rather than a fetch embedded in a visual component. Avoid increasing global permissions solely to simplify a UI interaction.
