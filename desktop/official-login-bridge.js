'use strict';

const OFFICIAL_LOGIN_PROVIDERS = new Set(['netease', 'qq', 'kugou', 'qishui']);
const SAFE_LOGIN_INFO_FIELDS = new Set([
  'provider',
  'loggedIn',
  'pendingProfile',
  'preview',
  'userId',
  'uin',
  'nickname',
  'avatar',
  'vipType',
  'svipType',
  'vipLevel',
  'isVip',
  'isSvip',
  'vipLabel',
  'hasCookie',
  'hasToken',
  'playbackReady',
  'playbackKeyReady',
  'profileSource',
  'profileUnavailable',
  'vipSource',
  'vipEvidence',
  'vipEvidenceLevel',
  'vipCheckedAt',
  'vipProbeAvailable',
  'membershipStale',
  'authorizationIncomplete',
  'vipSyncState',
  'stale',
  'partial',
  'saved',
  'officialLogin',
]);

function failedResult(provider, code, message) {
  return {
    ok: false,
    provider,
    error: code,
    message,
  };
}

function sanitizeLoginInfo(info) {
  const safe = {};
  for (const [key, value] of Object.entries(info || {})) {
    if (!SAFE_LOGIN_INFO_FIELDS.has(key)) continue;
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) safe[key] = value;
  }
  return safe;
}

async function applyOfficialProviderLogin(server, provider, result) {
  provider = String(provider || '').trim().toLowerCase();
  if (!OFFICIAL_LOGIN_PROVIDERS.has(provider)) {
    return failedResult(provider, 'UNSUPPORTED_LOGIN_PROVIDER', '当前平台不支持官方网页登录');
  }
  if (!result || result.ok !== true) {
    const failed = failedResult(provider, 'LOGIN_NOT_COMPLETED', '登录未完成');
    if (result && result.cancelled === true) failed.cancelled = true;
    return failed;
  }

  const cookie = typeof result.cookie === 'string' ? result.cookie.trim() : '';
  if (!cookie) return failedResult(provider, 'OFFICIAL_LOGIN_COOKIE_MISSING', '官方登录窗口没有返回有效会话，请重新登录');
  if (!server || typeof server.acceptOfficialLoginCookie !== 'function') {
    return failedResult(provider, 'OFFICIAL_LOGIN_BRIDGE_UNAVAILABLE', '登录服务尚未就绪，请重新启动 Mineradio');
  }

  try {
    const rawLoginInfo = await server.acceptOfficialLoginCookie(provider, cookie);
    if (!rawLoginInfo || rawLoginInfo.loggedIn !== true) {
      return failedResult(provider, 'OFFICIAL_LOGIN_SESSION_INVALID', '官方登录会话未能通过验证，请重新登录');
    }
    const loginInfo = sanitizeLoginInfo(rawLoginInfo);
    return {
      ok: true,
      provider,
      sessionApplied: true,
      loginInfo,
      partial: !!(result.partial || loginInfo.partial),
      reused: !!result.reused,
    };
  } catch (error) {
    const code = error && error.code ? String(error.code) : 'OFFICIAL_LOGIN_APPLY_FAILED';
    return failedResult(provider, code, '官方登录会话保存失败，请重新登录');
  }
}

module.exports = {
  OFFICIAL_LOGIN_PROVIDERS,
  applyOfficialProviderLogin,
  sanitizeLoginInfo,
};
