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
  
  // Find part files to get actual content
  const partFiles = await findFiles([
    "**/storage/session/part/ses_*/msg_*/prt_*.json"
  ], options.opencodeRoot);
  
  console.log(`Found ${partFiles.length} OpenCode part files`);
  
  // Group parts by message ID and track file modification times
  const partsByMessage = new Map<string, any[]>();
  const partFileTimesByMessage = new Map<string, Date[]>();
  
  for (const partFile of partFiles) {
    try {
      const content = await safeReadFile(partFile.path);
      if (content) {
        const part = safeParseJSON(content);
        if (part && part.messageID) {
          if (!partsByMessage.has(part.messageID)) {
            partsByMessage.set(part.messageID, []);
            partFileTimesByMessage.set(part.messageID, []);
          }
          partsByMessage.get(part.messageID)!.push(part);
          partFileTimesByMessage.get(part.messageID)!.push(partFile.mtime);
        }
      }
    } catch (error) {
      console.warn(`Error reading OpenCode part file ${partFile.path}:`, error);
    }
  }
  
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
      
      // Get parts for this message
      const messageParts = partsByMessage.get(obj.id) || [];
      
      // Find the latest modification time across message file and part files
      const partTimes = partFileTimesByMessage.get(obj.id) || [];
      const allTimes = [fileInfo.mtime, ...partTimes];
      const latestModTime = allTimes.reduce((latest, current) => 
        current > latest ? current : latest, fileInfo.mtime);
      
      const parsedMessages = parseOpenCodeMessage(obj, sessionId, sessionInfo, projectDirName, latestModTime, options, messageParts);
      for (const message of parsedMessages) {
        if (message && shouldIncludeMessage(message, options)) {
          messages.push(message);
          parsedCount++;
        }
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
  options: ScanOptions,
  messageParts: any[] = []
): Message[] {
  if (!obj || typeof obj !== "object") return [];
  
  const baseTimestamp = parseTimestamp(
    obj.time?.created ||
    obj.timestamp || 
    obj.createdAt || 
    obj.created ||
    sessionInfo?.created
  ) || fileMtime;
  
  const projectDisplay = getProjectDisplayName(
    sessionInfo?.cwd || sessionInfo?.workspace,
    projectDirName
  );
  
  const messages: Message[] = [];
  
  // Handle user messages (simple case)
  if (obj.role === "user") {
    // Use the earliest timestamp from user message parts
    const userTimestamps = messageParts
      .map(part => part.time?.start || part.time?.created)
      .filter(t => t)
      .map(t => new Date(t));
    const userTimestamp = userTimestamps.length > 0 ? 
      new Date(Math.min(...userTimestamps.map(d => d.getTime()))) : baseTimestamp;
    
    const enhancedObj = enhanceOpenCodeMessageWithParts(obj, messageParts);
    const size = measureOpenCodeMessage(enhancedObj, options.sizeMode);
    
    messages.push({
      tool: "opencode",
      sessionId,
      projectDisplay,
      projectPath: sessionInfo?.cwd || sessionInfo?.workspace,
      timestamp: userTimestamp,
      fileModifiedAt: fileMtime,
      role: obj.role,
      msgType: "user",
      size,
      raw: enhancedObj
    });
  }
  
  // Handle assistant messages - process parts in chronological order
  else if (obj.role === "assistant") {
    // Sort parts by timestamp to maintain chronological order, filtering out step markers
    const sortedParts = messageParts
      .filter(part => part.type === "text" || part.type === "tool" || part.type === "reasoning")
      .sort((a, b) => {
        const aTimestamp = getPartTimestamp(a);
        const bTimestamp = getPartTimestamp(b);
        const aTime = aTimestamp ? aTimestamp.getTime() : 0;
        const bTime = bTimestamp ? bTimestamp.getTime() : 0;
        return aTime - bTime;
      });
    
    // Process parts sequentially to maintain proper order
    for (const part of sortedParts) {
      if (part.type === "text" || part.type === "reasoning") {
        // Create individual assistant messages for text/reasoning parts
        const partTimestamp = getPartTimestamp(part) || fileMtime;
        const enhancedObj = enhanceOpenCodeMessageWithParts(obj, [part]);
        const size = measureOpenCodeMessage(enhancedObj, options.sizeMode);
        
        messages.push({
          tool: "opencode",
          sessionId,
          projectDisplay,
          projectPath: sessionInfo?.cwd || sessionInfo?.workspace,
          timestamp: partTimestamp,
          fileModifiedAt: fileMtime,
          role: obj.role,
          msgType: "assistant",
          size,
          raw: enhancedObj
        });
      } else if (part.type === "tool") {
        // For completed tools, create both tool_call and tool_result messages
        if (part.state && part.state.status === "completed") {
          const startTime = part.state.time?.start ? new Date(part.state.time.start) : (getPartTimestamp(part) || fileMtime);
          const endTime = part.state.time?.end ? new Date(part.state.time.end) : new Date(startTime.getTime() + 1);
          
          // Create tool_call message
          const callEnhancedObj = enhanceOpenCodeMessageWithParts(obj, [part], "tool_call");
          const callSize = measureOpenCodeMessage(callEnhancedObj, options.sizeMode);
          
          messages.push({
            tool: "opencode",
            sessionId,
            projectDisplay,
            projectPath: sessionInfo?.cwd || sessionInfo?.workspace,
            timestamp: startTime,
            fileModifiedAt: fileMtime,
            role: obj.role,
            msgType: "tool_call",
            size: callSize,
            raw: callEnhancedObj
          });
          
          // Create tool_result message
          const resultEnhancedObj = enhanceOpenCodeMessageWithParts(obj, [part], "tool_result");
          const resultSize = measureOpenCodeMessage(resultEnhancedObj, options.sizeMode);
          
          messages.push({
            tool: "opencode",
            sessionId,
            projectDisplay,
            projectPath: sessionInfo?.cwd || sessionInfo?.workspace,
            timestamp: endTime,
            fileModifiedAt: fileMtime,
            role: obj.role,
            msgType: "tool_result",
            size: resultSize,
            raw: resultEnhancedObj
          });
        }
      }
    }
  }
  
  return messages;
}

