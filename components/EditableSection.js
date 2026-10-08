// Read-only renderer for the page text/image blocks stored in `content_blocks`.
// The old inline "Edit this section" controls (drag, edit, delete, add, image upload)
// were removed on the owner's request: nothing on public pages is editable inline any more.
// The component keeps its old name and props so existing pages do not change.

function Block({ block, headingLevel = 2 }) {
  const content = block.content || {};
  return (
    <div className={'editable-block editable-block-' + block.type}>
      {block.type === 'heading' && (
        <>
          {content.kicker && <span className="public-kicker">{content.kicker}</span>}
          {headingLevel === 1 ? <h1>{content.text}</h1> : <h2>{content.text}</h2>}
        </>
      )}
      {block.type === 'text' && <p>{content.text}</p>}
      {block.type === 'image' && content.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="block-image" src={content.url} alt={content.alt || ''} />
      )}
    </div>
  );
}

export default function EditableSection({ initialBlocks, as, className, headingLevel = 2 }) {
  const Tag = as || 'section';
  const blocks = Array.isArray(initialBlocks) ? initialBlocks : [];
  return (
    <Tag className={'editable-zone ' + (className || '')}>
      {blocks.map((block) => (
        <Block key={block.id} block={block} headingLevel={headingLevel} />
      ))}
    </Tag>
  );
}
