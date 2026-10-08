'use client';

import AddImageButtons from '../AddImageButtons';
import linkStyles from '../ImageUploadField.module.css';
import { useBuilder } from './BuilderContext';

// The guide builder's "add a picture" control: the shared Upload Image + Choose from Drive buttons,
// wired to the builder's upload/pick flow for a block (or for the page when blockId is null).
// `index` is the slot inside an image grid. Several files are allowed for the page and for grids.
export default function GuideAddImage({ blockId = null, index = null, library = false, tone = 'light' }) {
  const { requestUpload, requestDrivePick, openLibrary, uploads } = useBuilder();
  const up = blockId ? uploads[blockId] : null;
  const multiple = !blockId || index != null;
  return (
    <div onClick={e => e.stopPropagation()}>
      <AddImageButtons
        multiple={multiple} busy={Boolean(up && !up.error)} progress={up ? up.progress : null} error={up?.error || ''}
        busyText="Uploading picture" tone={tone}
        onFiles={files => requestUpload(blockId, index, files)}
        onPick={files => requestDrivePick(blockId, index, files)}
        extra={library ? <button type="button" className={linkStyles.linkBtn} onClick={() => openLibrary(blockId, index)}>Or reuse a picture already in this guide</button> : null}
      />
    </div>
  );
}
