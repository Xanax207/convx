import { Renderable, OptimizedBuffer, RGBA } from "@opentui/core";

export class StatusBarRenderable extends Renderable {
  private message: string = "";
  private messageType: "info" | "success" | "error" = "info";
  private showTime: number = 0;
  private fadeDuration: number = 3000; // 3 seconds

  constructor(id: string, options: any = {}) {
    super(id, {
      ...options,
      buffered: true,
      height: 1
    });
  }

  showMessage(message: string, type: "info" | "success" | "error" = "info", duration: number = 3000) {
    this.message = message;
    this.messageType = type;
    this.showTime = Date.now();
    this.fadeDuration = duration;
    this.needsUpdate();
  }

  renderSelf(buffer: OptimizedBuffer, deltaTime: number) {
    // Clear the buffer
    buffer.fillRect(0, 0, this.width, this.height, RGBA.fromValues(0, 0, 0, 1));

    if (!this.message) return;

    // Check if message should still be visible
    const elapsed = Date.now() - this.showTime;
    if (elapsed > this.fadeDuration) {
      this.message = "";
      return;
    }

    // Calculate fade opacity
    const fadeStart = this.fadeDuration - 1000; // Start fading 1 second before end
    let opacity = 1;
    if (elapsed > fadeStart) {
      opacity = 1 - (elapsed - fadeStart) / 1000;
    }

    // Choose color based on message type
    let color: RGBA;
    switch (this.messageType) {
      case "success":
        color = RGBA.fromValues(0, 0.8, 0, opacity); // Green
        break;
      case "error":
        color = RGBA.fromValues(0.8, 0, 0, opacity); // Red
        break;
      default:
        color = RGBA.fromValues(0.8, 0.8, 0.8, opacity); // Light gray
    }

    // Draw the message centered
    const textWidth = this.message.length;
    const x = Math.max(0, Math.floor((this.width - textWidth) / 2));
    
    buffer.drawText(x, 0, this.message, color);

    // Schedule another update if we're still fading
    if (elapsed < this.fadeDuration) {
      setTimeout(() => this.needsUpdate(), 50);
    }
  }

  clear() {
    this.message = "";
    this.needsUpdate();
  }
}