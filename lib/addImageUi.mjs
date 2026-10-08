// Wording and enable/disable rules for the two "add an image" buttons that
// every admin screen shares (components/admin/AddImageButtons.jsx).
// Pure, so the rules are unit-tested without a browser.

export const UPLOAD_IMAGE_LABEL = 'Upload Image';
export const DRIVE_IMAGE_LABEL = 'Choose from Drive';
export const ADD_IMAGE_HELP = 'Upload Image: pick a picture from this computer. Choose from Drive: pick one already in Google Drive.';
export const DRIVE_NOT_CONNECTED_NOTE = 'Connect Google Drive first';
export const PICKER_NOT_SET_UP_NOTE = 'Google Picker is not set up yet';
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

/**
 * @param {{connected?:boolean, pickerConfigured?:boolean}|null} status GET /api/admin-drive/status (null while unknown)
 * @param {{busy?:boolean, disabled?:boolean}} [opts]
 * @returns {{upload:{disabled:boolean}, drive:{disabled:boolean}, notes:Array<{kind:'connect'|'picker', text:string}>}}
 */
export function addImageState(status, { busy = false, disabled = false } = {}) {
  const off = Boolean(busy || disabled);
  // Unknown status (still loading, or the status call failed) keeps both buttons usable:
  // the server answers with a plain message if Drive is really not available.
  if (!status) return { upload: { disabled: off }, drive: { disabled: off }, notes: [] };
  if (!status.connected) {
    return {
      upload: { disabled: true },
      drive: { disabled: true },
      notes: [{ kind: 'connect', text: DRIVE_NOT_CONNECTED_NOTE }],
    };
  }
  if (status.pickerConfigured === false) {
    return {
      upload: { disabled: off },
      drive: { disabled: true },
      notes: [{ kind: 'picker', text: PICKER_NOT_SET_UP_NOTE }],
    };
  }
  return { upload: { disabled: off }, drive: { disabled: off }, notes: [] };
}
