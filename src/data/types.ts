import { z } from "zod";

export type Tool = "claude-code" | "opencode";

export type MsgType =
  | "user"
  | "assistant"
  | "tool_call"
  | "tool_result";

export interface RawMessage {
  raw: any;
}

export interface Message extends RawMessage {
  tool: Tool;
  sessionId: string;
  projectDisplay: string;
  projectPath?: string;
  timestamp: Date;
  fileModifiedAt: Date; // File modification time from filesystem
  role?: "user" | "assistant";
  msgType: MsgType;
  size: number;
}

export interface Session {
  tool: Tool;
  sessionId: string;
  projectDisplay: string;
  projectPath?: string;
  startedAt: Date;
  endedAt: Date;
  fileLastModified: Date; // Actual file modification time
  messages: Message[];
}

export interface Index {
  byDate: Map<string, Session[]>; // "YYYY-MM-DD" -> Session[]
}

export interface ScanOptions {
  claudeRoot: string;
  opencodeRoot: string;
  sizeMode: "chars" | "bytes" | "tokens";
  since?: Date;
}

// Zod schemas for runtime validation
export const ToolSchema = z.enum(["claude-code", "opencode"]);

export const MsgTypeSchema = z.enum([
  "user",
  "assistant",
  "tool_call",
  "tool_result"
]);

export const MessageSchema = z.object({
  tool: ToolSchema,
  sessionId: z.string(),
  projectDisplay: z.string(),
  projectPath: z.string().optional(),
  timestamp: z.date(),
  role: z.enum(["user", "assistant"]).optional(),
  msgType: MsgTypeSchema,
  size: z.number(),
  raw: z.any()
});

export const SessionSchema = z.object({
  tool: ToolSchema,
  sessionId: z.string(),
  projectDisplay: z.string(),
  projectPath: z.string().optional(),
  startedAt: z.date(),
  endedAt: z.date(),
  messages: z.array(MessageSchema)
});

// Type guards
export function isValidMessage(obj: any): obj is Message {
  return MessageSchema.safeParse(obj).success;
}

export function isValidSession(obj: any): obj is Session {
  return SessionSchema.safeParse(obj).success;
}

// Color scheme constants
export const TYPE_COLORS = {
  user: "#FFD166",              // yellow
  assistant: "#06D6A0",         // green
  tool_call: "#118AB2",         // blue
  tool_result: "#EF476F",       // pink/red
} as const;