// Helper function to extract timestamp from a part
function getPartTimestamp(part: any): Date | null {
  const timestamp = part.time?.start || part.time?.created || part.time?.end || part.time?.completed ||
                   part.state?.time?.start || part.state?.time?.created || part.state?.time?.end || part.state?.time?.completed;
  return timestamp ? new Date(timestamp) : null;
}

function enhanceOpenCodeMessageWithParts(obj: any, parts: any[], messageType?: string): any {
  // Create a copy of the original object
  const enhanced = { ...obj };
  
  // Check if this is specifically a tool call or tool result based on parts
  const toolParts = parts.filter(part => part.type === "tool");
  const textParts = parts.filter(part => part.type === "text" && part.text);
  const reasoningParts = parts.filter(part => part.type === "reasoning" && part.reasoning);
  
  if (toolParts.length > 0) {
    // This is a tool-related message
    const toolPart = toolParts[0]; // Should only be one tool part per message now
    const toolName = toolPart.tool || "Unknown Tool";
    const callId = toolPart.callID || "Unknown ID";
    
    if (toolPart.state) {
      const input = toolPart.state.input ? JSON.stringify(toolPart.state.input, null, 2) : "No input";
      const output = toolPart.state.output || "No output";
      
      if (messageType === "tool_call") {
        // Tool call shows the input parameters
        enhanced.content = `Tool: ${toolName}\nCall ID: ${callId}\nInput: ${input}`;
      } else {
        // Tool result shows the output
        enhanced.content = `Tool: ${toolName}\nCall ID: ${callId}\nOutput: ${output}`;
      }
    } else {
      enhanced.content = `Tool: ${toolName}\nCall ID: ${callId}\nStatus: pending`;
    }
  } else {
    // This is a text/reasoning message (assistant or user)
    let contentParts: string[] = [];
    
    // Add text content
    if (textParts.length > 0) {
      contentParts.push(...textParts.map(part => part.text));
    }
    
    // Add reasoning content
    if (reasoningParts.length > 0) {
      contentParts.push(...reasoningParts.map(part => `[REASONING]\n${part.reasoning}`));
    }
    
    if (contentParts.length > 0) {
      enhanced.content = contentParts.join("\n\n");
    } else {
      // Fallback based on role
      if (obj.role === "user") {
        enhanced.content = "[User message - no content found]";
      } else {
        enhanced.content = "[Assistant response - no content found]";
      }
    }
  }
  
  // Always set message.content for compatibility
  enhanced.message = {
    content: enhanced.content
  };
  
  enhanced.parts = parts; // Keep original parts for reference
  return enhanced;
}

function shouldIncludeMessage(message: Message, options: ScanOptions): boolean {
  if (options.since && message.timestamp < options.since) {
    return false;
  }
  return true;
}