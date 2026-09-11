'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function Block({ block, editMode, onEdit, onDelete, headingLevel = 2 }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(block.content.text || '');
  const [draftKicker, setDraftKicker] = useState(block.content.kicker || '');
  const [draftAlt, setDraftAlt] = useState(block.content.alt || '');

function save() {
  if (block.type === 'heading') {
    onEdit(block.id, { kicker: draftKicker, text: draftText });
  } else if (block.type === 'text') {
    onEdit(block.id, { text: draftText });
  } else if (block.type === 'image') {
    onEdit(block.id, { ...block.content, alt: draftAlt });
  }
  setEditing(false);
}

async function handleImageUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/admin-content/upload', { method: 'POST', body });
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.url) {
    onEdit(block.id, { ...block.content, url: result.url });
  }
}

return (
  <div ref={setNodeRef} style={style} className={'editable-block editable-block-' + block.type + (editMode ? ' edit-mode' : '')}>
{editMode && (
  <div className="block-toolbar">
  <button type="button" className="block-drag-handle" {...attributes} {...listeners} title="Drag to reorder">::</button>
 <button type="button" className="block-edit-btn" onClick={() => setEditing((v) => !v)} title="Edit">Edit</button>
<button type="button" className="block-delete-btn" onClick={() => onDelete(block.id)} title="Delete">Del</button>
  </div>
)}

{block.type === 'heading' && !editing && (
  <>
{block.content.kicker && <span className="public-kicker">{block.content.kicker}</span>}
{headingLevel === 1 ? <h1>{block.content.text}</h1> : <h2>{block.content.text}</h2>}
  </>
)}
{block.type === 'text' && !editing && <p>{block.content.text}</p>}
{block.type === 'image' && !editing && block.content.url && (
  <img className="block-image" src={block.content.url} alt={block.content.alt || ''} />
)}
{block.type === 'image' && !editing && !block.content.url && (
  <p className="hint">No image set yet.</p>
  )}

{editing && block.type !== 'image' && (
  <div className="block-edit-form">
{block.type === 'heading' && (
<input value={draftKicker} onChange={(e) => setDraftKicker(e.target.value)} placeholder="Kicker label (optional)" />
)}
  <textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={block.type === 'heading' ? 2 : 4} />
  <div className="block-edit-actions">
  <button type="button" onClick={save}>Save</button>
<button type="button" onClick={() => setEditing(false)}>Cancel</button>
</div>
  </div>
  )}
{editing && block.type === 'image' && (
<div className="block-edit-form">
  <input type="file" accept="image/*" onChange={handleImageUpload} />
  <input value={draftAlt} onChange={(e) => setDraftAlt(e.target.value)} placeholder="Image description (alt text)" />
  <div className="block-edit-actions">
  <button type="button" onClick={save}>Save</button>
  <button type="button" onClick={() => setEditing(false)}>Cancel</button>
  </div>
 </div>
  )}
</div>
  );
}

export default function EditableSection({ page, initialBlocks, isAdmin, as, className, headingLevel = 2 }) {
  const Tag = as || 'section';
const [blocks, setBlocks] = useState(initialBlocks || []);
  const [editMode, setEditMode] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(event) {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    const next = arrayMove(blocks, oldIndex, newIndex);
    setBlocks(next);
    await fetch('/api/admin-content/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: next.map((b) => b.id) }),
    });
  }

async function handleEdit(id, content) {
  setBlocks((current) => current.map((b) => (b.id === id ? { ...b, content } : b)));
  await fetch('/api/admin-content/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

async function handleDelete(id) {
  if (!window.confirm('Remove this block?')) return;
  setBlocks((current) => current.filter((b) => b.id !== id));
  await fetch('/api/admin-content/' + id, { method: 'DELETE' });
}

async function handleAdd(type) {
  const defaults = {
    heading: { kicker: '', text: 'New heading' },
    text: { text: 'New text block. Click Edit to change this.' },
    image: { url: '', alt: '' },
  };
  const response = await fetch('/api/admin-content', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, type, content: defaults[type], position: blocks.length }),
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.block) {
    setBlocks((current) => [...current, result.block]);
  }
}

return (
  <Tag className={'editable-zone ' + (className || '')}>
{isAdmin && (
  <button type="button" className="edit-toggle-btn" onClick={() => setEditMode((v) => !v)}>
{editMode ? 'Done editing' : 'Edit this section'}
</button>
)}
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
{blocks.map((block) => (
  <Block key={block.id} block={block} editMode={editMode} onEdit={handleEdit} onDelete={handleDelete} headingLevel={headingLevel} />
  ))}
</SortableContext>
  </DndContext>
{editMode && (
  <div className="add-block-bar">
  <button type="button" onClick={() => handleAdd('heading')}>+ Heading</button>
<button type="button" onClick={() => handleAdd('text')}>+ Text</button>
  <button type="button" onClick={() => handleAdd('image')}>+ Image</button>
  </div>
  )}
  </Tag>
  );
  }
  
