# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A terminal UI application that scans local Claude Code and OpenCode conversation histories, displaying them in an interactive accordion interface with message size visualization. Built with Bun runtime and @opentui/core.

## Development Commands

```bash
# Install dependencies
bun install

# Run the application
bun run convx

# Development mode (if configured)
bun run dev

# Build for distribution
bun run build

# Run with debug mode
bun run convx --debug
```

## Architecture

### OpenTUI Core Architecture
- **CliRenderer** - Manages double-buffered OptimizedBuffer, terminal control, event loop, and Yoga layout tree
- **Renderable Components** - Base class with Yoga flexbox layout, optional internal framebuffers for custom drawing
- **OptimizedBuffer** - Native Zig-backed RGBA+char buffer with fast drawing operations (drawText, fillRect, drawBox)
- **Global Event System** - Keyboard parser with modifiers/function keys, mouse hit-testing, and focus management

### Data Flow
1. **File System Scanners** (`/src/data/scanner-*.ts`) - Parse Claude Code (NDJSON/JSON) and OpenCode (structured JSON) conversation files
2. **Indexer** (`/src/data/indexer.ts`) - Orchestrates scanners, builds normalized Index with date-based grouping
3. **Store** (`/src/state/store.ts`) - Manages UI state (selection, accordion open/closed, filters)
4. **Custom Renderables** (`/src/ui/`) - Extend Renderable base class for accordion navigation and stacked bar visualization

### Core Data Model
- **Message**: Normalized conversation message with tool, sessionId, timestamp, msgType, and computed size
- **Session**: Collection of messages grouped by sessionId with metadata (startedAt, endedAt, project info)
- **Index**: Date-bucketed sessions for accordion display (`Map<"YYYY-MM-DD", Session[]>`)

### Message Type Classification
- `user` - User input messages
- `assistant-text` - Assistant text responses
- `assistant-tool_use` - Assistant responses containing tool calls
- `tool_result` - Tool execution results
- `meta` - System messages, summaries, metadata

### Data Sources
- **Claude Code**: `~/.claude/projects/**/*.{json,jsonl,ndjson,log}` - NDJSON streams with cwd, timestamp, sessionId
- **OpenCode**: `~/.local/share/opencode/project/**/storage/session/` - Structured JSON with separate info/message files

## Key Implementation Details

### File Parsing Strategy
- **Robustness**: Skip malformed JSON lines, use file mtime as timestamp fallback
- **Performance**: Stream NDJSON line-by-line, cache with content hash (sum of mtimes)
- **Sessionization**: Group messages by tool+sessionId, sort by timestamp

### Size Computation
- Default: UTF-16 character count (JS `.length`)
- Tool use: `JSON.stringify(input).length` for payloads
- Configurable via `--size-mode=(chars|bytes|tokens)`

### UI Layout
```
┌─────────────────────────────┬─────────────────────────────────┐
│ Accordion (Date→Tool→Proj)  │ Session Detail                  │
│ [2025-08-20] ▼              │ - Header: tool, project, times  │
│   Claude Code ▼             │ - Stacked bar: msg type sizes   │
│     project-name ▶          │ - Legend with colors/percentages│
│   OpenCode ▼                │                                 │
│     other-proj ▼ (4 sess)   │                                 │
│       01:58 ses_abc123      │                                 │
└─────────────────────────────┴─────────────────────────────────┘
```

### Keyboard Controls
- `↑/↓` - Navigate within current level
- `←/→` or `Enter` - Collapse/expand accordion items  
- `Tab` - Toggle focus between panes
- `/` - Open filter input (fuzzy search)
- `r` - Refresh data (re-scan file system)
- `q` or `Ctrl+C` - Exit

### Color Scheme
```typescript
const TYPE_COLORS = {
  user: "#FFD166",              // yellow
  "assistant-text": "#06D6A0",  // green  
  "assistant-tool_use": "#118AB2", // blue
  tool_result: "#EF476F",       // pink/red
  meta: "#999999",              // gray
}
```

