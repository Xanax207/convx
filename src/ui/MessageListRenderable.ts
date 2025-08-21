import { Renderable, type RenderableOptions, OptimizedBuffer, RGBA } from "@opentui/core";
import type { Session, Message, MsgType } from "../data/types.ts";
import { TYPE_COLORS } from "../data/types.ts";
import { extractMessageTokens } from "../data/tokens.ts";

export class MessageListRenderable extends Renderable {
  private session: Session | null = null;
  private scrollOffset: number = 0;
  private selectedIndex: number = 0;
  private expandedIndex: number = -1; // Track which message is expanded
  private expandedScrollOffset: number = 0; // Track scroll within expanded message

  constructor(id: string, options: RenderableOptions = {}) {
    super(id, {
      ...options,
      buffered: true,
      focusable: true
    });
  }

  setSession(session: Session | null): void {
    if (this.session?.sessionId === session?.sessionId && 
        this.session?.tool === session?.tool) {
      return; // Same session, no need to update
    }
    
    this.session = session;
    this.scrollOffset = 0; // Reset scroll when changing sessions
    this.selectedIndex = 0; // Reset selection
    this.expandedIndex = -1; // Reset expansion
    this.expandedScrollOffset = 0; // Reset expanded scroll
    this.needsUpdate();
  }

