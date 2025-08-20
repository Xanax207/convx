#!/usr/bin/env bun

import { createCliRenderer, RGBA } from "@opentui/core";
import { homedir } from "os";
import { join } from "path";
import { App } from "./App.ts";
import type { ScanOptions } from "./data/types.ts";

interface CLIArgs {
  claudeRoot: string;
  opencodeRoot: string;
  sizeMode: "chars" | "bytes" | "tokens";
  since?: Date;
  debug: boolean;
  help: boolean;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<CLIArgs> = {};
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    switch (arg) {
      case "--claude-root":
        parsed.claudeRoot = args[++i];
        break;
        
      case "--opencode-root":
        parsed.opencodeRoot = args[++i];
        break;
        
      case "--size-mode":
        const mode = args[++i];
        if (mode === "chars" || mode === "bytes" || mode === "tokens") {
          parsed.sizeMode = mode;
        } else {
          console.error(`Invalid size mode: ${mode}. Must be one of: chars, bytes, tokens`);
          process.exit(1);
        }
        break;
        
      case "--since":
        const dateStr = args[++i];
        try {
          parsed.since = new Date(dateStr);
          if (isNaN(parsed.since.getTime())) {
            throw new Error("Invalid date");
          }
        } catch {
          console.error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD format.`);
          process.exit(1);
        }
        break;
        
      case "--debug":
        parsed.debug = true;
        break;
        
      case "--help":
      case "-h":
        parsed.help = true;
        break;
        
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
    
    i++;
  }
  
  // Set defaults
  return {
    claudeRoot: parsed.claudeRoot || join(homedir(), ".claude", "projects"),
    opencodeRoot: parsed.opencodeRoot || join(homedir(), ".local", "share", "opencode", "project"),
    sizeMode: parsed.sizeMode || "chars",
    since: parsed.since,
    debug: parsed.debug || false,
    help: parsed.help || false
  };
}

function printHelp(): void {
  const help = `
Conversation Explorer - TUI for Claude Code & OpenCode histories

USAGE:
  convx [OPTIONS]

OPTIONS:
  --claude-root <path>        Claude Code data root (default: ~/.claude/projects)
  --opencode-root <path>      OpenCode data root (default: ~/.local/share/opencode/project)
  --size-mode <mode>          Size calculation mode: chars, bytes, tokens (default: chars)
  --since <YYYY-MM-DD>        Only show sessions after this date
  --debug                     Enable debug overlay
  --help, -h                  Show this help message

KEYBOARD SHORTCUTS:
  ↑/↓ or j/k                  Navigate accordion
  ←/→ or h/l                  Collapse/expand items
  Enter                       Expand item or select session
  Tab                         Toggle focus between panes
  /                           Enter filter mode
  Esc                         Exit filter mode or clear selection
  r                           Refresh data (re-scan filesystem)
  q or Ctrl+C                 Exit application

EXAMPLES:
  convx                                          # Use default locations
  convx --debug                                  # Enable debug overlay
  convx --size-mode tokens                       # Show token counts instead of characters
  convx --since 2025-01-01                       # Only show sessions from 2025
  convx --claude-root ~/custom/claude/path       # Use custom Claude data location
`;

  console.log(help);
}

async function main(): Promise<void> {
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  // Validate that we're running with Bun
  if (!process.versions.bun) {
    console.error("Error: This application requires Bun runtime.");
    console.error("Please install Bun and run with: bun run convx");
    process.exit(1);
  }
  
  console.log("Conversation Explorer starting...");
  console.log(`Claude root: ${args.claudeRoot}`);
  console.log(`OpenCode root: ${args.opencodeRoot}`);
  console.log(`Size mode: ${args.sizeMode}`);
  if (args.since) {
    console.log(`Since: ${args.since.toISOString().slice(0, 10)}`);
  }
  console.log("");
  
  const scanOptions: ScanOptions = {
    claudeRoot: args.claudeRoot,
    opencodeRoot: args.opencodeRoot,
    sizeMode: args.sizeMode,
    since: args.since
  };
  
  try {
    // Create renderer that respects terminal theme
    const renderer = await createCliRenderer({
      targetFps: 30,
      useConsole: args.debug,
      useMouse: true,
      useAlternateScreen: false, // Don't use alternate screen to preserve terminal background
    });
    
    // Set transparent background to use terminal theme
    renderer.setBackgroundColor(RGBA.fromValues(0, 0, 0, 0));
    
    if (args.debug) {
      console.log("Debug mode enabled. Press Ctrl+O to toggle console overlay.");
    }
    
    // Create and mount app
    const app = new App(scanOptions, {
      width: "100%",
      height: "100%"
    });
    
    // NUCLEAR HACK: Patch stdout to strip black background ANSI codes
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = function(chunk: any, encoding?: any, cb?: any) {
      if (typeof chunk === 'string') {
        // Replace black background ANSI codes with default background reset
        chunk = chunk.replace(/\[48;2;0;0;0m/g, '[49m');
      }
      return originalWrite(chunk, encoding, cb);
    };
    
    renderer.root.add(app);
    
    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      process.exit(0);
    });
    
    process.on("SIGTERM", () => {
      console.log("\nShutting down...");
      process.exit(0);
    });
    
    // Start the renderer
    renderer.start();
    
    console.log("Application started. Press 'q' or Ctrl+C to exit.");
    
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
}

// Run main function
if (import.meta.main) {
  main().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}