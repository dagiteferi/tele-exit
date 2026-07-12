import type { ReactNode } from "react";

/**
 * Lightweight Markdown renderer for study-coach chat.
 * Supports paragraphs, lists, bold/italic, inline code, and $math$ / $$math$$.
 */
export function ChatMarkdown({ text }: { text: string }) {
  const blocks = splitBlocks(text.trim());
  return (
    <div className="chat-md space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "math"; text: string };

function splitBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith("$$")) {
      const body: string[] = [];
      if (line.trim() === "$$") {
        i += 1;
        while (i < lines.length && lines[i].trim() !== "$$") {
          body.push(lines[i]);
          i += 1;
        }
        i += 1; // closing $$
      } else {
        body.push(line.trim().replace(/^\$\$/, "").replace(/\$\$$/, ""));
        i += 1;
      }
      out.push({ type: "math", text: body.join("\n") });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      out.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      out.push({ type: "ol", items });
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("$$")
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push({ type: "p", text: para.join(" ") });
  }
  return out;
}

function Block({ block }: { block: Block }) {
  if (block.type === "math") {
    return (
      <div className="overflow-x-auto rounded-md bg-background/60 px-3 py-2 font-mono text-[0.9em] text-primary">
        {block.text}
      </div>
    );
  }
  if (block.type === "ul") {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  if (block.type === "ol") {
    return (
      <ol className="list-decimal space-y-1 pl-5">
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }
  return <p>{renderInline(block.text)}</p>;
}

function renderInline(text: string): ReactNode[] {
  // Tokenize: $$...$$ already handled as blocks; inline $...$, **bold**, *italic*, `code`
  const nodes: ReactNode[] = [];
  const re =
    /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\*\*[^*\n]+?\*\*|\*[^*\n]+?\*|`[^`\n]+?`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    }
    const token = match[0];
    if (token.startsWith("$$") && token.endsWith("$$")) {
      nodes.push(
        <span
          key={key++}
          className="mx-0.5 inline-block rounded bg-background/50 px-1 font-mono text-[0.92em]"
        >
          {token.slice(2, -2)}
        </span>,
      );
    } else if (token.startsWith("$") && token.endsWith("$")) {
      nodes.push(
        <span key={key++} className="mx-0.5 font-mono text-[0.92em] text-primary">
          {token.slice(1, -1)}
        </span>,
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<span key={key++}>{token}</span>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    nodes.push(<span key={key++}>{text.slice(last)}</span>);
  }
  return nodes;
}
