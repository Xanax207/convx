import { basename } from "path";
import type { Message, ScanOptions, MsgType } from "./types.ts";
import { findFiles, readNDJSON, safeReadFile, safeParseJSON, getProjectDisplayName } from "./fs-utils.ts";
import { measureClaudeMessage } from "./size.ts";
import { parseTimestamp } from "./time.ts";

export async function scanClaudeCode(options: ScanOptions): Promise<Message[]> {
  const messages: Message[] = [];
  
  console.log(`Scanning Claude Code data from: ${options.claudeRoot}`);
  
  const fileInfos = await findFiles([
    "**/*.json",
    "**/*.jsonl", 
    "**/*.ndjson",
    "**/*.log"
  ], options.claudeRoot);
  
  console.log(`Found ${fileInfos.length} Claude Code files`);
  
  let parsedCount = 0;
  let errorCount = 0;
  
  for (const fileInfo of fileInfos) {
    try {
      const projectDirSegments = fileInfo.path
        .replace(options.claudeRoot, "")
        .split("/")
        .filter(s => s);
      
      const projectDirName = projectDirSegments[0] || "unknown";
      
      // Check if file looks like NDJSON/JSONL
      const isStreamFormat = fileInfo.path.match(/\.(jsonl|ndjson|log)$/) || 
                            await looksLikeNDJSON(fileInfo.path);
      
      if (isStreamFormat) {
        for await (const obj of readNDJSON(fileInfo.path)) {
          const message = parseClaudeMessage(obj, projectDirName, fileInfo.mtime, options);
          if (message && shouldIncludeMessage(message, options)) {
            messages.push(message);
            parsedCount++;
          }
        }
      } else {
        // Try to parse as JSON array
        const content = await safeReadFile(fileInfo.path);
        if (content) {
          const obj = safeParseJSON(content);
          if (obj) {
            if (Array.isArray(obj)) {
              for (const item of obj) {
                const message = parseClaudeMessage(item, projectDirName, fileInfo.mtime, options);
                if (message && shouldIncludeMessage(message, options)) {
                  messages.push(message);
                  parsedCount++;
                }
              }
            } else {
              const message = parseClaudeMessage(obj, projectDirName, fileInfo.mtime, options);
              if (message && shouldIncludeMessage(message, options)) {
                messages.push(message);
                parsedCount++;
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Error processing Claude file ${fileInfo.path}:`, error);
      errorCount++;
    }
  }
  
  console.log(`Claude Code: parsed ${parsedCount} messages, ${errorCount} errors`);
  return messages;
}

async function looksLikeNDJSON(filePath: string): Promise<boolean> {
  const content = await safeReadFile(filePath);
  if (!content) return false;
  
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return false;
  
  // Check if multiple lines can be parsed as JSON
  let validJsonLines = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (safeParseJSON(lines[i])) {
      validJsonLines++;
    }
  }
  
  return validJsonLines >= 2;
}

function parseClaudeMessage(
  obj: any, 
  projectDirName: string, 
  fileMtime: Date,
  options: ScanOptions
): Message | null {
  if (!obj || typeof obj !== "object") return null;
  
  const sessionId = obj.sessionId || obj.requestId || deriveSessionId(obj, projectDirName);
  if (!sessionId) return null;
  
  const timestamp = parseTimestamp(obj.timestamp) || fileMtime;
  const msgType = classifyClaudeMessage(obj);
  const size = measureClaudeMessage(obj, options.sizeMode);
  const projectDisplay = getProjectDisplayName(obj.cwd, projectDirName);
  
  return {
    tool: "claude-code",
    sessionId,
    projectDisplay,
    projectPath: obj.cwd,
    timestamp,
    fileModifiedAt: fileMtime,
    role: obj.message?.role,
    msgType,
    size,
    raw: obj
  };
}

function classifyClaudeMessage(obj: any): MsgType {
  switch (obj.type) {
    case "user":
      // Check for tool_result pattern in user messages
      if (obj.message?.content && Array.isArray(obj.message.content)) {
        const hasToolResult = obj.message.content.some((part: any) => 
          part.type === "tool_result"
        );
        if (hasToolResult) return "tool_result";
      }
      return "user";
    
    case "assistant":
      if (obj.message?.content && Array.isArray(obj.message.content)) {
        const hasToolUse = obj.message.content.some((part: any) => 
          part.type === "tool_use"
        );
        return hasToolUse ? "tool_call" : "assistant";
      }
      return "assistant";
    
    default:
      // Default to assistant for any other message types
      return "assistant";
  }
}

function deriveSessionId(obj: any, projectDirName: string): string {
  // Try various fallback strategies
  if (obj.conversationId) return obj.conversationId;
  if (obj.threadId) return obj.threadId;
  
  // Create a derived session ID based on content hash or project
  const timestamp = obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now();
  return `${projectDirName}-${Math.floor(timestamp / (1000 * 60 * 60))}`; // Hour-based grouping
}

function shouldIncludeMessage(message: Message, options: ScanOptions): boolean {
  if (options.since && message.timestamp < options.since) {
    return false;
  }
  return true;
}