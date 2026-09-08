'use strict';

const CAMERA_PRIVACY_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera';
const CAMERA_PERMISSION_STATUSES = new Set(['not-determined', 'granted', 'denied', 'restricted', 'unknown']);

function normalizeCameraStatus(status) {
  return CAMERA_PERMISSION_STATUSES.has(status) ? status : 'unknown';
}

function cameraPermissionResult(status, requested) {
  status = normalizeCameraStatus(status);
  return {
    ok: status === 'granted',
    status,
    requested: !!requested,
    settingsRequired: status === 'denied' || status === 'restricted',
  };
}

function createCameraPermissionController(options = {}) {
  const platform = options.platform || process.platform;
  const systemPreferences = options.systemPreferences;
  const shell = options.shell;

  async function requestCameraAccess() {
    if (platform !== 'darwin') return cameraPermissionResult('granted', false);
    if (!systemPreferences || typeof systemPreferences.getMediaAccessStatus !== 'function') {
      return cameraPermissionResult('unknown', false);
    }

    let status;
    try {
      status = normalizeCameraStatus(systemPreferences.getMediaAccessStatus('camera'));
    } catch (_) {
      return cameraPermissionResult('unknown', false);
    }

    if (status !== 'not-determined') return cameraPermissionResult(status, false);
    if (typeof systemPreferences.askForMediaAccess !== 'function') {
      return cameraPermissionResult(status, false);
    }

    let granted = false;
    try {
      granted = await systemPreferences.askForMediaAccess('camera');
      status = normalizeCameraStatus(systemPreferences.getMediaAccessStatus('camera'));
    } catch (_) {
      status = 'unknown';
    }
    if (status === 'not-determined' || status === 'unknown') status = granted ? 'granted' : status;
    return cameraPermissionResult(status, true);
  }

  async function openCameraPrivacySettings() {
    if (platform !== 'darwin' || !shell || typeof shell.openExternal !== 'function') {
      return { ok: false, error: 'CAMERA_SETTINGS_UNAVAILABLE' };
    }
    try {
      await shell.openExternal(CAMERA_PRIVACY_SETTINGS_URL);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error && error.message || error || 'CAMERA_SETTINGS_OPEN_FAILED') };
    }
  }

  return { requestCameraAccess, openCameraPrivacySettings };
}

module.exports = {
  CAMERA_PRIVACY_SETTINGS_URL,
  createCameraPermissionController,
};
