Plan: Per-merchant custom pickup note for daily pickup orders

1. Schema change
- Add a new column `pickup_note` (text, nullable) to `public.profiles`.
- Update the `maybe_create_pickup_order` trigger function so the generated pickup order uses `COALESCE(p.pickup_note, '[ABHOLUNG] Automatisch generierter Abhol-Auftrag')` as the order note.

2. Admin UI
- Add `pickup_note` to the `MerchantProfile` interface in `src/pages/admin/HaendlerDetailPage.tsx`.
- Add a textarea in the pickup settings section on the settings tab so admins can enter and save a custom note for the merchant.
- Include the note in the `AdminEditMerchantDialog` props and form as well, so it can be edited from the merchant list dialog, and keep the profile state in sync after saving.

3. Type generation
- Update the generated Supabase types so the new column is known in the client. Re-run the TypeScript generator after the migration is applied.

4. Verification
- Deploy the function and verify the migration creates the column. Create or update a merchant's pickup note and confirm the next auto-generated pickup order carries that note.