function isKugouPrivateProtocolUrl(url) {
  return /^kugouurl:/i.test(String(url || '').trim());
}

function isIgnorableProviderLoadError(provider, error) {
  if (provider !== 'kugou' || !error) return false;

  const errorCode = Number(error.code ?? error.errorCode);
  const detail = [
    error.message,
    error.url,
    error.validatedURL,
  ].filter(Boolean).join(' ');
  const isAborted = errorCode === -3 || /\bERR_ABORTED\b|\(\s*-3\s*\)/i.test(detail);

  return isAborted && /kugouurl:/i.test(detail);
}

module.exports = {
  isIgnorableProviderLoadError,
  isKugouPrivateProtocolUrl,
};
