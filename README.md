# CPTS — Consultancy Project Tracking System (prototype)

Interactive prototype for CS314 Software Development Lab, Team T086. It implements the
requirements, business rules and UML models from Lab Assignments 1–5 using sample data.

> Prototype only: authentication is simulated, data lives in the browser (localStorage),
> and no e-mail, payment gateway or external system is connected.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
```

Requires Node 18+.

## Demo accounts

Password for every account: `demo123` (also selectable on the sign-in page).

| Account | Role |
|---|---|
| meera.iyer@cpts.demo | Faculty Consultant (R01) |
| sanjay.mehta@cpts.demo | Proposal Approver (R02) |
| rohit.verma@cpts.demo | Administrator (R03) |
| neha.gupta@cpts.demo | Finance/Accounts Officer (R04) |
| anand.krishnan@cpts.demo | Institute Management (R05) |

Switch accounts from the avatar menu (top right). **Reset sample data** in the same menu
restores the original data before a demo.

## Suggested demo script

1. **UC-004 Submit Proposal** — as Meera: *New proposal* → click *Submit for approval*
   with empty fields (validation) → fill the form → submit. Or open draft P050 and submit
   it; P049 is deliberately incomplete.
2. **UC-005 / UC-006 Approve or Reject** — as Prof. Mehta: *Review queue* → open the
   proposal (status moves to Under Review) → Approve (stamp appears) or Reject (reason
   required). A decided proposal can’t be decided again.
3. **UC-007 Finalize Agreement** — open P044 (approved) → *Finalize agreement* → a project
   (PR032) is created and accounts are notified to record its budget.
4. **UC-010 Record Finance Transaction** — as Neha: *Finance* → *Record transaction*.
   The four checks of State Diagram 02 run live:
   - PR032: an invoice before a budget is refused (BR-003); record the budget first.
   - An invoice above the remaining budget is refused (BR-006).
   - Reusing payment reference `UTR HDFC26091577310` is refused as a duplicate of T118 (BR-005).
   - PR029 is cancelled, so it refuses any transaction (BR-010).
5. Check the dashboard, notifications and audit log (as Rohit) for the effects.

The Lab 4 object-diagram instance is in the data: client C017, proposal P042,
agreement A031, project PR031, payment T118 of ₹1,50,000 recorded by U104.

## Structure

```
src/
  data/       types.ts (class model, Lab 4 §33) · seed.ts (sample data)
  store/      rules.ts (business rules BR-001…BR-010, UC checks)
              store.tsx (actions per use case, notifications, audit log)
              scope.ts (role-based visibility)
  components/ Shell (navigation by role), ui (design system), domain (lifecycle, charts)
  pages/      Dashboard, Proposals, ProposalForm, Approvals, Agreements, Projects,
              Finance, Clients, Notifications, Users, Audit, Reports
```
