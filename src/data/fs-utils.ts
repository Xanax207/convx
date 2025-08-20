import { readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import glob from "fast-glob";

export interface FileInfo {
  path: string;
  mtime: Date;
}

export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (error) {
    console.warn(`Failed to read file ${filePath}:`, error);
    return null;
  }
}

export function safeParseJSON(content: string): any {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function* readNDJSON(filePath: string): AsyncGenerator<any> {
  try {
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed) {
        const obj = safeParseJSON(trimmed);
        if (obj) {
          yield obj;
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to read NDJSON file ${filePath}:`, error);
  }
}

export async function getFileInfo(filePath: string): Promise<FileInfo | null> {
  try {
    const stats = await stat(filePath);
    return {
      path: filePath,
      mtime: stats.mtime
    };
  } catch {
    return null;
  }
}

export async function findFiles(patterns: string[], cwd?: string): Promise<FileInfo[]> {
  try {
    const paths = await glob(patterns, { 
      cwd, 
      absolute: true,
      onlyFiles: true 
    });
    
    const fileInfos = await Promise.all(
      paths.map(path => getFileInfo(path))
    );
    
    return fileInfos.filter((info): info is FileInfo => info !== null);
  } catch (error) {
    console.warn(`Failed to glob patterns ${patterns.join(', ')}:`, error);
    return [];
  }
}

export function getProjectDisplayName(cwd?: string, projectDirName?: string): string {
  if (cwd) {
    const parts = cwd.split('/');
    return parts[parts.length - 1] || cwd;
  }
  
  if (projectDirName) {
    // Decode slugged directory names (e.g., "Users-daniel-dev-Matrix2")
    return projectDirName.replace(/-/g, '/');
  }
  
  return 'unknown-project';
}

export function parseDateISO(dateString: string): Date | null {
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function computeContentHash(fileInfos: FileInfo[]): string {
  // Simple hash based on file paths and mtimes
  const hashInput = fileInfos
    .map(info => `${info.path}:${info.mtime.getTime()}`)
    .sort()
    .join('|');
    
  // Simple string hash
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return hash.toString(36);
}