  protected renderSelf(buffer: OptimizedBuffer): void {
    if (!buffer) return;
    
    // Clear the entire buffer to prevent ghosting - use black background like working accordion
    buffer.fillRect(0, 0, this.width, this.height, RGBA.fromValues(0, 0, 0, 1));

    if (!this.session || this.session.messages.length === 0) {
      const text = this.session ? "No messages in this session" : "No session selected";
      const textColor = RGBA.fromValues(0.7, 0.7, 0.7, 1); // Dimmed text for no session
      buffer.drawText(text, 1, Math.floor(this.height / 2), textColor);
      return;
    }

    // Sort messages by timestamp for chronological order
    const sortedMessages = [...this.session.messages].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Calculate visible range (account for borders like accordion)
    const totalMessages = sortedMessages.length;
    const maxVisibleMessages = this.height - 2; // Account for top/bottom borders
    const startIdx = this.scrollOffset;
    const endIdx = Math.min(startIdx + maxVisibleMessages, totalMessages);
    
    let y = 1; // Start at y=1 to account for top border
    
    // Render each visible message (accounting for expanded messages)
    let processedMessages = 0;
    for (let msgIdx = startIdx; msgIdx < totalMessages && y < this.height - 1 && processedMessages < this.height; msgIdx++) {
      processedMessages++;
      const message = sortedMessages[msgIdx];
      const isSelected = msgIdx === this.selectedIndex;
      const isExpanded = msgIdx === this.expandedIndex;
      
      // Get type indicator and color
      let indicator = "U";
      if (message.msgType === "assistant") indicator = "A";
      else if (message.msgType === "tool_call") indicator = "T";  
      else if (message.msgType === "tool_result") indicator = "R";
      
      // Convert hex color to RGBA
      const hex = TYPE_COLORS[message.msgType];
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const typeColor = RGBA.fromValues(r, g, b, 1);
      
      // Highlight selected message with different background
      if (isSelected) {
        const highlightColor = RGBA.fromValues(0.2, 0.2, 0.4, 1); // Blue highlight like accordion
        buffer.fillRect(1, y, this.width - 2, 1, highlightColor);
      }
      
      // Draw type indicator with colored background (account for left border)
      buffer.fillRect(1, y, 1, 1, typeColor);
      buffer.drawText(indicator, 1, y, RGBA.fromValues(0, 0, 0, 1));
      
      if (isExpanded) {
        // Show readable message content across multiple lines with scrolling
        const readableContent = this.extractReadableContent(message);
        const lines = readableContent.split('\n');
        const availableWidth = Math.max(10, this.width - 3);
        
        // Draw first line (header with scroll indicator)
        const headerText = `[EXPANDED] ${this.extractMessageContent(message)}`;
        const scrollInfo = ` (${this.expandedScrollOffset + 1}/${lines.length} lines)`;
        const fullHeader = headerText + scrollInfo;
        const textColor = RGBA.fromValues(1, 1, 1, 1); // Standard text for expanded header
        buffer.drawText(" " + fullHeader.substring(0, availableWidth), 2, y, textColor);
        y++;
        
        // Calculate available lines for content (account for scroll indicators and remaining space)
        const remainingHeight = this.height - y;
        const hasUpScroll = this.expandedScrollOffset > 0;
        
        // Calculate how many other messages need space below this one
        const messagesBelow = totalMessages - msgIdx - 1;
        const spaceForOtherMessages = Math.min(messagesBelow, 3); // Reserve space for up to 3 messages below
        
        // Use most of remaining space but leave room for other messages
        const maxExpandedLines = Math.max(5, remainingHeight - spaceForOtherMessages - 1);
        
        // Reserve space for indicators
        const maxIndicatorLines = 2; // Up to 2 lines for scroll indicators
        const availableContentLines = Math.max(1, maxExpandedLines - maxIndicatorLines);
        
        // Apply scroll offset to content lines
        const startLine = this.expandedScrollOffset;
        const endLine = Math.min(startLine + availableContentLines, lines.length);
        
        // Now determine if we actually need scroll indicators
        const hasDownScroll = endLine < lines.length;
        const actualIndicatorLines = (hasUpScroll ? 1 : 0) + (hasDownScroll ? 1 : 0);
        
        // Recalculate content lines with actual indicator count
        const finalContentLines = Math.max(1, maxExpandedLines - actualIndicatorLines);
        const finalEndLine = Math.min(startLine + finalContentLines, lines.length);
        
        // Show scroll up indicator first if needed
        if (hasUpScroll && y < this.height) {
          const upText = `  ^ UP for more (showing from line ${startLine + 1})`;
          buffer.drawText(upText, 2, y, RGBA.fromValues(0.7, 0.7, 0.7, 1));
          y++;
        }
        
        // Draw content lines with scroll offset and word wrapping
        for (let i = startLine; i < finalEndLine && y < this.height - (hasDownScroll ? 1 : 0); i++) {
          const line = lines[i];
          const wrappedLines = this.wrapText(line, availableWidth);
          
          for (const wrappedLine of wrappedLines) {
            if (y >= this.height - (hasDownScroll ? 1 : 0)) break;
            // Use gray for non-user messages in expanded view, white for user messages
            const contentColor = message.msgType === "user" ? 
              RGBA.fromValues(1, 1, 1, 1) : // Normal white for user messages
              RGBA.fromValues(0.6, 0.6, 0.6, 1); // Gray for non-user messages
            buffer.drawText("  " + wrappedLine, 2, y, contentColor);
            y++;
          }
        }
        
        // Show scroll down indicator at the end if needed
        if (hasDownScroll && y < this.height) {
          const remaining = lines.length - finalEndLine;
          const downText = `  v DOWN for ${remaining} more lines`;
          buffer.drawText(downText, 2, y, RGBA.fromValues(0.7, 0.7, 0.7, 1));
          y++;
        }
        
        // Add some spacing after expanded content
        if (y < this.height) {
          y++;
        }
      } else {
        // Show condensed message content with token info
        let content = this.extractMessageContent(message);
        const tokenInfo = extractMessageTokens(message);
        
        // Calculate relative ranking for color coding
        let tokenColor: RGBA | undefined;
        if (tokenInfo.hasTokens && tokenInfo.displayText && this.session) {
          const messageTokens = Math.round(message.size / 4);
          const rankPercentile = this.getTokenRankPercentile(messageTokens);
          tokenColor = this.getTokenColorByRank(rankPercentile);
          content = `${tokenInfo.displayText} ${content}`;
        }
        
        const availableWidth = Math.max(10, this.width - 3);
        
        if (content.length > availableWidth) {
          content = content.substring(0, availableWidth - 3) + "...";
        }
        
        // Draw message content with selection-aware and token-aware colors
        if (tokenInfo.hasTokens && tokenInfo.displayText && tokenColor) {
          // Draw token count in color, rest in regular color
          const tokenText = tokenInfo.displayText;
          const restContent = content.substring(tokenText.length);
          
          // Token count in calculated color
          buffer.drawText(" " + tokenText, 2, y, tokenColor);
          
          // Rest of content in regular color - gray for non-user messages, white for user messages
          const textColor = isSelected ? 
            RGBA.fromValues(1, 1, 1, 1) : // White text when selected
            (message.msgType === "user" ? 
              RGBA.fromValues(0.9, 0.9, 0.9, 1) : // Normal brightness for user messages
              RGBA.fromValues(0.6, 0.6, 0.6, 1)); // Grayed out for non-user messages
          const tokenWidth = tokenText.length + 1; // +1 for space
          buffer.drawText(restContent, 2 + tokenWidth, y, textColor);
        } else {
          // No token info, draw normally - gray for non-user messages, white for user messages
          const textColor = isSelected ? 
            RGBA.fromValues(1, 1, 1, 1) : // White text when selected
            (message.msgType === "user" ? 
              RGBA.fromValues(0.9, 0.9, 0.9, 1) : // Normal brightness for user messages
              RGBA.fromValues(0.6, 0.6, 0.6, 1)); // Grayed out for non-user messages
          buffer.drawText(" " + content, 2, y, textColor);
        }
        y++;
      }
      
      // Continue to next message
      // Skip messages that would go beyond visible area
      if (y >= this.height) break;
    }
    
    // Draw scroll indicators if needed
    if (this.scrollOffset > 0) {
      buffer.drawText("^", this.width - 1, 0, RGBA.fromValues(0.6, 0.6, 0.6, 1));
    }
    
    if (this.scrollOffset + maxVisibleMessages < totalMessages) {
      buffer.drawText("v", this.width - 1, this.height - 1, RGBA.fromValues(0.6, 0.6, 0.6, 1));
    }
  }

