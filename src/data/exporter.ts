import { dirname, join } from "path";
import { writeFile, mkdir, access, constants } from "fs/promises";
import type { Message, Session } from "./types.ts";

export type ExportFormat = "claude-code" | "opencode";

export interface ExportOptions {
  format: ExportFormat;
  outputPath: string;
  session: Session;
}

export interface ExportResult {
  success: boolean;
  error?: string;
  filesCreated?: string[];
}

export async function exportSession(options: ExportOptions): Promise<ExportResult> {
  try {
    // Validate inputs
    if (!options.session) {
      return { success: false, error: "No session provided for export" };
    }
    
    if (!options.outputPath || !options.outputPath.trim()) {
      return { success: false, error: "Output path is required" };
    }
    
    if (options.session.messages.length === 0) {
      return { success: false, error: "Session has no messages to export" };
    }
    
    // Check if output directory is writable
    try {
      await access(options.outputPath, constants.W_OK);
    } catch {
      try {
        // Try to create the directory if it doesn't exist
        await mkdir(options.outputPath, { recursive: true });
      } catch (dirError) {
        return { 
          success: false, 
          error: `Cannot write to output directory: ${options.outputPath}` 
        };
      }
    }
    
    switch (options.format) {
      case "claude-code":
        return await exportToClaudeCode(options);
      case "opencode":
        return await exportToOpenCode(options);
      default:
        return { success: false, error: `Unknown format: ${options.format}` };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

async function exportToClaudeCode(options: ExportOptions): Promise<ExportResult> {
  const { session, outputPath } = options;
  
  // Generate a unique filename based on timestamp and project
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
  const projectName = (session.projectDisplay || "unknown-project").replace(/[^a-zA-Z0-9]/g, '-');
  const fileName = `${projectName}_${timestamp}.jsonl`;
  
  // Create project-specific directory like Claude Code does (full path with / replaced by -)
  const projectPath = session.projectPath || process.cwd();
  const projectDirName = projectPath.replace(/\//g, '-');
  const projectDir = join(outputPath, projectDirName);
  const filePath = join(projectDir, fileName);
  
  // Ensure output directory exists
  await mkdir(dirname(filePath), { recursive: true });
  
  const lines: string[] = [];
  
  // Add summary line if we have multiple messages
  if (session.messages.length > 1) {
    const summary = generateSessionSummary(session);
    lines.push(JSON.stringify({
      type: "summary",
      summary,
      timestamp: session.startedAt.toISOString(),
      sessionId: session.sessionId
    }));
  }
  
  // Convert each message to Claude Code format
  for (const message of session.messages) {
    const claudeMessage = convertToClaudeCodeMessage(message);
    if (claudeMessage) {
      lines.push(JSON.stringify(claudeMessage));
    }
  }
  
  await writeFile(filePath, lines.join('\n'));
  
  return {
    success: true,
    filesCreated: [filePath]
  };
}

async function exportToOpenCode(options: ExportOptions): Promise<ExportResult> {
  const { session, outputPath } = options;
  
  // Generate a unique session ID based on timestamp and project for OpenCode format
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
  const projectName = (session.projectDisplay || "unknown-project").replace(/[^a-zA-Z0-9]/g, '-');
  const uniqueSessionId = `${projectName}_${timestamp}`;
  
  const filesCreated: string[] = [];
  
  // Create directory structure with project-specific path like OpenCode does (full path with / replaced by -)
  const projectPath = session.projectPath || process.cwd();
  const projectDirName = projectPath.replace(/^\//g, '').replace(/\//g, '-'); // Remove leading / and replace / with -
  const projectDir = join(outputPath, projectDirName);
  const storageDir = join(projectDir, "storage", "session");
  const infoDir = join(storageDir, "info");
  const messageDir = join(storageDir, `ses_${uniqueSessionId}`);
  const partDir = join(storageDir, "part", `ses_${uniqueSessionId}`);
  
  await mkdir(infoDir, { recursive: true });
  await mkdir(messageDir, { recursive: true });
  await mkdir(partDir, { recursive: true });
  
  // Create session info file
  const infoPath = join(infoDir, `ses_${uniqueSessionId}.json`);
  const sessionInfo = {
    id: uniqueSessionId,
    cwd: session.projectPath || process.cwd(),
    workspace: session.projectPath || process.cwd(),
    created: session.startedAt.toISOString(),
    updated: session.endedAt.toISOString()
  };
  await writeFile(infoPath, JSON.stringify(sessionInfo, null, 2));
  filesCreated.push(infoPath);
  
  // Convert messages to OpenCode format
  let messageCounter = 1;
  
  for (const message of session.messages) {
    const messageId = `msg_${messageCounter.toString().padStart(3, '0')}`;
    const messagePath = join(messageDir, `${messageId}.json`);
    const messagePartDir = join(partDir, messageId);
    
    await mkdir(messagePartDir, { recursive: true });
    
    // Create message file
    const openCodeMessage = {
      id: messageId,
      role: message.role || (message.msgType === "user" ? "user" : "assistant"),
      time: {
        created: message.timestamp.toISOString()
      }
    };
    
    await writeFile(messagePath, JSON.stringify(openCodeMessage, null, 2));
    filesCreated.push(messagePath);
    
    // Create part files based on message type
    const parts = await createOpenCodeParts(message, messageId, messagePartDir);
    filesCreated.push(...parts);
    
    messageCounter++;
  }
  
  return {
    success: true,
    filesCreated
  };
}

function convertToClaudeCodeMessage(message: Message): any | null {
  const base = {
    sessionId: message.sessionId,
    timestamp: message.timestamp.toISOString(),
    cwd: message.projectPath || process.cwd()
  };
  
  switch (message.msgType) {
    case "user":
      return {
        ...base,
        type: "user",
        message: {
          role: "user",
          content: extractMessageContent(message)
        }
      };
      
    case "assistant":
      return {
        ...base,
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: extractMessageContent(message)
            }
          ]
        }
      };
      
    case "tool_call":
      return {
        ...base,
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: `call_${Date.now()}`,
              name: extractToolName(message),
              input: extractToolInput(message)
            }
          ]
        }
      };
      
    case "tool_result":
      return {
        ...base,
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: `call_${Date.now()}`,
              content: extractMessageContent(message)
            }
          ]
        }
      };
      
    default:
      return null;
  }
}

