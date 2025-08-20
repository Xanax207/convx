import { 
  GroupRenderable, 
  BoxRenderable, 
  InputRenderable,
  InputRenderableEvents,
  type RenderableOptions, 
  type ParsedKey,
  getKeyHandler,
  RGBA
} from "@opentui/core";
import { AppStore } from "./state/store.ts";
import { AccordionRenderable } from "./ui/AccordionRenderable.ts";
import { StackedBarRenderable } from "./ui/StackedBarRenderable.ts";
import { HeaderRenderable } from "./ui/HeaderRenderable.ts";
import { MessageListRenderable } from "./ui/MessageListRenderable.ts";
import type { Index, ScanOptions } from "./data/types.ts";
import { buildIndex, clearCache } from "./data/indexer.ts";

export class App extends GroupRenderable {
  private store: AppStore;
  private scanOptions: ScanOptions;
  
  // UI Components
  private topPane: GroupRenderable;
  private bottomPane: GroupRenderable;
  private accordion: AccordionRenderable;
  private header: HeaderRenderable;
  private stackedBar: StackedBarRenderable;
  private messageList: MessageListRenderable;
  private filterInput: InputRenderable;
  private topBox: BoxRenderable;
  private bottomBox: BoxRenderable;
  
  // State
  private isFilterMode: boolean = false;

  constructor(scanOptions: ScanOptions, options: RenderableOptions = {}) {
    super("app", {
      ...options,
      width: "100%",
      height: "100%",
      flexDirection: "column"
    });

    this.scanOptions = scanOptions;
    this.store = new AppStore();
    
    this.setupUI();
    this.setupKeyboardHandling();
    this.subscribeToStoreChanges();
    
    // Load initial data
    this.refreshData();
  }

  private setupUI(): void {
    // Create top pane container (session browser + details)
    this.topPane = new GroupRenderable("top-pane", {
      width: "100%",
      height: "50%", // Take half the screen
      flexShrink: 0,
      flexDirection: "row" // Horizontal layout within top pane
    });

    // Left side of top pane - session browser
    const leftSection = new GroupRenderable("left-section", {
      flexGrow: 1,
      height: "100%",
      flexDirection: "column"
    });

    this.topBox = new BoxRenderable("top-box", {
      width: "100%",
      flexGrow: 1,
      title: "Conversations",
      borderStyle: "rounded",
      flexShrink: 0,
      backgroundColor: null, // Explicitly null
      borderColor: RGBA.fromValues(0.5, 0.5, 0.5, 1) // Gray border
    });

    this.filterInput = new InputRenderable("filter", {
      width: "100%",
      height: 1,
      flexShrink: 0,
      placeholder: "Type to filter... (Press / to focus, Esc to clear)"
    });

    this.accordion = new AccordionRenderable("accordion", this.store, {
      width: "100%",
      flexGrow: 1
    });

    this.topBox.add(this.filterInput);
    this.topBox.add(this.accordion);
    leftSection.add(this.topBox);

    // Right side of top pane - session details
    const rightSection = new GroupRenderable("right-section", {
      flexGrow: 1,
      height: "100%",
      flexDirection: "column"
    });

    const detailsBox = new BoxRenderable("details-box", {
      width: "100%",
      height: "100%",
      title: "Session Detail",
      borderStyle: "rounded",
      borderColor: RGBA.fromValues(0.5, 0.5, 0.5, 1) // Gray border
      // No backgroundColor
    });

    const detailsContent = new GroupRenderable("details-content", {
      width: "100%",
      height: "100%",
      flexDirection: "column"
    });

    this.header = new HeaderRenderable("header", {
      width: "100%",
      height: 3,
      flexShrink: 0
    });

    this.stackedBar = new StackedBarRenderable("stacked-bar", {
      width: "100%",
      height: 4,
      flexShrink: 0
    });

    detailsContent.add(this.header);
    detailsContent.add(this.stackedBar);
    detailsBox.add(detailsContent);
    rightSection.add(detailsBox);

    // Add both sections to top pane
    this.topPane.add(leftSection);
    this.topPane.add(rightSection);

    // Create bottom pane container (individual messages)
    this.bottomPane = new GroupRenderable("bottom-pane", {
      width: "100%",
      flexGrow: 1, // Take remaining space
      flexDirection: "column"
    });

    this.bottomBox = new BoxRenderable("bottom-box", {
      width: "100%",
      flexGrow: 1,
      title: "Messages",
      borderStyle: "rounded",
      borderColor: RGBA.fromValues(0.5, 0.5, 0.5, 1) // Gray border
      // No backgroundColor
    });

    this.messageList = new MessageListRenderable("message-list", {
      width: "100%",
      flexGrow: 1
    });

    // Add message list inside the bottom box
    this.bottomBox.add(this.messageList);
    this.bottomPane.add(this.bottomBox);

    // Add both panes to main app (vertical layout)
    this.add(this.topPane);
    this.add(this.bottomPane);

    // Set initial focus
    this.accordion.focus();
  }

