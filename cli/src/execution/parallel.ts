import { copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PROGRESS_FILE, RALPHY_DIR } from "../config/loader.ts";
import { logTaskProgress } from "../config/writer.ts";
import type { AIEngine, AIResult } from "../engines/types.ts";
import { getCurrentBranch, returnToBaseBranch } from "../git/branch.ts";
import {
	abortMerge,
	createIntegrationBranch,
	deleteLocalBranch,
	mergeAgentBranch,
} from "../git/merge.ts";
import { cleanupAgentWorktree, createAgentWorktree, getWorktreeBase } from "../git/worktree.ts";
import type { Task, TaskSource } from "../tasks/types.ts";
import { YamlTaskSource } from "../tasks/yaml.ts";
import { logDebug, logError, logInfo, logSuccess, logWarn } from "../ui/logger.ts";
import { notifyTaskComplete, notifyTaskFailed } from "../ui/notify.ts";
import { resolveConflictsWithAI } from "./conflict-resolution.ts";
import { buildParallelPrompt } from "./prompt.ts";
import { isRetryableError, sleep, withRetry } from "./retry.ts";
import type { ExecutionOptions, ExecutionResult } from "./sequential.ts";

interface ParallelAgentResult {
	task: Task;
	worktreeDir: string;
	branchName: string;
	result: AIResult | null;
	error?: string;
}

/**
 * Run a single agent in a worktree
 */
async function runAgentInWorktree(
	engine: AIEngine,
	task: Task,
	agentNum: number,
	baseBranch: string,
	worktreeBase: string,
	originalDir: string,
	prdSource: string,
	prdFile: string,
	prdIsFolder: boolean,
	maxRetries: number,
	retryDelay: number,
	skipTests: boolean,
	skipLint: boolean,
	browserEnabled: "auto" | "true" | "false",
	modelOverride?: string,
): Promise<ParallelAgentResult> {
	let worktreeDir = "";
	let branchName = "";

	try {
		// Create worktree
		const worktree = await createAgentWorktree(
			task.title,
			agentNum,
			baseBranch,
			worktreeBase,
			originalDir,
		);
		worktreeDir = worktree.worktreeDir;
		branchName = worktree.branchName;

		logDebug(`Agent ${agentNum}: Created worktree at ${worktreeDir}`);

		// Copy PRD file or folder to worktree
		if (prdSource === "markdown" || prdSource === "yaml") {
			const srcPath = join(originalDir, prdFile);
			const destPath = join(worktreeDir, prdFile);
			if (existsSync(srcPath)) {
				copyFileSync(srcPath, destPath);
			}
		} else if (prdSource === "markdown-folder" && prdIsFolder) {
			const srcPath = join(originalDir, prdFile);
			const destPath = join(worktreeDir, prdFile);
			if (existsSync(srcPath)) {
				cpSync(srcPath, destPath, { recursive: true });
			}
		}

		// Ensure .ralphy/ exists in worktree
		const ralphyDir = join(worktreeDir, RALPHY_DIR);
		if (!existsSync(ralphyDir)) {
			mkdirSync(ralphyDir, { recursive: true });
		}

		// Build prompt
		const prompt = buildParallelPrompt({
			task: task.title,
			progressFile: PROGRESS_FILE,
			skipTests,
			skipLint,
			browserEnabled,
		});

		// Execute with retry
		const engineOptions = modelOverride ? { modelOverride } : undefined;
		const result = await withRetry(
			async () => {
				const res = await engine.execute(prompt, worktreeDir, engineOptions);
				if (!res.success && res.error && isRetryableError(res.error)) {
					throw new Error(res.error);
				}
				return res;
			},
			{ maxRetries, retryDelay },
		);

		return { task, worktreeDir, branchName, result };
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		return { task, worktreeDir, branchName, result: null, error: errorMsg };
	}
}

/**
 * Run tasks in parallel using worktrees
 */
