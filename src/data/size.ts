import type { ScanOptions } from "./types.ts";

export type SizeMode = "chars" | "bytes" | "tokens";

export function measureText(text: string, mode: SizeMode = "chars"): number {
  if (!text) return 0;
  
  switch (mode) {
    case "chars":
      return text.length;
    case "bytes":
      return new TextEncoder().encode(text).length;
    case "tokens":
      // Rough approximation: ~4 chars per token for English text
      return Math.ceil(text.length / 4);
    default:
      return text.length;
  }
}

export function measureClaudeMessage(obj: any, mode: SizeMode = "chars"): number {
  let totalSize = 0;

  switch (obj.type) {
    case "summary":
      if (typeof obj.summary === "string") {
        totalSize += measureText(obj.summary, mode);
      }
      break;

    case "user":
      if (obj.message?.content) {
        if (typeof obj.message.content === "string") {
          totalSize += measureText(obj.message.content, mode);
        } else if (Array.isArray(obj.message.content)) {
          for (const part of obj.message.content) {
            if (part.type === "text" && part.text) {
              totalSize += measureText(part.text, mode);
            }
            if (part.type === "tool_result" && part.content) {
              totalSize += measureText(JSON.stringify(part.content), mode);
            }
          }
        }
      }
      break;

    case "assistant":
      if (obj.message?.content && Array.isArray(obj.message.content)) {
        for (const part of obj.message.content) {
          if (part.type === "text" && part.text) {
            totalSize += measureText(part.text, mode);
          }
          if (part.type === "thinking" && part.thinking) {
            totalSize += measureText(part.thinking, mode);
          }
          if (part.type === "tool_use" && part.input) {
            totalSize += measureText(JSON.stringify(part.input), mode);
          }
        }
      }
      break;

    default:
      // For unknown types, try to stringify the whole object
      totalSize += measureText(JSON.stringify(obj), mode);
  }

  return Math.max(totalSize, 1); // Minimum size of 1
}

export function measureOpenCodeMessage(obj: any, mode: SizeMode = "chars"): number {
  let totalSize = 0;

  // Handle parts array
  if (obj.parts && Array.isArray(obj.parts)) {
    for (const part of obj.parts) {
      if (part.text) {
        totalSize += measureText(part.text, mode);
      }
      if (part.type === "tool-call" || part.type === "tool_use") {
        totalSize += measureText(JSON.stringify(part.payload || part.input || part), mode);
      }
    }
  }

  // Handle direct content field
  if (obj.content) {
    if (typeof obj.content === "string") {
      totalSize += measureText(obj.content, mode);
    } else {
      totalSize += measureText(JSON.stringify(obj.content), mode);
    }
  }

  // Fallback: stringify the whole object if no content found
  if (totalSize === 0) {
    totalSize = measureText(JSON.stringify(obj), mode);
  }

  return Math.max(totalSize, 1); // Minimum size of 1
}