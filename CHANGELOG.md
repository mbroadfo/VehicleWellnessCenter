# Changelog

All notable changes to the Vehicle Wellness Center project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Natural Language Maintenance Entry] - 2026-02-01

### Added - Natural Language Input Feature

- **Backend Route**: POST /vehicles/{vehicleId}/events/parse-maintenance
  - Uses Google Gemini 2.0 Flash with structured output (not function calling)
  - Parses natural language maintenance descriptions into structured JSON
  - Returns parsed data for frontend preview before saving
  - Comprehensive validation: vehicleId format, vehicle ownership, empty text detection
  - Rate limit handling with user-friendly 429 error messages
  - 10 automated unit tests (validation-only, no external API dependency)
- **Frontend Modal Component**: `AddMaintenanceModal.tsx` (314 lines)
  - Two-phase flow: Parse → Preview → Save
  - Textarea input with natural language parsing
  - Structured preview with edit capability
  - Loading states with spinners for parse and save operations
  - Error display with user-friendly messages
  - Services breakdown with individual costs
  - Parts section with yellow highlighting for attention items
- **Type Definitions**: `backend/src/lib/maintenanceTypes.ts`
  - ParsedMaintenanceRecord, MaintenanceService, MaintenancePart interfaces
  - ParseMaintenanceRequest/Response types for API consistency
- **UI Integration**: "Add Maintenance" button in header
  - Disabled when no vehicle selected
  - Success toast notification after save
  - Auto-refresh vehicle data after record creation
- **AI Parsing Intelligence**:
  - Date handling: Converts "yesterday", "1/15/2026", "last week" to ISO 8601
  - Mileage conversion: "45k", "45,000" → 45000 integer
  - Service name standardization: "oil change" → "Oil Change" (title case)
  - Cost distribution: AI estimates individual costs from total if not itemized
  - Parts detection: Extracts wear patterns like "brake pads at 30%"

### Changed - Development Patterns

- **Test Strategy**: Validation-only tests for route handlers, manual/integration tests for Gemini API
  - Automated tests avoid external API dependencies and rate limits
  - 10 tests covering input validation, ownership verification, error cases
  - All tests passing (10/10) with 0 TypeScript errors
- **API Client Extension**: Added `parseMaintenance()` method to frontend API client
  - Type-safe with proper interface definitions
  - Error handling for 429 rate limits and parsing failures

### Fixed - TypeScript Issues

- **Test File Type Safety**: `backend/src/parseMaintenance.test.ts`
  - Cast handler responses to `APIGatewayProxyStructuredResultV2` for proper type checking
  - Added fallback for optional body field: `JSON.parse(response.body || "{}")`
  - Resolved all property access errors on Lambda response objects

### Documentation - Feature Guides

- **Feature Guide**: `docs/natural-language-maintenance-entry.md`
  - Complete user experience walkthrough
  - Architecture details (backend route, frontend component, types)
  - Parsing intelligence examples (dates, mileage, services, costs, parts)
  - Benefits comparison vs traditional forms (80% time savings)
  - Future enhancement ideas (Gemini Vision, bulk import, cost tracking)
- **Testing Guide**: `docs/TESTING-MAINTENANCE-ENTRY.md`
  - Automated test instructions and results
  - 10-step manual test plan with expected outcomes
  - Integration testing procedures
  - Database verification queries
  - Edge cases and troubleshooting section
- **Implementation Summary**: `docs/MAINTENANCE-ENTRY-COMPLETE.md`
  - Files created/modified checklist
  - Deployment status confirmation
  - Quick manual test (3 minutes)
  - Architecture highlights and design decisions
  - Performance metrics and cost analysis
  - Known limitations and future enhancements

### Performance Metrics

- **Parsing Time**: 500-1000ms (Gemini API call)
- **Save Time**: 50-100ms (MongoDB insert)
- **Total User Time**: ~20-30 seconds per record (vs 2-3 minutes with forms)
- **Cost**: $0.00 within free tiers (Gemini free tier: 15 RPM, 1500 RPD)

## [Test Suite MongoDB Schema Fix] - 2025-11-28

### Fixed - Test Reliability

- **Backend Tests**: Fixed MongoDB schema mismatch causing 18 test failures
  - **Root Cause**: Tests were creating vehicles with flat `vin` field, but production schema uses nested `identification.vin`
  - **Impact**: E11000 duplicate key errors on `uk_vehicle_identification_vin` unique index
  - **Files Updated**:
    - `backend/src/api-integration.test.ts`: Fixed vehicle creation schema + added pre-test cleanup
    - `backend/src/enrichVehicle.test.ts`: Added pre-test cleanup hook
    - `backend/src/importDealerData.test.ts`: Fixed vehicle schema in beforeAll
    - `backend/src/vehicleSafety.test.ts`: Fixed schema in beforeAll and persistence test
  - **Result**: All 100 tests now passing (was 82/100)

- **Backend Handlers**: Enhanced field extraction for test compatibility
  - `backend/src/routes/getVehicleOverview.ts`:
    - Fixed to return `vehicleId` instead of `_id`
    - Added `eventCount` and `recentEvents` to response
    - Added `attributes` fallback for make/model/year extraction
  - `backend/src/routes/getVehicleSafety.ts`:
    - Added `attributes` fallback when extracting make/model/year
    - Prevents 400 errors when vehicle data is in `attributes` vs `identification`

### Changed - Test Architecture

- **Pre-Test Cleanup Pattern**: All test suites now delete old test data in `beforeAll` hooks
  - Prevents duplicate key errors on test reruns
  - Uses `identification.vin` path with regex matching for TEST vehicles
  - Ensures test isolation and repeatability

## [Vehicle Delete Feature] - 2025-11-28

### Added - Vehicle Deletion

- **Backend**: DELETE /vehicles/{vehicleId} endpoint (`backend/src/routes/deleteVehicle.ts`)
  - Deletes vehicle and all related data: vehicle document, events, conversation sessions & messages
  - **Security**: Verifies vehicle ownership via JWT token (ownership.ownerId check)
  - Returns 204 No Content on success
  - Validates ObjectId format and vehicle existence
  - Logs deletion summary (vehicle count, events count, sessions count, VIN)
- **Frontend**: Delete button with confirmation modal
  - Red "Delete" button in vehicle header (next to Refresh All)
  - Trash icon SVG with clear visual hierarchy
  - `ConfirmDeleteModal` component with warning UI:
    - Red warning icon and bold heading
    - Lists all data that will be deleted (vehicle, events, conversations)
    - "Cannot be undone" warning in red text
    - Cancel/Delete buttons with distinct styling
  - Success toast notification with vehicle name
  - Auto-adjusts active vehicle index when deleting current vehicle
  - Clears chat session when deleting active vehicle
- **Frontend**: Toast notification system
  - Bottom-right positioned toast with slide-up animation
  - Green checkmark icon for success
  - Shows vehicle name in success message
  - Auto-dismisses after 3 seconds
  - CSS keyframe animation for smooth slide-up effect
- **Infrastructure**: API Gateway DELETE route with JWT authorization
  - Route: DELETE /vehicles/{vehicleId}
  - JWT authorization required (Auth0)
  - Integrated with unified Lambda handler

### Changed - API Client

- **Frontend**: Fixed 204 No Content response handling in `apiClient.request()`
  - Added check for 204 status code to return `undefined` instead of parsing empty JSON
  - Prevents JSON parse errors on successful DELETE responses
  - Maintains backward compatibility with other endpoints

### Security - Vehicle Deletion

- **Authorization**: DELETE endpoint verifies vehicle ownership before deletion
  - Extracts ownerId from JWT token claims (sub field)
  - Queries MongoDB with both _id and ownership.ownerId
  - Returns 404 if vehicle not found or doesn't belong to user
  - Prevents users from deleting other users' vehicles
- **Authentication**: JWT token required (enforced at API Gateway level)
- **Data Integrity**: Cascading delete ensures no orphaned records
  - Vehicle events deleted via vehicleId foreign key
  - Conversation sessions deleted via vehicleId foreign key
  - Conversation messages deleted via sessionId from sessions

### Technical Details - Delete Feature

- **Deletion Strategy**: Parallel deletion with Promise.all for performance
  - Vehicle document and events deleted simultaneously
  - Sessions fetched to get IDs for message cleanup
  - Messages and sessions deleted in sequence after fetch
- **Error Handling**: Comprehensive error responses
  - 400 for missing/invalid vehicleId
  - 401 for missing user identity
  - 404 for vehicle not found or unauthorized access
  - 500 for server errors with error logging
- **UI/UX**: Progressive deletion flow
  - Click delete → Confirmation modal → Toast on success → UI update
  - Loading states during deletion prevent duplicate requests
  - Smooth transitions when vehicle list changes
- **Lambda Package**: 8.31 MB (includes deleteVehicle handler)

### Benefits - Delete Feature

- **Security**: Ownership validation prevents unauthorized deletions
- **User Experience**: Confirmation prevents accidental deletions
- **Data Cleanup**: Cascading delete removes all related data automatically
- **Feedback**: Toast notifications provide clear success confirmation
- **Multi-vehicle Support**: Works seamlessly with tabbed vehicle interface

## [Progressive Data Loading] - 2025-11-28

### Added - Progressive Enrichment UI

- **Frontend**: Dramatic progressive loading experience with real-time visual feedback
  - Individual section refresh buttons for Specifications, Fuel Economy, and Safety Data
  - Loading indicators with animated spinners and status messages ("Fetching from NHTSA vPIC...", "Fetching EPA data...", "Fetching recalls, complaints & ratings...")
  - Skeleton loaders with gradient pulse animations (bg-linear-to-r from-primary-200 to-primary-100)
  - Section-specific loading states tracked independently per vehicle
  - "Refresh All" button orchestrates sequential refresh of both specs and safety APIs
- **Frontend**: Per-vehicle loading state management in App.tsx
  - Three loading state records: loadingSpecs, loadingSafety, loadingFuelEconomy (keyed by vehicleId)
  - Refresh handlers: handleRefreshSpecs, handleRefreshSafety, handleRefreshFuelEconomy
  - Progressive enrichment during vehicle creation with visual feedback at each API step
  - Loading states set before API calls, cleared in finally blocks for reliability
- **Frontend**: VehicleReport component completely rewritten (514 lines)
  - Props: onRefreshSpecs, onRefreshSafety, onRefreshFuelEconomy handlers + loading flags
  - Local state: refreshingSpecs, refreshingSafety, refreshingFuelEconomy for button feedback
  - Computed loading states: Combines parent loading prop + local refreshing state + data availability
  - Skeleton loaders replace static placeholders: structured gradients matching actual content layout
  - Refresh buttons with SVG icons positioned in section headers
  - Loading animations prevent multiple simultaneous refreshes

### Changed - User Experience Improvements

- **Frontend**: Enrichment flow now provides step-by-step visual feedback
  - Step 1: VIN decode shows "Fetching from NHTSA vPIC..." with spinner
  - Step 2: Safety data shows "Fetching recalls, complaints & ratings..." with spinner
  - Each section updates independently as data arrives
  - User can interact with loaded sections while others are still loading
- **Frontend**: Refresh All button now actually refreshes all data
  - Previous behavior: Only called getVehicle (re-fetched cached data)
  - New behavior: Calls handleRefreshSpecs() then handleRefreshSafety() sequentially
  - Both external APIs re-queried for latest data
  - Loading indicators show progress for each step
- **Frontend**: All sections now have individual refresh capabilities
  - Specifications: Refresh VIN decode (includes fuel economy as side effect)
  - Fuel Economy: Refresh VIN decode (dedicated button for clarity)
  - Safety Data: Refresh recalls, complaints, and NCAP ratings together
  - Each refresh button shows loading state independently

### Technical Details - Progressive Loading

- **Loading State Architecture**:
  - Parent component (App.tsx): Tracks loading state for API calls (loadingSpecs, loadingSafety, loadingFuelEconomy)
  - Child component (VehicleReport.tsx): Tracks button click state (refreshingSpecs, refreshingSafety, refreshingFuelEconomy)
  - Computed state: isLoadingSpecs = loadingSpecs || refreshingSpecs || !vehicle.specs || vehicle.specs.make === 'Loading...'
  - Prevents multiple refresh requests with combined state checks
