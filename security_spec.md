# Security Specification - Bank Simulation App

## Data Invariants
1. A **User Profile** can only be created by the user themselves or an admin. Users cannot change their own `role` or `status` once established.
2. **Simulations** must be associated with the user who created them (`userId`).
3. **Proposals** must reference a valid user.
4. **WhatsApp Sessions** are identified by phone numbers or session IDs. They are volatile and used for flow tracking.
5. **Admin privileges** are strictly controlled and verified against a trusted document or hardcoded email list for initial bootstrap.

## The "Dirty Dozen" Payloads (Red Team Test Cases)
1. **Identity Spoofing**: User A attempts to read User B's profile.
2. **Privilege Escalation**: User A (corretor) attempts to update their own role to 'admin'.
3. **Status Corruption**: Use A attempts to activate their own account when it is 'pending'.
4. **Data Injection**: Malicious user attempts to inject 1MB of junk data into a BankRule document ID.
5. **Orphaned Simulation**: User attempts to create a simulation with a fake `userId`.
6. **Cross-User Access**: User A attempts to list simulations belonging to User B.
7. **WhatsApp Scraping**: Unauthenticated user attempts to `list` all active WhatsApp sessions.
8. **Settings Tampering**: Non-admin attempts to change the promoter branding (`/settings/promoter`).
9. **Log Tampering**: Non-admin attempts to delete or modify WhatsApp logs.
10. **Rule Bypass**: User attempts to update a BankRule with a string in a number field.
11. **Timestamp Spoofing**: User attempts to set a `createdAt` date in the past.
12. **Immutable Field Change**: User attempts to change the `userId` associated with an existing Proposal.

## Test Runner (Logic Outline)
The rules will be verified using the following logic in `firestore.rules.test.ts`.

```typescript
// Example test cases
it('should deny non-admin from listing WhatsApp sessions', async () => {
  const db = getFirestore(corretorAuth);
  await assertFails(getDocs(collection(db, 'whatsappSessions')));
});

it('should allow admin to list WhatsApp sessions', async () => {
  const db = getFirestore(adminAuth);
  await assertSucceeds(getDocs(collection(db, 'whatsappSessions')));
});

it('should prevent user from changing their own role', async () => {
  const db = getFirestore(corretorAuth);
  await assertFails(updateDoc(doc(db, 'users', corretorUid), { role: 'admin' }));
});
```
