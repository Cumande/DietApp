# Deployment: UX update without sign-in

The owner requested publication of UX changes only, retaining existing no-login
access. No email or PIN is required. Anyone who knows the API address can read
or modify the shared tracker and call estimates. This release is not private.

## Configuration

Server-only Vercel variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
OPENAI_API_KEY (meal estimates). Never put secret keys in HTML or GitHub.
Framework: Other. Build: npm run build. Output directory: .

The additive supabase/secure-sync.sql migration was applied on 2026-10-02.
The existing data row was not replaced. Its diet_apply_changes RPC provides
atomic field updates and conflict detection. The unused diet_owner table
has no effect on this release. For a NEW installation only, apply schema.sql
followed by secure-sync.sql. Never reinitialize an existing state to fix sync.

The training and nutrition update stores editable targets under the `profile`
sync scope. The existing project RPC was updated on 2026-10-09 to allow this
scope without rewriting tracker data. For another existing project, run
`supabase/profile-settings-scope.sql` in the Supabase SQL Editor before deploy.

## Sync and UX

- Edits save automatically; offline edits remain on the device until saved.
- Refresh on returning, clicking sync, and every 90 visible seconds.
- ETag/304 avoids downloading unchanged history.
- Conflict review offers saved or local values per field, preserving other edits.
- Meal, weight and run deletions can be undone on the same device.
- Older pending changes without a baseline require explicit review.
- Older open app versions must reload before saving with the updated API.
- Food portions, recent foods, favorites, workout sets, direct performance
  fields, expandable history and selectable chart points are available.
- The weekly schedule is four lifting days, Tuesday 5K, Thursday full rest,
  and Sunday rest. Old dated workout records remain in the history.

## Checks

npm test covers no-login API access, field validation, conflict response handling,
offline reload, meals, weights, workouts and AI.
npm run build prepares the static app; it is not a compilation check.
Browser checks use fixtures. Do not insert test meals into production.
