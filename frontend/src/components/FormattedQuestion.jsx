import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function FormattedQuestion({ question = "", equation = "", className = "" }) {
  const rendered = useMemo(() => {
    let mainText = (question || "").toString();
    let eqText = (equation || "").toString();

    // 1. If explicit equation prop is provided
    if (eqText) {
      try {
        const katexHtml = katex.renderToString(eqText, {
          throwOnError: false,
          displayMode: false
        });
        return { text: mainText, katexHtml };
      } catch (err) {
        return { text: mainText, rawEq: eqText };
      }
    }

    // 2. If no equation prop, check if mainText has math patterns or $...$
    // Do not touch CO tokens (CO1, CO2, CO3, CO4, CO5, CO6)
    if (mainText.includes("$")) {
      const parts = mainText.split("$");
      const htmlParts = parts.map((part, idx) => {
        if (idx % 2 === 1) {
          try {
            return katex.renderToString(part, { throwOnError: false });
          } catch (e) {
            return part;
          }
        }
        return part;
      });
      return { fullHtml: htmlParts.join("") };
    }

    // 3. Fallback: check if text has embedded math exponent like x^2, a^2 + b^2 = c^2
    if (/(?:[a-zA-Z]\^[0-9]+|\=|\√|\\int|\\sum|\\pi|\\sqrt)/.test(mainText)) {
      try {
        const html = katex.renderToString(mainText, { throwOnError: false });
        return { fullHtml: html };
      } catch (e) {
        return { text: mainText };
      }
    }

    return { text: mainText };
  }, [question, equation]);

  if (rendered.fullHtml) {
    return <span className={`formatted-question ${className}`} dangerouslySetInnerHTML={{ __html: rendered.fullHtml }} />;
  }

  return (
    <div className={`formatted-question inline-flex flex-wrap items-baseline gap-2 ${className}`}>
      {rendered.text && <span className="text-gray-800">{rendered.text}</span>}
      {rendered.katexHtml && (
        <span
          className="inline-block bg-teal-50/60 px-2 py-0.5 rounded border border-teal-200 text-teal-950 font-mono shadow-none"
          dangerouslySetInnerHTML={{ __html: rendered.katexHtml }}
        />
      )}
      {!rendered.katexHtml && rendered.rawEq && (
        <span className="font-mono bg-gray-100 px-1 rounded text-teal-900">{rendered.rawEq}</span>
      )}
    </div>
  );
}