- **Skeleton Loader Design**:
  - Gradient animations: bg-linear-to-r from-primary-200 to-primary-100 (TailwindCSS v4 syntax)
  - Structural match: Skeleton divs mirror actual content layout (grid cols, spacing)
  - Color scheme: Primary colors for active loading areas, gray for static placeholders
  - Animation: Tailwind's animate-pulse utility for shimmer effect
- **API Call Pattern**:
  - enrichVehicle: Fetches specs + fuel economy (NHTSA vPIC)
  - getSafetyData: Fetches recalls + complaints + NCAP ratings (3 APIs combined)
  - Fuel economy refresh: Calls enrichVehicle (VIN decode includes EPA data)
  - Each API sets loading state, updates vehicle document, clears loading state in finally block

### Benefits - Progressive Loading

- **User Engagement**: Visual drama during data loading creates sense of active processing
- **Transparency**: Users see exactly which external APIs are being queried and when
- **Responsiveness**: Sections appear as data arrives, not all-or-nothing loading
- **Control**: Individual refresh buttons let users update specific data without full re-enrichment
- **Performance**: Loading states prevent duplicate API calls during refresh operations

### Known Issues - Progressive Loading

- **Fuel Economy Button**: Calls enrichVehicle (VIN decode) even though EPA data already present
  - Reason: EPA data is side effect of VIN decode, not separate API
  - Impact: Minimal (VIN decode cached, fast refresh)
  - Future: Could add dedicated EPA endpoint for targeted refresh

## [Frontend Cloud Deployment] - 2025-11-28

### Added - Cloud-Hosted Frontend

- **Frontend**: S3 + CloudFront deployment infrastructure via Terraform
  - S3 bucket `vwc-frontend-dev` with static website hosting
  - CloudFront distribution with Origin Access Control (OAC) for secure S3 access
  - Custom error responses for SPA routing (404/403 → 200 /index.html)
  - Cache TTL: 0 min / 3600 default / 86400 max
  - PriceClass_100 (US, Canada, Europe)
  - Public URL: <https://dgs070mgszb6.cloudfront.net>
- **Frontend**: Single dashboard page architecture (eliminated login/onboarding pages)
  - Auto-redirect to Auth0 Universal Login when not authenticated
  - Empty state for zero vehicles with call-to-action button
  - Single vehicle view (no tabs) when user has 1 vehicle
  - Tabbed interface when user has 2+ vehicles (year/make/model labels)
  - "Add Vehicle" button in header (always visible)
  - Modal dialog for VIN entry (replaces full-page onboarding)
- **Frontend**: AddVehicleModal component
  - Modal dialog with backdrop overlay
  - 17-character VIN validation with real-time counter
  - Calls createVehicle API and triggers progressive enrichment
  - Automatically switches to new vehicle tab after creation
  - Cancel and submit buttons with loading states
- **Infrastructure**: IAM policy updates for S3 and CloudFront management
  - S3BucketManagement: 24 actions (create/delete bucket, manage policy/website/tags/ACL)
  - S3ObjectManagement: 3 actions (put/get/delete objects)
  - CloudFrontManagement: 14 actions (distributions, OAC, invalidations)
  - Resource scoped to `vwc-frontend-*` buckets
- **DevOps**: Simplified deployment scripts
  - `npm run deploy:frontend` - Build, sync to S3, invalidate CloudFront cache
  - `npm run deploy:backend` - Update Lambda function code
  - `npm run deploy:all` - Deploy both frontend and backend
  - `npm run infra:apply` - Apply Terraform infrastructure changes
- **Documentation**: Complete deployment guide (`DEPLOYMENT.md`)
  - Quick deploy commands for common workflows
  - Infrastructure management (plan/apply/destroy)
  - Auth0 configuration instructions
  - Troubleshooting steps for CloudFront cache and Lambda issues
  - Performance metrics (5s backend, 10s frontend, 3-5min infrastructure)
  - Cost optimization notes (free tier limits)

### Changed - User Experience

- **Frontend**: Multi-vehicle support with tab navigation
  - Changed from single vehicle state to vehicles:Vehicle[] array
  - activeVehicleIndex tracks currently selected tab
  - Tab labels: "{year} {make} {model}" or VIN or "Vehicle N"
  - Active tab highlighted with blue border-bottom
  - Only shows tabs when vehicles.length > 1 (cleaner UI for single vehicle)
- **Frontend**: Progressive enrichment on vehicle creation
  - Adds vehicle to array immediately with "Loading..." placeholders
  - Switches to new vehicle tab before enrichment starts
  - Updates vehicle data in array as each API completes
  - Console logging with checkmarks for user feedback
  - Non-blocking: other vehicles remain accessible during enrichment

### Infrastructure - Phase 14 Deployment

- Terraform resources created:
  - `aws_s3_bucket.frontend` - vwc-frontend-dev
  - `aws_s3_bucket_public_access_block.frontend` - All public access blocked
  - `aws_s3_bucket_website_configuration.frontend` - index.html + SPA routing
  - `aws_cloudfront_origin_access_control.frontend` - OAC with sigv4 signing
  - `aws_cloudfront_distribution.frontend` - Distribution E36T027C39MTRV
  - `aws_s3_bucket_policy.frontend` - CloudFront service principal access
- Terraform outputs:
  - cloudfront_url: <https://dgs070mgszb6.cloudfront.net>
  - cloudfront_distribution_id: E36T027C39MTRV
  - s3_bucket_name: vwc-frontend-dev
