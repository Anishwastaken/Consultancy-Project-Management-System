"""Lab 8 browser checks and screenshots (Playwright, installed Chrome and Edge).

Starts the test API (port 3101, database cpts_test) and a Vite dev server on
port 5273 that proxies to it, then drives the real UI. Screenshots go to
testing/evidence/, observations to testing/ui_results.json.

    python testing/ui_tests.py
"""

import json, os, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import run_tests as rt  # noqa: E402

WEB = 'http://localhost:5273'
EV = rt.TESTING / 'evidence'
EMAIL = {'meera': 'meera.iyer@lnmiit.ac.in', 'sanjay': 'sanjay.mehta@lnmiit.ac.in', 'neha': 'neha.gupta@lnmiit.ac.in'}
U = {}


def note(key, **obs):
    U[key] = obs
    print(key, json.dumps(obs, ensure_ascii=False)[:500])


def start_web():
    env = dict(os.environ, PORT=str(rt.PORT))
    p = subprocess.Popen(['node', 'node_modules/vite/bin/vite.js', '--port', '5273', '--strictPort'], cwd=rt.ROOT, env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            urllib.request.urlopen(WEB)
            return p
        except Exception:
            time.sleep(0.5)
    raise SystemExit('vite did not start')


def signin(browser, who):
    ctx = browser.new_context(viewport={'width': 1366, 'height': 820})
    page = ctx.new_page()
    page.goto(WEB + '/#/')
    page.fill('#email', EMAIL[who])
    page.fill('#password', 'demo123')
    n = len(rt.log_lines)
    page.click('button[type=submit]')
    page.wait_for_selector('#otp')
    page.fill('#otp', rt.otp_for(EMAIL[who], n))  # the form submits itself on the sixth digit
    page.wait_for_selector('#otp', state='detached', timeout=15000)
    page.wait_for_timeout(800)
    return ctx, page


def toast(page):
    page.wait_for_timeout(700)
    return page.locator('div[aria-live="polite"].fixed').inner_text().strip()


def shot(page, name):
    page.screenshot(path=str(EV / name))


def go(page, route):
    page.goto(WEB + '/#' + route)
    page.wait_for_timeout(900)


def record_payment(page, amount, ref, date='2026-10-26', submit=True):
    go(page, '/finance?record=1&project=PR027')
    page.select_option('#tx-invoice', 'T120')
    page.fill('#tx-amount', str(amount))
    page.fill('#tx-date', date)
    page.fill('#tx-ref', ref)
    if submit:
        page.get_by_role('button', name='Record payment').click()
        page.wait_for_timeout(800)


def dialog_text(page):
    return page.locator('[role=dialog]').last.inner_text().strip()


def run(browser):
    # TC-01 A and B
    rt.reset()
    ctx, page = signin(browser, 'meera')
    go(page, '/proposals/P050')
    page.get_by_role('button', name='Submit for approval').click()
    t = toast(page)
    shot(page, 'TE-TC01-A-SCR08A.png')
    note('TC-01 A', toast=t, status=rt.prop(rt.state(), 'P050')['status'])
    ctx.close()

    rt.reset()
    rt.act('rohit', 'toggleUserStatus', 'U103')
    ctx, page = signin(browser, 'meera')
    go(page, '/proposals/P050')
    page.get_by_role('button', name='Submit for approval').click()
    t = toast(page)
    shot(page, 'UI-TestEvidence-DEF01-SCR08A.png')
    note('TC-01 B', toast=t, status=rt.prop(rt.state(), 'P050')['status'])
    ctx.close()
    rt.reset()

    # TC-02, TC-03
    ctx, page = signin(browser, 'meera')
    go(page, '/proposals/P049')
    page.get_by_role('button', name='Submit for approval').click()
    t = toast(page)
    banner = page.locator('text=required fields are incomplete').first.locator('xpath=..').inner_text()
    shot(page, 'TE-TC02-SCR03.png')
    note('TC-02', toast=t, banner=banner, status=rt.prop(rt.state(), 'P049')['status'])
    for pid in ('P046', 'P042'):
        go(page, f'/proposals/{pid}')
        note(f'TC-03 {pid}', submitButtons=page.get_by_role('button', name='Submit for approval').count())
        if pid == 'P046':
            shot(page, 'TE-TC03-SCR03.png')

    # TC-04 B4 (end date = start date) through Edit draft
    go(page, '/proposals/P050/edit')
    page.fill('#start', '2026-12-07')
    page.fill('#end', '2026-12-07')
    page.get_by_role('button', name='Submit for approval').click()
    t = toast(page)
    end_err = [m for m in ('End date must be after the start date.', 'End date must be on or after the start date.') if page.get_by_text(m).count()]
    shot(page, 'UI-TestEvidence-DEF02-SCR03.png')
    note('TC-04 B4', toast=t, endField=end_err, status=rt.prop(rt.state(), 'P050')['status'])
    ctx.close()

    # TC-07 B2 (three spaces)
    rt.reset()
    ctx, page = signin(browser, 'sanjay')
    go(page, '/approvals/P046')
    page.get_by_role('button', name='Reject', exact=True).click()
    page.fill('#decision-comments', '   ')
    page.get_by_role('button', name='Reject proposal').click()
    page.wait_for_timeout(600)
    msg = page.locator('[role=dialog]').inner_text()
    shot(page, 'TE-TC07-B2-SCR05.png')
    note('TC-07 B2', dialog=msg, status=rt.prop(rt.state('sanjay'), 'P046')['status'])
    ctx.close()

    # TC-08 B: two tabs on SCR-05; X approves, Y rejects without reloading
    rt.reset()
    ctx, x = signin(browser, 'sanjay')
    y = ctx.new_page()
    go(x, '/approvals/P046')
    go(y, '/approvals/P046')
    x.get_by_role('button', name='Approve', exact=True).click()
    x.get_by_role('button', name='Approve proposal').click()
    x.wait_for_timeout(300)
    y.get_by_role('button', name='Reject', exact=True).click()
    y.fill('#decision-comments', 'Budget is not broken down by deliverable.')
    y.get_by_role('button', name='Reject proposal').click()
    ty = toast(y)
    shot(y, 'UI-TestEvidence-DEF03-SCR05.png')
    y.wait_for_timeout(5000)
    status_y = y.locator('main').inner_text()[:300]
    shot(y, 'TE-TC08-B-SCR05.png')
    db = rt.state('sanjay')
    note('TC-08 B', tabYToast=ty, tabYAfter5s=status_y, serverStatus=rt.prop(db, 'P046')['status'],
         approvalRows=[(a['decision'], a['comments']) for a in db['approvals'] if a['proposalId'] == 'P046'])

    # TC-08 A: Y on a stale review queue clicks P046 after X approved
    rt.reset()
    x.wait_for_timeout(5000)  # let both tabs pick up the reset (they poll every 4 s)
    go(x, '/approvals')
    go(y, '/approvals')
    go(x, '/approvals/P046')
    x.get_by_role('button', name='Approve', exact=True).click()
    x.get_by_role('button', name='Approve proposal').click()
    x.wait_for_timeout(300)
    y.locator('tr', has_text='P046').first.click()
    y.wait_for_timeout(700)
    panel = y.get_by_role('button', name='Approve', exact=True).count()
    shot(y, 'TE-TC08-A-SCR04.png')
    note('TC-08 A', decisionPanelShownInStaleTab=panel > 0, serverStatus=rt.prop(rt.state('sanjay'), 'P046')['status'])
    ctx.close()

    # TC-10, TC-11 B3, B6
    rt.reset()
    ctx, page = signin(browser, 'neha')
    record_payment(page, 100000, 'UTR HDFC26102699001')
    d = dialog_text(page)
    t = toast(page)
    shot(page, 'TE-TC10-SCR08C.png')
    note('TC-10', toast=t, dialog=d)
    ctx.close()

    rt.reset()
    ctx, page = signin(browser, 'neha')
    record_payment(page, 378000, 'UTR TC11B3')
    t = toast(page)
    shot(page, 'UI-TestEvidence-DEF04-SCR07.png')
    note('TC-11 B3', toast=t, dialog=dialog_text(page)[-600:])
    ctx.close()

    rt.reset()
    ctx, page = signin(browser, 'neha')
    record_payment(page, '1000.005', 'UTR TC11B6', submit=False)
    field = page.input_value('#tx-amount')
    shot(page, 'TE-TC11-B6-SCR07.png')
    page.get_by_role('button', name='Record payment').click()
    page.wait_for_timeout(800)
    d = dialog_text(page)
    t = toast(page)
    shot(page, 'UI-TestEvidence-DEF05-SCR08C.png')
    db = rt.state('neha')
    note('TC-11 B6', fieldValue=field, toast=t, dialog=d, serverAmount=[x['amount'] for x in db['transactions'] if x['reference'] == 'UTR TC11B6'],
         dbAmount=rt.sql(f"USE {rt.TEST_DB}; SELECT transaction_id, amount FROM finance_transactions WHERE reference='UTR TC11B6'"))
    ctx.close()

    # TC-16 E: Dr. Meera Iyer's own session reads P045 (Dr. Vikram Shekhawat's)
    rt.reset()
    ctx, page = signin(browser, 'meera')
    go(page, '/proposals/P045')
    ui_text = page.locator('main').inner_text()[:200]
    body = page.evaluate("""async () => {
        const r = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + localStorage.getItem('cpts.token') } })
        const d = await r.json()
        const p = d.db.proposals.find(x => x.id === 'P045')
        const out = 'GET /api/state  as Dr. Meera Iyer (U101)  ->  HTTP ' + r.status + '\\n\\nP045 in response:\\n' + JSON.stringify(p, null, 2)
        document.body.innerHTML = '<pre style="font:14px monospace;padding:16px;white-space:pre-wrap"></pre>'
        document.querySelector('pre').textContent = out
        return out
    }""")
    shot(page, 'UI-TestEvidence-DEF06-API.png')
    note('TC-16 E', uiScreen=ui_text, api=body[:300])
    ctx.close()


def tc15(pw, channel):
    b = pw.chromium.launch(channel=channel)
    rt.reset()
    out = {'browserVersion': b.version}
    ctx, page = signin(b, 'meera')
    out['meeraLanding'] = page.url.split('#')[-1]
    go(page, '/proposals/P050')
    page.get_by_role('button', name='Submit for approval').click()
    out['C1'] = toast(page)
    ctx.close()
    ctx, page = signin(b, 'sanjay')
    out['sanjayLanding'] = page.url.split('#')[-1]
    go(page, '/approvals/P050')
    page.get_by_role('button', name='Approve', exact=True).click()
    page.get_by_role('button', name='Approve proposal').click()
    out['C2'] = toast(page)
    ctx.close()
    ctx, page = signin(b, 'neha')
    out['nehaLanding'] = page.url.split('#')[-1]
    record_payment(page, 100000, 'UTR HDFC26102699001')
    out['C3'] = toast(page)
    out['dialog'] = dialog_text(page)
    shot(page, f'TE-TC15-{channel}-SCR08C.png')
    ctx.close()
    db = rt.state('neha')
    out['P050'] = rt.prop(db, 'P050')['status']
    out['PR027'] = rt.fin(db, 'PR027')
    note(f'TC-15 {channel}', **out)
    b.close()


if __name__ == '__main__':
    EV.mkdir(parents=True, exist_ok=True)
    api = rt.start_server()
    web = start_web()
    try:
        for who, email in (('meera', EMAIL['meera']), ('sanjay', EMAIL['sanjay']), ('neha', EMAIL['neha']), ('rohit', 'rohit.verma@lnmiit.ac.in')):
            rt.T[who] = rt.login(email)
        with sync_playwright() as pw:
            br = pw.chromium.launch(channel='chrome')
            U['_browser'] = 'Chrome ' + br.version
            run(br)
            br.close()
            for ch in ('chrome', 'msedge'):
                tc15(pw, ch)
        rt.reset()
        (rt.TESTING / 'ui_results.json').write_text(json.dumps(U, indent=2, ensure_ascii=False), encoding='utf-8')
    finally:
        web.terminate()
        api.terminate()
