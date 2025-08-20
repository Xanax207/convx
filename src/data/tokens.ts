import type { Message } from "./types.ts";

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface MessageTokenInfo {
  hasTokens: boolean;
  usage?: TokenUsage;
  displayText: string;
}

export function extractMessageTokens(message: Message): MessageTokenInfo {
  // Calculate tokens as chars / 4 (simple approximation)
  const estimatedTokens = Math.round(message.size / 4);
  
  const usage: TokenUsage = {
    input_tokens: 0,
    output_tokens: estimatedTokens
  };
  
  const displayText = estimatedTokens > 0 ? `${estimatedTokens}t` : "";
  
  return {
    hasTokens: estimatedTokens > 0,
    usage,
    displayText
  };
}

export function calculateSessionTokens(messages: Message[]): {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  hasTokenData: boolean;
  displayText: string;
} {
  let totalEstimatedTokens = 0;
  
  for (const message of messages) {
    // Estimate tokens as chars / 4
    totalEstimatedTokens += Math.round(message.size / 4);
  }

  const displayText = totalEstimatedTokens > 0 ? 
    `~${totalEstimatedTokens.toLocaleString()} tokens (estimated)` : 
    "";

  return {
    totalInputTokens: 0,
    totalOutputTokens: totalEstimatedTokens,
    totalCacheCreation: 0,
    totalCacheRead: 0,
    hasTokenData: totalEstimatedTokens > 0,
    displayText
  };
}