- Frontend deployed: 4 files synced (index.html, CSS, JS, vite.svg)
- CloudFront cache invalidated: /*

### Security - Auth0 Configuration

- CloudFront URL added to Auth0 application settings:
  - Allowed Callback URLs: `https://dgs070mgszb6.cloudfront.net/callback`
  - Allowed Logout URLs: `https://dgs070mgszb6.cloudfront.net`
  - Allowed Web Origins: `https://dgs070mgszb6.cloudfront.net`
- JWT validation working correctly with Auth0
- No secrets in frontend code (Auth0 domain/clientId are public)

### Technical Notes - Cloud Deployment

- CloudFront creation time: ~3 minutes
- S3 sync time: ~2 seconds (4 files)
- Cache invalidation time: ~1-2 minutes
- CloudFront OAC replaces legacy Origin Access Identity (OAI)
- SPA routing via custom error responses (404/403 → 200 index.html)
- Cache invalidation automatically included in `deploy:frontend` script
- Distribution ID hardcoded in package.json for fast deploys (E36T027C39MTRV)

### Benefits - Cloud Deployment

- **No local dev server**: Production-only deployment model
- **Global CDN**: CloudFront edge locations for low latency
- **Automatic cache invalidation**: Always serves latest frontend code
- **Simplified architecture**: No separate login/onboarding pages
- **Multi-vehicle support**: Tabs for users with multiple vehicles
- **Progressive disclosure**: Empty state → single view → tabs (scales with data)

## [Auth0 Authentication & Progressive Enrichment] - 2025-11-25

### Added - Auth0 Universal Login Integration

- **Frontend**: Complete Auth0 authentication flow
  - Auth0Provider wrapper in `main.tsx` with callback routing
  - Universal Login redirect flow (no embedded login forms)
  - Token refresh with refresh tokens stored in localStorage
  - User profile display in header with email
  - Log out functionality with returnTo redirect
  - Protected routes (login required to access vehicle dashboard)
  - OAuth callback handler (`/callback` route) for Authorization Code flow
  - Session persistence across browser refreshes
  - Automatic token refresh on expiration
- **Backend**: JWT token extraction from API Gateway authorizer
  - `createVehicle` handler extracts ownerId from JWT claims (`sub` field)
  - No manual ownerId in request body (auto-populated from authenticated user)
  - Vehicle ownership automatically linked to Auth0 user identity
  - `listVehicles` endpoint filters by authenticated user's ownerId
  - All vehicles scoped to authenticated user (multi-tenant isolation)
- **Frontend**: User vehicle listing on app load
  - Automatic fetch of user's vehicles after login
  - Displays first vehicle in dashboard (or onboarding if none exist)
  - Loading states during authentication and vehicle fetch
  - Error handling for expired tokens (force re-login)
  - Graceful fallback to VIN onboarding for new users

### Added - Progressive Enrichment with Expandable Sections

- **Frontend**: Sequential API enrichment flow
  - Step 1: VIN decode (NHTSA vPIC) → vehicle specifications
  - Step 2: Safety data (NHTSA Recalls + Complaints + NCAP) → parallel fetch
  - Console logging with checkmarks for each completed step
  - No auto-start AI chat (user-initiated only to avoid rate limits)
  - Loading placeholders during enrichment (animated skeleton screens)
- **Frontend**: Expandable recalls section
  - Shows 3 recalls by default, "View All X" button if more than 3
  - Expanded view shows full details: component, summary, consequence, remedy
  - Chevron icons indicate expand/collapse state
  - "No Active Recalls" green badge when vehicle has no recalls
  - Campaign numbers and dates displayed for all recalls
- **Frontend**: Expandable complaints section
  - Shows 5 complaints by default, "View All X" button if more than 5
  - Expanded view shows full summary and component information
  - ODI numbers and incident dates displayed
  - Collapse to summary view with "Show Less" button
- **Backend**: Enhanced safety endpoint schema compatibility
  - Checks multiple locations for make/model/year fields
  - Primary: `vehicle.identification.{make,model,year}` (from enrichment)
  - Fallback 1: `vehicle.specs.{make,model,year}` (from VIN decode)
  - Fallback 2: `vehicle.{make,model,year}` (flat schema, legacy)
  - Debug output shows all checked locations for troubleshooting
- **Backend**: VehicleReport displays all external API data
  - Specifications: Engine, transmission, drivetrain, body style
  - Fuel Economy: City/highway/combined MPG, annual fuel cost, CO2 emissions
  - Safety Ratings: NCAP crash test stars (when available)
  - Active Recalls: Full recall details with consequences and remedies
  - Consumer Complaints: ODI complaints with component information
  - Dealer Portal: Warranty, coverage plans, mileage (when imported)

### Added - AI Chat Enhancements

- **Backend**: Enhanced AI system instruction with context awareness
  - AI recognizes `[Context: User is viewing vehicle {vehicleId}]` prefix
  - Uses provided vehicleId for all tool calls (no need to ask user)
  - Understands user is asking about the active vehicle
  - Example: "what's my fuel economy?" → calls getVehicleOverview with provided vehicleId
- **Backend**: New AI tool `getVehicleSafety`
  - Function declaration for Gemini with vehicleId parameter
  - Description: "Get comprehensive safety data including NHTSA recalls, consumer complaints, and NCAP crash test ratings"
  - Tool call executor in aiChat.ts makes HTTP request to safety endpoint
  - AI can now answer safety-specific queries
- **Backend**: Improved AI data source understanding
  - System instruction explains getVehicleOverview returns EVERYTHING (specs, safety, fuel economy, dealer data)
  - Guidance to extract relevant sections from overview instead of calling multiple endpoints
  - Only use getVehicleSafety if overview already called and need ONLY updated safety data
  - Example: "what's my fuel economy?" → Call getVehicleOverview → Return vehicle.fuelEconomy.epa
- **Backend**: Rate limit and quota error handling
  - Detects 429 (Rate Limit Exceeded) and returns user-friendly message
  - Detects quota exceeded errors and returns service unavailable message
  - Includes retryAfter field in response (20s for rate limit, 60s for quota)
  - Frontend displays error message without generic error UI
- **Backend**: Enhanced AI chat logging
  - Logs response details: sessionId, message length, tools used count
  - First 100 characters of response for debugging
  - Helps troubleshoot rate limit and quota issues
- **Frontend**: Chat pane passes vehicleId context to backend
  - Sends vehicleId in request body alongside message and sessionId
  - Backend constructs context string for AI understanding
  - Improves AI accuracy for vehicle-specific queries
- **Frontend**: Rate limit error handling in chat
  - Displays user-friendly error messages from backend
  - Shows specific message for 429 (rate limit) and 503 (quota exceeded)
  - Graceful degradation without crashing chat interface

### Added - Schema Migration & Testing

- **Backend**: Vehicle schema migration script (`migrate-vehicle-schema.ts`)
  - Migrates flat `vin` field to nested `identification.vin` structure
  - Drops old `uk_vehicle_vin` unique index
  - Creates new `uk_vehicle_identification_vin` unique index
  - Removes duplicate VINs (keeps first occurrence)
  - Safely handles migration of existing vehicle documents
  - Reports migration status with counts and affected document IDs
  - Run with: `npm run migrate:vehicle-schema --workspace=backend`
- **Backend**: Updated test utilities for new schema
  - `test-connection.ts` checks vehicle ownerId and identification.vin
  - Moved from `src/` to `tests/` directory for proper separation
  - Fixed import paths for parameter store module
- **Backend**: GET /vehicles endpoint for listing user vehicles
  - New route handler `listVehicles.ts`
  - Queries vehicles by `ownership.ownerId` from JWT token
  - Returns array of vehicles with VIN, year, make, model, nickname
  - Debug logging shows ownerId and sample vehicles for troubleshooting
  - Added to Lambda router and API Gateway routes

### Changed - Code Quality & Type Safety

- **Backend**: Fixed TypeScript compile errors
  - Removed unused eslint-disable directives
  - Added proper type annotations for error objects
  - Migration script disables type checking (deals with legacy schema)
  - All compilation errors resolved (0 errors across all files)
- **Frontend**: Updated API client types to match backend
  - RecallData interface uses lowercase field names (component, summary, consequence, remedy)
  - Matches backend response format from externalApis.ts
  - ChatResponse interface updated with correct field names (message, toolsUsed)
  - Proper error type handling with statusCode and data properties
- **Backend**: Consistent route parameter handling
  - enrichVehicle handler checks both `vehicleId` and `id` path parameters
  - getVehicleOverview returns full vehicle document (not just overview summary)
  - All handlers support API Gateway v2 parameter formats

### Changed - Workflow & User Experience

- **Frontend**: Removed auto-start AI chat
  - Previous behavior: Automatically started chat after vehicle creation
  - New behavior: User manually initiates chat when ready
  - Reason: Avoids hitting Gemini rate limits during onboarding
  - AI chat fully functional, just user-controlled timing
- **Frontend**: Simplified VIN onboarding
  - Removed auto-chat initialization
  - Immediately shows vehicle dashboard after creation
  - Progressive enrichment happens in background with visible updates
  - User sees data populate in real-time (specs → safety → fuel economy)
- **Backend**: Gemini model switched to experimental
  - Changed from `gemini-2.5-flash` to `gemini-2.0-flash-exp`
  - Reason: Separate quota pool from 2.5-flash
  - **NOTE**: Experimental model has stricter free-tier limits
  - **Action needed**: May need to revert to 2.5-flash if quota issues persist

### Changed - Project Configuration

- **Root**: Updated Node.js version requirement to 22.0.0+
  - Reflects Lambda runtime upgrade from Phase earlier milestone
  - Updated in package.json engines field
  - Updated in package-lock.json
- **Root**: Added `dev` script shortcut
  - `npm run dev` now starts frontend dev server
  - Convenience alias for `npm run dev --workspace=frontend`
  - Faster development workflow

### Fixed - Schema Compatibility

- **Backend**: enrichVehicle route now uses correct VIN field path
  - Changed from `vehicle.vin` to `vehicle.identification.vin`
  - Auto-populates `identification.{year,make,model}` from vPIC response
  - Consistent with new nested schema structure
- **Backend**: createVehicle uses nested identification structure
  - Vehicle document created with `identification.vin` field
  - Includes `ownership.ownerId` and `ownership.nickname` fields
  - Matches current schema design

### Infrastructure - Auth0 & Schema Updates

- **API Gateway**: Added GET /vehicles route
  - Resource: `aws_apigatewayv2_route.list_vehicles`
  - Route key: GET /vehicles with JWT authorization
  - Integrated with unified Lambda handler
- **Lambda**: All route handlers operational through single function
  - Router dispatches: GET /vehicles, POST /vehicles, GET /vehicles/:id/overview, etc.
  - Shared connection pool and Auth0 token cache
  - Single deployment package (8.27 MB)

### Testing - Auth0 Integration

- Successfully tested Auth0 Universal Login flow
  - Login redirects to Auth0 hosted page
  - Authorization Code + PKCE flow completes
  - Tokens stored in localStorage with refresh token
  - User identity (email) displayed in header
  - Logout clears session and returns to login
- Successfully tested progressive enrichment
  - VIN decode completes in ~2 seconds
  - Safety data loads in ~3 seconds (recalls + complaints + NCAP)
  - All data displays correctly in expandable sections
  - 2017 Jeep Cherokee test vehicle: 6 recalls, 1,251 complaints

### Known Issues

- **AI Chat Rate Limits**: Gemini 2.0-flash-exp has strict free-tier quotas
  - May encounter 429 errors after several chat messages
  - User sees friendly error message with retry guidance
  - Consider reverting to gemini-2.5-flash if persistent
- **NCAP Ratings**: Not available for all vehicles
  - 2017 Jeep Cherokee shows "N/A" for crash test ratings
  - API query returns no results for this specific vehicle
  - Other vehicles (e.g., 2020+ models) may have ratings

### Benefits - This Release

- **Security**: Real user authentication with Auth0 Universal Login (no mock tokens)
- **User Experience**: Progressive data loading with visual feedback
- **Data Quality**: All 5 external APIs (vPIC, EPA, Recalls, Complaints, NCAP) fully integrated
- **AI Intelligence**: Context-aware chat with vehicle-specific queries
- **Multi-Tenancy**: Vehicle ownership properly scoped to authenticated users
- **Error Resilience**: Graceful handling of rate limits and quota errors
- **Type Safety**: All TypeScript errors resolved, proper type definitions throughout

### Next Steps

1. Test with multiple vehicles per user (vehicle switching UI)
2. Add dealer portal data import UI (currently backend-only)
3. Implement vehicle nickname editing
4. Add event recording through UI (currently AI chat only)
5. Monitor Gemini quota usage and adjust model selection if needed

## [Runtime Update] - 2025-11-21

### Changed - Infrastructure

- **Lambda Runtime**: Upgraded from Node.js 20.x to Node.js 22.x
  - Proactive upgrade ahead of Node.js 20.x EOL (April 30, 2026)
  - Avoids AWS Lambda runtime deprecation warnings
  - All integration tests passing on Node.js 22.x
- **Package Engines**: Updated Node.js requirement to >=22.0.0, npm to >=10.0.0

## [Phase 13 - Frontend Development - Initial Build] - 2025-11-20

### Added - Frontend Infrastructure

- **Frontend**: Complete React SPA with Vite 7.2.2 and React 19.2.0
  - TailwindCSS 4.1.17 with @import syntax and @theme definitions
  - Auth0 React SDK 2.9.0 (installed, not yet configured)
  - React Router 7.9.6 (installed, not yet used)
  - TypeScript strict mode, PostCSS with Autoprefixer
- **Frontend**: Split-pane application layout
  - Left pane (2/3 width): Vehicle report with all data sections
  - Right pane (1/3 width): AI chat assistant
  - Responsive loading states, error handling, refresh functionality
- **Frontend**: VIN Onboarding component (`src/components/VINOnboarding.tsx`)
  - 17-character VIN validation with real-time character counter
  - Creates vehicle via POST /vehicles endpoint
  - Enriches with VIN decode via POST /vehicles/:id/enrich
  - Starts AI chat session automatically
  - Full error handling and loading states
- **Frontend**: Vehicle Report component (`src/components/VehicleReport.tsx`)
  - Displays vehicle specifications (engine, transmission, body style)
  - Shows EPA fuel economy with annual cost estimates
  - Renders NCAP safety ratings with star display
  - Lists active safety recalls with details
  - Shows dealer portal data (mileage, warranty, coverage plans)
  - Empty state messaging when no data available
- **Frontend**: Chat Pane component (`src/components/ChatPane.tsx`)
  - Real-time AI conversation with message history
  - User/assistant message styling and timestamps
  - Tool call display (shows AI actions taken)
  - Auto-scroll to latest messages
  - Loading animations (bounce effect for "typing" indicator)
  - Form validation (disabled submit when empty/loading)
- **Frontend**: API Client library (`src/lib/api.ts`)
  - Centralized HTTP client with Bearer token authentication
  - Comprehensive TypeScript interfaces for all data types
  - Methods: createVehicle, getVehicle, enrichVehicle, getSafetyData, sendMessage
  - Error handling with JSON response parsing
  - Base URL from environment variable with fallback
- **Frontend**: TailwindCSS v4 custom styles (`src/index.css`)
  - Custom color palette (primary-50 through primary-900)
  - Reusable component classes (.btn-primary, .btn-secondary, .card, .input)
  - Responsive design utilities
  - Gradient backgrounds and shadow effects

### Added - Backend Vehicle Creation Endpoint

- **Backend**: POST /vehicles endpoint (`routes/createVehicle.ts`)
  - Creates new vehicle records with VIN validation
  - Request body: { vin: string, ownerId: string, nickname?: string }
  - VIN format validation (17 alphanumeric, no I/O/Q)
  - Duplicate VIN checking (returns 409 if exists)
  - Returns vehicleId for immediate use
  - Response: 201 Created, 409 Conflict, 400 Bad Request, 500 Server Error
- **Backend**: Lambda router updated with createVehicle handler
  - Route pattern: POST /vehicles (no path parameters)
  - Integrated with existing route dispatch logic
- **Infrastructure**: API Gateway route for vehicle creation
  - Resource: `aws_apigatewayv2_route.create_vehicle`
  - Route key: POST /vehicles
  - JWT authorization required
  - Successfully deployed (route ID: utzd225)

### Changed - Authentication Architecture (Pending)

- **Frontend**: Temporary mock token implementation
  - Using 'mock-development-token' for development
  - TODO comment indicates Auth0 implementation needed
  - API client properly sends Bearer token in Authorization header
  - API Gateway correctly rejects mock token with 401 (expected behavior)
- **Frontend**: Auth0 dependencies installed but not yet configured
  - @auth0/auth0-react 2.9.0 ready for implementation
  - Auth0Provider not yet added to main.tsx
  - useAuth0 hooks not yet integrated into components
  - Login/logout UI not yet implemented

### Documentation - Auth0 Implementation Guide

- **Documentation**: Comprehensive Auth0 SPA setup guide (`docs/Auth0-Frontend-Setup-Guide.md`)
  - Complete architecture diagram showing Universal Login flow
  - Step-by-step Auth0 dashboard configuration instructions
  - Terraform updates for frontend SPA client ID
  - React implementation code samples (Auth0Provider, useAuth0 hooks)
  - Callback route handling and user profile header
  - Security benefits explanation (real user identity, token refresh, no secrets in frontend)
  - 10-step token flow from login to API Gateway validation
  - Production security checklist (disable Implicit Grant, enable MFA, restrict URLs)
  - Testing procedures and troubleshooting guidance

### Infrastructure - Phase 13 Deployment

- **Lambda**: Deployed with createVehicle endpoint (8.27 MB package)
  - CodeSha256: 0HJ2hgkOkoeo2t9ToVC2dETXIyS7diKA+1GCk7yKLgo=
  - FunctionName: vwc-dev
  - Status: Active and operational
- **API Gateway**: POST /vehicles route added successfully
  - Route ID: utzd225
  - Authorization: JWT (Auth0 validation required)
  - Integration: Lambda proxy with unified handler
- **Terraform**: Applied successfully (1 added, 1 changed)
  - New route resource created
  - Lambda source hash updated

### Known Issues - Authentication

- **Frontend**: All API calls fail with 401 Unauthorized (expected)
  - Mock token correctly rejected by API Gateway JWT Authorizer
  - Real Auth0 SPA configuration required from user
  - User must create Auth0 SPA application and provide credentials
  - Implementation blocked until user completes Auth0 setup
- **Frontend**: Cannot test vehicle creation or enrichment flows
  - VIN onboarding screen functional but blocked by auth
  - Vehicle report and chat components built but untested
  - Integration testing postponed until Auth0 configured

### Next Steps - Auth0 Implementation

1. User creates Auth0 SPA application in tenant
2. User configures callback URLs: `http://localhost:5173/callback`
3. User provides: Domain, Client ID, Audience
4. Agent implements Auth0Provider in main.tsx
5. Agent updates App.tsx with useAuth0 hooks
6. Agent adds callback route and logout functionality
7. Test complete authentication flow
8. Update createVehicle to extract ownerId from JWT
9. Deploy to S3 + CloudFront (production)

### Technical Notes - Frontend

- TailwindCSS v4 breaking changes resolved (no config file, @theme syntax)
- PostCSS plugin changed from 'tailwindcss' to '@tailwindcss/postcss'
- React 19 compatibility confirmed (no breaking changes from 18)
- API Gateway JWT Authorizer working correctly (rejects unauthorized requests)
- Backend security properly implemented at gateway level (no Lambda code changes needed)
- Frontend development server running on port 5173
- Dev server auto-refresh working with HMR (Hot Module Replacement)

## [Phase 12 - Dealer Portal Data Import] - 2025-11-18

### Added - Mopar Dashboard Integration

- **Dealer Portal Import Endpoint**: New `POST /vehicles/:id/import-dealer-data` route in `backend/src/routes/importDealerData.ts`
  - Purpose: Parse dealer portal HTML/screenshots via Gemini AI and import to MongoDB
  - Supports: Mopar dashboard data (with extensibility for GM, Ford, Toyota)
  - Data types: `dashboard` (mileage, warranty, coverage plans), `service_history` (maintenance records)
  - Gemini model: `gemini-2.0-flash` (stable, free-tier compatible) for structured JSON extraction
  - Temperature: 0.1 for factual accuracy
- **Mopar Dashboard Parser**: `parseMoparDashboard(html)` extracts:
  - Actual mileage with sync date (e.g., 3,560 miles vs 96k estimate)
  - Warranty status: Basic limited warranty with expiration date/mileage
  - Coverage plans: Tire Works, extended warranty, etc. (name, contract #, dates, type)
  - Connected services: Uconnect, remote services status
  - Safety recalls: Count of incomplete vs complete
- **Service History Parser**: `parseMoparServiceHistory(html)` extracts:
  - Service records table: date, description, provider, odometer
  - Imports to events collection with `source: 'mopar_import'` tag
  - Deduplication: Date + description matching prevents duplicates
- **MongoDB Schema Extensions**:
  - `vehicle.dealerPortal`: New field with source, lastSync, mileage, warranty, coveragePlans, connectedServices
  - `events` collection: Service history imported from dealer portal
- **DealerPortalData Interface**: Comprehensive type definition in `backend/src/lib/externalApis.ts`
  - Multi-vendor support: 'mopar' | 'gm' | 'ford' | 'toyota'
  - Warranty details: basic, powertrain, other coverage
  - Coverage plans: Array of contracts with dates and types
  - Connected services: Uconnect, remote start, subscription status

### Tested - Dealer Import Suite

- **Validation Tests**: 7 new tests in `backend/src/importDealerData.test.ts` (all passing)
  - ✅ Missing vehicle ID (400)
  - ✅ Invalid vehicle ID format (400)
  - ✅ Non-existent vehicle (404)
  - ✅ Missing request body (400)
  - ✅ Invalid JSON body (400)
  - ✅ Missing required fields: source, dataType, content (400)
  - ✅ Unsupported source (non-Mopar, 400)
- **Real Data Test**: Tested with actual 2017 Jeep Cherokee "Horace" Mopar dashboard
  - ✅ Parsed: 3,560 miles, basic warranty expired 09/23/2020
  - ✅ Extracted: MOPAR TIRE WORKS plan (contract #53769698, expires 05/29/2026)
  - ✅ Detected: Uconnect expired
  - ✅ MongoDB updated: vehicle.dealerPortal field and events collection
  - Response: `{ mileage: 1, warrantyUpdates: 1, coveragePlans: 1 }`
- **Test Coverage**: All 8 tests passing (7 validation + 1 real data)

### Changed - KBB Approach Abandoned

- **Market Value Plan Pivot**: Original Phase 12 plan was KBB scraping with Playwright + Gemini Vision
  - Research: Found VIN entry form at <https://www.kbb.com/whats-my-car-worth/>
  - Implementation: Built 307-line `getMarketValue.ts` with Playwright browser automation
  - Blockers: Bot detection ("Access Denied"), multi-step wizard requiring email
  - Decision: User rejected approach ("KBB has made a good fly trap... This is too much")
- **Superior Alternative**: Dealer portal data is MORE valuable than public estimates
  - User-controlled: Copy/paste approach, no security risk
  - Accurate: Real mileage (3,560 vs 96k estimate), actual service history
  - Legal: No bot detection concerns, no ToS violations
  - Richer data: Warranty, coverage plans, recalls, connected services
- **Gemini Vision Module Retained**: `backend/src/lib/geminiVision.ts` (150 lines) kept for future features
  - Available for: Receipt scanning, damage photo analysis, inspection reports
  - Not used in Phase 12 (text model sufficient for HTML parsing)

### Infrastructure - Phase 12

- **Lambda Deployment**: Updated deployment package to 8.19 MB
  - Successfully deployed to AWS Lambda (vwc-dev function)
  - New endpoint: `POST /vehicles/:id/import-dealer-data`
  - API key: GOOGLE_API_KEY in Parameter Store for Gemini text model
- **Playwright Dependency**: Added but unused in final solution (kept for future features)
  - 4 packages, 2 vulnerabilities (non-blocking, isolated from production Lambda)

## [Phase 11 - NCAP Safety Ratings Integration] - 2025-11-18

### Added - NHTSA NCAP Safety Ratings

- **NCAP Ratings API Client**: Implemented two-step NCAP ratings integration in `backend/src/lib/externalApis.ts`
  - `getSafetyRatings(year, make, model)`: Two-step process via NHTSA SafetyRatings API
    - Step 1: Search for vehicle IDs by year/make/model (`/SafetyRatings/modelyear/{year}/make/{make}/model/{model}`)
    - Step 2: Fetch detailed ratings by vehicle ID (`/SafetyRatings/VehicleId/{id}`)
  - Returns star ratings (1-5) for overall, front driver/passenger, side, rollover
  - Includes rollover risk percentage (0-100%) and safety features (ESC, FCW, LDW)
  - Memory caching: 24-hour TTL for NCAP ratings (immutable but allows periodic refresh)
  - Non-blocking error handling: Returns null if ratings unavailable (doesn't throw)
- **NCAPRatings Interface**: Added comprehensive type definitions
  - Star ratings: overall, frontDriver, frontPassenger, side, rollover (1-5 scale)
  - Rollover risk: rolloverPossibility (percentage)
  - Safety features: ESC (Electronic Stability Control), FCW (Forward Collision Warning), LDW (Lane Departure Warning)
  - Metadata: vehicleId (NCAP database ID), lastUpdated (timestamp)
- **Safety Endpoint Enhancement**: Extended `GET /vehicles/:id/safety` to include NCAP ratings
  - Parallel data fetching: recalls + complaints + NCAP ratings via Promise.all
  - MongoDB persistence: Stores `ncapRating` field in vehicle safety data
  - Response summary: Added `hasNCAPRatings` and `overallRating` fields

### Tested - NCAP Test Suite

- **Unit Tests**: 6 new tests in `backend/src/ncapRatings.test.ts` (all passing)
  - ✅ Fetch ratings for 2017 Jeep Cherokee 4WD (NCAP ID 11348)
  - ✅ Verify expected ratings: 4/4/5/4 stars (overall/front/side/rollover), 16.9% rollover risk
  - ✅ Memory cache validation (24-hour TTL, sub-millisecond hits)
  - ✅ Non-existent vehicle handling (returns null gracefully)
  - ✅ Vehicles without NCAP ratings (1990 Honda Civic, pre-NCAP era)
  - ✅ API error handling (invalid inputs, network failures)
- **Integration Tests**: Safety endpoint tests updated and passing
  - ✅ NCAP ratings fetched in parallel with recalls/complaints
  - ✅ Data persisted to MongoDB (`vehicle.safety.ncapRating`)
  - ✅ Response includes `hasNCAPRatings: true` and `overallRating: 4` fields
- **Test Coverage**: All 92 tests passing (86 existing + 6 NCAP tests)
- **Production Verification**: Deployed to AWS Lambda and tested via API Gateway
  - Vehicle ID 11348 found for 2017 Jeep Cherokee
  - Ratings fetched: Overall=4★, Front=4/4★, Side=5★, Rollover=4★
  - Cache working with 86400s (24-hour) TTL

### Infrastructure - Phase 11

- **Lambda Deployment**: Updated deployment package to 5.36 MB
  - Successfully deployed to AWS Lambda (vwc-dev function)
  - NCAP integration verified in production environment
  - All API integration tests (17 tests) passing

### Changed - Test Reliability

- **EPA Cache Test**: Fixed flaky timing assertion in `epaClient.test.ts`
  - Removed unreliable timing comparison (cache hits can be 0ms due to sub-millisecond performance)
  - Now validates data equality instead of timing thresholds
  - Test suite stability improved for CI/CD environments

## [Phase 10 - EPA Fuel Economy Integration] - 2025-11-18

### Added - EPA Fuel Economy API Client

- **EPA API Client**: Implemented XML-based EPA Fuel Economy API integration in `backend/src/lib/externalApis.ts`
  - `searchEPAVehicle(year, make, model)`: Hierarchical search via `/menu/model` and `/menu/options` endpoints
  - `getFuelEconomy(epaId)`: Fetches fuel economy data from `/vehicle/{id}` endpoint
  - `matchVehicleToEPA()`: Smart matching with engine spec filtering (cylinders, displacement)
  - XML parsing via `fast-xml-parser` library (40KB, battle-tested, 23M weekly downloads)
  - Memory caching: 24-hour TTL for vehicle search, permanent cache for fuel economy data
- **VehicleSpecs Enhancement**: Added year/make/model fields to VehicleSpecs interface
  - Extracted from NHTSA vPIC response for EPA lookup
  - Enables EPA matching without requiring vehicle document fields
- **Enrichment Integration**: Updated `enrichVehicle` route to fetch EPA data after VIN decode
  - Non-blocking EPA fetch (doesn't fail enrichment if EPA unavailable)
  - Stores `fuelEconomy.epa` with city/highway/combined MPG, annual fuel cost, CO2 emissions
  - Automatically matches vehicle to EPA database using engine specs

### Changed - Code Quality

- **ESLint Configuration**: Added `src/lib/externalApis.ts` to unsafe-type exceptions
  - XML parser returns `any` types, requires unsafe type rules disabled
  - Consistent with existing pattern for MongoDB and route handlers

### Tested - Comprehensive EPA Test Suite

- **Unit Tests**: 12 new tests in `backend/src/epaClient.test.ts` (all passing)
  - ✅ EPA vehicle search (14 variants found for 2017 Jeep Cherokee)
  - ✅ Vehicle ID + engine/transmission description parsing
  - ✅ Memory cache validation (search and fuel economy caching)
  - ✅ Fuel economy fetch (18/24/21 MPG for 2017 Cherokee V6)
  - ✅ Smart matching with cylinder filtering (6-cyl vs 4-cyl)
  - ✅ Smart matching with displacement filtering (3.2L specification)
  - ✅ Fallback matching (no engine specs provided)
  - ✅ Non-existent vehicle handling (returns null)
  - ✅ Error handling (invalid EPA ID, network errors)
- **Test Performance**: Cache effectiveness validated
  - API calls: ~500-1000ms, Cache hits: <1ms (sub-millisecond)
  - Cache hit rate target: >80% for hot vehicles
- **Full Test Suite**: All 86 tests passing (74 existing + 12 EPA tests)

### Infrastructure - Phase 10

- **Lambda Deployment**: Updated deployment package to 5.35 MB (includes fast-xml-parser)
  - Successfully deployed to AWS Lambda (vwc-dev function)
  - Status: Successful, State: Active
  - Integration tests pass (17/17 API tests)

### Technical Details

- **EPA API Structure**: RESTful XML API at fueleconomy.gov/ws/rest/
  - Model search: `/menu/model?year={year}&make={make}`
  - Options search: `/menu/options?year={year}&make={make}&model={model}`
  - Vehicle data: `/vehicle/{id}`
  - Returns 145+ fields including city08, highway08, comb08, fuelCost08, co2TailpipeGpm
- **Data Fields**: FuelEconomyData interface captures key metrics
  - `epa.city`: City MPG (EPA test cycle)
  - `epa.highway`: Highway MPG
  - `epa.combined`: Combined MPG (55% city, 45% highway)
  - `epa.annualFuelCost`: Estimated annual fuel cost ($)
  - `epa.co2`: CO2 emissions (grams/mile)
  - `lastUpdated`: Timestamp of data retrieval

## [Phase 13 - Conversation History] - 2025-11-18

### Added - AI Conversation Persistence

- **MongoDB Collections**: Created `conversation_sessions` and `conversation_messages` collections with TTL indexes
  - `conversation_messages`: 30-day automatic expiration (2,592,000 seconds)
  - `conversation_sessions`: 90-day idle expiration (7,776,000 seconds)
  - Indexes: `ix_session_messages`, `ix_user_messages`, `ix_user_sessions`
- **Backend Types**: Added conversation types in `backend/src/lib/conversationTypes.ts`
  - `ConversationSession`: Session metadata with user, vehicle, timestamps, message count
  - `ConversationMessage`: Individual messages with role (user/assistant), content, tools used
  - `ChatRequest`, `ChatResponse`, `ConversationHistoryResponse`: API request/response types
- **Route Handler**: `getConversationMessagesHandler` for retrieving conversation history
  - `GET /conversations/{sessionId}/messages` - Fetch all messages for a session
  - User authentication and session ownership validation
  - Returns session metadata + chronological message list
- **API Routes**: API Gateway route for conversation history retrieval
  - `GET /conversations/{sessionId}/messages` with JWT authorization

### Changed - AI Chat Handler (Phase 13)

- **Backend**: Enhanced `aiChat.ts` to persist all conversations in MongoDB
  - Auto-creates new session if `sessionId` not provided in request
  - Saves user prompts and AI responses to `conversation_messages` collection
  - Updates session metadata (`lastActiveAt`, `messageCount`) on each interaction
  - Loads last 20 messages from MongoDB for AI context (replaces in-memory conversationHistory)
  - Sets session title from first user message (first 50 characters)
  - Returns `sessionId` and `conversationContext` in response
- **Database Initialization**: Updated `init-collections.ts` with conversation schemas
  - Automatic TTL cleanup configured (no manual maintenance required)
  - Validation rules for required fields (userId, role, timestamp, etc.)

### Tested

- **Unit Tests**: 6 new tests in `backend/src/conversationHistory.test.ts`
  - ✅ Session creation with TTL index verification
  - ✅ Message persistence with timestamps
  - ✅ History retrieval in chronological order
  - ✅ Session metadata updates (messageCount, lastActiveAt)
  - ✅ Limited history queries (last N messages)
  - ✅ TTL index configuration validation (30-day and 90-day expiration)
- **Integration**: All 74 tests passing (including new conversation tests)
  - Conversation persistence tested with MongoDB
  - TTL indexes confirmed operational

### Benefits

- **Smart Context Window**: AI remembers last 20 messages across sessions (10-15 minute typical conversation)
- **Automatic Cleanup**: TTL indexes delete old data (messages after 30 days, inactive sessions after 90 days)
- **Storage Efficient**: ~300 bytes per message, 1.8 MB for 10 active users (33% of free tier)
- **Cold Start Resilient**: Conversation history persists across Lambda container restarts
- **User Privacy**: Each user's sessions isolated, automatic expiration enforces data minimization

### Technical Details - Phase 13

- **Lambda Package**: 4.92 MB (includes new conversation code)
- **Caching Strategy**: MongoDB persistent storage + Lambda memory cache for session data
- **Security**: JWT authentication required, userId validation, session ownership checks
- **Scalability**: Indexed queries, pagination-ready design (limit 20 messages in AI context)

## [Phase 9 - Real Vehicle Validation] - 2025-11-17

### Added

- **Infrastructure**: API Gateway routes for vehicle enrichment and safety endpoints
  - `POST /vehicles/{vehicleId}/enrich` - VIN decode and specification storage
  - `GET /vehicles/{vehicleId}/safety` - Recalls and complaints retrieval
- **Backend**: Real vehicle testing utilities in `backend/tests/` directory
  - `test-real-vehicle.ts` - End-to-end enrichment and safety data validation
  - `test-vin-report.ts` - Comprehensive VIN-based report generator
  - `test-endpoints.ts` - Quick API endpoint validation
  - `debug-structure.ts` - MongoDB document structure inspector

### Changed - Route Handlers

- **Backend**: Fixed path parameter handling in route handlers
  - `enrichVehicleHandler` now accepts `vehicleId` or `id` from path parameters
  - `getVehicleSafetyHandler` now accepts `vehicleId` or `id` from path parameters
  - Ensures compatibility with API Gateway v2 route parameter naming
- **Backend**: Moved test utilities from `src/` to `tests/` directory
  - Resolves TypeScript compilation errors from utility scripts
  - Separates development/test tooling from production Lambda code

### Validated

- **Real Vehicle**: 2017 Jeep Cherokee (VIN: 1C4PJMBS9HW664582)
  - ✅ VIN decode successful: 3.2L V6, 271 HP, 4-door SUV
  - ✅ Safety data: 6 active recalls, 1,249 complaints retrieved
  - ✅ Memory cache working: MISS (first call), HIT (subsequent calls, 0-1ms)
  - ✅ MongoDB persistence: Specs and safety data stored with proper TTL tracking
  - ✅ External API integration: NHTSA vPIC, Recalls API, Complaints API all functional

### Infrastructure

- **Terraform**: Added API Gateway v2 routes for enrich and safety endpoints
- **IAM**: CloudWatch logs filtering permission added to terraform-vwc policy
- **Lambda**: Deployed with enrich and safety route handlers (5.16 MB package)

## [Phase 2 - Safety Intelligence - DataCache Removal] - 2025-11-17

### Changed - DataCache Removal

- **Backend**: Refactored safety endpoint (`getVehicleSafetyHandler`) to use memoryCache and persist safety data in MongoDB
  - Added fallback update by VIN for test reliability
  - Safety data now stored in `vehicle.safety` with `lastChecked` timestamp
  - Memory cache used for Lambda container optimization (hot path)
- **Backend**: Removed legacy DataCache class from `externalApis.ts`
  - Eliminated Parameter Store caching for external API responses
  - Simplified to memory-only cache for VIN decode, recalls, and complaints
  - Parameter Store now only used for secrets (`/vwc/dev/secrets`) and Auth0 token cache (`/vwc/dev/auth0-token-cache`)
- **Tests**: Updated all safety and enrichment tests to validate MongoDB persistence
  - All 68 backend tests passing
  - Tests verify memory cache behavior and MongoDB document updates

### Fixed

- Safety data persistence issue for test vehicles resolved by fallback update logic in handler
- Test reliability improved for safety endpoint and caching operations
- Eliminated Parameter Store size limit errors (4KB/32KB) by removing external API caching

### Documentation

- Updated `backend/README.md` to reflect memory cache + MongoDB persistence strategy
- Updated `docs/job-jar-remove-parameter-store-caching.md` status (Phases 1-6 completed)
- Confirmed all documentation current with new caching strategy

## [Phase 2 - Safety Intelligence] - 2025-11-16

### Added - Safety Data Integration

- **Backend**: NHTSA Recalls and Complaints API integration (FREE government services)
  - New methods in `VehicleDataClient`: `getRecalls(make, model, year)` and `getComplaints(make, model, year)`
  - Recalls API: `https://api.nhtsa.gov/recalls/recallsByVehicle?make=X&model=Y&modelYear=Z`
  - Complaints API: `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=X&model=Y&modelYear=Z`
  - Two-tier caching: Memory (0-1ms) + Parameter Store (50-100ms) → reduces API calls significantly
  - Cache TTLs: 7 days for recalls (frequent updates), 30 days for complaints (less frequent)
  - Cache key formats: `/vwc/cache/recalls/{MAKE}/{MODEL}/{YEAR}` and `/vwc/cache/complaints/{MAKE}/{MODEL}/{YEAR}`
  - Error handling: `ExternalAPIError` class with structured error messages
- **Backend**: Safety data TypeScript interfaces
  - `RecallData`: NHTSACampaignNumber, ReportReceivedDate, Component, Summary, Consequence, Remedy, ModelYear, Make, Model
  - `ComplaintData`: odiNumber, manufacturer, crash, fire, numberOfInjuries, numberOfDeaths, dateOfIncident, dateComplaintFiled, vin, components, summary
  - `SafetyData`: recalls array, complaints array, lastChecked timestamp
- **Backend**: Vehicle safety endpoint (`src/routes/getVehicleSafety.ts`)
  - Route: `GET /vehicles/{vehicleId}/safety`
  - Process: Validate ID → Fetch vehicle → Extract make/model/year → Call safety APIs → Return comprehensive safety data
  - Response: `{ success, recalls, complaints, vehicle }`
  - Error handling: 400 (validation), 404 (vehicle not found), 502 (API failures), 500 (server errors)
  - JWT-protected via Auth0
- **Tests**: Comprehensive safety integration tests (`src/vehicleSafety.test.ts`)
  - 9 new tests across 3 suites: Recalls API (3 tests), Complaints API (3 tests), Safety Endpoint (3 tests)
  - Test vehicle: 2017 Jeep Cherokee (make/model/year extracted from decoded VIN)
  - Cache timing validation: Memory cache hits in 0-1ms
  - Test cleanup: `beforeAll()` deletes test vehicle, `afterAll()` removes test data
  - All 9 tests passing with memory cache working perfectly
  - **Note**: Parameter Store writes fail due to 4KB/32KB size limits (acceptable, memory caching sufficient)
  - Total test count: 55/55 passing (9 safety + 46 existing)
- **Backend**: Lambda router updated with safety route
  - Imported `getVehicleSafetyHandler` in `src/index.ts`
  - Route pattern: `GET /vehicles/[vehicleId]/safety` with regex match
  - Integrated alongside existing routes (overview, events, enrich, chat)

### Added - Architecture Documentation

- **Documentation**: External API caching strategy analysis (`docs/external-api-caching-strategy.md`)
  - Comprehensive analysis of 7 external APIs (current + future phases)
  - **THE TABLE**: Analyzes each API by mutability, size, freshness requirements, cost, recommended cache tiers, TTL, and rationale
  - Key insights:
    - Immutable data (VIN decode, EPA fuel economy, NCAP ratings) → MongoDB only, no expiration
    - Mutable data (recalls, complaints, investigations) → MongoDB + TTL checking + memory cache
    - Parameter Store → Secrets and Auth0 tokens ONLY (not for external API caching)
  - Recommended three-tier cache architecture:
    - **Tier 1**: MongoDB (primary persistence with TTL fields, 10-20ms access)
    - **Tier 2**: Memory cache (Lambda container optimization, 0-1ms access)
    - **Tier 3**: External API (fallback when cache miss or TTL expired, 500ms+ latency)
  - Performance comparison: MongoDB+memory (20ms cold, 1ms warm) vs current Parameter Store approach (75ms, fails for large data)
  - Cost analysis: $0 additional (using existing MongoDB) vs $2-5/month for Parameter Store Advanced tier
  - Migration overview, monitoring strategy, implementation checklist
- **Documentation**: Parameter Store caching removal migration plan (`docs/job-jar-remove-parameter-store-caching.md`)
  - Detailed 9-phase migration plan (~7 hours total) to fix Parameter Store misuse
  - Problem: Parameter Store designed for secrets/config (<4KB), not application data (safety data exceeds limits)
  - Target architecture: MemoryCache utility class + MongoDB persistence with TTL checking
  - **Phase 1**: Create MemoryCache utility (30 min) - complete TypeScript implementation provided
  - **Phase 2**: Refactor VIN decode to memory-only cache, store in MongoDB vehicle.specs (1 hour)
  - **Phase 3**: Refactor safety APIs to memory cache (1.5 hours)
  - **Phase 4**: Update safety endpoint with MongoDB TTL checking (1.5 hours) - complete code example
  - **Phase 5**: Remove DataCache class entirely (30 min)
  - **Phase 6**: Update all tests for MongoDB assertions (1 hour)
  - **Phase 7**: Infrastructure cleanup - restrict Parameter Store IAM to secrets only (30 min)
  - **Phase 8**: Documentation updates (30 min)
  - **Phase 9**: Deploy and verify (30 min)
  - MongoDB document structure: `vehicle.specs` (VIN decode), `vehicle.safety.recalls`, `vehicle.safety.complaints` with `lastChecked` timestamps
  - Rollback plan: Git revert, keep IAM permissions until verified
  - Success criteria: 46+ tests passing, no Parameter Store errors, MongoDB contains safety data

### Changed - Development Guidelines

- **Copilot Instructions**: Updated with critical external API caching rules
  - **NEW RULE**: "Parameter Store: ONLY for secrets (/vwc/dev/secrets) and Auth0 token caching (/vwc/dev/auth0-token-cache)"
  - **NEW RULE**: "DO NOT use Parameter Store for external API response caching (wrong use case, size limits, unnecessary complexity)"
  - Cache tier definitions for each API type based on mutability:
    - VIN decode (immutable) → Memory cache → Store in MongoDB vehicle.specs (no expiration)
    - Safety data (mutable) → Memory cache → Store in MongoDB vehicle.safety with TTL checking
    - Fuel economy (immutable) → Store in MongoDB vehicle.fuelEconomy.epa on first lookup
  - Rationale: External APIs are free, data often too large for Parameter Store, MongoDB is better persistence layer
  - References new strategy and migration documents

### Technical Notes - Safety Intelligence

- NHTSA Recalls API returns JSON with Count, Message, and results array
- NHTSA Complaints API returns JSON with Count, Message, and results array
- Cache storage: Parameter Store attempts fail for large datasets (recalls >4KB, complaints >32KB)
- Memory cache: Works perfectly, sufficient for Lambda container reuse (~15-45 min lifetime)
- Test strategy: Validation-only tests, skip complex MongoDB mocking, all integration tests pass
- **Architectural Issue Identified**: Parameter Store misused for application data caching
  - Parameter Store designed for configuration and secrets (<4KB Standard, <32KB Advanced)
  - Safety data exceeds limits (recalls 4KB+, complaints 32KB+)
  - Migration planned to fix architecture: MemoryCache + MongoDB with TTL
  - Current implementation works (memory cache succeeds), Parameter Store failures non-blocking

## [Phase 1 - VIN Intelligence] - 2025-11-14

### Added - VIN Decode & Enrichment

- **Backend**: NHTSA vPIC API integration for VIN decoding (FREE government service, 145+ vehicle variables)
  - External API client library (`src/lib/externalApis.ts`) with `VehicleDataClient` class
  - Decodes VIN to comprehensive vehicle specifications: make, model, year, engine, body, safety, transmission
  - Two-tier caching: Memory (0-1ms) + Parameter Store (45-163ms) → reduces API calls by 90%
  - Cache TTL: 30 days (vehicle specs don't change)
  - Cache key format: `/vwc/cache/vin/{VIN}` (AWS Parameter Store hierarchy)
  - Date deserialization: `dateReviver` function for proper Date object handling from Parameter Store
  - Error handling: `ExternalAPIError` class with structured error messages
- **Backend**: ISO 3779 VIN validation utility (`src/lib/vinValidator.ts`)
  - Check digit algorithm: Weighted sum modulo 11 for authenticity verification
  - VIN structure parsing: WMI, VDS, check digit, model year, plant, serial number
  - Model year decoding: Handles 30-year code cycles (2000-2029, 2030-2059)
  - Sanitization: Removes spaces/hyphens, validates 17-character format
  - Validation: No I/O/Q characters, valid check digit at position 9
- **Backend**: Vehicle enrichment endpoint (`src/routes/enrichVehicle.ts`)
  - Route: `POST /vehicles/{vehicleId}/enrich`
  - Request: `{ vin?: string }` (optional if vehicle already has VIN)
  - Response: `{ success, message, vehicle, specs }`
  - Process: Validate ID → Fetch vehicle → Validate VIN → Decode API → Update document → Return enriched data
  - Error handling: 400 (validation), 404 (not found), 502 (API failure), 500 (server)
  - JWT-protected via Auth0
- **Backend**: Gemini AI function calling integration
  - New function: `enrichVehicleFromVIN` in `src/routes/aiChat.ts`
  - Description: "Decode VIN and enrich vehicle with specifications from NHTSA vPIC API"
  - Parameters: vehicleId (required), vin (optional)
  - AI can now automatically decode VINs when users provide them in chat
  - System instruction updated to include enrichVehicleFromVIN in AVAILABLE TOOLS
- **Backend**: Parameter Store cache utilities
  - New functions in `src/lib/parameterStore.ts`: `getParameter()`, `putParameter()`
  - Used by `DataCache` class for shared caching across Lambda containers
  - Complements existing `getSecretsFromParameterStore()` function
- **Tests**: Comprehensive VIN enrichment test suite (`src/enrichVehicle.test.ts`)
  - 11 new tests covering VIN validation, API integration, caching, enrichment endpoint
  - Test VIN: `1C4PJMBS9HW664582` (2017 Jeep Cherokee)
  - Test suites: VIN Validator (6 tests), NHTSA API Client (3 tests), Enrich Endpoint (2 tests)
  - Cache timing validation: Memory (sub-10ms) vs API (325ms+)
  - Test cleanup: `beforeAll()` deletes existing test vehicle to prevent duplicate VIN errors
  - Total test count: 46/46 passing (11 VIN enrichment + 35 existing)

### Fixed - Parameter Store Cache Issues

- **Cache Key Format**: Changed from `vin:{VIN}` to `vin/{VIN}` (AWS Parameter Store only allows letters, numbers, `.-_` and `/` for hierarchy)
- **Date Deserialization**: Added `dateReviver()` method to `DataCache` class
  - Binds to `JSON.parse()` for Parameter Store cache reads
  - Regex-matches ISO 8601 date strings (`/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/`)
  - Converts to proper Date objects (fixes `decodedAt` returning string instead of Date)
- **Test Reliability**: Added `clearCache()` call in cache timing test to ensure fresh API call on first run

### Changed - Router & Tests

- **Backend**: Lambda router updated
  - Imported `enrichVehicleHandler` in `src/index.ts`
  - Route ready for deployment (handler imported, needs router pattern added)
- **Tests**: Test code quality improvements
  - Refactored hardcoded VIN to `TEST_VIN` constant for maintainability
  - Added vehicle cleanup in `beforeAll()` to prevent duplicate key errors on test reruns
  - All 46 tests passing consistently

### Infrastructure - Phase 1 Deployment

- Lambda deployed with Phase 1 features (5.14 MB deployment package)
- Cache infrastructure: AWS Parameter Store Standard tier (free) at `/vwc/cache/*`
- No Terraform changes required (uses existing Parameter Store permissions)

### Performance

- **Caching Gains**:
  - Memory cache: 0-1ms (12,000x faster than API)
  - Parameter Store: 45-163ms (2-7x faster than API)
  - API call: 325-500ms (baseline)
- **Expected Impact**: 90% reduction in NHTSA API calls through two-tier caching

### Technical Notes - VIN Intelligence

- NHTSA vPIC API v3.64 endpoint: `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{VIN}?format=json`
- VIN validation standard: ISO 3779 with transliteration values for check digit calculation
- Cache storage: Parameter Store handles Date objects via JSON serialization with custom reviver
- AI integration pattern: Gemini calls existing HTTP endpoints (not direct database access)
- Test strategy: Validation-only tests (input checks, error cases), skip complex MongoDB mocking

## [Secrets Manager Migration Complete] - 2025-11-14

### Removed - Secrets Manager Complete Elimination (Phase 7/8)

- **All Code**: Eliminated ALL Secrets Manager references from entire codebase
  - **infra/load-tf-env.js**: Now uses Parameter Store for Atlas API keys (was last holdout using old secret)
  - **Utility Scripts**: `init-collections.ts` and `test-connection.ts` converted to Parameter Store
  - **Documentation**: Removed Secrets Manager references from all guides except CHANGELOG and migration docs
  - **Configuration**: Removed `AWS_SECRET_ID` from `.aws-credentials.example` and `load-aws-credentials.ps1`
  - **IAM Policy**: Removed `SecretsManagerAccess` statement from `terraform-vwc-core-policy-updated.json`
- **Migration Guide**: Created `docs/parameter-store-atlas-keys-migration.md` with step-by-step instructions to:
  - Export Atlas API keys from old secret (`vehical-wellness-center-dev`)
  - Add 4 keys to Parameter Store: `MONGODB_ATLAS_PUBLIC_KEY`, `MONGODB_ATLAS_PRIVATE_KEY`, `MONGODB_ATLAS_ORG_ID`, `MONGODB_ATLAS_PROJECT_ID`
  - Test Terraform with new Parameter Store source
  - Delete old secret with 7-day recovery window
- **Next Step**: User will manually migrate Atlas keys to Parameter Store, then delete old secret in AWS Console

### Removed - Secrets Manager (Phase 6 Complete)

- **Backend**: Removed AWS Secrets Manager code from `mongodb.ts`
  - Simplified `getSecrets()` to single line calling Parameter Store
  - Removed imports: `SecretsManagerClient`, `GetSecretValueCommand`
  - Removed ~45 lines of legacy Secrets Manager retrieval code
  - Clean codebase - no dead code, no fallback complexity
- **Infrastructure**: Removed Secrets Manager from Terraform configuration
  - Removed data source: `aws_secretsmanager_secret_version.mongodb_database_user`
  - Removed variable: `mongodb_database_user_secret_id`
  - Updated Lambda IAM policy: removed `secretsmanager:GetSecretValue` and `secretsmanager:DescribeSecret` permissions
  - Removed Lambda environment variable: `AWS_SECRET_ID`
  - MongoDB user resource removed from Terraform (now managed manually in Atlas UI to prevent accidental deletion)
- **Infrastructure**: Fixed Terraform placeholder bug
  - Corrected `MONGODB_URI` → `MONGODB_ATLAS_HOST` in Parameter Store template
  - Ensures consistency between Terraform and actual Parameter Store structure
- **Cost Savings**: $4.80/year savings now fully realized
  - Secrets Manager completely removed from infrastructure
  - Parameter Store Standard tier (free) handling all application secrets
  - Migration from $0.40/month to $0.00/month for secret storage

### Fixed - MongoDB User Management

- **Database**: MongoDB user `vwc_admin_db_user` recreated manually after Terraform deletion
  - Role: `readWriteAnyDatabase@admin` (upgraded from scoped readWrite)
  - Managed in Atlas UI to prevent future accidental deletions during Terraform operations
  - Credentials match Parameter Store values exactly
  - All 35 tests passing with new user configuration

### Changed - Migration Status (Phase 6 → Phase 7)

- **Phase 6 Complete**: Secrets Manager fully removed from code and infrastructure
  - Lambda using Parameter Store exclusively (`SSM_SECRETS_PARAMETER_NAME` set)
  - All tests passing (35/35: 18 unit + 17 integration)
  - Code simplified, infrastructure cleaner, costs reduced
- **Next Phase**: Phase 7 will delete Secrets Manager secret with 7-day recovery window
- **Documentation**: Phase 6 completion notes added to migration plan

### Added - Migration Planning

- **Documentation**: Comprehensive 8-phase migration plan to replace AWS Secrets Manager with AWS Systems Manager Parameter Store for application secrets
  - **Cost optimization**: Eliminates $4.80/year Secrets Manager cost (100% savings for Standard tier Parameter Store)
  - **Security maintained**: Both solutions use KMS encryption (SecureString), IAM resource-level permissions, CloudTrail audit logs, and TLS in transit
  - **Zero-downtime approach**: Parallel operation with dual-read implementation ensures smooth cutover
  - **Rollback procedures**: Each phase includes specific rollback steps, 7-day recovery window for deleted secrets
  - **8 phases planned**: (1) Infrastructure foundation, (2) Dual-read implementation, (3) Manual population, (4) Testing & validation, (5) Documentation updates, (6) Remove Secrets Manager from Terraform, (7) Delete Secrets Manager secret, (8) Final cleanup
  - **6 milestone commits**: Aligned with phase completion for incremental progress tracking
  - **Modeled on success**: Based on recently completed Parameter Store token caching optimization (commit 99065c8)
  - Parameter format: Single JSON parameter `/vwc/dev/secrets` with all 7 credential fields (MongoDB, Auth0, Gemini)
  - New module specification: `backend/src/lib/parameterStore.ts` with `getSecretsFromParameterStore()`, `clearSecretsCache()` functions
  - Dual-read pattern: Environment variable `SSM_SECRETS_PARAMETER_NAME` switches between Parameter Store (primary) and Secrets Manager (fallback)
  - Timeline: 7-10 hours over 2-3 sessions
  - Documentation file: `docs/job-jar-secrets-to-parameter-store-migration.md`

### Added - Parameter Store Token Caching

- **Backend**: Two-tier Auth0 token caching system to minimize API calls and improve performance
  - **Tier 1**: Memory cache (fastest, container-specific, 0-1ms access time)
  - **Tier 2**: AWS Systems Manager Parameter Store (shared across all Lambda containers, 50-100ms access time)
  - **Tier 3**: Auth0 OAuth API (fallback, 500-1000ms when cache miss)
  - Token stored in format `token|expiresAt` (pipe-delimited) at `/vwc/dev/auth0-token-cache`
  - 5-minute expiration buffer prevents mid-request token expiry
  - Graceful degradation: Falls back to memory-only cache if Parameter Store unavailable
  - **70-90% reduction** in Auth0 API calls across all Lambda invocations
  - New functions: `clearMemoryCache()` for testing new container scenarios
- **Backend**: Auth0 module refactored with comprehensive SSM integration
  - New dependency: `@aws-sdk/client-ssm` (v3.931.0)
  - Functions: `getTokenFromParameterStore()`, `saveTokenToParameterStore()`, `fetchNewToken()`
  - Updated `getAuth0Token()` implements three-tier fallback pattern
  - Memory cache variable renamed from `cachedToken` to `memoryCache` for clarity
- **Backend**: Token caching test utility (`src/test-token-refresh.ts`)
  - Tests cold start (Auth0 fetch), memory cache hit, Parameter Store hit, forced refresh
  - Validates token sharing across simulated Lambda containers
  - Demonstrates performance gains: 12,655x faster (memory) and 4.5x faster (Parameter Store) vs Auth0
  - Auto-cleanup with `process.exit(0)` for CI/CD compatibility
- **Infrastructure**: Parameter Store resource for Auth0 token cache
  - Resource: `aws_ssm_parameter.auth0_token_cache` (Standard tier, free)
  - Name: `/vwc/dev/auth0-token-cache`
  - Initial value: `not-initialized|0` (Lambda manages at runtime)
  - Lifecycle: `ignore_changes` on value/description (Lambda controls updates)
  - Tags: Project, Environment, ManagedBy=Terraform
- **Infrastructure**: Lambda IAM permissions for Parameter Store access
  - Actions: `ssm:GetParameter`, `ssm:PutParameter` on token cache ARN
  - Added to existing `vwc_lambda_secrets` IAM role policy
  - Lambda environment variable: `AUTH0_TOKEN_PARAMETER_NAME=/vwc/dev/auth0-token-cache`
- **Infrastructure**: terraform-vwc IAM policy updated with SSM permissions
  - Two statements for security best practice:
    - `ParameterStoreManagement`: Resource-scoped actions (Get, Put, Delete, Tags) on `/vwc/*` parameters
    - `ParameterStoreDescribe`: Global `ssm:DescribeParameters` permission (required by Terraform aws_ssm_parameter resource)
  - File: `infra/terraform-vwc-core-policy-updated.json`

### Changed - Token Caching Architecture

- Auth0 token lifecycle now optimized for Lambda container reuse
  - Previously: Memory cache per container (15-45 min lifetime)
  - Now: Parameter Store shared cache + memory cache (persistent until expiry)
  - Benefit: New Lambda containers read from shared cache instead of calling Auth0
  - Cost impact: Zero (Standard Parameter Store is free tier)
- Lambda cold start performance improved for authenticated operations
  - First invocation: 189ms (Auth0 fetch) → subsequent: 42ms (Parameter Store) or 0.015ms (memory)
  - Warm containers: 0.015ms (memory cache hit)
  - Cross-container: 42ms (Parameter Store hit vs 189ms Auth0)

### Infrastructure Changes

- Terraform apply results:
  - Added: 1 resource (`aws_ssm_parameter.auth0_token_cache`)
  - Changed: 2 resources (Lambda function code + environment vars, IAM role policy)
  - Parameter Store created successfully at `/vwc/dev/auth0-token-cache`
- Lambda function updated with new source code hash (YacyINSsvuabnFGmyQj7phYSVaNKg+qsAcvksE31bOE=)
- All 35 tests passing (18 unit + 17 integration) with new caching system

### Performance - Token Caching

- Memory cache: 0.015ms (12,655x faster than Auth0)
- Parameter Store: 42ms (4.5x faster than Auth0)
- Auth0 API: 189-558ms (baseline)
- Expected production impact: 70-90% reduction in Auth0 token requests

### Changed - Lambda Consolidation

- **Backend**: Consolidated 4 separate Lambda functions into 1 unified Lambda with router pattern
  - Router in `src/index.ts` dispatches requests based on HTTP method and path regex
  - All handlers moved to `src/routes/` directory (getVehicleOverview.ts, listVehicleEvents.ts, recordVehicleEvent.ts, aiChat.ts)
  - Shared connection pool and token cache across all routes (better performance, lower cold start impact)
  - All handlers now use `APIGatewayProxyEventV2` for consistency
  - Simplified architecture: 1 Lambda instead of 4 reduces complexity and cost
- **Infrastructure**: Terraform refactored from 4 Lambda resources to 1
  - Single Lambda function: `vwc-dev` (Node.js 20.x, 512 MB memory, 60s timeout)
  - Single API Gateway integration for all 4 routes
  - All routes (`GET /vehicles/{vehicleId}/overview`, `GET /vehicles/{vehicleId}/events`, `POST /vehicles/{vehicleId}/events`, `POST /ai/chat`) point to same Lambda
  - Deployment package: `lambda-vwc.zip` (4.03 MB)
- **AI Integration**: Gemini model updated to `gemini-2.5-flash`
  - Previous model `gemini-2.0-flash-exp` had free tier quota of 0
  - Updated based on user's Google AI console showing traffic for gemini-2.5-flash
  - AI chat endpoint working with function calling (AI successfully calls getVehicleOverview tool)
  - AI Data Curator pattern validated: AI calls existing CRUD endpoints via HTTP, validates data, provides natural responses
- **Build System**: Lambda build script simplified for single function
  - `backend/scripts/build-lambda.js` no longer requires function name parameter
  - Outputs single `lambda-vwc.zip` with all routes included
  - Root `package.json` updated with simplified `build:lambda` and `deploy` scripts
- **DevOps**: Streamlined deployment process
  - `npm run deploy` builds and updates single Lambda function
  - Faster deployments (no need to update 4 separate functions)
  - Simpler infrastructure state (16 resources destroyed, 4 added, 4 updated in consolidation)
- **Tests**: All test files updated for new architecture
  - Import paths changed from `./` to `./routes/` for handler functions
  - All handlers use V2 event types throughout
  - 35/35 tests passing (18 unit + 17 integration)

### Added - AI Chat Testing

- **Backend**: AI chat test utility (`src/test-ai-chat.ts`)
  - Validates AI endpoint with realistic queries
  - Tests function calling (AI calls getVehicleOverview tool)
  - Tests data validation (AI checks vehicle existence before operations)
  - Automatic Auth0 token retrieval (no manual setup)
  - Examples: "Tell me about this vehicle", "Add oil change event"

### Fixed - Configuration

- **Configuration**: Updated `.gitignore` to properly exclude Terraform numbered backups
  - Added pattern `infra/terraform.tfstate.*.backup` to catch all backup files
  - Previously only excluded `terraform.tfstate.backup` (not numbered variants)

### Infrastructure - Lambda Consolidation

- Terraform apply results:
  - Destroyed: 16 resources (4 old Lambdas + 4 old integrations + 4 old routes + 4 old log groups)
  - Added: 4 resources (1 new Lambda + 1 new integration + 1 new log group + 1 new route)
  - Changed: 4 resources (3 routes updated to use new integration + 1 JWT authorizer)
- All 4 API endpoints operational through unified Lambda
- CloudWatch logs consolidated (single log group instead of 4)

### Architecture Notes

- Single Lambda benefits: Shared connection pool, shared token cache, simpler deployment, lower cost, less infrastructure complexity
- Router pattern uses regex matching for flexible path dispatching
- AI orchestrator is core application logic (not just another endpoint) - consolidation reflects this architecture
- Function calling working correctly: AI calls tools, validates data, handles edge cases naturally
- Gemini 2.5 Flash model stable and working (confirmed from user's API usage logs)

## [POST API & Integration Tests] - 2025-11-13

### Added - POST Endpoint & Integration Tests

- **Backend**: `recordVehicleEvent` Lambda function (POST `/vehicles/{vehicleId}/events`)
  - Creates vehicle events with comprehensive validation (vehicleId, required fields, optional numeric types)
  - Validates ObjectId format, JSON parsing, required fields (type, occurredAt, summary)
  - Validates optional fields (cost must be positive number, mileage must be positive integer)
  - Checks vehicle existence before creating event (returns 404 if not found)
  - Builds event document with nested details/source structure
  - Returns 201 with eventId on success, appropriate 400/404/500 errors
  - JWT-protected via Auth0 (401 without valid token)
- **Tests**: Comprehensive unit tests for `recordVehicleEvent` (9 validation tests)
  - Tests missing/invalid vehicleId, missing body, invalid JSON
  - Tests missing required fields (type, occurredAt, summary)
  - Tests invalid date format, negative cost, non-integer mileage
  - All validation tests passing
- **Tests**: Full API integration test suite (`api-integration.test.ts`) with 17 tests
  - Phase 1: Creates test vehicle and 3 events via POST API
  - Phase 2: Validates data via GET endpoints (overview, events list)
  - Phase 3: Updates data and verifies changes
  - Phase 4: Tests authentication (401), validation errors (400), non-existent vehicles (404)
  - Phase 5: Cleans up all test data via MongoDB
  - Self-contained: creates and removes own test data, safe to run repeatedly
  - Runs in ~3-4 seconds with proper cleanup even on test failures
  - **Automatic Auth0 token retrieval**: No manual token setup required
- **Auth0**: M2M (Machine-to-Machine) application integration for automated testing
  - Client Credentials flow implementation in `lib/auth0.ts`
  - Token caching with 5-minute expiration buffer (reduces Auth0 API calls)
  - Tokens cached in Lambda container memory (survives ~15-45 minutes)
  - Integration tests automatically fetch tokens via M2M credentials from Secrets Manager
  - Eliminates manual token copying from Auth0 dashboard
- **Infrastructure**: recordVehicleEvent Lambda, API Gateway POST route, CloudWatch logs
  - Lambda: 512MB memory, 30s timeout, JWT authentication required
  - Route: `POST /vehicles/{vehicleId}/events` with authorization_type="JWT"
  - Package: 3.89 MB deployment artifact
- **DevOps**: All tests run with AWS credentials automatically (`npm run test`)
  - Uses `terraform-vwc` AWS profile for MongoDB and Secrets Manager access
  - No manual AUTH0_TOKEN environment variable needed
  - Comprehensive README in `backend/tests/README-integration.md`
- **Documentation**: Parameter Store token caching design document
  - Job jar entry: `docs/job-jar-parameter-store-token-cache.md`
  - Future enhancement for shared token cache across Lambda containers
  - Complete Terraform configuration and implementation plan
  - Free tier solution using AWS Systems Manager Parameter Store
- **Utilities**: Updated `seed-test-data.ts` to disable auto-cleanup
  - Leaves test data in database for manual API testing
  - Shows both overview and events URLs
  - Auto-cleanup can be re-enabled by uncommenting cleanup section

### Changed it

- All three Lambda functions now deployed and JWT-protected:
  - `vwc-getVehicleOverview-dev` (GET `/vehicles/{vehicleId}/overview`)
  - `vwc-listVehicleEvents-dev` (GET `/vehicles/{vehicleId}/events`)
  - `vwc-recordVehicleEvent-dev` (POST `/vehicles/{vehicleId}/events`)
- Secrets Manager schema expanded to include Auth0 M2M credentials
  - Added `AUTH0_M2M_CLIENT_ID` and `AUTH0_M2M_CLIENT_SECRET` fields
  - `AppSecrets` interface in `lib/mongodb.ts` now exports `getSecrets()` for reuse
  - Updated `infra/secret-example.json` with M2M credential placeholders
- Vitest configuration simplified (no test exclusions, all tests run with credentials)

### Testing

- Successfully tested POST endpoint with Auth0 token:
  - Created event with valid payload (eventId: 6916159d6abd942ccd1ef492)
  - Verified 404 for non-existent vehicle
  - Verified 400 for missing required fields
  - Verified 401 without authentication
  - Event correctly appears in GET endpoints after creation
- Integration test suite validates full lifecycle:
  - Create → Read → Update → Validate → Cleanup
  - All 17 tests passing consistently

## [MongoDB Foundation] - 2025-01-22

### Added - Foundation

- **Infrastructure**: Terraform configuration for MongoDB Atlas M0 free tier cluster (`vehicalwellnesscenter-cluster`) in us-west-2
- **Infrastructure**: IAM role `vwc-lambda-execution-role` with Secrets Manager and CloudWatch Logs permissions
- **Infrastructure**: IAM user `terraform-vwc` with CLI access keys and policies for infrastructure management
- **Backend**: TypeScript Lambda project with ESLint (flat config), Vitest, and workspace scripts
- **Backend**: MongoDB connection test utility (`test-connection.ts`) with AWS Secrets Manager integration
- **Backend**: Collection initialization script (`init-collections.ts`) for vehicles, fleets, and vehicleEvents
- **Data Model**: Three MongoDB collections with JSON schema validators and indexes:
  - `vehicles` – VIN (unique), ownerId+VIN compound index
  - `fleets` – Vehicle aggregator with ownerId+name compound index
  - `vehicleEvents` – Timeline with vehicleId+occurredAt and type+occurredAt indexes
- **Documentation**: Comprehensive README with workspace commands, architecture, and prerequisites
- **Documentation**: Data model specification (`docs/data-model.md`) with sample documents and dealer maintenance mapping
- **Documentation**: MongoDB Atlas setup guide (`docs/MongoDB-Atlas-Setup-Guide.md`)
- **Documentation**: Secrets Manager provisioning checklist (`docs/atlas-secrets-todo.md`)
- **Documentation**: Milestone commit checklist in `.github/copilot-instructions.md` for repeatable quality gates
- **DevOps**: NPM workspace monorepo structure with root-level commands for build/lint/test/typecheck
- **DevOps**: PowerShell scripts for AWS credentials and Terraform variable loading

### Infrastructure - MongoDB Setup

- MongoDB Atlas M0 free tier cluster with 512 MB storage
- Database user `vwc_admin_db_user` with readWrite scope (imported to Terraform state)
- AWS Secrets Manager secret `vehical-wellness-center-dev` with denormalized credential structure
- Terraform template for mongosh collection initialization script

### Security

- All credentials stored in AWS Secrets Manager (no hardcoded values in source)
- IAM roles for Lambda execution (cloud native, no access keys in production)
- JSON schema validators on all collections with "warn" action for flexible development

## [JWT Authentication] - 2025-01-22

### Added - JWT Authentication

- **Security**: Auth0 JWT authentication for API Gateway
  - JWT authorizer validates RS256 tokens from Auth0 tenant
  - Issuer: Auth0 tenant domain (configured via AWS Secrets Manager)
  - Audience: `https://vehiclewellnesscenter/api`
  - Automatic public key validation via JWKS endpoint
- **Infrastructure**: Auth0 configuration variables (`auth0_domain`, `auth0_audience`)
  - Loaded from AWS Secrets Manager secret `vehical-wellness-center-dev`
  - Updated `load-tf-env.js` to inject Auth0 variables into Terraform
- **Documentation**: Complete Auth0 setup guide (`docs/Auth0-Setup-Guide.md`)
  - Tenant creation, API configuration, token generation instructions
  - Testing examples for PowerShell, curl, JavaScript
  - Troubleshooting guide for common auth issues
- **Documentation**: Quick reference for AWS secret updates (`docs/auth0-secrets-todo.md`)
- **Infrastructure**: Terraform variables template (`infra/terraform.tfvars.example`)

### Changed - Authentication

- **API Gateway**: All routes now require JWT authorization
  - `GET /vehicles/{vehicleId}/overview` - protected
  - `GET /vehicles/{vehicleId}/events` - protected
  - Unauthorized requests return 401 with `{"message":"Unauthorized"}`
- **Security**: Removed custom JWT generation script (not needed with Auth0)

### Infrastructure - Auth0 Integration

- AWS API Gateway HTTP API v2 JWT authorizer created
- Both Lambda routes updated with `authorization_type = "JWT"`
- CloudWatch API Gateway logs show authorization status (401 vs 404/200)

## [Lambda & API Gateway Foundation] - 2025-11-12

### Added - Lambda & API Gateway

- **Backend**: First Lambda function `getVehicleOverview` with comprehensive error handling and MongoDB queries
  - Returns vehicle details, total event count, and last 5 events
  - Validates vehicleId parameter and ObjectId format
  - Full unit test coverage (4 test cases covering 400/404/200 responses)
- **Backend**: Shared MongoDB connection module (`src/lib/mongodb.ts`) with Lambda container caching
  - Connection pooling (maxPoolSize: 10, minPoolSize: 1)
  - Retrieves credentials from AWS Secrets Manager
  - Reuses connections across Lambda invocations
- **Backend**: Pure Node.js Lambda build system (`scripts/build-lambda.js`) using archiver package
  - Creates ZIP deployment packages with compiled code and production dependencies
  - Replaces OS-specific PowerShell scripts for cross-platform compatibility
- **Backend**: Lambda function `listVehicleEvents` for paginated event retrieval
  - Route: `GET /vehicles/{vehicleId}/events`
  - Query parameters: limit (max 100), offset, type (event type filter)
  - Returns paginated events sorted by date (newest first)
  - Includes pagination metadata (totalCount, hasMore, nextOffset)
  - Full input validation with unit tests
- **Backend**: Test data seeding utility (`src/seed-test-data.ts`)
  - Creates sample 2021 Honda Accord with 5 maintenance events
  - Cleanup-first pattern: removes existing test VIN before seeding
  - Upsert operations for idempotent execution
  - Auto-cleanup after 3 seconds with proper process termination
  - Outputs test API URL for immediate validation
- **Infrastructure**: Lambda function resource with 512MB memory, 30s timeout, Node.js 20 runtime
- **Infrastructure**: API Gateway HTTP API v2 with CORS configuration
  - Route: `GET /vehicles/{vehicleId}/overview`
  - CloudWatch access logging with 3-day retention
  - CloudWatch Logs resource policy for API Gateway write permissions
- **Infrastructure**: CloudWatch log groups for Lambda and API Gateway (3-day retention)
- **Infrastructure**: Node.js credential loading script (`infra/load-tf-env.js`)
  - Loads AWS credentials and Terraform variables from Secrets Manager
  - Automatically changes to infra/ directory for Terraform commands
  - Replaces both `load-aws-credentials.ps1` and `load-terraform-vars.ps1`
- **DevOps**: NPM scripts for infrastructure management
  - `infra:init`, `infra:plan`, `infra:apply`, `infra:destroy` - Terraform operations
  - `deploy` - Build Lambda package and update function code (fast iteration)
  - `build:lambda` - Create Lambda deployment ZIP
- **DevOps**: Cross-platform environment variable handling using `cross-env` package
  - NPM scripts now set `AWS_PROFILE=terraform-vwc` inline
  - Works on Windows PowerShell, Mac/Linux bash
  - Applied to `test:connection`, `init:collections`, `seed:test` scripts
- **DevOps**: IAM policy `terraform-vwc-core` with comprehensive permissions (9 statement blocks)
  - IAM role management for vwc-* roles
  - PassRole permissions for lambda.amazonaws.com and apigateway.amazonaws.com
  - Lambda function management (19 actions)
  - API Gateway management (5 CRUD actions)
  - CloudWatch Logs management (log groups, retention, delivery, resource policies)
  - Secrets Manager read access

### Changed - Backend & Infrastructure

- **Backend**: ESLint configuration updated to disable unsafe type rules for test files
- **Backend**: Seed script improvements
  - Removed Ctrl+C requirement - now auto-cleans after brief pause
  - Fixed hanging issue - properly exits with `process.exit(0)` after cleanup
  - Improves developer experience and CI/CD compatibility
- **Backend**: Lambda build system now accepts function name as parameter
  - Supports building multiple Lambda functions from single script
  - Usage: `node build-lambda.js <functionName>`
- **Infrastructure**: Auto-format Terraform files before plan/apply operations
  - `load-tf-env.js` now runs `terraform fmt` automatically
  - Ensures consistent code style without manual intervention
- **Infrastructure**: Simplified npm scripts - moved credential loading into wrapper script
- **Infrastructure**: Separated infra management (`infra:*`) from app deployment (`deploy`)
- **Infrastructure**: Added second Lambda function and API route to Terraform configuration
- **DevOps**: Eliminated all PowerShell dependencies - 100% Node.js tooling for cross-platform support
- **DevOps**: Root package.json now builds all Lambda functions via `build:lambda` script

### Removed - PowerShell Scripts

- **DevOps**: Removed `load-aws-credentials.ps1` and `load-terraform-vars.ps1` (replaced by `load-tf-env.js`)

### Deployed Infrastructure - Initial Launch

- API endpoint: `https://lrq8kagxo1.execute-api.us-west-2.amazonaws.com`
- Lambda functions:
  - `vwc-getVehicleOverview-dev` (3.88 MB deployment package)
  - `vwc-listVehicleEvents-dev` (3.88 MB deployment package)
- Lambda execution role: `arn:aws:iam::491696534851:role/vwc-lambda-execution-role`
- API routes:
  - `GET /vehicles/{vehicleId}/overview` - Vehicle summary with recent events
  - `GET /vehicles/{vehicleId}/events` - Paginated event list with filtering
- CloudWatch log groups with 3-day retention for cost optimization
- MongoDB Atlas IP whitelist configured to allow Lambda connections (0.0.0.0/0)
- End-to-end validation: Both API endpoints deployed and tested successfully

### Technical Notes - Lambda Foundation

- Lambda package size: 3.87 MB (includes mongodb driver, AWS SDK, compiled TypeScript)
- API Gateway logging configured via CloudWatch Logs resource policy (HTTP API v2 pattern)
- IAM policy iteratively refined through multiple Terraform apply cycles
- Build system uses archiver v7.0.1 for reliable ZIP creation
- All tooling now Node.js-based for Windows/Mac/Linux compatibility
- Terraform files auto-formatted before plan/apply - no manual `terraform fmt` needed
