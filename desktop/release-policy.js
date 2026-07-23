'use strict';

function packageMetadata() {
  try {
    return require('../package.json').mineradio || {};
  } catch (_) {
    return {};
  }
}

const metadata = packageMetadata();
const publicRelease = metadata.publicRelease === true && metadata.internalBeta !== true;
const disabledProviders = new Set(
  (Array.isArray(metadata.disabledProviders) ? metadata.disabledProviders : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
);

function providerEnabled(provider) {
  return !disabledProviders.has(String(provider || '').trim().toLowerCase());
}

module.exports = Object.freeze({
  publicRelease,
  internalBeta: metadata.internalBeta === true,
  allowCredentialImport: !publicRelease && metadata.allowCredentialImport !== false,
  allowCredentialExport: !publicRelease && metadata.allowCredentialExport !== false,
  qishuiEnabled: providerEnabled('qishui'),
  disabledProviders: Object.freeze(Array.from(disabledProviders)),
  providerEnabled,
});
