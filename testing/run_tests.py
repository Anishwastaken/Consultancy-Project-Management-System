"""Lab 8 test run: executes TC-01..TC-18 (where possible) against a separate CPTS
API instance on port 3101 using the throwaway MySQL database `cpts_test`.

The real `cpts` database and the app code are not touched. Each input starts
from the sample data (POST /api/reset). Results go to testing/results.json.

    python testing/run_tests.py
"""

import hashlib, hmac, base64, json, os, re, subprocess, sys, threading, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TESTING = ROOT / 'testing'
DATA_DIR = TESTING / '.data'
PORT = 3101
BASE = f'http://localhost:{PORT}'
TEST_DB = 'cpts_test'
MYSQL = r'C:\mysql\bin\mysql.exe'


def load_env():
    env = {}
    for line in (ROOT / '.env').read_text(encoding='utf-8').splitlines():
        m = re.match(r'\s*([A-Z_]+)\s*=\s*(.*)$', line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"')
    return env


ENV = load_env()


def sql(query):
    e = dict(os.environ, MYSQL_PWD=ENV.get('MYSQL_PASSWORD', ''))
    r = subprocess.run([MYSQL, '-u', ENV.get('MYSQL_USER', 'root'), '-h', ENV.get('MYSQL_HOST', 'localhost'), '-P', ENV.get('MYSQL_PORT', '3306'), '--table', '-e', query],
                       capture_output=True, text=True, env=e, encoding='utf-8')
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


# ------------------------------------------------------------- server --

log_lines = []


def start_server():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    sql(f'DROP DATABASE IF EXISTS `{TEST_DB}`')
    env = dict(os.environ, MYSQL_DATABASE=TEST_DB, PORT=str(PORT), CPTS_DATA_DIR=str(DATA_DIR), SMTP_HOST='', SMTP_USER='', SMTP_PASS='', DATA_STORE='mysql')
    p = subprocess.Popen(['node', 'node_modules/tsx/dist/cli.mjs', 'server/index.ts'], cwd=ROOT, env=env,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8')

    def pump():
        for line in p.stdout:
            log_lines.append(line.rstrip())
    threading.Thread(target=pump, daemon=True).start()
    for _ in range(120):
        if any('listening' in l for l in log_lines):
            return p
        if p.poll() is not None:
            break
        time.sleep(0.5)
    print('\n'.join(log_lines))
    raise SystemExit('server did not start')


def http(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')


def otp_for(email, after):
    for _ in range(40):
        for l in log_lines[after:]:
            m = re.search(rf'Code for {re.escape(email)}: (\d{{6}})', l)
            if m:
                return m.group(1)
        time.sleep(0.25)
    raise RuntimeError(f'no OTP for {email}')


def login(email):
    n = len(log_lines)
    s, b = http('POST', '/api/login', {'email': email, 'password': 'demo123'})
    assert s == 200, (s, b)
    s, b = http('POST', '/api/login/verify', {'challengeId': b['challengeId'], 'code': otp_for(email, n)})
    assert s == 200, (s, b)
    return b['token']


# ------------------------------------------------------------ helpers --

T = {}


def act(who, name, *args):
    s, b = http('POST', '/api/actions', {'name': name, 'args': list(args)}, T[who])
    res = b.get('result')
    if isinstance(res, dict):
        res = {k: v for k, v in res.items() if k != 'checks'}
    return {'http': s, 'result': res, 'error': b.get('error')}, b.get('db')


def state(who='meera'):
    return http('GET', '/api/state', token=T[who])[1]['db']


def reset():
    s, _ = http('POST', '/api/reset', token=T['rohit'])
    assert s == 200


def prop(db, pid):
    return next(p for p in db['proposals'] if p['id'] == pid)


def fin(db, prj):
    tx = [t for t in db['transactions'] if t['projectId'] == prj]
    budget = next((t['amount'] for t in tx if t['type'] == 'Budget'), None)
    inv = sum(t['amount'] for t in tx if t['type'] == 'Invoice')
    rec = sum(t['amount'] for t in tx if t['type'] == 'Payment')
    return {'budget': budget, 'invoiced': inv, 'received': rec, 'available': round((budget or 0) - rec, 3), 'txns': len(tx)}


def pay(prj, amount, ref, inv='T120', date='2026-10-26', typ='Payment'):
    return {'projectId': prj, 'type': typ, 'amount': amount, 'date': date, 'reference': ref, 'invoiceId': inv if typ == 'Payment' else '', 'note': ''}


def proposal_input(p, **changes):
    drop = {'id', 'status', 'createdAt', 'updatedAt', 'ownerId', 'submissionDate', 'agreementId'}
    d = {k: v for k, v in p.items() if k not in drop}
    d.update(changes)
    return d


def notes_for(db, recipient, text):
    return [n for n in db['notifications'] if n['recipientId'] == recipient and text in n['message']]


R = {}


def rec(tc, key, **obs):
    R.setdefault(tc, {})[key] = obs
    print(f'{tc} {key}: {json.dumps(obs, ensure_ascii=False)[:400]}')


# -------------------------------------------------------------- tests --

def tc01():
    reset()
    r, _ = act('meera', 'submitProposal', 'P050')
    db = state()
    p = prop(db, 'P050')
    rec('TC-01', 'A', **r, status=p['status'], submissionDate=p.get('submissionDate'),
        approverNotifications=[n['type'] + ' / ' + n['status'] for n in notes_for(db, 'U103', 'P050')])
    reset()
    r0, _ = act('rohit', 'toggleUserStatus', 'U103')
    r, _ = act('meera', 'submitProposal', 'P050')
    db = state()
    rec('TC-01', 'B', setup=r0, **r, status=prop(db, 'P050')['status'],
        sanjayStatus=next(u['status'] for u in db['users'] if u['id'] == 'U103'),
        approverNotifications=len([n for n in db['notifications'] if 'P050' in n['message'] and n['recipientId'] != 'U101']),
        warningInResponse='warning' in json.dumps(r))


def tc02():
    reset()
    r, _ = act('meera', 'submitProposal', 'P049')
    db = state()
    rec('TC-02', 'P049', **r, status=prop(db, 'P049')['status'], notifications=len(notes_for(db, 'U103', 'P049')))


def tc03():
    for pid in ('P046', 'P042'):
        reset()
        before = prop(state(), pid)['status']
        r, _ = act('meera', 'submitProposal', pid)
        rec('TC-03', pid, **r, before=before, after=prop(state(), pid)['status'])


def tc04():
    cases = {'B1': {'proposedBudget': 0}, 'B2': {'proposedBudget': 0.01},
             'B3': {'startDate': '2026-12-07', 'endDate': '2026-12-06'}, 'B4': {'startDate': '2026-12-07', 'endDate': '2026-12-07'}}
    for k, ch in cases.items():
        reset()
        p = prop(state(), 'P050')
        r, _ = act('meera', 'saveProposal', proposal_input(p, **ch), {'id': 'P050', 'submit': True})
        db = state()
        rec('TC-04', k, **{x: y for x, y in r.items() if x != 'result'}, ok=(r['result'] or {}).get('ok'), resultError=(r['result'] or {}).get('error'),
            status=prop(db, 'P050')['status'], storedBudget=prop(db, 'P050')['proposedBudget'])


def open_p046():
    reset()
    act('sanjay', 'openForReview', 'P046')
    return prop(state(), 'P046')['status']


def tc05():
    opened = open_p046()
    r, _ = act('sanjay', 'decideProposal', 'P046', 'Approved', 'Scope and budget are in order.')
    db = state()
    p = prop(db, 'P046')
    rec('TC-05', 'P046', afterOpen=opened, **r, status=p['status'], eligibleForAgreement=p['status'] == 'Approved' and not p.get('agreementId'),
        ownerNotified=[n['type'] for n in notes_for(db, 'U101', 'P046')])


def tc06():
    open_p046()
    r, _ = act('sanjay', 'decideProposal', 'P046', 'Rejected', 'Budget is not broken down by deliverable.')
    db = state()
    ap = [a for a in db['approvals'] if a['proposalId'] == 'P046']
    rec('TC-06', 'P046', **r, status=prop(db, 'P046')['status'], storedReason=ap[0]['comments'] if ap else None,
        ownerNotified=[n['type'] for n in notes_for(db, 'U101', 'P046')])


def tc07():
    for k, reason in (('B1', ''), ('B2', '   '), ('B3', 'X')):
        open_p046()
        r, _ = act('sanjay', 'decideProposal', 'P046', 'Rejected', reason)
        db = state()
        rec('TC-07', k, **r, status=prop(db, 'P046')['status'], approvalRows=len([a for a in db['approvals'] if a['proposalId'] == 'P046']))


def tc08():
    open_p046()
    r1, _ = act('sanjay', 'decideProposal', 'P046', 'Approved', '')
    r2, _ = act('sanjay', 'decideProposal', 'P046', 'Rejected', 'Second tab')
    db = state()
    rec('TC-08', 'A/B (API: second decision on P046)', first=r1, second=r2, status=prop(db, 'P046')['status'],
        approvalRows=len([a for a in db['approvals'] if a['proposalId'] == 'P046']))
    reset()
    r, _ = act('sanjay', 'openForReview', 'P050')
    rec('TC-08', 'C', **r, status=prop(state(), 'P050')['status'])


def counts_p046():
    return sql(f"USE {TEST_DB}; SELECT (SELECT COUNT(*) FROM approvals WHERE proposal_id='P046') approvals, "
               "(SELECT status FROM proposals WHERE proposal_id='P046') proposal_status, "
               "(SELECT COUNT(*) FROM audit_logs WHERE entity='P046' AND action='Approve proposal') audit_rows, "
               "(SELECT COUNT(*) FROM notifications WHERE recipient_id='U101' AND type='Proposal approved' AND message LIKE '%P046%') notification_rows")


def tc09():
    open_p046()
    before = counts_p046()
    r, _ = act('sanjay', 'decideProposal', 'P046', 'Approved', 'Scope and budget are in order.')
    rec('TC-09', 'A', **r, before=before, after=counts_p046())
    open_p046()
    sql(f"USE {TEST_DB}; CREATE TRIGGER t_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test double: audit write fails'")
    try:
        before = counts_p046()
        r, _ = act('sanjay', 'decideProposal', 'P046', 'Approved', 'Scope and budget are in order.')
        after = counts_p046()
        mem = prop(state(), 'P046')['status']
    finally:
        sql(f'USE {TEST_DB}; DROP TRIGGER IF EXISTS t_fail_audit')
    rec('TC-09', 'B', **r, before=before, after=after, serverCopyStatus=mem)


def tc10():
    reset()
    before = fin(state(), 'PR027')
    r, _ = act('neha', 'recordTransaction', pay('PR027', 100000, 'UTR HDFC26102699001'))
    rec('TC-10', 'PR027', **r, before=before, after=fin(state(), 'PR027'))


def tc11():
    amounts = {'B1': 0, 'B2': 0.01, 'B3': 378000, 'B4': 378000.01, 'B5': 900000, 'B6': 1000.005}
    for k, a in amounts.items():
        reset()
        r, _ = act('neha', 'recordTransaction', pay('PR027', a, f'UTR TC11{k}'))
        extra = {}
        if (r['result'] or {}).get('ok'):
            tid = r['result']['txn']['id']
            extra['dbAmount'] = sql(f"USE {TEST_DB}; SELECT transaction_id, amount FROM finance_transactions WHERE transaction_id='{tid}'")
        rec('TC-11', k, amount=a, **r, after=fin(state(), 'PR027'), **extra)


def tc12():
    reset()
    r, _ = act('neha', 'recordTransaction', pay('PR029', 10000, 'INV/2026/099', typ='Invoice'))
    rec('TC-12', 'A', **r, txnsAfter=fin(state(), 'PR029')['txns'])
    reset()
    r, _ = act('neha', 'recordTransaction', pay('PR027', 50000, 'UTR TC12D', inv='T117'))
    rec('TC-12', 'D (invoice T117 of PR031)', **r, txnsAfter=fin(state(), 'PR027')['txns'])


def tc13():
    for k, a in (('A', 150000), ('B', 10000)):
        reset()
        r, _ = act('neha', 'recordTransaction', pay('PR031', a, 'UTR HDFC26091577310', inv='T117', date='2026-09-15'))
        rec('TC-13', k, **r, after=fin(state(), 'PR031'))
    reset()
    r, _ = act('neha', 'recordTransaction', pay('PR027', 10000, 'UTR HDFC26091577310'))
    rec('TC-13', 'probe: same reference on an open invoice (PR027/T120)', **r, after=fin(state(), 'PR027'))


def counts_pr027():
    return sql(f"USE {TEST_DB}; SELECT (SELECT COUNT(*) FROM finance_transactions WHERE project_id='PR027') txns, "
               "(SELECT COALESCE(SUM(amount),0) FROM finance_transactions WHERE project_id='PR027' AND txn_type='Invoice') invoiced, "
               "(SELECT COALESCE(SUM(amount),0) FROM finance_transactions WHERE project_id='PR027' AND txn_type='Payment') received, "
               "(SELECT COUNT(*) FROM audit_logs) audit_rows, (SELECT COUNT(*) FROM notifications) notification_rows")


def tc14():
    reset()
    before = counts_pr027()
    r, _ = act('neha', 'recordTransaction', pay('PR027', 60000, 'INV/2026/019', typ='Invoice'))
    rec('TC-14', 'A', **r, before=before, after=counts_pr027(), summary=fin(state(), 'PR027'))
    reset()
    sql(f"USE {TEST_DB}; CREATE TRIGGER t_fail_notify BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test double: notification write fails'")
    try:
        before = counts_pr027()
        r, _ = act('neha', 'recordTransaction', pay('PR027', 100000, 'UTR TC14B'))
        after = counts_pr027()
        mem = fin(state(), 'PR027')
    finally:
        sql(f'USE {TEST_DB}; DROP TRIGGER IF EXISTS t_fail_notify')
    r2, _ = act('neha', 'recordTransaction', pay('PR027', 100000, 'UTR TC14B'))
    rec('TC-14', 'B', **r, before=before, after=after, serverCopy=mem, nextRequestAfterRemovingDouble=r2)


def tc16():
    s1, b1 = http('POST', '/api/login', {'email': 'meera.iyer@lnmiit.ac.in', 'password': 'wrong-password'})
    s2, b2 = http('POST', '/api/login', {'email': 'nobody.here@lnmiit.ac.in', 'password': 'demo123'})
    rec('TC-16', 'A', wrongPassword=[s1, b1.get('error')], unknownEmail=[s2, b2.get('error')])
    reset()
    r, _ = act('neha', 'submitProposal', 'P050')
    rec('TC-16', 'B', **r, status=prop(state(), 'P050')['status'])
    reset()
    r1, _ = act('meera', 'openForReview', 'P046')
    r2, _ = act('meera', 'decideProposal', 'P046', 'Approved', '')
    rec('TC-16', 'C', openForReview=r1, decide=r2, status=prop(state(), 'P046')['status'])
    reset()
    r, _ = act('meera', 'recordTransaction', pay('PR027', 50000, 'UTR TC16D'))
    rec('TC-16', 'D', **r, txnsAfter=fin(state(), 'PR027')['txns'])
    s, b = http('GET', '/api/state', token=T['meera'])
    p45 = next((p for p in b['db']['proposals'] if p['id'] == 'P045'), None)
    rec('TC-16', 'E (GET /api/state as Dr. Meera Iyer)', http=s, p045Returned=p45 is not None,
        p045Owner=p45 and p45['ownerId'], p045Budget=p45 and p45['proposedBudget'])
    key = bytes.fromhex((DATA_DIR / '.secret').read_text().strip())
    payload = f'U104.{int(time.time() * 1000) - 1000}'
    sig = base64.urlsafe_b64encode(hmac.new(key, payload.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
    before = fin(state(), 'PR027')['txns']
    s, b = http('POST', '/api/actions', {'name': 'recordTransaction', 'args': [pay('PR027', 50000, 'UTR TC16F')]}, f'{payload}.{sig}')
    rec('TC-16', 'F (expired token)', http=s, error=b.get('error'), txnsBefore=before, txnsAfter=fin(state(), 'PR027')['txns'])


def tc18():
    def both(a1, a2):
        reset()
        with ThreadPoolExecutor(2) as ex:
            f = [ex.submit(act, 'neha', 'recordTransaction', pay('PR027', a, f'UTR TC18-{i}-{a}')) for i, a in enumerate((a1, a2))]
            out = [x.result()[0] for x in f]
        return out, fin(state(), 'PR027')
    out, after = both(200000, 200000)
    rec('TC-18', '2 x 200000 in parallel', responses=out, after=after)
    out, after = both(100000, 100000)
    rec('TC-18', 'probe: 2 x 100000 in parallel', responses=out, after=after)


if __name__ == '__main__':
    proc = start_server()
    try:
        for who, email in (('meera', 'meera.iyer@lnmiit.ac.in'), ('sanjay', 'sanjay.mehta@lnmiit.ac.in'),
                           ('neha', 'neha.gupta@lnmiit.ac.in'), ('rohit', 'rohit.verma@lnmiit.ac.in')):
            T[who] = login(email)
        for fn in (tc01, tc02, tc03, tc04, tc05, tc06, tc07, tc08, tc09, tc10, tc11, tc12, tc13, tc14, tc16, tc18):
            try:
                fn()
            except Exception as e:
                rec(fn.__name__.upper().replace('TC', 'TC-'), 'ERROR', error=repr(e))
        reset()
        R['_meta'] = {'executed': time.strftime('%Y-%m-%d %H:%M'), 'api': BASE, 'database': TEST_DB}
        (TESTING / 'results.json').write_text(json.dumps(R, indent=2, ensure_ascii=False), encoding='utf-8')
        (TESTING / 'server.log').write_text('\n'.join(log_lines), encoding='utf-8')
    finally:
        proc.terminate()
