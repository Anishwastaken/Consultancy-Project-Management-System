"""Writes the Test Cycle 1 results (testing/results.json, ui_results.json) into
../lab8/Lab8_T086.docx. Only the results side changes; formatting is kept by
reusing each cell's first run.

    python testing/update_docx.py
"""

import copy
from pathlib import Path

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

ROOT = Path(__file__).resolve().parent.parent
DOCX = ROOT.parent / 'lab8' / 'Lab8_T086.docx'
EV = ROOT / 'testing' / 'evidence'

d = docx.Document(str(DOCX))
P = d.paragraphs
T = d.tables


def set_runs(p, segments):
    """Replace a paragraph's text with [(text, bold)] segments, keeping the first run's font."""
    template = p.runs[0]._r
    for r in list(p.runs):
        r._r.getparent().remove(r._r)
    for text, bold in segments:
        r = copy.deepcopy(template)
        p._p.append(r)
        run = docx.text.run.Run(r, p)
        run.text = text
        run.bold = bold


def set_cell(cell, text):
    first, *rest = cell.paragraphs
    for extra in rest:
        extra._p.getparent().remove(extra._p)
    set_runs(first, [(text, first.runs[0].bold)])


def set_lines(cell, lines):
    """Monospace chart cell: one paragraph per line."""
    paras = cell.paragraphs
    for p in paras[len(lines):]:
        p._p.getparent().remove(p._p)
    while len(cell.paragraphs) < len(lines):
        cell.paragraphs[-1]._p.addnext(copy.deepcopy(cell.paragraphs[-1]._p))
    for p, line in zip(cell.paragraphs, lines):
        set_runs(p, [(line, None)])


def replace_in_cell(cell, old, new):
    for p in cell.paragraphs:
        for r in p.runs:
            if old in r.text:
                r.text = r.text.replace(old, new)


# ------------------------------------------------------------ 46.1 --
env = T[1]
set_cell(env.cell(1, 1), 'CPTS build of Assignment 7 (React 19 + Vite front end, Express 5 API, MySQL 9.5), run locally against a '
         'separate test database (cpts_test). The sample data (Section 41.8 baseline) is restored through the API before every input.')
set_cell(env.cell(2, 1), 'Dr. Meera Iyer (Faculty Consultant), Prof. Sanjay Mehta (Proposal Approver, the only Active approver), Neha Gupta '
         '(Finance/Accounts Officer); Rohit Verma (Administrator) only to deactivate the approver for TC-01 B. Sign-in is password plus '
         'one-time code.')
set_cell(env.cell(3, 1), 'Chrome 157.0.8103.80 and Edge 157.0.4341.60 on Windows 11, driven with Playwright. Firefox 137 is installed but '
         'was not run (Playwright cannot drive the installed Firefox).')
set_cell(env.cell(4, 1), 'The build has no setting for invoice reservation or the payment-to-invoice limit; the limit is always applied '
         '(DEF-04). Direct requests go to the single action endpoint POST /api/actions, which answers rule refusals with HTTP 200 and a message.')
set_cell(env.cell(5, 1), 'Notification e-mail (SMTP link A16): the build e-mails only sign-in codes. Fixtures that the schema cannot hold '
         '(agreement status other than Finalized; project without a budget).')
set_cell(T[2].cell(4, 1), 'Approved / Finalized / Active; budget ₹6,00,000; invoice T117 (INV/2026/016) and payment T118 (₹1,50,000 each, '
         'ref UTR HDFC26091577310); available ₹4,50,000.')

# ------------------------------------------------------------ 46.4 --
for cell in (T[16].cell(4, 1), T[17].cell(3, 1), T[17].cell(4, 1)):
    replace_in_cell(cell, 'T114', 'T117')
    replace_in_cell(cell, 'PAY-2026-031', 'UTR HDFC26091577310')

# ---------------------------------------------------- 47 execution log --
set_runs(P[36], [('Test Cycle 1 (executed 20 November 2026): 17 of 18 test cases executed, through the API with a script and through '
                  'the UI in Chrome and Edge. A test case passes only if all of its executed inputs give the expected behaviour and '
                  'state. The build answers rule refusals with HTTP 200 and a message instead of the 4xx codes of Section 43.8, so '
                  'differences in status code, error code or wording are noted in Remarks.', None)])

