import { Renderable, type RenderableOptions, OptimizedBuffer, RGBA } from "@opentui/core";
import type { MsgType, Session } from "../data/types.ts";
import { TYPE_COLORS } from "../data/types.ts";

interface TypeStats {
  msgType: MsgType;
  count: number;
  percentage: number;
  color: RGBA;
}

export class PercentageBarRenderable extends Renderable {
  private session: Session | null = null;
  private typeStats: TypeStats[] = [];

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
    this.updateStats();
    this.needsUpdate();
  }

  private updateStats(): void {
    this.typeStats = [];
    
    if (!this.session || this.session.messages.length === 0) {
      return;
    }
    
    // Count messages by type
    const typeCounts = new Map<MsgType, number>();
    for (const msg of this.session.messages) {
      typeCounts.set(msg.msgType, (typeCounts.get(msg.msgType) || 0) + 1);
    }
    
    const totalMessages = this.session.messages.length;
    
    // Convert to stats with percentages
    for (const [msgType, count] of typeCounts) {
      const percentage = (count / totalMessages) * 100;
      
      // Convert hex color to RGBA
      const hex = TYPE_COLORS[msgType];
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      this.typeStats.push({
        msgType,
        count,
        percentage,
        color: RGBA.fromValues(r, g, b, 1)
      });
    }
    
    // Sort by count (descending)
    this.typeStats.sort((a, b) => b.count - a.count);
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    if (!buffer) return;
    
    // Clear the entire buffer to prevent ghosting
    buffer.fillRect(0, 0, this.width, this.height, RGBA.fromValues(0, 0, 0, 1));
    
    if (!this.session) {
      return;
    }
    
    if (this.typeStats.length === 0) {
      return;
    }
    
    // Create single line with all message types
    let currentX = 0;
    const y = 0;
    
    for (let i = 0; i < this.typeStats.length; i++) {
      const stat = this.typeStats[i];
      
      // Format: "U:5(25%) "
      const shortType = stat.msgType.charAt(0).toUpperCase();
      const label = `${shortType}:${stat.count}(${stat.percentage.toFixed(0)}%)`;
      
      // Check if we have space for this label
      if (currentX + label.length >= this.width) break;
      
      // Draw colored type indicator
      buffer.drawText(shortType, currentX, y, stat.color);
      currentX++;
      
      // Draw rest of label in white
      const remainder = label.substring(1);
      buffer.drawText(remainder, currentX, y, RGBA.fromValues(0.9, 0.9, 0.9, 1));
      currentX += remainder.length;
      
      // Add separator if not last item
      if (i < this.typeStats.length - 1 && currentX < this.width - 1) {
        buffer.drawText(" ", currentX, y, RGBA.fromValues(0.5, 0.5, 0.5, 1));
        currentX++;
      }
    }
  }
}