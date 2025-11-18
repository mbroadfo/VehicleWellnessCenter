## [Unreleased] - 2025-11-17

### Changed
- Refactored safety endpoint (`getVehicleSafetyHandler`) to use memoryCache and persist safety data in MongoDB, with fallback update by VIN for test reliability.
- Removed legacy DataCache class and all Parameter Store caching logic from `externalApis.ts`.
- Updated all safety and enrichment tests to validate MongoDB persistence and memory cache usage.
- All backend tests now pass (68/68).

### Fixed
- Safety data persistence issue for test vehicles resolved by fallback update logic in handler.
- Test reliability improved for safety endpoint and caching.

### Documentation
- Confirmed all documentation and copilot-instructions are up to date with new caching strategy and migration rules.

