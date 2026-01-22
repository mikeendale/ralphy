import {
	BaseAIEngine,
	checkForErrors,
	detectStepFromOutput,
	execCommand,
	execCommandStreaming,
} from "./base.ts";
import type { AIResult, EngineOptions, ProgressCallback } from "./types.ts";

/**
 * Factory Droid AI Engine
 */
export class DroidEngine extends BaseAIEngine {
	name = "Factory Droid";
	cliCommand = "droid";

	async execute(prompt: string, workDir: string, options?: EngineOptions): Promise<AIResult> {
		const args = ["exec", "--output-format", "stream-json", "--auto", "medium"];
		if (options?.modelOverride) {
			args.push("--model", options.modelOverride);
		}
		args.push(prompt);

		const { stdout, stderr, exitCode } = await execCommand(this.cliCommand, args, workDir);

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

		// Parse Droid output
		const { response, durationMs } = this.parseOutput(output);

		return {
			success: exitCode === 0,
			response,
			inputTokens: 0, // Droid doesn't expose token counts in exec mode
			outputTokens: 0,
			cost: durationMs > 0 ? `duration:${durationMs}` : undefined,
		};
	}

	private parseOutput(output: string): { response: string; durationMs: number } {
		const lines = output.split("\n").filter(Boolean);
		let response = "";
		let durationMs = 0;

		for (const line of lines) {
			try {
				const parsed = JSON.parse(line);

				// Check completion event
				if (parsed.type === "completion") {
					response = parsed.finalText || "Task completed";
					if (typeof parsed.durationMs === "number") {
						durationMs = parsed.durationMs;
					}
				}
			} catch {
				// Ignore non-JSON lines
			}
		}

		return { response: response || "Task completed", durationMs };
	}

	async executeStreaming(
		prompt: string,
		workDir: string,
		onProgress: ProgressCallback,
		options?: EngineOptions,
	): Promise<AIResult> {
		const args = ["exec", "--output-format", "stream-json", "--auto", "medium"];
		if (options?.modelOverride) {
			args.push("--model", options.modelOverride);
		}
		args.push(prompt);

		const outputLines: string[] = [];

		const { exitCode } = await execCommandStreaming(this.cliCommand, args, workDir, (line) => {
			outputLines.push(line);

			// Detect and report step changes
			const step = detectStepFromOutput(line);
			if (step) {
				onProgress(step);
			}
		});

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

		// Parse Droid output
		const { response, durationMs } = this.parseOutput(output);

		return {
			success: exitCode === 0,
			response,
			inputTokens: 0,
			outputTokens: 0,
			cost: durationMs > 0 ? `duration:${durationMs}` : undefined,
		};
	}
}
