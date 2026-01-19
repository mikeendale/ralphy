import { existsSync } from "node:fs";
import type { AIEngineName } from "../../engines/types.ts";
import { createEngine, isEngineAvailable } from "../../engines/index.ts";
import { buildPrompt } from "../../execution/prompt.ts";
import { isRetryableError, withRetry } from "../../execution/retry.ts";
import { logTaskProgress } from "../../config/writer.ts";
import { logError, logInfo, logSuccess, setVerbose, formatTokens } from "../../ui/logger.ts";
import { ProgressSpinner } from "../../ui/spinner.ts";
import { notifyTaskComplete, notifyTaskFailed } from "../../ui/notify.ts";
import type { RuntimeOptions } from "../../config/types.ts";

/**
 * Run a single task (brownfield mode)
 */
export async function runTask(task: string, options: RuntimeOptions): Promise<void> {
	const workDir = process.cwd();

	// Set verbose mode
	setVerbose(options.verbose);

	// Check engine availability
	const engine = createEngine(options.aiEngine as AIEngineName);
	const available = await isEngineAvailable(options.aiEngine as AIEngineName);

	if (!available) {
		logError(`${engine.name} CLI not found. Make sure '${engine.cliCommand}' is in your PATH.`);
		process.exit(1);
	}

	logInfo(`Running task with ${engine.name}...`);

	// Build prompt
	const prompt = buildPrompt({
		task,
		autoCommit: options.autoCommit,
		workDir,
		skipTests: options.skipTests,
		skipLint: options.skipLint,
	});

	// Execute with spinner
	const spinner = new ProgressSpinner(task);

	if (options.dryRun) {
		spinner.success("(dry run) Would execute task");
		console.log("\nPrompt:");
		console.log(prompt);
		return;
	}

	try {
		const result = await withRetry(
			async () => {
				spinner.updateStep("Working");
				const res = await engine.execute(prompt, workDir);

				if (!res.success && res.error && isRetryableError(res.error)) {
					throw new Error(res.error);
				}

				return res;
			},
			{
				maxRetries: options.maxRetries,
				retryDelay: options.retryDelay,
				onRetry: (attempt) => {
					spinner.updateStep(`Retry ${attempt}`);
				},
			}
		);

		if (result.success) {
			const tokens = formatTokens(result.inputTokens, result.outputTokens);
			spinner.success(`Done ${tokens}`);

			logTaskProgress(task, "completed", workDir);
			notifyTaskComplete(task);

			// Show response summary
			if (result.response && result.response !== "Task completed") {
				console.log("\nResult:");
				console.log(result.response.slice(0, 500));
				if (result.response.length > 500) {
					console.log("...");
				}
			}
		} else {
			spinner.error(result.error || "Unknown error");
			logTaskProgress(task, "failed", workDir);
			notifyTaskFailed(task, result.error || "Unknown error");
			process.exit(1);
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		spinner.error(errorMsg);
		logTaskProgress(task, "failed", workDir);
		notifyTaskFailed(task, errorMsg);
		process.exit(1);
	}
}
