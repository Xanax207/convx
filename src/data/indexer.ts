import type { Message, Session, Index, ScanOptions } from "./types.ts";
import { scanClaudeCode } from "./scanner-claude.ts";
import { scanOpenCode } from "./scanner-opencode.ts";
import { groupSessionsByDate } from "./time.ts";

interface CacheEntry {
  hash: string;
  index: Index;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function buildIndex(options: ScanOptions): Promise<Index> {
  const cacheKey = generateCacheKey(options);
  const cached = cache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log("Using cached index");
    return cached.index;
  }
  
  console.log("Building fresh index...");
  const startTime = Date.now();
  
  // Scan both sources in parallel
  const [claudeMessages, openCodeMessages] = await Promise.all([
    scanClaudeCode(options).catch(error => {
      console.error("Claude Code scan failed:", error);
      return [];
    }),
    scanOpenCode(options).catch(error => {
      console.error("OpenCode scan failed:", error);
      return [];
    })
  ]);
  
  const allMessages = [...claudeMessages, ...openCodeMessages];
  console.log(`Total messages found: ${allMessages.length}`);
  
  // Group messages into sessions
  const sessions = buildSessions(allMessages);
  console.log(`Built ${sessions.length} sessions`);
  
  // Group sessions by date
  const byDate = groupSessionsByDate(sessions);
  
  const index: Index = { byDate };
  
  // Cache the result
  const hash = generateIndexHash(allMessages);
  cache.set(cacheKey, {
    hash,
    index,
    timestamp: Date.now()
  });
  
  const duration = Date.now() - startTime;
  console.log(`Index built in ${duration}ms`);
  
  return index;
}

function buildSessions(messages: Message[]): Session[] {
  const sessionMap = new Map<string, Message[]>();
  
  // Group messages by tool + sessionId
  for (const message of messages) {
    const key = `${message.tool}:${message.sessionId}`;
    const existing = sessionMap.get(key) || [];
    existing.push(message);
    sessionMap.set(key, existing);
  }
  
  const sessions: Session[] = [];
  
  for (const [key, sessionMessages] of sessionMap) {
    if (sessionMessages.length === 0) continue;
    
    // Sort messages by timestamp
    sessionMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const first = sessionMessages[0];
    const last = sessionMessages[sessionMessages.length - 1];
    
    // Find the latest file modification time across all messages
    const fileLastModified = sessionMessages.reduce((latest, msg) => {
      return msg.fileModifiedAt.getTime() > latest.getTime() ? msg.fileModifiedAt : latest;
    }, first.fileModifiedAt);

    const session: Session = {
      tool: first.tool,
      sessionId: first.sessionId,
      projectDisplay: first.projectDisplay,
      projectPath: first.projectPath,
      startedAt: first.timestamp,
      endedAt: last.timestamp,
      fileLastModified,
      messages: sessionMessages
    };
    
    sessions.push(session);
  }
  
  return sessions;
}

function generateCacheKey(options: ScanOptions): string {
  const parts = [
    options.claudeRoot,
    options.opencodeRoot,
    options.sizeMode,
    options.since?.getTime() || "no-since"
  ];
  return parts.join("|");
}

function generateIndexHash(messages: Message[]): string {
  // Simple hash based on message count and sample content
  const sampleData = messages.slice(0, 100).map(m => 
    `${m.tool}:${m.sessionId}:${m.timestamp.getTime()}:${m.size}`
  ).join("|");
  
  let hash = 0;
  for (let i = 0; i < sampleData.length; i++) {
    const char = sampleData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `${messages.length}-${hash.toString(36)}`;
}

export function clearCache(): void {
  cache.clear();
  console.log("Index cache cleared");
}

export function getCacheStats(): { size: number; entries: string[] } {
  return {
    size: cache.size,
    entries: Array.from(cache.keys())
  };
}