  private setupKeyboardHandling(): void {
    const keyHandler = getKeyHandler();
    
    keyHandler.on("keypress", (key: ParsedKey) => {
      // Global shortcuts that work regardless of focus
      if (this.handleGlobalKeyPress(key)) {
        return;
      }

      // Mode-specific handling
      if (this.isFilterMode) {
        this.handleFilterKeyPress(key);
      } else {
        this.handleNavigationKeyPress(key);
      }
    });

    // Filter input events
    this.filterInput.on(InputRenderableEvents.INPUT, (value: string) => {
      this.store.setFilterText(value);
    });

    this.filterInput.on(InputRenderableEvents.CHANGE, (value: string) => {
      this.store.setFilterText(value);
    });
  }

  private handleGlobalKeyPress(key: ParsedKey): boolean {
    switch (key.name) {
      case "r":
        this.refreshData();
        return true;

      case "q":
        if (key.ctrl || !key.ctrl) { // Allow both q and Ctrl+C
          process.exit(0);
        }
        return false;

      case "c":
        if (key.ctrl) {
          process.exit(0);
        }
        return false;

      case "/":
        this.enterFilterMode();
        return true;

      case "escape":
        if (this.isFilterMode) {
          this.exitFilterMode();
          return true;
        }
        return false;

      case "tab":
        this.toggleFocus();
        return true;

      default:
        return false;
    }
  }

  private handleFilterKeyPress(key: ParsedKey): void {
    switch (key.name) {
      case "escape":
        this.exitFilterMode();
        break;

      case "return":
        this.exitFilterMode();
        break;

      default:
        // Let the input handle other keys
        break;
    }
  }

  private handleNavigationKeyPress(key: ParsedKey): void {
    const state = this.store.getState();
    
    if (state.focusedPane === "accordion") {
      // Let accordion handle its keys
      this.accordion.handleKeyPress(key);
    } else if (state.focusedPane === "messages") {
      // Handle message list navigation with selection
      const isExpanded = this.messageList.isMessageExpanded();
      
      switch (key.name) {
        case "up":
        case "k":
          if (isExpanded) {
            this.messageList.scrollExpandedUp();
          } else {
            this.messageList.selectPrevious();
          }
          break;
        case "down":
        case "j":
          if (isExpanded) {
            this.messageList.scrollExpandedDown();
          } else {
            this.messageList.selectNext();
          }
          break;
        case "home":
          if (isExpanded) {
            this.messageList.scrollExpandedUp(100); // Scroll to top of expanded content
          } else {
            this.messageList.scrollToTop();
          }
          break;
        case "end":
          if (isExpanded) {
            this.messageList.scrollExpandedDown(100); // Scroll to bottom of expanded content
          } else {
            this.messageList.scrollToBottom();
          }
          break;
        case "pageup":
          if (isExpanded) {
            this.messageList.scrollExpandedUp(10);
          } else {
            this.messageList.scrollUp(10);
          }
          break;
        case "pagedown":
          if (isExpanded) {
            this.messageList.scrollExpandedDown(10);
          } else {
            this.messageList.scrollDown(10);
          }
          break;
        case "d":
          this.messageList.deleteSelected();
          break;
        case "return":
          this.messageList.toggleExpansion();
          break;
      }
    }
  }

  private enterFilterMode(): void {
    this.isFilterMode = true;
    this.filterInput.focus();
    this.topBox.title = "Conversations (Filter Mode - Esc to exit)";
    this.needsUpdate();
  }

  private exitFilterMode(): void {
    this.isFilterMode = false;
    this.filterInput.blur();
    this.accordion.focus();
    this.topBox.title = "Conversations";
    
    // Clear filter if empty
    const filterText = this.filterInput.value.trim();
    if (!filterText) {
      this.store.setFilterText("");
      this.filterInput.value = "";
    }
    
    this.needsUpdate();
  }

  private toggleFocus(): void {
    const state = this.store.getState();
    
    if (this.isFilterMode) {
      this.exitFilterMode();
      return;
    }
    
    if (state.focusedPane === "accordion") {
      this.store.setFocusedPane("messages");
      this.accordion.blur();
      // Message list will show focus through title change in store subscription
    } else {
      this.store.setFocusedPane("accordion");
      this.accordion.focus();
      // Title updates handled in store subscription
    }
    
    this.needsUpdate();
  }

  private subscribeToStoreChanges(): void {
    this.store.subscribe((state) => {
      // Update all components when selection changes
      this.header.setSession(state.selectedSession);
      this.stackedBar.setSession(state.selectedSession);
      this.messageList.setSession(state.selectedSession);
      
      // Update titles to show focus state
      if (state.focusedPane === "accordion") {
        this.topBox.title = "Conversations (Focused)";
        this.bottomBox.title = "Messages";
      } else {
        this.topBox.title = "Conversations";
        this.bottomBox.title = "Messages (Focused)";
      }
      
      // Update refresh status
      if (state.isRefreshing) {
        this.topBox.title = "Conversations (Refreshing...)";
      }
      
      this.needsUpdate();
    });
  }

  private async refreshData(): Promise<void> {
    try {
      this.store.setRefreshing(true);
      console.log("Refreshing conversation data...");
      
      clearCache();
      const index = await buildIndex(this.scanOptions);
      this.store.setIndex(index);
      
      console.log("Data refresh completed");
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      this.store.setRefreshing(false);
    }
  }

  getStore(): AppStore {
    return this.store;
  }

  getScanOptions(): ScanOptions {
    return this.scanOptions;
  }

}