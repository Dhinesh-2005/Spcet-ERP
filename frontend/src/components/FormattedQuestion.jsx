import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Helper to split a question string into alternating text and LaTeX math tokens.
 */
function parseMixedTextAndLatex(textStr) {
  if (!textStr) return [];
  const text = String(textStr);

  // 1. If explicit $ or $$ delimiters are present
  if (text.includes('$')) {
    const parts = text.split('$');
    const segments = [];
    parts.forEach((part, idx) => {
      if (!part) return;
      if (idx % 2 === 1) {
        // Math part inside $...$
        segments.push({ type: 'math', content: part.trim() });
      } else {
        segments.push({ type: 'text', content: part });
      }
    });
    return segments;
  }

  // 2. If no $ delimiters, look for LaTeX commands like \frac, \sqrt, \sum, \int, \iint, \iiint, \prod, \lim, \infty, \partial, \pm, \approx, \ne, \le, \ge, \pi, \alpha, \beta, \theta, \lambda, \sigma, \cdot, \sin, \cos, \tan, \cot, \sec, \csc, \cosh, \sinh, \tanh, \coth, \sech, \csch, \exp, \log, \ln, \left, \right
  const latexCommandRegex = /\\(?:frac|sqrt|vec|sum|prod|int|oint|iint|iiint|idotsint|lim|infty|cosh|sinh|tanh|coth|sech|csch|exp|sin|cos|tan|cot|sec|csc|log|lg|ln|max|min|sup|inf|left|right|partial|pm|approx|ne|le|ge|leq|geq|pi|alpha|beta|theta|lambda|sigma|cdot|to|rightarrow|leftarrow|rightleftharpoons|xrightarrow|longrightarrow|longleftarrow|longleftrightarrow|begin|pmatrix|bmatrix|vmatrix|cases)\b/i;

  if (!latexCommandRegex.test(text)) {
    return [{ type: 'text', content: text }];
  }

  // Regex to capture LaTeX expressions (commands + arguments/brackets)
  // e.g. \frac{a}{b}, \sqrt{x}, \sum_{i=1}^n, \int_a^b f(x)dx, \frac{d^2y}{dx^2}
  const mathExprRegex = /(?:\\(?:frac|sqrt|vec)(?:\[[^\]]*\])?\{[^{}]*\}\{[^{}]*\}|\\(?:frac|sqrt|vec)(?:\[[^\]]*\])?\{[^{}]*\}|\\xrightarrow\{[^{}]*\}|\\(?:sum|int|iint|iiint|prod|lim)(?:_\{[^{}]*\}|_\S+)?(?:\^\{[^{}]*\}|\^\S+)?|\\(?:partial|pm|approx|ne|le|ge|leq|geq|pi|alpha|beta|theta|lambda|sigma|cdot|to|infty|cosh|sinh|tanh|coth|sech|csch|exp|sin|cos|tan|cot|sec|csc|log|ln|rightarrow|leftarrow|longrightarrow|longleftrightarrow|rightleftharpoons)\b(?:\^[0-9\{\}\-]+)?(?:\_[0-9\{\}\-]+)?)+/gi;

  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = mathExprRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.substring(lastIndex, match.index) });
    }
    segments.push({ type: 'math', content: match[0] });
    lastIndex = mathExprRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.substring(lastIndex) });
  }

  return segments;
}

export default function FormattedQuestion({ question = "", equation = "", className = "" }) {
  const renderedElements = useMemo(() => {
    let mainText = (question || "").toString();
    let eqText = (equation || "").toString();

    // If explicit equation prop is provided and question is plain text
    if (eqText && !mainText.includes('\\')) {
      try {
        const katexHtml = katex.renderToString(eqText, { throwOnError: false, displayMode: false });
        return [
          { type: 'text', content: mainText ? mainText + " " : "" },
          { type: 'katexHtml', html: katexHtml }
        ];
      } catch (err) {
        return [
          { type: 'text', content: mainText ? mainText + " " : "" },
          { type: 'text', content: eqText }
        ];
      }
    }

    const segments = parseMixedTextAndLatex(mainText);
    return segments.map(seg => {
      if (seg.type === 'math') {
        try {
          const html = katex.renderToString(seg.content, { throwOnError: false, displayMode: false });
          return { type: 'katexHtml', html };
        } catch (e) {
          return { type: 'text', content: seg.content };
        }
      }
      return seg;
    });
  }, [question, equation]);

  return (
    <span className={`formatted-question inline-flex flex-wrap items-baseline gap-1 ${className}`}>
      {renderedElements.map((el, idx) => {
        if (el.type === 'katexHtml') {
          return (
            <span
              key={idx}
              className="inline-block text-gray-900 leading-normal align-baseline px-0.5"
              dangerouslySetInnerHTML={{ __html: el.html }}
            />
          );
        }
        return <span key={idx} className="text-gray-800">{el.content}</span>;
      })}
    </span>
  );
}

