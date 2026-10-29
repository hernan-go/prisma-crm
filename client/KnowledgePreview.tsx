import Markdown from 'react-markdown';

export function knowledgeUrl(url: string) {
  if (
    /^https?:\/\//i.test(url) &&
    !Array.from(url).some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return url;
  return '';
}
export function KnowledgePreview({ content }: { content: string }) {
  return (
    <div className="knowledge-preview">
      <Markdown
        skipHtml
        allowedElements={[
          'p',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'strong',
          'em',
          'blockquote',
          'ul',
          'ol',
          'li',
          'code',
          'pre',
          'hr',
          'br',
          'a',
        ]}
        urlTransform={knowledgeUrl}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
