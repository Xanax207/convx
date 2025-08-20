import { Renderable, type RenderableOptions, RGBA, OptimizedBuffer } from "@opentui/core";
import type { Session } from "../data/types.ts";
import { formatFullDateTime } from "../data/time.ts";
import { calculateSessionTokens } from "../data/tokens.ts";

export class HeaderRenderable extends Renderable {
  private session: Session | null = null;

  constructor(id: string, options: RenderableOptions = {}) {
    super(id, {
      ...options,
      height: 3, // Fixed height for header info
      buffered: true
    });

    this.updateContent();
  }

  setSession(session: Session | null): void {
    if (this.session?.sessionId === session?.sessionId && 
        this.session?.tool === session?.tool) {
      return; // Same session, no need to update
    }
    
    this.session = session;
    this.needsUpdate();
  }

  private updateContent(): void {
    // Content is now generated in renderSelf
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    if (!buffer) return;
    
    // Don't clear background - let terminal theme show through

    const textColor = RGBA.fromValues(1, 1, 1, 1); // Terminal default foreground
    const maxWidth = Math.max(10, this.width - 2);
    
    if (!this.session) {
      const text = "No session selected";
      buffer.drawText(text.substring(0, maxWidth), 0, 0, textColor);
      return;
    }

    let y = 0;

    // Tool and session ID (line 1)
    const toolDisplay = this.session.tool === "claude-code" ? "Claude Code" : "OpenCode";
    const sessionIdShort = this.session.sessionId.length > 12 ? 
      this.session.sessionId.substring(0, 12) + "..." : 
      this.session.sessionId;
    const line1 = toolDisplay + " | " + sessionIdShort;
    buffer.drawText(line1.substring(0, maxWidth), 0, y++, textColor);

    // Project info with duration (line 2)
    if (y < this.height) {
      const duration = this.calculateDuration(this.session.startedAt, this.session.endedAt);
      const line2 = String(this.session.projectDisplay) + " | " + duration;
      buffer.drawText(line2.substring(0, maxWidth), 0, y++, textColor);
    }

  }

  private calculateDuration(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes === 0) {
      return "< 1 minute";
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const remainingMinutes = diffMinutes % 60;
      
      if (remainingMinutes === 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
      } else {
        return `${hours}h ${remainingMinutes}m`;
      }
    }
  }

}