async function createOpenCodeParts(message: Message, messageId: string, partDir: string): Promise<string[]> {
  const files: string[] = [];
  let partCounter = 1;
  
  const createPart = async (type: string, content: any) => {
    const partId = `prt_${partCounter.toString().padStart(3, '0')}`;
    const partPath = join(partDir, `${partId}.json`);
    
    const part = {
      id: partId,
      messageID: messageId,
      type,
      time: {
        created: message.timestamp.toISOString()
      },
      ...content
    };
    
    await writeFile(partPath, JSON.stringify(part, null, 2));
    files.push(partPath);
    partCounter++;
  };
  
  switch (message.msgType) {
    case "user":
      await createPart("text", {
        text: extractMessageContent(message)
      });
      break;
      
    case "assistant":
      await createPart("text", {
        text: extractMessageContent(message)
      });
      break;
      
    case "tool_call":
      await createPart("tool", {
        tool: extractToolName(message),
        callID: `call_${Date.now()}`,
        state: {
          status: "running",
          input: extractToolInput(message),
          time: {
            start: message.timestamp.toISOString()
          }
        }
      });
      break;
      
    case "tool_result":
      await createPart("tool", {
        tool: extractToolName(message),
        callID: `call_${Date.now()}`,
        state: {
          status: "completed",
          output: extractMessageContent(message),
          time: {
            start: message.timestamp.toISOString(),
            end: new Date(message.timestamp.getTime() + 1000).toISOString()
          }
        }
      });
      break;
  }
  
  return files;
}

function extractMessageContent(message: Message): string {
  if (message.tool === "claude-code") {
    // For Claude Code messages, extract from raw object
    const raw = message.raw;
    if (raw?.message?.content) {
      if (typeof raw.message.content === "string") {
        return raw.message.content;
      } else if (Array.isArray(raw.message.content)) {
        return raw.message.content
          .map((part: any) => {
            if (part.type === "text") return part.text;
            if (part.type === "tool_result") return JSON.stringify(part.content);
            return "";
          })
          .filter(Boolean)
          .join("\n");
      }
    }
    if (raw?.summary) return raw.summary;
  } else if (message.tool === "opencode") {
    // For OpenCode messages, extract from enhanced content
    const raw = message.raw;
    if (raw?.content) return raw.content;
    if (raw?.message?.content) return raw.message.content;
  }
  
  return "[Content not available]";
}

function extractToolName(message: Message): string {
  const content = extractMessageContent(message);
  const toolMatch = content.match(/Tool:\s*([^\n]+)/);
  return toolMatch ? toolMatch[1].trim() : "Unknown";
}

function extractToolInput(message: Message): any {
  const content = extractMessageContent(message);
  const inputMatch = content.match(/Input:\s*([\s\S]*?)(?:\nOutput:|$)/);
  
  if (inputMatch) {
    try {
      return JSON.parse(inputMatch[1].trim());
    } catch {
      return { raw: inputMatch[1].trim() };
    }
  }
  
  return {};
}

function generateSessionSummary(session: Session): string {
  const userMessages = session.messages.filter(m => m.msgType === "user").length;
  const assistantMessages = session.messages.filter(m => m.msgType === "assistant").length;
  const toolCalls = session.messages.filter(m => m.msgType === "tool_call").length;
  
  return `Conversation with ${userMessages} user messages, ${assistantMessages} assistant responses, and ${toolCalls} tool calls. Project: ${session.projectDisplay}`;
}