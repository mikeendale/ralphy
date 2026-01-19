import {
	BaseAIEngine,
	checkForErrors,
	execCommand,
	parseStreamJsonResult,
} from "./base.ts";
import type { AIResult } from "./types.ts";

/**
 * Claude Code AI Engine
 */
export class ClaudeEngine extends BaseAIEngine {
	name = "Claude Code";
	cliCommand = "claude";

	async execute(prompt: string, workDir: string): Promise<AIResult> {
		const { stdout, stderr, exitCode } = await execCommand(
			this.cliCommand,
			["--dangerously-skip-permissions", "--verbose", "--output-format", "stream-json", "-p", prompt],
			workDir
		);

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

		// Parse result
		const { response, inputTokens, outputTokens } = parseStreamJsonResult(output);

		return {
			success: exitCode === 0,
			response,
			inputTokens,
			outputTokens,
		};
	}
}