LOG = {
    'TC-01': ('A: P050 Submitted, submission date set, "Proposal submitted" notification for Prof. Sanjay Mehta, toast "Proposal submitted. '
              'P050 is now with the Proposal Approver...". B: approver Inactive; P050 Submitted, nobody notified, same success toast, no warning.',
              'Fail', 'DEF-01'),
    'TC-02': ('Refused; banner "7 of 13 required fields are incomplete. Complete proposed budget, end date, scope of work, deliverables, '
              'milestones, expected outcomes, terms and conditions before submitting"; toast "Complete the missing information before '
              'submitting."; P049 Draft; no notification.', 'Pass', 'HTTP 200 with message, no 422 code.'),
    'TC-03': ('Submit button not shown for P046 or P042. Direct request refused: "Only drafts can be submitted. P046 is Submitted (BR-004)." '
              '(P042: Approved); no change.', 'Pass', 'HTTP 200 with message, no NOT_DRAFT code.'),
    'TC-04': ('B1, B3 refused ("1 required field is incomplete." with the field message). B2 submitted, ₹0.01 stored. B4 (end = start) '
              'refused: "End date must be after the start date."', 'Fail', 'DEF-02'),
    'TC-05': ('Opening moved P046 to Under Review; Approved; eligible for agreement; toast "Proposal approved. Dr. Meera Iyer has been '
              'notified."; "Proposal approved" notification created.', 'Pass', '—'),
    'TC-06': ('Rejected; reason stored; consultant notified; toast "Proposal rejected. Dr. Meera Iyer has been notified."', 'Pass', '—'),
    'TC-07': ('B1, B2: "Give the consultant a reason so they can revise the proposal." shown; the server also refuses ("Give a reason for '
              'the rejection (FR-013)."); P046 stays Under Review. B3: rejection recorded.', 'Pass',
              'Whitespace-only reason is trimmed and refused.'),
    'TC-08': ('Server refuses a second decision ("A decision has already been recorded for P046."); one approval row. A: stale tab still '
              'offered Approve/Reject. B: stale tab showed "Proposal rejected..." while P046 stayed Approved. C: opening Draft P050 was '
              'ignored silently.', 'Fail', 'DEF-03'),
    'TC-09': ('A: approval, proposal (Approved), audit and notification rows written together. B: audit insert failed; HTTP 500 "The change '
              'could not be saved to the database. Nothing was changed."; no rows; P046 Under Review.', 'Pass',
              'Failure injected with a MySQL trigger in the test database.'),
    'TC-10': ('T121 recorded; "Payment recorded. T121 · ₹1,00,000"; received ₹2,62,000 of ₹5,40,000; available ₹2,78,000.', 'Pass', '—'),
    'TC-11': ('B1 refused ("Complete the transaction details."). B2 recorded, available ₹3,77,999.99. B3 refused: "Amount is more than the '
              '₹1,62,000 outstanding on INV/2026/018." B4, B5 refused with MSG-15 text. B6 recorded, shown as ₹1,000, stored as 1000.01.',
              'Fail', 'DEF-04 (B3), DEF-05 (B6)'),
    'TC-12': ('A refused: "PR029 is cancelled. Cancelled projects cannot accept new transactions." D refused ("Complete the transaction '
              'details."). Nothing recorded.', 'Pass',
              'B, C not run (fixtures not representable, Section 46.1). D gives a generic message, not MSG-20.'),
    'TC-13': ('A, B refused: "Amount is more than the ₹0 outstanding on INV/2026/016."; PR031 balance stays ₹4,50,000.', 'Pass',
              'Stopped by the invoice check first; the same reference on PR027 gives "Already recorded as T118".'),
    'TC-14': ('A: invoice recorded; invoiced ₹3,84,000, available ₹3,78,000; audit and notification rows added. B: notification insert '
              'failed; HTTP 500; no rows; summary unchanged; the next payment was accepted.', 'Pass', 'Failure injected with a MySQL trigger.'),
    'TC-15': ('Chrome and Edge: same results; submit, approval and payment confirmations shown; P050 Approved; PR027 available ₹2,78,000.',
              'Pass', 'Firefox not run. All roles land on the Dashboard, not SCR-02/04/06.'),
    'TC-16': ('A: 401 with the same message for both. B, C, D refused with role messages; no change. E: the UI blocks P045, but GET '
              '/api/state returns P045 to Dr. Meera Iyer (HTTP 200). F: 401, sign in again.', 'Fail', 'DEF-06'),
    'TC-17': ('—', 'Not Executed', 'The build sends e-mail only for sign-in codes; there is no notification e-mail to test.'),
    'TC-18': ('Both parallel ₹2,00,000 payments refused ("Amount is more than the ₹1,62,000 outstanding on INV/2026/018."). Probe with '
              '2 × ₹1,00,000: first recorded, second refused. Received never exceeded ₹5,40,000.', 'Fail',
              'DEF-04. Requests are applied one at a time.'),
}
log = T[23]
for row in log.rows[1:]:
    tc = row.cells[0].text.strip()
    actual, status, remark = LOG[tc]
    set_cell(row.cells[1], actual)
    set_cell(row.cells[2], status)
    set_cell(row.cells[3], remark)