export async function runParallel(
	options: ExecutionOptions & {
		maxParallel: number;
		prdSource: string;
		prdFile: string;
		prdIsFolder?: boolean;
	},
): Promise<ExecutionResult> {
	const {
		engine,
		taskSource,
		workDir,
		skipTests,
		skipLint,
		dryRun,
		maxIterations,
		maxRetries,
		retryDelay,
		baseBranch,
		maxParallel,
		prdSource,
		prdFile,
		prdIsFolder = false,
		browserEnabled,
		modelOverride,
		skipMerge,
	} = options;

	const result: ExecutionResult = {
		tasksCompleted: 0,
		tasksFailed: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
	};

	// Get worktree base directory
	const worktreeBase = getWorktreeBase(workDir);
	logDebug(`Worktree base: ${worktreeBase}`);

	// Save starting branch to restore after merge phase
	const startingBranch = await getCurrentBranch(workDir);

	// Save original base branch for merge phase
	const originalBaseBranch = baseBranch || startingBranch;

	// Track completed branches for merge phase
	const completedBranches: string[] = [];

	// Global agent counter to ensure unique numbering across batches
	let globalAgentNum = 0;

	// Process tasks in batches
	let iteration = 0;

	while (true) {
		// Check iteration limit
		if (maxIterations > 0 && iteration >= maxIterations) {
			logInfo(`Reached max iterations (${maxIterations})`);
			break;
		}

		// Get tasks for this batch
		let tasks: Task[] = [];

		// For YAML sources, try to get tasks from the same parallel group
		if (taskSource instanceof YamlTaskSource) {
			const nextTask = await taskSource.getNextTask();
			if (!nextTask) break;

			const group = await taskSource.getParallelGroup(nextTask.title);
			if (group > 0) {
				tasks = await taskSource.getTasksInGroup(group);
			} else {
				tasks = [nextTask];
			}
		} else {
			// For other sources, get all remaining tasks
			tasks = await taskSource.getAllTasks();
		}

		if (tasks.length === 0) {
			logSuccess("All tasks completed!");
			break;
		}

		// Limit to maxParallel
		const batch = tasks.slice(0, maxParallel);
		iteration++;

		logInfo(`Batch ${iteration}: ${batch.length} tasks in parallel`);

		if (dryRun) {
			logInfo("(dry run) Skipping batch");
			continue;
		}

		// Run agents in parallel
		const promises = batch.map((task) => {
			globalAgentNum++;
			return runAgentInWorktree(
				engine,
				task,
				globalAgentNum,
				baseBranch,
				worktreeBase,
				workDir,
				prdSource,
				prdFile,
				prdIsFolder,
				maxRetries,
				retryDelay,
				skipTests,
				skipLint,
				browserEnabled,
				modelOverride,
			);
		});

		const results = await Promise.all(promises);

		// Process results
		for (const agentResult of results) {
			const { task, worktreeDir, branchName, result: aiResult, error } = agentResult;

			if (error) {
				logError(`Task "${task.title}" failed: ${error}`);
				logTaskProgress(task.title, "failed", workDir);
				result.tasksFailed++;
				notifyTaskFailed(task.title, error);
			} else if (aiResult?.success) {
				logSuccess(`Task "${task.title}" completed`);
				result.totalInputTokens += aiResult.inputTokens;
				result.totalOutputTokens += aiResult.outputTokens;

				await taskSource.markComplete(task.id);
				logTaskProgress(task.title, "completed", workDir);
				result.tasksCompleted++;
				notifyTaskComplete(task.title);

				// Track successful branch for merge phase
				if (branchName) {
					completedBranches.push(branchName);
				}
			} else {
				const errMsg = aiResult?.error || "Unknown error";
				logError(`Task "${task.title}" failed: ${errMsg}`);
				logTaskProgress(task.title, "failed", workDir);
				result.tasksFailed++;
				notifyTaskFailed(task.title, errMsg);
			}

			// Cleanup worktree
			if (worktreeDir) {
				const cleanup = await cleanupAgentWorktree(worktreeDir, branchName, workDir);
				if (cleanup.leftInPlace) {
					logInfo(`Worktree left in place (uncommitted changes): ${worktreeDir}`);
				}
			}
		}
	}

	// Merge phase: merge completed branches back to base branch
	if (!skipMerge && !dryRun && completedBranches.length > 0) {
		await mergeCompletedBranches(
			completedBranches,
			originalBaseBranch,
			engine,
			workDir,
			modelOverride,
		);

		// Restore starting branch if we're not already on it
		const currentBranch = await getCurrentBranch(workDir);
		if (currentBranch !== startingBranch) {
			logDebug(`Restoring starting branch: ${startingBranch}`);
			await returnToBaseBranch(startingBranch, workDir);
		}
	}

	return result;
}

/**
 * Merge completed branches back to the base branch
 */
async function mergeCompletedBranches(
	branches: string[],
	targetBranch: string,
	engine: AIEngine,
	workDir: string,
	modelOverride?: string,
): Promise<void> {
	if (branches.length === 0) {
		return;
	}

	logInfo(`\nMerge phase: merging ${branches.length} branch(es) into ${targetBranch}`);

	const merged: string[] = [];
	const failed: string[] = [];

	for (const branch of branches) {
		logInfo(`Merging ${branch}...`);

		const mergeResult = await mergeAgentBranch(branch, targetBranch, workDir);

		if (mergeResult.success) {
			logSuccess(`Merged ${branch}`);
			merged.push(branch);
		} else if (mergeResult.hasConflicts && mergeResult.conflictedFiles) {
			// Try AI-assisted conflict resolution
			logWarn(`Merge conflict in ${branch}, attempting AI resolution...`);

			const resolved = await resolveConflictsWithAI(
				engine,
				mergeResult.conflictedFiles,
				branch,
				workDir,
				modelOverride,
			);

			if (resolved) {
				logSuccess(`Resolved conflicts and merged ${branch}`);
				merged.push(branch);
			} else {
				logError(`Failed to resolve conflicts for ${branch}`);
				await abortMerge(workDir);
				failed.push(branch);
			}
		} else {
			logError(`Failed to merge ${branch}: ${mergeResult.error || "Unknown error"}`);
			failed.push(branch);
		}
	}

	// Delete successfully merged branches
	for (const branch of merged) {
		const deleted = await deleteLocalBranch(branch, workDir, true);
		if (deleted) {
			logDebug(`Deleted merged branch: ${branch}`);
		}
	}

	// Summary
	if (merged.length > 0) {
		logSuccess(`Successfully merged ${merged.length} branch(es)`);
	}
	if (failed.length > 0) {
		logWarn(`Failed to merge ${failed.length} branch(es): ${failed.join(", ")}`);
		logInfo("These branches have been preserved for manual review.");
	}
}
