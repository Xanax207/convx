# AGENTS.md - Development Guidelines

## Build/Test Commands
- `bun install` - Install dependencies
- `bun run dev` - Run in development mode
- `bun run build` - Build for distribution
- `bun run convx` - Run the application

## Code Style Guidelines
- **Runtime**: Bun only (requires bun:ffi and native Zig library)
- **Imports**: Use `.ts` extensions for local files, grouped: external libs → local types → local modules
- **Types**: Strict TypeScript with explicit interfaces, prefer `type` for unions, `interface` for objects
- **Naming**: PascalCase for classes/interfaces, camelCase for variables/functions, kebab-case for file names
- **Error Handling**: Use try/catch for async operations, return null/undefined for optional failures
- **Comments**: Avoid comments unless documenting complex algorithms or OpenTUI patterns
- **Formatting**: No semicolons, double quotes for strings, 2-space indentation
- **Classes**: Prefer composition over inheritance, use private fields with underscore prefix
- **OpenTUI**: Use `buffered: true` for expensive rendering, extend `Renderable` base class
- **State**: Centralized in AppStore with subscription pattern, immutable updates
- **File Structure**: Group by feature (`/data`, `/ui`, `/state`), separate concerns clearly
- **Dependencies**: Only use pre-installed packages (@opentui/core, zod, fast-glob, date-fns)
- **Performance**: Stream large files, cache with content hashes, use OptimizedBuffer for drawing