import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADD_IMAGE_HELP, DRIVE_IMAGE_LABEL, DRIVE_NOT_CONNECTED_NOTE, PICKER_NOT_SET_UP_NOTE, UPLOAD_IMAGE_LABEL, addImageState,
} from '../lib/addImageUi.mjs';

test('the two button labels and helper line are fixed', () => {
  assert.equal(UPLOAD_IMAGE_LABEL, 'Upload Image');
  assert.equal(DRIVE_IMAGE_LABEL, 'Choose from Drive');
  assert.equal(ADD_IMAGE_HELP, 'Upload Image: pick a picture from this computer. Choose from Drive: pick one already in Google Drive.');
});

test('Drive not connected disables both buttons with a plain note', () => {
  const s = addImageState({ connected: false, pickerConfigured: true });
  assert.equal(s.upload.disabled, true);
  assert.equal(s.drive.disabled, true);
  assert.deepEqual(s.notes, [{ kind: 'connect', text: DRIVE_NOT_CONNECTED_NOTE }]);
});

test('Picker keys missing disables only Choose from Drive', () => {
  const s = addImageState({ connected: true, pickerConfigured: false });
  assert.equal(s.upload.disabled, false);
  assert.equal(s.drive.disabled, true);
  assert.equal(s.notes[0].text, PICKER_NOT_SET_UP_NOTE);
});

test('connected and configured, unknown status, busy and disabled', () => {
  assert.deepEqual(addImageState({ connected: true, pickerConfigured: true }), { upload: { disabled: false }, drive: { disabled: false }, notes: [] });
  assert.equal(addImageState(null).upload.disabled, false, 'unknown status stays usable');
  assert.equal(addImageState(null, { busy: true }).drive.disabled, true);
  assert.equal(addImageState({ connected: true, pickerConfigured: true }, { disabled: true }).upload.disabled, true);
});
