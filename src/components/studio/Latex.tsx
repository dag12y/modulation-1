import React, { useMemo } from 'react';
import katex from 'katex';

interface LatexProps {
  math: string;
  displayMode?: boolean;
  className?: string;
}

export const Latex: React.FC<LatexProps> = ({
  math,
  displayMode = false,
  className = '',
}) => {
  const html = useMemo(() => {
    return katex.renderToString(math, {
      throwOnError: false,
      displayMode,
      strict: false,
    });
  }, [math, displayMode]);

  if (displayMode) {
    return (
      <div
        className={`overflow-x-auto ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className={`inline-block align-middle ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

interface LatexTextProps {
  text: string;
  className?: string;
}

/**
 * Renders prose containing inline `$...$` or display `$$...$$` LaTeX expressions
 * seamlessly alongside regular text.
 */
export const LatexText: React.FC<LatexTextProps> = ({ text, className = '' }) => {
  const parts = useMemo(() => {
    const tokens: { type: 'text' | 'inline' | 'display'; value: string }[] = [];
    const regex = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        tokens.push({ type: 'text', value: text.slice(lastIdx, match.index) });
      }
      if (match[1] !== undefined) {
        tokens.push({ type: 'display', value: match[1] });
      } else if (match[2] !== undefined) {
        tokens.push({ type: 'inline', value: match[2] });
      }
      lastIdx = regex.lastIndex;
    }

    if (lastIdx < text.length) {
      tokens.push({ type: 'text', value: text.slice(lastIdx) });
    }
    return tokens;
  }, [text]);

  return (
    <span className={className}>
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return <React.Fragment key={idx}>{part.value}</React.Fragment>;
        }
        return (
          <Latex
            key={idx}
            math={part.value}
            displayMode={part.type === 'display'}
          />
        );
      })}
    </span>
  );
};
