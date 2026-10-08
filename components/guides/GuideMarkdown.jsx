import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { linkifyBareUrls } from '../../lib/guideContent.mjs';

// One renderer for every rich-text block: GFM markdown through rehype-sanitize
// (the same sanitizer the classic guide page uses). Raw HTML is never rendered,
// h1 is demoted so each guide page keeps a single h1, and off-site links open
// safely.
const COMPONENTS = {
  h1: ({ node: _node, ...props }) => <h2 {...props} />,
  a: ({ node: _node, href = '', ...props }) => (
    /^https?:\/\//i.test(href) ? <a href={href} rel="noopener noreferrer" {...props} /> : <a href={href} {...props} />
  ),
};

export default function GuideMarkdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={COMPONENTS}>
      {linkifyBareUrls(children || '')}
    </ReactMarkdown>
  );
}
