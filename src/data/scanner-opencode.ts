import { basename, dirname } from "path";
import type { Message, ScanOptions, MsgType } from "./types.ts";
import { findFiles, safeReadFile, safeParseJSON, getProjectDisplayName } from "./fs-utils.ts";
import { measureOpenCodeMessage } from "./size.ts";
import { parseTimestamp } from "./time.ts";

interface OpenCodeSessionInfo {
  sessionId: string;
  cwd?: string;
  workspace?: string;
  created?: string;
  updated?: string;
}

export async function scanOpenCode(options: ScanOptions): Promise<Message[]> {
  const messages: Message[] = [];
  
  console.log(`Scanning OpenCode data from: ${options.opencodeRoot}`);
  
  // Find session info files
  const infoFiles = await findFiles([
    "**/storage/session/info/ses_*.json"
  ], options.opencodeRoot);
  
  console.log(`Found ${infoFiles.length} OpenCode session info files`);
  
  const sessionInfos = new Map<string, OpenCodeSessionInfo>();
  
  // Load session metadata
  for (const fileInfo of infoFiles) {
    try {
      const content = await safeReadFile(fileInfo.path);
      if (content) {
        const info = safeParseJSON(content);
        if (info) {
          const sessionId = extractSessionIdFromPath(fileInfo.path);
          if (sessionId) {
            sessionInfos.set(sessionId, {
              sessionId,
              cwd: info.cwd || info.workspace,
              workspace: info.workspace,
              created: info.created || info.createdAt,
              updated: info.updated || info.updatedAt
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Error reading OpenCode info file ${fileInfo.path}:`, error);
    }
  }
  
  // Find message files
  const messageFiles = await findFiles([
    "**/storage/session/message/ses_*/msg_*.json"
  ], options.opencodeRoot);
  
  console.log(`Found ${messageFiles.length} OpenCode message files`);
  
  let parsedCount = 0;
  let errorCount = 0;
  
  for (const fileInfo of messageFiles) {
    try {
      const sessionId = extractSessionIdFromMessagePath(fileInfo.path);
      if (!sessionId) continue;
      
      const content = await safeReadFile(fileInfo.path);
      if (!content) continue;
      
      const obj = safeParseJSON(content);
      if (!obj) continue;
      
      const sessionInfo = sessionInfos.get(sessionId);
      const projectDirName = extractProjectDirFromPath(fileInfo.path);
      
      const message = parseOpenCodeMessage(obj, sessionId, sessionInfo, projectDirName, fileInfo.mtime, options);
      if (message && shouldIncludeMessage(message, options)) {
        messages.push(message);
        parsedCount++;
      }
    } catch (error) {
      console.warn(`Error processing OpenCode file ${fileInfo.path}:`, error);
      errorCount++;
    }
  }
  
  console.log(`OpenCode: parsed ${parsedCount} messages, ${errorCount} errors`);
  return messages;
}

function extractSessionIdFromPath(path: string): string | null {
  const match = path.match(/ses_([^/]+)\.json$/);
  return match ? match[1] : null;
}

function extractSessionIdFromMessagePath(path: string): string | null {
  const match = path.match(/ses_([^/]+)\/msg_/);
  return match ? match[1] : null;
}

function extractProjectDirFromPath(path: string): string {
  // Extract project directory from path like:
  // ~/.local/share/opencode/project/Users-daniel-dev-Matrix2/storage/...
  const match = path.match(/\/project\/([^/]+)\//);
  return match ? match[1] : "unknown";
}

function parseOpenCodeMessage(
  obj: any,
  sessionId: string,
  sessionInfo: OpenCodeSessionInfo | undefined,
  projectDirName: string,
  fileMtime: Date,
  options: ScanOptions
): Message | null {
  if (!obj || typeof obj !== "object") return null;
  
  const timestamp = parseTimestamp(
    obj.timestamp || 
    obj.createdAt || 
    obj.created ||
    sessionInfo?.created
  ) || fileMtime;
  
  const msgType = classifyOpenCodeMessage(obj);
  const size = measureOpenCodeMessage(obj, options.sizeMode);
  const projectDisplay = getProjectDisplayName(
    sessionInfo?.cwd || sessionInfo?.workspace,
    projectDirName
  );
  
  return {
    tool: "opencode",
    sessionId,
    projectDisplay,
    projectPath: sessionInfo?.cwd || sessionInfo?.workspace,
    timestamp,
    fileModifiedAt: fileMtime,
    role: obj.role,
    msgType,
    size,
    raw: obj
  };
}

function classifyOpenCodeMessage(obj: any): MsgType {
  // Check role first
  if (obj.role === "user" || obj.type === "human") {
    return "user";
  }
  
  // Check for tool result patterns first (these can come from user or assistant)
  if (obj.type === "tool_result" || 
      obj.type === "function_result" ||
      (obj.parts && obj.parts.some((part: any) => 
        part.type === "tool_result" || part.type === "function_result"))) {
    return "tool_result";
  }
  
  if (obj.role === "assistant" || obj.type === "ai") {
    // Check for tool use patterns
    if (obj.parts && Array.isArray(obj.parts)) {
      const hasToolUse = obj.parts.some((part: any) => 
        part.type === "tool-call" || 
        part.type === "tool_use" ||
        part.type === "function_call"
      );
      return hasToolUse ? "tool_call" : "assistant";
    }
    
    // Check content for tool patterns
    if (obj.content) {
      const contentStr = typeof obj.content === "string" ? 
        obj.content : 
        JSON.stringify(obj.content);
      
      if (contentStr.includes("tool_use") || contentStr.includes("function_call")) {
        return "tool_call";
      }
    }
    
    return "assistant";
  }
  
  // Default classification
  return "assistant";
}

function shouldIncludeMessage(message: Message, options: ScanOptions): boolean {
  if (options.since && message.timestamp < options.since) {
    return false;
  }
  return true;
}