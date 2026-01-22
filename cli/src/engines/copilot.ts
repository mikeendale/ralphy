import {
	BaseAIEngine,
	checkForErrors,
	detectStepFromOutput,
	execCommand,
	execCommandStreaming,
} from "./base.ts";
import type { AIResult, EngineOptions, ProgressCallback } from "./types.ts";

/**
 * GitHub Copilot CLI AI Engine
 */
export class CopilotEngine extends BaseAIEngine {
	name = "GitHub Copilot";
	cliCommand = "copilot";

	/**
	 * Build command arguments for Copilot CLI
	 */
	private buildArgs(prompt: string, options?: EngineOptions): string[] {
		const args = ["-p", prompt];
		if (options?.modelOverride) {
			args.push("--model", options.modelOverride);
		}
		return args;
	}

	async execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult> {
		const args = this.buildArgs(prompt, options);

		const startTime = Date.now();
		const { stdout, stderr, exitCode } = await execCommand(this.cliCommand, args, workDir);
		const durationMs = Date.now() - startTime;

		const output = stdout + stderr;

		// Check for errors
		const error = checkForErrors(output);
		if (error) {
			return {
				success: false,
				response: "",
				inputTokens: 0,
				outputTokens: 0,
				error,
			};
		}

		// Parse Copilot output - extract response from output
		const response = this.parseOutput(output);

		return {
			success: exitCode === 0,
			response,
			inputTokens: 0, // Copilot CLI doesn't expose token counts in programmatic mode
			outputTokens: 0,
			cost: durationMs > 0 ? `duration:${durationMs}` : undefined,
		};
	}

	private parseOutput(output: string): string {
		// Copilot CLI may output text responses
		// Extract the meaningful response, filtering out control characters and prompts
		// Note: These filter patterns are specific to current Copilot CLI behavior
		// and may need updates if the CLI output format changes
		const lines = output.split("\n").filter(Boolean);

		// Filter out empty lines and common CLI artifacts
		const meaningfulLines = lines.filter((line) => {
			const trimmed = line.trim();
			return (
				trimmed &&
				!trimmed.startsWith("?") && // Interactive prompts
				!trimmed.startsWith("❯") && // Command prompts
				!trimmed.includes("Thinking...") && // Status messages
				!trimmed.includes("Working on it...") // Status messages
			);
		});

		return meaningfulLines.join("\n") || "Task completed";
	}

	async executeStreaming(
		prompt: string,
		workDir: string,
		onProgress: ProgressCallback,
		options?: EngineOptions,
	): Promise<AIResult> {
		const args = this.buildArgs(prompt, options);

		const outputLines: string[] = [];
		const startTime = Date.now();

		const { exitCode } = await execCommandStreaming(this.cliCommand, args, workDir, (line) => {
			outputLines.push(line);

			// Detect and report step changes
			const step = detectStepFromOutput(line);
			if (step) {
				onProgress(step);
			}
		});

		const durationMs = Date.now() - startTime;
		const output = outputLines.join("\n");

		// Check for errors
		const error = checkForErrors(output);
		if (error) {
			return {
				success: false,
				response: "",
				inputTokens: 0,
				outputTokens: 0,
				error,
			};
		}

		// Parse Copilot output
		const response = this.parseOutput(output);

		return {
			success: exitCode === 0,
			response,
			inputTokens: 0,
			outputTokens: 0,
			cost: durationMs > 0 ? `duration:${durationMs}` : undefined,
		};
	}
}
