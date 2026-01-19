import {
	BaseAIEngine,
	checkForErrors,
	execCommand,
	parseStreamJsonResult,
} from "./base.ts";
import type { AIResult } from "./types.ts";

/**
 * Qwen-Code AI Engine
 */
export class QwenEngine extends BaseAIEngine {
	name = "Qwen-Code";
	cliCommand = "qwen";

	async execute(prompt: string, workDir: string): Promise<AIResult> {
		const { stdout, stderr, exitCode } = await execCommand(
			this.cliCommand,
			["--output-format", "stream-json", "--approval-mode", "yolo", "-p", prompt],
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

		// Parse result (same format as Claude)
		const { response, inputTokens, outputTokens } = parseStreamJsonResult(output);

		return {
			success: exitCode === 0,
			response,
			inputTokens,
			outputTokens,
		};
	}
}
