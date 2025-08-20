import { Renderable, type RenderableOptions, OptimizedBuffer, RGBA } from "@opentui/core";
import type { MsgType, Session } from "../data/types.ts";
import { TYPE_COLORS } from "../data/types.ts";
import { calculateSessionTokens } from "../data/tokens.ts";

interface BarSegment {
  msgType: MsgType;
  count: number;
  size: number;
  width: number;
  color: RGBA;
}

export class StackedBarRenderable extends Renderable {
  private session: Session | null = null;
  private segments: BarSegment[] = [];

  constructor(id: string, options: RenderableOptions = {}) {
    super(id, {
      ...options,
      buffered: true
    });
  }

  setSession(session: Session | null): void {
    if (this.session?.sessionId === session?.sessionId && 
        this.session?.tool === session?.tool) {
      return; // Same session, no need to update
    }
    
    this.session = session;
    this.updateSegments();
    this.needsUpdate();
  }

  private updateSegments(): void {
    this.segments = [];
    
    if (!this.session || this.session.messages.length === 0) {
      return;
    }
    
    // Sort messages by timestamp for chronological order
    const sortedMessages = [...this.session.messages].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    if (sortedMessages.length === 0) return;
    
    const barWidth = Math.max(20, this.width - 4);
    const messagesPerSegment = Math.max(1, Math.ceil(sortedMessages.length / barWidth));
    
    // Create chronological segments - each represents a time slice
    for (let i = 0; i < barWidth; i++) {
      const startIdx = i * messagesPerSegment;
      const endIdx = Math.min(startIdx + messagesPerSegment, sortedMessages.length);
      
      if (startIdx >= sortedMessages.length) break;
      
      const segmentMessages = sortedMessages.slice(startIdx, endIdx);
      if (segmentMessages.length === 0) continue;
      
      // Find the most common message type in this time slice
      const typeCounts = new Map<MsgType, number>();
      for (const msg of segmentMessages) {
        typeCounts.set(msg.msgType, (typeCounts.get(msg.msgType) || 0) + 1);
      }
      
      // Get the dominant message type for this segment
      let dominantType: MsgType = "user";
      let maxCount = 0;
      for (const [type, count] of typeCounts) {
        if (count > maxCount) {
          maxCount = count;
          dominantType = type;
        }
      }
      
      const totalSize = segmentMessages.reduce((sum, msg) => sum + msg.size, 0);
      
      // Convert hex color to RGBA
      const hex = TYPE_COLORS[dominantType];
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      this.segments.push({
        msgType: dominantType,
        count: segmentMessages.length,
        size: totalSize,
        width: 1, // Each segment is 1 character wide
        color: RGBA.fromValues(r, g, b, 1)
      });
    }
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    if (!buffer) return;
    
    if (!this.session) {
      // Show placeholder text
      const text = "Select a session to view message breakdown";
      const x = Math.max(0, Math.floor((this.width - text.length) / 2));
      const y = Math.floor(this.height / 2);
      buffer.drawText(text, x, y, RGBA.fromValues(0.5, 0.5, 0.5, 1));
      return;
    }
    
    if (this.segments.length === 0) {
      const text = "No messages in this session";
      const x = Math.max(0, Math.floor((this.width - text.length) / 2));
      const y = Math.floor(this.height / 2);
      buffer.drawText(text, x, y, RGBA.fromValues(0.7, 0.7, 0.7, 1));
      return;
    }
    
    // Draw the stacked bar in the middle
    const barY = Math.floor(this.height / 2);
    const barWidth = Math.max(10, this.width - 2);
    let currentX = 1;
    
    for (const segment of this.segments) {
      if (segment.width <= 0) continue;
      
      // Draw segment using filled blocks
      const blockChar = "█";
      for (let i = 0; i < segment.width && currentX + i < this.width - 1; i++) {
        buffer.drawText(blockChar, currentX + i, barY, segment.color);
      }
      
      currentX += segment.width;
    }
    
    // Calculate and display total at bottom with token info
    const totalSize = this.segments.reduce((sum, seg) => sum + seg.size, 0);
    const totalCount = this.segments.reduce((sum, seg) => sum + seg.count, 0);
    
    // Calculate token information
    const tokenStats = calculateSessionTokens(this.session.messages);
    
    let totalText = `${totalCount} msgs | ${totalSize} chars`;
    if (tokenStats.hasTokenData) {
      totalText = `${totalCount} msgs | ${tokenStats.displayText} | ${totalSize} chars`;
    }
    
    const totalY = this.height - 1;
    buffer.drawText(totalText, 0, totalY, RGBA.fromValues(0.8, 0.8, 0.8, 1));
  }

  getSegments(): BarSegment[] {
    return [...this.segments];
  }
}