# ------------------------------------------------------- 47 defects --
DEFECTS = [
    ('DEF-01', 'TC-01', 'No warning when no Active Proposal Approver exists',
     'As Rohit Verma deactivate Prof. Sanjay Mehta; as Dr. Meera Iyer open P050; Submit for approval.',
     'Committed with warning NO_APPROVER_AVAILABLE; MSG-22 shown.',
     'Normal success toast; P050 Submitted; no approver notified; no warning (Figure 18).', 'Medium', 'Medium'),
    ('DEF-02', 'TC-04', 'End date equal to the start date is rejected',
     'As Dr. Meera Iyer edit P050; start 07/12/2026, end 07/12/2026; Submit for approval.',
     'Submitted; MSG-C1 (FR-007: end date on or after start date).',
     'Refused: "End date must be after the start date."; toast "1 required field is incomplete." (Figure 19).', 'Medium', 'Medium'),
    ('DEF-03', 'TC-08', 'Stale tab shows success for a decision the server refused',
     'As Prof. Sanjay Mehta open P046 on SCR-05 in two tabs; approve in one; reject in the other within 4 s.',
     'HTTP 409 VERSION_CONFLICT; MSG-08 "This record was changed by another user. Reload the page and try again."',
     'Second tab shows "Proposal rejected. Dr. Meera Iyer has been notified."; server keeps Approved (one approval row); tab switches to '
     'Approved about 4 s later with no message (Figure 20).', 'High', 'High'),
    ('DEF-04', 'TC-11, TC-18', 'Payment-to-invoice limit is always applied',
     'As Neha Gupta, SCR-07 for PR027; Payment of ₹3,78,000 against INV/2026/018; Record payment.',
     'Recorded, balance ₹0.00, with the limit disabled (Section 44.5).',
     'Refused: "Amount is more than the ₹1,62,000 outstanding on INV/2026/018."; the build has no setting for the limit (Figure 21).',
     'Medium', 'Medium'),
    ('DEF-05', 'TC-11', 'Amount with three decimals is accepted and rounded',
     'As Neha Gupta, SCR-07 for PR027; Payment of 1000.005 against INV/2026/018; Record payment.',
     'MSG-19; HTTP 422 VALIDATION_FAILED; nothing recorded.',
     'T121 recorded and shown as ₹1,000; the database stores 1000.01 while the server copy keeps 1000.005. A direct request is also '
     'accepted (Figure 22).', 'Medium', 'Medium'),
    ('DEF-06', 'TC-16', 'Any signed-in user can read every record through the API',
     'Sign in as Dr. Meera Iyer; send GET /api/state with the session token; look for P045.',
     'HTTP 404 NOT_FOUND for another consultant\'s proposal (NFR-005).',
     'HTTP 200 with the whole database, including P045 of Dr. Vikram Shekhawat; only the screen hides it (Figure 23).', 'High', 'High'),
]

defect_tbl = T[24]
spacer = copy.deepcopy(P[38]._p)
second = copy.deepcopy(defect_tbl._tbl)
defect_tbl._tbl.addnext(second)
second_tbl = docx.table.Table(second, defect_tbl._parent)
for tbl, group in ((defect_tbl, DEFECTS[:3]), (second_tbl, DEFECTS[3:])):
    for col, (did, tc, title, steps, exp, act, sev, pri) in enumerate(group, start=1):
        for row, value in enumerate((did, tc, title, steps, exp, act, sev, pri, 'Open')):
            set_cell(tbl.cell(row, col), value)

