# Lab 8 test run

Test-only code. Nothing in the app was changed. The scripts use a separate MySQL database, `cpts_test`, which they drop and recreate on every run, plus a second API instance on port 3101. The real `cpts` database is never touched.

```bash
python testing/run_tests.py    # API checks          -> testing/results.json, testing/server.log
python testing/ui_tests.py     # Chrome/Edge checks  -> testing/ui_results.json, testing/evidence/*.png
python testing/update_docx.py  # writes the results into ../lab8/Lab8_T086.docx (run it on the original copy)
```

The scripts need MySQL running, `.env` filled in, and the Python packages `playwright`, `python-docx` and `pymupdf`. Every input starts from the sample data (`POST /api/reset`). The sign-in codes are read from the server log, because SMTP is off in the test instance.

TC-09 B and TC-14 B need a failing audit or notification write. The scripts get it by adding a MySQL trigger to `cpts_test` for the duration of that input, then dropping it.

## Results (executed 20 Nov 2026)

18 test cases were designed and 17 were executed: 11 passed and 6 failed. TC-17 was not executed.

- Pass rate: 11 / 17 = 64.71%
- Execution rate: 17 / 18 = 94.44%

| Defect | Test case | Severity |
|---|---|---|
| DEF-01: no warning when no Active approver exists | TC-01 B | Medium |
| DEF-02: end date equal to start date is rejected | TC-04 B4 | Medium |
| DEF-03: a stale tab shows "Proposal rejected" after the server refused the rejection | TC-08 A/B | High |
| DEF-04: the payment-to-invoice limit is always applied | TC-11 B3, TC-18 | Medium |
| DEF-05: a 3-decimal amount is accepted, shown as ₹1,000 and stored as 1000.01 | TC-11 B6 | Medium |
| DEF-06: `GET /api/state` returns every record to any signed-in user | TC-16 E | High |

The suspected defects from the draft behaved as follows:

- **Old DEF-01** (whitespace-only rejection reason): did not reproduce.
- **Old DEF-02** (version-conflict banner): replaced by DEF-03 above.
- **Old DEF-03** (3-decimal amount): reproduced, but the server accepts the amount too. The draft said the server rejected it.

## Differences between the docx and the app

- **API:** there are no REST routes. Every operation goes through one endpoint, `POST /api/actions {name, args}`. The approval operation is called `decideProposal`.
- **Errors:** business-rule refusals come back as HTTP 200 with a message. There are no 409/422 codes and no error codes. The only status codes used are 401 (session), 500 (database) and 400 (bad input).
- **Message wording:** it differs from MSG-xx in several places. MSG-11 and MSG-15 match.
- **Optimistic UI:** the UI checks the rules itself first. If a rule fails in the browser, no request is sent.
- **Landing page:** every role lands on the Dashboard after sign-in.
- **Notifications:** they are in-app only (Unread/Read). No notification e-mail is sent, which is why TC-17 was not executed.
- **IDs:** PR031's invoice is T117 (INV/2026/016), not T114. T118's reference is `UTR HDFC26091577310`, not PAY-2026-031. The baseline table and the TC-12/TC-13 inputs were changed to match.
- **Fixtures:** TC-12 B and C could not be set up. The agreement status can only be `Finalized`, and the app has no way to remove a project's budget.
- **Browsers:** Firefox 137 was not run.

## Changes made to Lab8_T086.docx

A backup of the original is at `../lab8/Lab8_T086.backup-before-results.docx`.

- **46.1:** the environment rows and the PR031 baseline row.
- **46.4:** TC-12 D and TC-13 now use T117 and the real payment reference.
- **47:** the intro line, all 18 log rows, and two defect tables (DEF-01 to DEF-06). Figures 18 to 23 are the defect screenshots.
- **48.1:** the Test result column of the RTM, and the Section 23 TBD paragraph.
- **48.2:** the metrics, the per-use-case table and both bar charts, which are now Figures 24 and 25.
- **49:** the Result column and the last bullet.
- **Contributions:** the defect numbers only.
- **Declaration:** unchanged. Its date is still 20 November 2026.
