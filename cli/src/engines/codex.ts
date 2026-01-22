import { existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { BaseAIEngine, execCommand } from "./base.ts";
import type { AIResult, EngineOptions } from "./types.ts";

/**
 * Codex AI Engine
 */
export class CodexEngine extends BaseAIEngine {
	name = "Codex";
	cliCommand = "codex";

	async execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult> {
		// Codex uses a separate file for the last message
		const lastMessageFile = join(workDir, `.codex-last-message-${Date.now()}-${process.pid}.txt`);

		try {
			const args = ["exec", "--full-auto", "--json", "--output-last-message", lastMessageFile];
			if (options?.modelOverride) {
				args.push("--model", options.modelOverride);
			}
			args.push(prompt);

			const { stdout, stderr, exitCode } = await execCommand(this.cliCommand, args, workDir);

			const output = stdout + stderr;

			// Read the last message from the file
			let response = "";
			if (existsSync(lastMessageFile)) {
				response = readFileSync(lastMessageFile, "utf-8");
				// Remove the "Task completed successfully." prefix if present
				response = response.replace(/^Task completed successfully\.\s*/i, "").trim();
				// Clean up the temp file
				try {
					unlinkSync(lastMessageFile);
				} catch {
					// Ignore cleanup errors
				}
			}

			// Check for errors in output
			if (output.includes('"type":"error"')) {
				const errorMatch = output.match(/"message":"([^"]+)"/);
				return {
					success: false,
					response: "",
					inputTokens: 0,
					outputTokens: 0,
					error: errorMatch?.[1] || "Unknown error",
				};
			}

			return {
				success: exitCode === 0,
				response: response || "Task completed",
				inputTokens: 0, // Codex doesn't expose token counts
				outputTokens: 0,
			};
		} finally {
			// Ensure cleanup
			if (existsSync(lastMessageFile)) {
				try {
					unlinkSync(lastMessageFile);
				} catch {
					// Ignore
				}
			}
		}
	}
}
