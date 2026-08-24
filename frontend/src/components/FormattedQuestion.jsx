import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Reads a balanced brace/bracket group starting at pos in str.
 * Returns { full: string, inner: string, nextPos: number } or null.
 */
function readBalancedGroup(str, pos) {
  if (pos >= str.length) return null;
  const openChar = str[pos];
  if (openChar !== '{' && openChar !== '[' && openChar !== '(') return null;
  
  const closeChar = openChar === '{' ? '}' : (openChar === '[' ? ']' : ')');
  let depth = 1;
  let i = pos + 1;
  while (i < str.length && depth > 0) {
    if (str[i] === '\\') {
      i += 2;
      continue;
    }
    if (str[i] === openChar) depth++;
    else if (str[i] === closeChar) depth--;
    i++;
  }
  if (depth === 0) {
    return {
      full: str.substring(pos, i),
      inner: str.substring(pos + 1, i - 1),
      nextPos: i
    };
  }
  return null;
}

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

  // 2. If no $ delimiters, look for LaTeX commands
  const latexCommandRegex = /\\(?:frac|sqrt|vec|sum|prod|int|oint|iint|iiint|idotsint|lim|infty|cosh|sinh|tanh|coth|sech|csch|exp|sin|cos|tan|cot|sec|csc|log|lg|ln|max|min|sup|inf|left|right|partial|pm|approx|ne|le|ge|leq|geq|pi|alpha|beta|gamma|delta|theta|lambda|sigma|cdot|to|rightarrow|leftarrow|rightleftharpoons|xrightarrow|longrightarrow|longleftarrow|longleftrightarrow|begin|pmatrix|bmatrix|vmatrix|cases)(?![a-zA-Z])/i;

  if (!latexCommandRegex.test(text)) {
    return [{ type: 'text', content: text }];
  }

  const ENGLISH_WORDS_REGEX = /^\s+(?:and|where|over|under|in|of|the|is|if|when|for|with|find|evaluate|calculate|determine|show|prove|such|that|given|let|whereby|hence|thus|obtain)\b/i;

  const segments = [];
  let i = 0;

  while (i < text.length) {
    const nextBs = text.indexOf('\\', i);
    if (nextBs === -1) {
      segments.push({ type: 'text', content: text.substring(i) });
      break;
    }

    if (nextBs > i) {
      segments.push({ type: 'text', content: text.substring(i, nextBs) });
      i = nextBs;
    }

    let mathEnd = i;

    // Check for \begin{matrix|pmatrix|bmatrix|vmatrix|cases}... \end{...}
    const envMatch = text.substring(i).match(/^\\begin\{(matrix|pmatrix|bmatrix|vmatrix|cases)\}/i);
    if (envMatch) {
      const envName = envMatch[1];
      const endTag = `\\end{${envName}}`;
      const endIdx = text.indexOf(endTag, i);
      if (endIdx !== -1) {
        mathEnd = endIdx + endTag.length;
      } else {
        mathEnd = text.length;
      }
    } else {
      let pos = i;
      let parenDepth = 0;

      while (pos < text.length) {
        if (parenDepth === 0 && ENGLISH_WORDS_REGEX.test(text.substring(pos))) {
          break;
        }

        if (text[pos] === '\\') {
          const cmdMatch = text.substring(pos).match(/^\\[a-zA-Z]+/);
          if (cmdMatch) {
            const cmd = cmdMatch[0];
            pos += cmd.length;

            if (cmd === '\\frac') {
              for (let argCount = 0; argCount < 2; argCount++) {
                while (pos < text.length && /\s/.test(text[pos])) pos++;
                if (text[pos] === '{') {
                  const grp = readBalancedGroup(text, pos);
                  if (grp) pos = grp.nextPos;
                }
              }
            } else if (cmd === '\\sqrt') {
              while (pos < text.length && /\s/.test(text[pos])) pos++;
              if (text[pos] === '[') {
                const grp = readBalancedGroup(text, pos);
                if (grp) pos = grp.nextPos;
              }
              while (pos < text.length && /\s/.test(text[pos])) pos++;
              if (text[pos] === '{') {
                const grp = readBalancedGroup(text, pos);
                if (grp) pos = grp.nextPos;
              }
            } else if (cmd === '\\vec' || cmd === '\\xrightarrow') {
              while (pos < text.length && /\s/.test(text[pos])) pos++;
              if (text[pos] === '{') {
                const grp = readBalancedGroup(text, pos);
                if (grp) pos = grp.nextPos;
              }
            } else if (/^\\(?:int|iint|iiint|oint|idotsint|sum|prod|lim)$/.test(cmd)) {
              while (pos < text.length) {
                while (pos < text.length && /\s/.test(text[pos])) pos++;
                if (text[pos] === '_' || text[pos] === '^') {
                  pos++;
                  while (pos < text.length && /\s/.test(text[pos])) pos++;
                  if (text[pos] === '{') {
                    const grp = readBalancedGroup(text, pos);
                    if (grp) pos = grp.nextPos;
                  } else {
                    pos++;
                  }
                } else {
                  break;
                }
              }
            }
          } else {
            pos++;
          }
        } else if (text[pos] === '_' || text[pos] === '^') {
          pos++;
          while (pos < text.length && /\s/.test(text[pos])) pos++;
          if (text[pos] === '{') {
            const grp = readBalancedGroup(text, pos);
            if (grp) pos = grp.nextPos;
          } else {
            pos++;
          }
        } else if (text[pos] === '{') {
          const grp = readBalancedGroup(text, pos);
          if (grp) pos = grp.nextPos;
          else pos++;
        } else if (text[pos] === '(') {
          parenDepth++;
          pos++;
        } else if (text[pos] === ')') {
          if (parenDepth > 0) parenDepth--;
          pos++;
        } else if (/[a-zA-Z0-9\+\-\*\/\=\[\]\,\.\s]/.test(text[pos])) {
          const diffMatch = text.substring(pos).match(/^d[xyztr\theta]/);
          if (diffMatch) {
            pos += diffMatch[0].length;
            continue;
          }
          if (parenDepth === 0 && (text[pos] === '.' || text[pos] === ',' || text[pos] === ';') && pos + 1 < text.length && /\s+[A-Z]/.test(text.substring(pos + 1))) {
            break;
          }
          pos++;
        } else {
          break;
        }
      }
      mathEnd = pos;
    }

    if (mathEnd > i) {
      const mathStr = text.substring(i, mathEnd).trim();
      if (mathStr) {
        if (segments.length > 0 && segments[segments.length - 1].type === 'math') {
          segments[segments.length - 1].content += " " + mathStr;
        } else {
          segments.push({ type: 'math', content: mathStr });
        }
      }
      i = mathEnd;
    } else {
      segments.push({ type: 'text', content: text[i] });
      i++;
    }
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
    <span className={`formatted-question inline flex-wrap items-baseline ${className}`}>
      {renderedElements.map((el, idx) => {
        if (el.type === 'katexHtml') {
          return (
            <span
              key={idx}
              className="katex-eq-container inline-block text-gray-900 align-middle my-1 px-1 max-w-full overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: el.html }}
            />
          );
        }
        return <span key={idx} className="text-gray-800 align-baseline">{el.content}</span>;
      })}
    </span>
  );
}


