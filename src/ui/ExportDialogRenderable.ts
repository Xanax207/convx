import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { ParsedKey } from "@opentui/core";
import type { Session } from "../data/types.ts";
import type { ExportFormat } from "../data/exporter.ts";

export interface ExportDialogOptions {
  session: Session;
  claudeRoot: string;
  opencodeRoot: string;
  onCancel: () => void;
  onExport: (format: ExportFormat, outputPath: string) => void;
}

export class ExportDialogRenderable extends BoxRenderable {
  private session: Session;
  private claudeRoot: string;
  private opencodeRoot: string;
  private onCancel: () => void;
  private onExport: (format: ExportFormat, outputPath: string) => void;

  constructor(options: ExportDialogOptions) {
    super("export-dialog", {
      position: "absolute",
      width: 80,
      height: 12,
      left: 5,
      top: 3,
      border: true,
      borderStyle: "double",
      borderColor: "#CCCCCC",
      backgroundColor: "#1A1A1A",
      title: "Export Conversation",
      titleAlignment: "center",
      focusable: true,
      zIndex: 1000
    });

    this.session = options.session;
    this.claudeRoot = options.claudeRoot;
    this.opencodeRoot = options.opencodeRoot;
    this.onCancel = options.onCancel;
    this.onExport = options.onExport;

    this.setupUI();
  }

  private setupUI() {
    // Truncate paths to fit in dialog
    const truncatePath = (path: string, maxLength: number) => {
      if (path.length <= maxLength) return path;
      return "..." + path.slice(-(maxLength - 3));
    };

    // Session info text
    const sessionInfo = new TextRenderable("session-info", {
      left: 2,
      top: 1,
      width: 76,
      height: 2,
      content: `Session: ${this.session.sessionId.slice(0, 20)}...\nProject: ${this.session.projectDisplay}`,
      fg: "#CCCCCC"
    });

    // Format options text
    const claudePath = truncatePath(this.claudeRoot, 60);
    const opencodePath = truncatePath(this.opencodeRoot, 60);
    
    const formatOptions = new TextRenderable("format-options", {
      left: 2,
      top: 4,
      width: 76,
      height: 5,
      content: `[1] Claude Code\n    → ${claudePath}\n\n[2] OpenCode\n    → ${opencodePath}`,
      fg: "#FFFFFF"
    });

    // Instructions text
    const instructions = new TextRenderable("instructions", {
      left: 2,
      top: 10,
      width: 76,
      height: 1,
      content: "Press 1 or 2 to export, Esc to cancel",
      fg: "#999999"
    });

    // Add all components to this box
    this.add(sessionInfo);
    this.add(formatOptions);
    this.add(instructions);
  }

  handleKeyPress(key: ParsedKey): boolean {
    console.log("Dialog key press:", key.key, key.name);
    
    if (key.name === "escape" || key.key === "Escape") {
      console.log("Canceling export");
      this.onCancel();
      return true;
    }

    if (key.key === "1" || key.name === "1") {
      console.log("Starting Claude Code export");
      this.onExport("claude-code", this.claudeRoot);
      this.needsUpdate();
      console.log("Claude Code export callback completed");
      return true;
    }

    if (key.key === "2" || key.name === "2") {
      console.log("Starting OpenCode export");
      this.onExport("opencode", this.opencodeRoot);
      this.needsUpdate();
      console.log("OpenCode export callback completed");
      return true;
    }

    return false;
  }

  // Center the dialog on screen
  updatePosition(screenWidth: number, screenHeight: number) {
    this.x = Math.floor((screenWidth - this.width) / 2);
    this.y = Math.floor((screenHeight - this.height) / 2);
  }
}