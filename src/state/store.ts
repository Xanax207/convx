import type { Session, Index } from "../data/types.ts";

export interface AppState {
  index: Index | null;
  selectedSession: Session | null;
  accordionState: AccordionState;
  filterText: string;
  focusedPane: "accordion" | "detail";
  isRefreshing: boolean;
}

export interface AccordionState {
  expandedDates: Set<string>;
  expandedTools: Map<string, Set<string>>; // dateKey -> Set<tool>
  expandedProjects: Map<string, Set<string>>; // dateKey:tool -> Set<projectDisplay>
  selectedPath: SelectionPath | null;
}

export interface SelectionPath {
  dateKey: string;
  tool: string;
  projectDisplay: string;
  sessionId: string;
}

export class AppStore {
  private state: AppState;
  private listeners: Set<(state: AppState) => void> = new Set();

  constructor() {
    this.state = {
      index: null,
      selectedSession: null,
      accordionState: {
        expandedDates: new Set(),
        expandedTools: new Map(),
        expandedProjects: new Map(),
        selectedPath: null
      },
      filterText: "",
      focusedPane: "accordion",
      isRefreshing: false
    };
  }

  getState(): AppState {
    return { ...this.state };
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.getState());
    }
  }

  setIndex(index: Index): void {
    this.state.index = index;
    
    // Auto-expand the first date if no expansion state exists
    if (this.state.accordionState.expandedDates.size === 0 && index.byDate.size > 0) {
      const firstDate = Array.from(index.byDate.keys()).sort().reverse()[0]; // Most recent first
      this.state.accordionState.expandedDates.add(firstDate);
    }
    
    this.notifyListeners();
  }

  setSelectedSession(session: Session | null): void {
    this.state.selectedSession = session;
    
    if (session) {
      const dateKey = session.startedAt.toISOString().slice(0, 10);
      this.state.accordionState.selectedPath = {
        dateKey,
        tool: session.tool,
        projectDisplay: session.projectDisplay,
        sessionId: session.sessionId
      };
    } else {
      this.state.accordionState.selectedPath = null;
    }
    
    this.notifyListeners();
  }

  toggleDateExpansion(dateKey: string): void {
    if (this.state.accordionState.expandedDates.has(dateKey)) {
      this.state.accordionState.expandedDates.delete(dateKey);
      // Also collapse all tools under this date
      this.state.accordionState.expandedTools.delete(dateKey);
    } else {
      this.state.accordionState.expandedDates.add(dateKey);
    }
    this.notifyListeners();
  }

  toggleToolExpansion(dateKey: string, tool: string): void {
    const toolsForDate = this.state.accordionState.expandedTools.get(dateKey) || new Set();
    
    if (toolsForDate.has(tool)) {
      toolsForDate.delete(tool);
      // Also collapse all projects under this tool
      this.state.accordionState.expandedProjects.delete(`${dateKey}:${tool}`);
    } else {
      toolsForDate.add(tool);
    }
    
    this.state.accordionState.expandedTools.set(dateKey, toolsForDate);
    this.notifyListeners();
  }

  toggleProjectExpansion(dateKey: string, tool: string, projectDisplay: string): void {
    const key = `${dateKey}:${tool}`;
    const projectsForTool = this.state.accordionState.expandedProjects.get(key) || new Set();
    
    if (projectsForTool.has(projectDisplay)) {
      projectsForTool.delete(projectDisplay);
    } else {
      projectsForTool.add(projectDisplay);
    }
    
    this.state.accordionState.expandedProjects.set(key, projectsForTool);
    this.notifyListeners();
  }

  setFilterText(text: string): void {
    this.state.filterText = text;
    this.notifyListeners();
  }

  setFocusedPane(pane: "accordion" | "detail"): void {
    this.state.focusedPane = pane;
    this.notifyListeners();
  }

  setRefreshing(refreshing: boolean): void {
    this.state.isRefreshing = refreshing;
    this.notifyListeners();
  }

  // Helper to get filtered sessions
  getFilteredSessions(): Session[] {
    if (!this.state.index) return [];
    
    const allSessions: Session[] = [];
    for (const sessions of this.state.index.byDate.values()) {
      allSessions.push(...sessions);
    }
    
    if (!this.state.filterText.trim()) {
      return allSessions;
    }
    
    const filter = this.state.filterText.toLowerCase();
    return allSessions.filter(session => 
      session.projectDisplay.toLowerCase().includes(filter) ||
      session.sessionId.toLowerCase().includes(filter) ||
      session.tool.toLowerCase().includes(filter)
    );
  }
  
  // Helper to find session by selection path
  findSessionByPath(path: SelectionPath): Session | null {
    if (!this.state.index) return null;
    
    const sessionsForDate = this.state.index.byDate.get(path.dateKey);
    if (!sessionsForDate) return null;
    
    return sessionsForDate.find(s => 
      s.tool === path.tool &&
      s.projectDisplay === path.projectDisplay &&
      s.sessionId === path.sessionId
    ) || null;
  }
}