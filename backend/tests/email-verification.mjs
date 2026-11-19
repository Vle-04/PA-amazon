// Email verification rules. Run: BASE_URL=... TEST_AUTH_TOKEN=... node tests/email-verification.mjs
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.TEST_AUTH_TOKEN || 'dev-test-token';
let cookie = '';
async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body && JSON.stringify(body) });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}
let failed = 0;
const check = (ok, name, info = '') => { console.log(`${ok ? '✅' : '❌'} ${name}${info ? ` — ${info}` : ''}`); if (!ok) failed++; };
const email = `verify-${Date.now().toString(36)}@test.am`;
const T = { 'x-test-token': TOKEN };

const noToken = await call('POST', '/api/auth/register', { email: `x${email}`, password: 'password123', name: 'NoToken' });
check(noToken.status === 201 && !noToken.testCode && !cookie, 'Normal sign-up gets no code in the response and no session');

const reg = await call('POST', '/api/auth/register', { email, password: 'password123', name: 'Verify Me' }, T);
check(reg.status === 201 && reg.pendingVerification && /^\d{6}$/.test(reg.testCode || '') && !cookie, 'Sign-up does not sign in; it waits for the code');
const login1 = await call('POST', '/api/auth/login', { email, password: 'password123' }, T);
check(login1.status === 403 && login1.error.code === 'EMAIL_NOT_VERIFIED' && !cookie, 'Sign-in before confirming is refused', `${login1.status} ${login1.error?.code}`);
const code = login1.error.testCode || reg.testCode;
const wrong = await call('POST', '/api/auth/verify-email', { email, code: code === '000000' ? '111111' : '000000' });
check(wrong.status === 400 && wrong.error.code === 'INVALID_CODE' && !cookie, 'Wrong code is rejected', wrong.error?.message);
const ok = await call('POST', '/api/auth/verify-email', { email, code });
check(ok.status === 200 && ok.user?.email === email && !!cookie, 'Correct code confirms the email and signs in');
const me = await call('GET', '/api/me');
check(me.user?.email === email, 'Session works after confirming');
cookie = '';
const login2 = await call('POST', '/api/auth/login', { email, password: 'password123' });
check(login2.status === 200, 'Sign-in works after confirming');
cookie = '';
const again = await call('POST', '/api/auth/register', { email, password: 'other-password', name: 'Thief' });
check(again.status === 409 && again.error.code === 'EMAIL_TAKEN', 'A confirmed email cannot be registered again');
const resendUnknown = await call('POST', '/api/auth/resend-verification', { email: `nobody-${email}` });
check(resendUnknown.status === 200, 'Resend does not reveal whether an email exists');
console.log(failed ? `\n${failed} failed` : '\nAll email verification checks passed');
process.exit(failed ? 1 : 0);