set_runs(P[38], [('Defect reports.', True), (' Each defect traces to the failed test case(s) that found it. Figures 18 to 23 show each '
                                             'defect; all screenshots are kept in the project\'s testing/evidence folder, with the '
                                             'scripts and raw results in testing/.', None)])

# a blank paragraph between the two defect tables
gap = copy.deepcopy(spacer)
second.addprevious(gap)
for r in gap.findall('.//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}r'):
    gap.remove(r)

# ------------------------------------------------------- 47 figures --
FIGS = [
    ('UI-TestEvidence-DEF01-SCR08A.png', 'Figure 18. DEF-01: P050 submitted with no Active approver, normal confirmation.'),
    ('UI-TestEvidence-DEF02-SCR03.png', 'Figure 19. DEF-02: end date equal to the start date refused.'),
    ('UI-TestEvidence-DEF03-SCR05.png', 'Figure 20. DEF-03: "Proposal rejected" shown while P046 is Approved.'),
    ('UI-TestEvidence-DEF04-SCR07.png', 'Figure 21. DEF-04: ₹3,78,000 refused by the invoice limit.'),
    ('UI-TestEvidence-DEF05-SCR08C.png', 'Figure 22. DEF-05: 1000.005 recorded and shown as ₹1,000.'),
    ('UI-TestEvidence-DEF06-API.png', 'Figure 23. DEF-06: GET /api/state returns P045 to Dr. Meera Iyer.'),
]
caption_tpl = P[51]
fig_tbl = d.add_table(rows=3, cols=2)
gap2 = copy.deepcopy(gap)  # keeps Word from merging the figure grid into the defect table
second.addnext(gap2)
gap2.addnext(fig_tbl._tbl)
for i, (img, caption) in enumerate(FIGS):
    cell = fig_tbl.cell(i // 2, i % 2)
    pic = cell.paragraphs[0]
    pic.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pic.add_run().add_picture(str(EV / img), width=Inches(3.05))
    cap = copy.deepcopy(caption_tpl._p)
    cell._tc.append(cap)
    cap_p = docx.text.paragraph.Paragraph(cap, cell)
    set_runs(cap_p, [(caption, None)])
    for r in cap_p.runs:
        r.italic = True
        r.font.size = Pt(10)

# ------------------------------------------------------------ 48.1 --
RTM = {
    'FR-001': 'TC-16 Fail (DEF-06); TC-15 Pass', 'FR-002': 'TC-16 Fail (DEF-06)', 'FR-005': 'TC-16 Fail (DEF-06); TC-15 Pass',
    'FR-007': 'TC-01 Fail (DEF-01), TC-04 Fail (DEF-02); TC-02 Pass', 'FR-010': 'TC-01 Fail (DEF-01), TC-04 Fail (DEF-02); others Pass',
    'FR-011': 'TC-08 Fail (DEF-03); others Pass', 'FR-012': 'Pass', 'FR-013': 'Pass', 'FR-022': 'Pass',
    'FR-023': 'TC-11 Fail (DEF-04, DEF-05); others Pass', 'FR-024': 'TC-11 Fail (DEF-04, DEF-05); TC-18 Fail (DEF-04)',
    'FR-025': 'Pass', 'FR-027': 'Pass', 'FR-028': 'Pass', 'FR-037': 'TC-01 Fail (DEF-01); TC-17 Not Executed; others Pass',
    'BR-001': 'TC-16 Fail (DEF-06)', 'BR-002': 'Pass', 'BR-003': 'Pass', 'BR-004': 'TC-01 Fail (DEF-01); TC-03 Pass', 'BR-005': 'Pass',
    'BR-006': 'TC-11 Fail (DEF-04, DEF-05); TC-18 Fail (DEF-04); TC-10 Pass', 'BR-007': 'TC-16 Fail (DEF-06); TC-10 Pass',
    'BR-008': 'Pass', 'BR-010': 'Pass', 'NFR-003': 'TC-18 Fail (DEF-04)', 'NFR-004': 'TC-16 Fail (DEF-06)',
    'NFR-005': 'TC-16 Fail (DEF-06)', 'NFR-006': 'TC-16 Fail (DEF-06)', 'NFR-007': 'Pass', 'NFR-008': 'Pass',
    'NFR-009': 'TC-08 Fail (DEF-03); TC-02 Pass', 'NFR-011': 'TC-11 Fail (DEF-04, DEF-05); TC-18 Fail (DEF-04); TC-14 Pass',
    'NFR-018': 'Pass (Chrome, Edge)', 'NFR-019': 'TC-16 Fail (DEF-06)', 'NFR-020': 'Pass',
}
for row in T[25].rows[1:]:
    req = row.cells[0].text.strip()
    if req in RTM:
        set_cell(row.cells[4], RTM[req])

tbd = P[45]
set_runs(tbd, [(tbd.runs[0].text, True), (' FR-011 → TC-05, TC-08, TC-09, TC-15 (TC-08 Fail, DEF-03). FR-021 → its effect is tested by '
                                          'TC-11 (TC-12 input C could not be set up in this build). FR-016 (UC-008), FR-029 (UC-011) '
                                          'and FR-034 (UC-007) are outside the three use cases and carried to the next cycle.', None)])

# ------------------------------------------------------------ 48.2 --
m = T[26]
for row, value in enumerate(['18', '17', '11', '6 (TC-01, TC-04, TC-08, TC-11, TC-16, TC-18)', '1 (TC-17)',
                             '6 (DEF-01 Medium, DEF-02 Medium, DEF-03 High, DEF-04 Medium, DEF-05 Medium, DEF-06 High)',
                             '35 of 38 targeted FR/BR/NFR covered (92.11%); 35 of 38 by executed test cases (92.11%). FR 15/18, BR 9/9, '
                             'NFR 11/11. Not covered: FR-006, FR-008, FR-009 (UC-003 preconditions).'], start=1):
    set_cell(m.cell(row, 1), value)
set_runs(P[48], [('Test Pass Percentage', True), (' = (Passed / Executed) × 100 = (11 / 17) × 100 = ', None), ('64.71%', True)])
set_runs(P[49], [('Test Execution Percentage', True), (' = (Executed / Total Designed) × 100 = (17 / 18) × 100 = ', None), ('94.44%', True)])
for row, vals in enumerate([('4', '2', '2', '0'), ('5', '4', '1', '0'), ('5', '4', '1', '0'), ('4', '1', '2', '1'), ('18', '11', '6', '1')], start=1):
    for col, v in enumerate(vals, start=1):
        set_cell(T[27].cell(row, col), v)

set_lines(T[28].cell(0, 0), [
    'Execution status of the 18 test cases   (██ = 1 test case)', ' ',
    'Passed       │ ' + '██' * 11 + '  11 (61.1%)',
    'Failed       │ ' + ('██' * 6).ljust(22) + '   6 (33.3%)',
    'Not Executed │ ' + '██'.ljust(22) + '   1 (5.6%)',
    '             └─────────────────────────',
])
set_lines(T[29].cell(0, 0), [
    'Test cases per use case   (███ = 1 test case;  █ Pass  ▓ Fail  ░ Not Executed)', ' ',
    'UC-004         │ ' + ('██████▓▓▓▓▓▓').ljust(15) + '  4',
    'UC-005         │ ' + '████████████▓▓▓' + '  5',
    'UC-010         │ ' + '████████████▓▓▓' + '  5',
    'Cross-use-case │ ' + ('███▓▓▓▓▓▓░░░').ljust(15) + '  4',
    '               └──────────────────',
])
set_runs(P[51], [('Figure 24. Test execution status.', None)])
set_runs(P[52], [('Figure 25. Test cases per use case.', None)])
for p in (P[51], P[52]):
    p.runs[0].italic = True

# -------------------------------------------------------------- 49 --
for row, v in enumerate(['2 Pass, 2 Fail (DEF-01, DEF-02)', '4 Pass, 1 Fail (DEF-03)', '4 Pass, 1 Fail (DEF-04, DEF-05)',
                         '1 Pass, 2 Fail (DEF-04, DEF-06), 1 Not Executed'], start=1):
    set_cell(T[30].cell(row, 4), v)
set_runs(P[59], [('Each defect traces to the failed test case(s) that found it and, through the RTM, to its scenario, use case and '
                  'requirements.', None)])

replace_in_cell(T[31].cell(2, 1), 'DEF-01 and DEF-02', 'DEF-03')
replace_in_cell(T[31].cell(3, 1), 'DEF-03', 'DEF-04 and DEF-05')

d.save(str(DOCX))
print('saved', DOCX)