  private extractMessageContent(message: Message): string {
    if (!message.raw) return "[No content]";
    
    // Format message content based on type and structure
    if (message.msgType === "user") {
      // User messages - show the actual text content, prefer enhanced content from scanner
      if (message.raw.content && typeof message.raw.content === "string") {
        // Use enhanced content from scanner (for OpenCode)
        return message.raw.content.replace(/\s+/g, " ").trim();
      }
      
      if (typeof message.raw === "string") {
        return message.raw.replace(/\s+/g, " ").trim();
      }
      
      if (message.raw.message?.content) {
        if (typeof message.raw.message.content === "string") {
          return message.raw.message.content.replace(/\s+/g, " ").trim();
        }
        
        if (Array.isArray(message.raw.message.content)) {
          const textParts = message.raw.message.content
            .filter((part: any) => part.type === "text" && part.text)
            .map((part: any) => part.text);
          
          if (textParts.length > 0) {
            return textParts.join(" ").replace(/\s+/g, " ").trim();
          }
        }
      }
    }
    
    else if (message.msgType === "assistant") {
      // Assistant messages - show text content, prefer enhanced content from scanner
      if (message.raw.content && typeof message.raw.content === "string") {
        // Use enhanced content from scanner (for OpenCode)
        return message.raw.content.replace(/\s+/g, " ").trim();
      }
      
      if (message.raw.message?.content) {
        if (typeof message.raw.message.content === "string") {
          return message.raw.message.content.replace(/\s+/g, " ").trim();
        }
        
        if (Array.isArray(message.raw.message.content)) {
          const contentParts = [];
          
          // Include thinking content
          const thinkingParts = message.raw.message.content
            .filter((part: any) => part.type === "thinking" && part.thinking)
            .map((part: any) => `[THINKING: ${part.thinking.substring(0, 50)}...]`);
          
          // Include text content
          const textParts = message.raw.message.content
            .filter((part: any) => part.type === "text" && part.text)
            .map((part: any) => part.text);
          
          contentParts.push(...thinkingParts, ...textParts);
          
          if (contentParts.length > 0) {
            return contentParts.join(" ").replace(/\s+/g, " ").trim();
          }
        }
      }
    }
    
    else if (message.msgType === "tool_call") {
      // Tool calls - handle both Claude Code and OpenCode formats
      
      // OpenCode format - check for enhanced content first
      if (message.raw.content && typeof message.raw.content === "string") {
        // Parse the enhanced content to extract tool name and input
        const lines = message.raw.content.split('\n');
        const toolMatch = lines.find(line => line.startsWith('Tool:'));
        const inputLineIndex = lines.findIndex(line => line.startsWith('Input:'));
        
        if (toolMatch) {
          const toolName = toolMatch.replace('Tool: ', '');
          
          if (inputLineIndex >= 0) {
            // Extract the JSON from the input line and potentially subsequent lines
            try {
              // Get all lines from "Input: " onwards until we hit another section or end
              const inputLines = [];
              for (let i = inputLineIndex; i < lines.length; i++) {
                const line = lines[i];
                if (i === inputLineIndex) {
                  // First line: remove "Input: " prefix
                  inputLines.push(line.replace('Input: ', ''));
                } else if (line.startsWith('Output:') || line.startsWith('--- Raw JSON')) {
                  // Stop when we hit the next section
                  break;
                } else {
                  // Continue adding lines that are part of the JSON
                  inputLines.push(line);
                }
              }
              
              const inputJson = inputLines.join('\n');
              const parsed = JSON.parse(inputJson);
              const args = this.extractToolArgs(toolName, parsed);
              return args ? `${toolName}: ${args}` : toolName;
            } catch {
              // If JSON parsing fails, just show the tool name
              return toolName;
            }
          }
          
          return toolName;
        }
      }
      
      // Claude Code format
      if (message.raw.message?.content && Array.isArray(message.raw.message.content)) {
        const toolParts = message.raw.message.content
          .filter((part: any) => part.type === "tool_use")
          .map((part: any) => {
            const toolName = part.name || "Unknown Tool";
            const description = this.getToolDescription(part);
            return description ? `${toolName}: ${description}` : toolName;
          });
        
        if (toolParts.length > 0) {
          return toolParts.join(", ");
        }
      }
      
      // Fallback: check for parts array directly
      if (message.raw.parts && Array.isArray(message.raw.parts)) {
        const toolParts = message.raw.parts
          .filter((part: any) => part.type === "tool")
          .map((part: any) => {
            const toolName = part.tool || "Unknown Tool";
            const input = part.state?.input;
            
            if (input && typeof input === "object") {
              const args = this.extractToolArgs(toolName, input);
              return args ? `${toolName}: ${args}` : toolName;
            }
            
            return toolName;
          });
        
        if (toolParts.length > 0) {
          return toolParts.join(", ");
        }
      }
      
      // Fallback for other tool call formats
      if (message.raw.function_call?.name) {
        return `${message.raw.function_call.name}(...)`;
      }
      
      return "[Tool Call]";
    }
    
    else if (message.msgType === "tool_result") {
      // Tool results - handle both Claude Code and OpenCode formats
      
      // Claude Code format
      if (message.raw.message?.content && Array.isArray(message.raw.message.content)) {
        const resultParts = message.raw.message.content
          .filter((part: any) => part.type === "tool_result")
          .map((part: any) => {
            // Find the tool name from the corresponding tool call
            const toolName = this.findToolNameForResult(part.tool_use_id);
            const content = part.content;
            
            if (typeof content === "string") {
              const summary = content.length > 50 ? content.substring(0, 50) + "..." : content;
              return `${toolName}: ${summary.replace(/\s+/g, " ")}`;
            }
            
            return `${toolName}: [Output]`;
          });
        
        if (resultParts.length > 0) {
          return resultParts.join(", ");
        }
      }
      
      // OpenCode format - check for enhanced content first (from scanner)
      if (message.raw.content && typeof message.raw.content === "string") {
        // Scanner has already processed the tool parts and created readable content
        const lines = message.raw.content.split('\n');
        const toolLines = lines.filter(line => line.startsWith('[TOOL:'));
        
        if (toolLines.length > 0) {
          const summaries = toolLines.map(line => {
            // Extract tool name and output summary
            const match = line.match(/\[TOOL: ([^\]]+)\]/);
            const toolName = match ? match[1] : "Unknown Tool";
            
            // Look for output in the content
            const outputMatch = message.raw.content.match(/Output: ([^\n]+)/);
            if (outputMatch) {
              const output = outputMatch[1];
              const summary = output.length > 50 ? output.substring(0, 50) + "..." : output;
              return `${toolName}: ${summary}`;
            }
            
            return `${toolName}: [Completed]`;
          });
          
          return summaries.join(", ");
        }
      }
      
      // Fallback: check for parts array directly
      if (message.raw.parts && Array.isArray(message.raw.parts)) {
        const toolParts = message.raw.parts
          .filter((part: any) => part.type === "tool" && part.state?.status === "completed")
          .map((part: any) => {
            const toolName = part.tool || "Unknown Tool";
            const output = part.state?.output;
            
            if (typeof output === "string") {
              // Clean up output and create summary
              const cleanOutput = output.replace(/<\/?[^>]+(>|$)/g, "").replace(/\s+/g, " ").trim();
              const summary = cleanOutput.length > 50 ? cleanOutput.substring(0, 50) + "..." : cleanOutput;
              return summary ? `${toolName}: ${summary}` : `${toolName}: [Completed]`;
            }
            
            return `${toolName}: [Completed]`;
          });
        
        if (toolParts.length > 0) {
          return toolParts.join(", ");
        }
      }
      
      return "[Tool Result]";
    }
    
