'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  applyOfficialProviderLogin,
} = require('../desktop/official-login-bridge');

test('official login bridge applies the session without exposing cookies to renderer', async () => {
  let received = null;
  const server = {
    async acceptOfficialLoginCookie(provider, cookie) {
      received = { provider, cookie };
      return {
        provider,
        loggedIn: true,
        nickname: '测试用户',
        playbackKeyReady: true,
        cookie: 'must-not-leak',
        accessToken: 'must-not-leak',
      };
    },
  };

  const result = await applyOfficialProviderLogin(server, 'qq', {
    ok: true,
    cookie: 'uin=10001; qqmusic_key=secret',
    reused: true,
  });

  assert.deepEqual(received, {
    provider: 'qq',
    cookie: 'uin=10001; qqmusic_key=secret',
  });
  assert.equal(result.ok, true);
  assert.equal(result.sessionApplied, true);
  assert.equal(result.reused, true);
  assert.equal(result.loginInfo.loggedIn, true);
  assert.equal(Object.hasOwn(result.loginInfo, 'cookie'), false);
  assert.equal(Object.hasOwn(result.loginInfo, 'accessToken'), false);
  assert.equal(Object.hasOwn(result, 'cookie'), false);
  assert.doesNotMatch(JSON.stringify(result), /secret|must-not-leak/);
});

test('official login bridge preserves partial authorization state', async () => {
  const server = {
    async acceptOfficialLoginCookie(provider) {
      return { provider, loggedIn: true, partial: true, playbackKeyReady: false };
    },
  };
  const result = await applyOfficialProviderLogin(server, 'kugou', {
    ok: true,
    cookie: 'KuGoo=1; token=partial',
  });
  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.loginInfo.playbackKeyReady, false);
});

test('official login bridge rejects missing sessions and unsupported providers', async () => {
  const server = {
    async acceptOfficialLoginCookie() {
      throw new Error('must not run');
    },
  };
  const missing = await applyOfficialProviderLogin(server, 'netease', { ok: true });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'OFFICIAL_LOGIN_COOKIE_MISSING');

  const unsupported = await applyOfficialProviderLogin(server, 'qishui', {
    ok: true,
    cookie: 'sessionid=secret',
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error, 'UNSUPPORTED_LOGIN_PROVIDER');
});

test('official login bridge returns a generic error without leaking server details', async () => {
  const server = {
    async acceptOfficialLoginCookie() {
      const error = new Error('cookie=private-value');
      error.code = 'INVALID_OFFICIAL_SESSION';
      throw error;
    },
  };
  const result = await applyOfficialProviderLogin(server, 'netease', {
    ok: true,
    cookie: 'MUSIC_U=private-value',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'INVALID_OFFICIAL_SESSION');
  assert.doesNotMatch(JSON.stringify(result), /private-value/);
});

test('official login bridge does not pass through failed window results', async () => {
  const result = await applyOfficialProviderLogin(null, 'qq', {
    ok: false,
    cancelled: true,
    cookie: 'uin=10001; qqmusic_key=private-value',
    error: 'private-value',
  });
  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.error, 'LOGIN_NOT_COMPLETED');
  assert.doesNotMatch(JSON.stringify(result), /private-value|qqmusic_key/);
});
