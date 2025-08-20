import { Renderable, type RenderableOptions, OptimizedBuffer, RGBA, type ParsedKey } from "@opentui/core";
import type { Session, Tool } from "../data/types.ts";
import { AppStore } from "../state/store.ts";
import { formatTime, sortDateKeysDescending } from "../data/time.ts";

interface AccordionItem {
  type: "date" | "tool" | "project" | "session";
  level: number;
  label: string;
  expanded?: boolean;
  selected?: boolean;
  dateKey?: string;
  tool?: Tool;
  projectDisplay?: string;
  session?: Session;
}

export class AccordionRenderable extends Renderable {
  private store: AppStore;
  private items: AccordionItem[] = [];
  private selectedIndex: number = -1; // -1 means no selection
  private scrollOffset: number = 0;

  constructor(id: string, store: AppStore, options: RenderableOptions = {}) {
    super(id, {
      ...options,
      buffered: true,
      focusable: true,
      height: "auto" // Let it expand to fit content
    });
    
    this.store = store;
    this.updateItems();
    
    // Subscribe to store changes
    this.store.subscribe(() => {
      this.updateItems();
      this.needsUpdate();
    });
  }

  private updateItems(): void {
    const state = this.store.getState();
    this.items = [];
    
    if (!state.index) {
      this.items.push({
        type: "session",
        level: 0,
        label: "No data loaded...",
        expanded: false
      });
        return;
    }
    
    // Collect all sessions from all dates and flatten them
    const allSessions: Session[] = [];
    for (const [, sessionsForDate] of state.index.byDate) {
      allSessions.push(...sessionsForDate);
    }
    
    // Sort by fileLastModified descending (most recent first)
    allSessions.sort((a, b) => {
      return b.fileLastModified.getTime() - a.fileLastModified.getTime();
    });
    
    // Create flat list items for each session
    for (const session of allSessions) {
      const isSelected = state.selectedSession?.sessionId === session.sessionId &&
                       state.selectedSession?.tool === session.tool;
      
      // Format: [Tool] Project | Date | SessionID  
      const toolDisplay = session.tool === "claude-code" ? "CC" : "OC";
      const dateDisplay = formatTime(session.fileLastModified);
      const sessionIdShort = session.sessionId.slice(0, 8);
      const label = `[${toolDisplay}] ${session.projectDisplay} | ${dateDisplay} | ${sessionIdShort}...`;
      
      this.items.push({
        type: "session",
        level: 0,
        label,
        selected: isSelected,
        session
      });
    }
    
    // Ensure selected index is valid (-1 for no selection is allowed)
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = this.items.length - 1;
    }
    
  }


  handleKeyPress(key: ParsedKey): boolean {
    const maxVisibleItems = Math.max(1, this.height - 2); // Account for borders
    
    switch (key.name) {
      case "up":
      case "k":
        if (this.selectedIndex > 0) {
          this.selectedIndex--;
          this.ensureItemVisible();
                this.needsUpdate();
        } else if (this.selectedIndex === -1 && this.items.length > 0) {
          // If no selection, start from the bottom
          this.selectedIndex = this.items.length - 1;
          this.ensureItemVisible();
                this.needsUpdate();
        }
        return true;

      case "down":
      case "j":
        if (this.selectedIndex < this.items.length - 1) {
          this.selectedIndex++;
          this.ensureItemVisible();
                this.needsUpdate();
        } else if (this.selectedIndex === -1 && this.items.length > 0) {
          // If no selection, start from the top
          this.selectedIndex = 0;
          this.ensureItemVisible();
                this.needsUpdate();
        }
        return true;

      case "escape":
        // Clear selection both locally and in store
        this.selectedIndex = -1;
        this.store.setSelectedSession(null);
            this.needsUpdate();
        return true;

      case "left":
      case "h":
        // No collapse action needed in flat list
        return true;

      case "right":
      case "l":
      case "return":
        this.selectCurrentItem();
        return true;

      case "home":
        if (this.items.length > 0) {
          this.selectedIndex = 0;
          this.scrollOffset = 0;
          this.needsUpdate();
        }
        return true;

      case "end":
        if (this.items.length > 0) {
          this.selectedIndex = this.items.length - 1;
          this.ensureItemVisible();
          this.needsUpdate();
        }
        return true;

      default:
        return false;
    }
  }

  private ensureItemVisible(): void {
    // No need to scroll if no selection
    if (this.selectedIndex === -1) return;
    
    const maxVisibleItems = Math.max(1, this.height - 2);
    
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + maxVisibleItems) {
      this.scrollOffset = this.selectedIndex - maxVisibleItems + 1;
    }
  }

  private selectCurrentItem(): void {
    // Can't select if no selection
    if (this.selectedIndex === -1) return;
    
    const item = this.items[this.selectedIndex];
    if (!item || !item.session) return;

    this.store.setSelectedSession(item.session);
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    if (!buffer) return;
    
    // Clear the entire buffer to prevent ghosting - use black background like working version
    buffer.fillRect(0, 0, this.width, this.height, RGBA.fromValues(0, 0, 0, 1));
    
    const maxVisibleItems = Math.max(1, this.height - 2); // Account for borders
    const visibleItems = this.items.slice(this.scrollOffset, this.scrollOffset + maxVisibleItems);
    
    let y = 1; // Start at y=1 to account for top border
    
    for (let i = 0; i < visibleItems.length && y < this.height - 1; i++) {
      const item = visibleItems[i];
      // Calculate the absolute index of this item in the full list
      const absoluteIndex = this.scrollOffset + i;
      const isCurrentSelection = this.selectedIndex !== -1 && absoluteIndex === this.selectedIndex;
      
      // Background highlighting for current selection
      if (isCurrentSelection) {
        buffer.fillRect(1, y, this.width - 2, 1, RGBA.fromValues(0.2, 0.2, 0.4, 1)); // Blue highlight
      }
      
      // Use default terminal colors - this should adapt to the theme
      const textColor = isCurrentSelection ? 
        RGBA.fromValues(1, 1, 1, 1) : // White text on highlighted background
        RGBA.fromValues(0.8, 0.8, 0.8, 1); // Gray text normally
      
      // Add label, ensuring it's a clean string
      const cleanLabel = String(item.label || "").replace(/[^\x20-\x7E]/g, '');
      let displayText = cleanLabel;
      
      // Truncate if too long, accounting for left padding and right border
      const maxLen = Math.max(10, this.width - 2); // Like working version
      if (displayText.length > maxLen) {
        displayText = displayText.substring(0, maxLen - 3) + "...";
      }
      
      // Draw the text with proper padding inside the box
      if (displayText && displayText.length > 0) {
        buffer.drawText(displayText, 1, y, textColor);
      }
      
      y++;
    }
    
    // Draw scroll indicators if needed (like working version)
    const scrollColor = RGBA.fromValues(0.6, 0.6, 0.6, 1);
    
    if (this.scrollOffset > 0) {
      buffer.drawText("↑", this.width - 2, 1, scrollColor);
    }
    
    if (this.scrollOffset + maxVisibleItems < this.items.length) {
      buffer.drawText("↓", this.width - 2, this.height - 2, scrollColor);
    }
  }
}