## CLI Flags

- `--claude-root <path>` - Claude Code data root (default: `~/.claude/projects`)
- `--opencode-root <path>` - OpenCode data root (default: `~/.local/share/opencode/project`)  
- `--size-mode <chars|bytes|tokens>` - Size calculation method (default: chars)
- `--since <YYYY-MM-DD>` - Filter sessions after date
- `--debug` - Enable OpenTUI debug overlay

## Dependencies

- `@opentui/core` - Terminal UI framework (retained-mode renderer with Yoga layout)
- `fast-glob` - File system scanning
- `zod` - Runtime validation  
- `date-fns` - Date manipulation
- Target runtime: Bun (required for bun:ffi and native Zig library)

## OpenTUI Core Implementation Details

### Component Architecture
- Extend `Renderable` base class for custom UI components
- Use `buffered: true` for components with expensive/custom drawing (accordion, stacked bar)
- Implement `renderSelf(buffer, deltaTime)` for custom drawing logic
- Override `handleKeyPress(key)` for focused input handling

### Layout System
- Yoga flexbox layout with `width/height`, `flexDirection`, `alignItems`, `justifyContent`
- Use `GroupRenderable` as containers for complex layouts
- Position types: `relative` (default, participates in layout) vs `absolute` (manual x,y positioning)

### Rendering Modes
- **On-demand**: Auto re-render when tree/layout changes or `needsUpdate()` called
- **Live loop**: Use `renderer.start()` for animations or set `live: true` on components
- **Buffered components**: Internal framebuffer for partial redraws, alpha blending, effects

### Built-in Components to Leverage
- `TextRenderable` - Styled text with selection support, auto-sizing
- `BoxRenderable` - Borders (single/double/rounded), backgrounds, titles
- `InputRenderable` - Single-line input with focus management
- `SelectRenderable` - Vertical menu with keyboard navigation
- `FrameBufferRenderable` - Custom drawing surface for charts/effects

## Project Structure

```
/src
  index.ts                # Entry point, createCliRenderer, mount root
  App.ts                  # Root renderable, layout panes, global keyboard handling
  /ui                     # Custom OpenTUI renderables  
    AccordionRenderable.ts  # Date→Tool→Project→Session tree (extends Renderable)
    StackedBarRenderable.ts # Horizontal stacked bar with FrameBufferRenderable
    LegendRenderable.ts     # Type colors and percentages (TextRenderable)
    HeaderRenderable.ts     # Session metadata display (GroupRenderable)
  /data                   # File system and parsing
    indexer.ts            # Orchestrate scanners, build Index
    scanner-claude.ts     # Parse Claude Code NDJSON/JSON
    scanner-opencode.ts   # Parse OpenCode structured JSON  
    types.ts              # Core data model
    size.ts               # Message size computation
    time.ts               # Date bucketing helpers
    fs-utils.ts           # Safe file operations
  /state
    store.ts              # Selection, accordion state, filter
```

## Key OpenTUI Patterns for This Project

### Custom Accordion Implementation
```typescript
class AccordionRenderable extends Renderable {
  constructor() {
    super("accordion", { buffered: true, focusable: true })
  }
  
  handleKeyPress(key: ParsedKey) {
    // Handle ↑/↓ navigation, ←/→ expand/collapse
  }
  
  renderSelf(buffer: OptimizedBuffer) {
    // Draw tree with ▶/▼ glyphs, highlight selection
  }
}
```

### Stacked Bar with Custom Drawing
```typescript
class StackedBarRenderable extends FrameBufferRenderable {
  updateData(totalsByType: Record<MsgType, number>) {
    // Compute segments, redraw only when data changes
    this.needsUpdate()
  }
  
  renderSelf(buffer: OptimizedBuffer) {
    // Draw colored '█' blocks for each message type
    buffer.fillRect(...) // background
    buffer.drawText(...) // colored segments
  }
}
```