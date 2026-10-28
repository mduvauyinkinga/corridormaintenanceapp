# Unit Profiles in Management Dashboard

> Status (Phase 1 review): IMPLEMENTED. The items below were previously
> tracked as TODO but are now present in the current code:
> `#tab-units` + `#view-units` + `#unit-modal` in `management.html`,
> `.units-grid` / `.units-block-grid` / `.unit-*` styles in
> `css/management.css`, and `renderUnits()` / `refreshUnitsView()` /
> `openUnitModal(roomId)` + `buildRoomProfiles()` grouping with search,
> block picker, and unit-announcement wiring in `js/management.js`.
> Function names differ slightly from the original TODO
> (`buildRoomProfiles` instead of `buildUnitProfiles`), but the feature
> is complete. Remaining work is end-to-end verification against live
> Firestore data in Phase 2.

- [x] Add "Unit Profiles" tab button + `#view-units` section to `management.html`
- [x] Add unit profile modal `#unit-modal` to `management.html`
- [x] Add CSS styles for units grid, unit cards, and unit modal to `css/management.css`
- [x] Add DOM refs + tab wiring for the Unit Profiles view in `js/management.js`
- [x] Implement room-profile grouping of residents + complaints by room (`buildRoomProfiles()`)
- [x] Implement `renderUnits()` grid with search + block filter
- [x] Implement `openUnitModal(roomId)` showing residents and grouped complaints
- [ ] Verify end-to-end against production data (Phase 2)

