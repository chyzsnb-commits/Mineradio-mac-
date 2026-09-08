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

const qishuiEnabled = metadata.qishuiExperimental === true && process.platform === 'darwin'
  ? true
  : providerEnabled('qishui');

module.exports = Object.freeze({
  publicRelease,
  internalBeta: metadata.internalBeta === true,
  allowCredentialImport: (qishuiEnabled && metadata.allowCredentialImport === true) || (!publicRelease && metadata.allowCredentialImport !== false),
  allowCredentialExport: !publicRelease && metadata.allowCredentialExport !== false,
  qishuiCatalogEnabled: metadata.qishuiCatalogEnabled === true,
  qishuiEnabled: providerEnabled('qishui'),
  disabledProviders: Object.freeze(Array.from(disabledProviders)),
  providerEnabled,
});
