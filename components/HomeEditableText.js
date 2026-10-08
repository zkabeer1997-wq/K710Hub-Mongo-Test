// Plain text element. The inline admin editor was removed on the owner's request;
// the component keeps its props so existing pages do not change.
export default function HomeEditableText({ initialText, as = 'span', className }) {
  const Tag = as;
  return <Tag className={className}>{initialText || ''}</Tag>;
}