    // Fallback
    return "[Message]";
  }

  private extractToolArgs(toolName: string, input: any): string {
    if (!input || typeof input !== "object") return "";
    
    // Tool-specific argument extraction
    switch (toolName.toLowerCase()) {
      case "read":
        return input.file_path ? `${input.file_path.split('/').pop()}` : "";
      
      case "write":
        return input.file_path ? `${input.file_path.split('/').pop()}` : "";
      
      case "edit":
        return input.file_path ? `${input.file_path.split('/').pop()}` : "";
      
      case "bash":
        const cmd = input.command || "";
        return cmd.length > 25 ? cmd.substring(0, 25) + "..." : cmd;
      
      case "glob":
        return input.pattern || "";
      
      case "grep":
        return input.pattern || "";
      
      case "todowrite":
        const todoCount = input.todos?.length || 0;
        return `${todoCount} todos`;
      
      case "webfetch":
        return input.url ? new URL(input.url).hostname : "";
      
      case "websearch":
        return input.query || "";
      
      default:
        // Generic extraction - look for common parameter names
        const commonKeys = ['path', 'file_path', 'pattern', 'query', 'command', 'url', 'text', 'content'];
        for (const key of commonKeys) {
          if (input[key] && typeof input[key] === "string") {
            const value = input[key];
            // For file paths, show just the filename
            if (key.includes('path') && value.includes('/')) {
              return value.split('/').pop() || value;
            }
            // For other values, truncate if too long
            return value.length > 25 ? value.substring(0, 25) + "..." : value;
          }
        }
        
        // If no common keys found, show first string value
        const firstStringValue = Object.values(input).find(v => typeof v === "string");
        if (firstStringValue) {
          const str = firstStringValue as string;
          return str.length > 25 ? str.substring(0, 25) + "..." : str;
        }
        
        return "";
    }
  }

  private getToolDescription(toolPart: any): string {
    if (!toolPart.input) return "";
    
    // Extract meaningful description from tool input
    const input = toolPart.input;
    
    // For common tools, show relevant parameters
    if (toolPart.name === "str_replace_editor") {
      if (input.command === "view") {
        return `view ${input.path || "file"}`;
      } else if (input.command === "str_replace") {
        return `edit ${input.path || "file"}`;
      } else if (input.command === "create") {
        return `create ${input.path || "file"}`;
      }
      return input.command || "";
    }
    
    if (toolPart.name === "bash") {
      const cmd = input.command || "";
      return cmd.length > 30 ? cmd.substring(0, 30) + "..." : cmd;
    }
    
    if (toolPart.name === "Edit") {
      return `edit ${input.file_path ? input.file_path.split('/').pop() : "file"}`;
    }
    
    if (toolPart.name === "Read") {
      return `read ${input.file_path ? input.file_path.split('/').pop() : "file"}`;
    }
    
    if (toolPart.name === "Write") {
      return `write ${input.file_path ? input.file_path.split('/').pop() : "file"}`;
    }
    
    // Generic fallback - show first meaningful property
    const keys = Object.keys(input);
    if (keys.length > 0) {
      const firstKey = keys[0];
      const value = input[firstKey];
      if (typeof value === "string" && value.length > 0) {
        return value.length > 20 ? value.substring(0, 20) + "..." : value;
      }
    }
    
    return "";
  }

  // Scroll handling methods (can be called by parent for keyboard navigation)
  scrollUp(amount: number = 1): void {
    if (!this.session) return;
    this.scrollOffset = Math.max(0, this.scrollOffset - amount);
    this.needsUpdate();
  }

  scrollDown(amount: number = 1): void {
    if (!this.session) return;
    const maxOffset = Math.max(0, this.session.messages.length - this.height);
    this.scrollOffset = Math.min(maxOffset, this.scrollOffset + amount);
    this.needsUpdate();
  }

  scrollToTop(): void {
    this.scrollOffset = 0;
    this.needsUpdate();
  }

  scrollToBottom(): void {
    if (!this.session) return;
    this.scrollOffset = Math.max(0, this.session.messages.length - this.height);
    this.needsUpdate();
  }

  // Selection methods
  selectPrevious(): void {
    if (!this.session || this.session.messages.length === 0) return;
    
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    
    // Auto-scroll to keep selection visible
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
    
    this.needsUpdate();
  }

  selectNext(): void {
    if (!this.session || this.session.messages.length === 0) return;
    
    this.selectedIndex = Math.min(this.session.messages.length - 1, this.selectedIndex + 1);
    
    // Auto-scroll to keep selection visible
    if (this.selectedIndex >= this.scrollOffset + this.height) {
      this.scrollOffset = this.selectedIndex - this.height + 1;
    }
    
    this.needsUpdate();
  }

  deleteSelected(): void {
    if (!this.session || this.session.messages.length === 0) return;
    if (this.selectedIndex < 0 || this.selectedIndex >= this.session.messages.length) return;
    
    // Remove the selected message
    this.session.messages.splice(this.selectedIndex, 1);
    
    // Adjust selection after deletion
    if (this.selectedIndex >= this.session.messages.length) {
      this.selectedIndex = Math.max(0, this.session.messages.length - 1);
    }
    
    // Adjust scroll if necessary
    if (this.scrollOffset > 0 && this.scrollOffset >= this.session.messages.length - this.height) {
      this.scrollOffset = Math.max(0, this.session.messages.length - this.height);
    }
    
    this.needsUpdate();
  }

  toggleExpansion(): void {
    if (!this.session || this.session.messages.length === 0) return;
    if (this.selectedIndex < 0 || this.selectedIndex >= this.session.messages.length) return;
    
    // Toggle expansion: if already expanded, collapse; otherwise expand
    if (this.expandedIndex === this.selectedIndex) {
      this.expandedIndex = -1; // Collapse
      this.expandedScrollOffset = 0; // Reset scroll
    } else {
      this.expandedIndex = this.selectedIndex; // Expand
      this.expandedScrollOffset = 0; // Reset scroll for new expansion
    }
    
    this.needsUpdate();
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  // Methods for scrolling within expanded messages
  scrollExpandedUp(amount: number = 1): void {
    if (this.expandedIndex === -1) return;
    
    this.expandedScrollOffset = Math.max(0, this.expandedScrollOffset - amount);
    this.needsUpdate();
  }

  scrollExpandedDown(amount: number = 1): void {
    if (this.expandedIndex === -1) return;
    if (!this.session) return;
    
    const sortedMessages = [...this.session.messages].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    const expandedMessage = sortedMessages[this.expandedIndex];
    if (!expandedMessage) return;
    
    // Use the same readable content format as in rendering
    const readableContent = this.extractReadableContent(expandedMessage);
    const lines = readableContent.split('\n');
    
    // Calculate max offset based on dynamic expansion space
    // Find the expanded message to calculate its available space
    const messagesBelow = this.session.messages.length - this.expandedIndex - 1;
    const spaceForOtherMessages = Math.min(messagesBelow, 3);
    const maxExpandedLines = Math.max(5, this.height - 2 - spaceForOtherMessages); // 2 for header + current message
    const maxIndicatorLines = 2;
    const availableContentLines = Math.max(1, maxExpandedLines - maxIndicatorLines);
    
    // Maximum offset should allow us to see the last lines
    const maxOffset = Math.max(0, lines.length - availableContentLines);
    this.expandedScrollOffset = Math.min(maxOffset, this.expandedScrollOffset + amount);
    this.needsUpdate();
  }

  isMessageExpanded(): boolean {
    return this.expandedIndex !== -1;
  }

  private findToolNameForResult(toolUseId: string | undefined): string {
    if (!toolUseId || !this.session) return "Result";
    
    // Look through session messages to find the corresponding tool call
    for (const msg of this.session.messages) {
      if (msg.msgType === "tool_call" && msg.raw.message?.content) {
        if (Array.isArray(msg.raw.message.content)) {
          for (const part of msg.raw.message.content) {
            if (part.type === "tool_use" && part.id === toolUseId) {
              return part.name || "Unknown Tool";
            }
          }
        }
      }
    }
    
    return "Result";
  }

  private getTokenRankPercentile(messageTokens: number): number {
    if (!this.session || this.session.messages.length === 0) return 0;
    
    // Get token counts for all messages
    const allTokenCounts = this.session.messages.map(msg => Math.round(msg.size / 4));
    
    // Sort to find percentile rank
    const sortedTokens = [...allTokenCounts].sort((a, b) => a - b);
    
    // Find where this message ranks (percentile)
    const rank = sortedTokens.filter(tokens => tokens < messageTokens).length;
    const percentile = (rank / (sortedTokens.length - 1)) * 100;
    
    return percentile;
  }

  private getTokenColorByRank(percentile: number): RGBA {
    // Color scale based on ranking among messages in session
    // 0-20th percentile: Green (lowest token counts)
    // 20-40th percentile: Yellow-Green
    // 40-60th percentile: Yellow
    // 60-80th percentile: Orange
    // 80-100th percentile: Red (highest token counts)
    
    if (percentile >= 80) {
      return RGBA.fromValues(1, 0.2, 0.2, 1); // Bright red - top 20%
    } else if (percentile >= 60) {
      return RGBA.fromValues(1, 0.6, 0.2, 1); // Orange - 60-80%
    } else if (percentile >= 40) {
      return RGBA.fromValues(1, 1, 0.3, 1); // Yellow - 40-60%
    } else if (percentile >= 20) {
      return RGBA.fromValues(0.7, 1, 0.3, 1); // Yellow-green - 20-40%
    } else {
      return RGBA.fromValues(0.3, 1, 0.3, 1); // Green - bottom 20%
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (text.length <= maxWidth) {
      return [text];
    }
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      // If adding this word would exceed the width
      if (currentLine.length + word.length + 1 > maxWidth) {
        // If we have content in current line, push it
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is longer than max width, split it
          if (word.length > maxWidth) {
            for (let i = 0; i < word.length; i += maxWidth) {
              lines.push(word.slice(i, i + maxWidth));
            }
            currentLine = '';
          } else {
            currentLine = word;
          }
        }
      } else {
        // Add word to current line
        if (currentLine.length > 0) {
          currentLine += ' ' + word;
        } else {
          currentLine = word;
        }
      }
    }
    
    // Push the last line if it has content
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    
    return lines.length > 0 ? lines : [''];
  }

  private extractReadableContent(message: Message): string {
    const lines: string[] = [];
    
    // Add header with message type and timestamp
    lines.push(`=== ${message.msgType.toUpperCase()} MESSAGE ===`);
    lines.push(`Timestamp: ${message.timestamp.toLocaleString()}`);
    lines.push(`Size: ${message.size} chars (~${Math.round(message.size / 4)} tokens)`);
    lines.push('');
    
    if (message.msgType === "user") {
      // User messages - show the actual text content
      let content = "";
      
      // Check if scanner has enhanced content first (for OpenCode)
      if (message.raw.content && typeof message.raw.content === "string") {
        content = message.raw.content;
      }
      // Check raw string format
      else if (typeof message.raw === "string") {
        content = message.raw;
      } 
      // Claude Code format
      else if (message.raw.message?.content) {
        if (typeof message.raw.message.content === "string") {
          content = message.raw.message.content;
        } else if (Array.isArray(message.raw.message.content)) {
          const textParts = message.raw.message.content
            .filter((part: any) => part.type === "text" && part.text)
            .map((part: any) => part.text);
          content = textParts.join('\n');
        }
      }
      
      lines.push('Content:');
      lines.push(content || '[No content found]');
    }
    
    else if (message.msgType === "assistant") {
      // Assistant messages - show response text including thinking
      let content = "";
      
      // Check if scanner has enhanced content first
      if (message.raw.content && typeof message.raw.content === "string") {
        content = message.raw.content;
      }
      // Claude Code format
      else if (message.raw.message?.content) {
        if (typeof message.raw.message.content === "string") {
          content = message.raw.message.content;
        } else if (Array.isArray(message.raw.message.content)) {
          const contentParts = [];
          
          // Include thinking content
          const thinkingParts = message.raw.message.content
            .filter((part: any) => part.type === "thinking" && part.thinking)
            .map((part: any) => `[THINKING]\n${part.thinking}`);
          
          // Include text content
          const textParts = message.raw.message.content
            .filter((part: any) => part.type === "text" && part.text)
            .map((part: any) => part.text);
          
          contentParts.push(...thinkingParts, ...textParts);
          content = contentParts.join('\n\n');
        }
      }
      
      lines.push('Response:');
      lines.push(content || '[No content found]');
    }
    
    else if (message.msgType === "tool_call") {
      // Tool calls - show tool details for both Claude Code and OpenCode formats
      
      // Claude Code format
      if (message.raw.message?.content && Array.isArray(message.raw.message.content)) {
        const toolCalls = message.raw.message.content.filter((part: any) => part.type === "tool_use");
        
        for (const tool of toolCalls) {
          lines.push(`Tool: ${tool.name || 'Unknown'}`);
          lines.push(`ID: ${tool.id || 'N/A'}`);
          
          if (tool.input) {
            lines.push('Parameters:');
            for (const [key, value] of Object.entries(tool.input)) {
              if (typeof value === "string") {
                lines.push(`  ${key}: ${value}`);
              } else {
                lines.push(`  ${key}: ${JSON.stringify(value, null, 2)}`);
              }
            }
          }
          lines.push('');
        }
      }
      
      // OpenCode format - use enhanced content from scanner if available
      else if (message.raw.content && typeof message.raw.content === "string") {
        // Scanner has already processed tool parts into readable format
        lines.push('Content:');
        lines.push(message.raw.content);
      }
      
      // Fallback: parse parts directly
      else if (message.raw.parts && Array.isArray(message.raw.parts)) {
        const toolParts = message.raw.parts.filter((part: any) => part.type === "tool");
        
        for (const part of toolParts) {
          lines.push(`Tool: ${part.tool || 'Unknown'}`);
          lines.push(`Call ID: ${part.callID || 'N/A'}`);
          
          if (part.state) {
            lines.push(`Status: ${part.state.status || 'pending'}`);
            
            if (part.state.input) {
              lines.push('Input:');
              lines.push(JSON.stringify(part.state.input, null, 2));
            }
          }
          lines.push('');
        }
      }
    }
    
    else if (message.msgType === "tool_result") {
      // Tool results - show output for both Claude Code and OpenCode formats
      
      // Claude Code format
      if (message.raw.message?.content && Array.isArray(message.raw.message.content)) {
        const results = message.raw.message.content.filter((part: any) => part.type === "tool_result");
        
        for (const result of results) {
          const toolName = this.findToolNameForResult(result.tool_use_id);
          lines.push(`Tool: ${toolName}`);
          lines.push(`ID: ${result.tool_use_id || 'N/A'}`);
          
          if (result.is_error) {
            lines.push('Status: ERROR');
          }
          
          lines.push('Output:');
          if (typeof result.content === "string") {
            lines.push(result.content);
          } else {
            lines.push(JSON.stringify(result.content, null, 2));
          }
          lines.push('');
        }
      }
      
      // OpenCode format - use enhanced content from scanner if available
      else if (message.raw.content && typeof message.raw.content === "string") {
        // Scanner has already processed tool parts into readable format
        lines.push('Content:');
        lines.push(message.raw.content);
      }
      
      // Fallback: parse parts directly
      else if (message.raw.parts && Array.isArray(message.raw.parts)) {
        const toolParts = message.raw.parts.filter((part: any) => part.type === "tool");
        
        for (const part of toolParts) {
          lines.push(`Tool: ${part.tool || 'Unknown'}`);
          lines.push(`Call ID: ${part.callID || 'N/A'}`);
          
          if (part.state) {
            lines.push(`Status: ${part.state.status || 'unknown'}`);
            
            if (part.state.input) {
              lines.push('Input:');
              lines.push(JSON.stringify(part.state.input, null, 2));
            }
            
            if (part.state.output) {
              lines.push('Output:');
              lines.push(part.state.output);
            }
          }
          lines.push('');
        }
      }
    }
    
    // Add raw JSON at the end for debugging (but collapsed)
    lines.push('');
    lines.push('--- Raw JSON (for debugging) ---');
    lines.push(JSON.stringify(message.raw, null, 2));
    
    return lines.join('\n');
  }
}