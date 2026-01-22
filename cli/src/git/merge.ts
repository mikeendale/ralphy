import simpleGit, { type SimpleGit } from "simple-git";

/**
 * Result of a merge operation
 */
export interface MergeResult {
	success: boolean;
	hasConflicts: boolean;
	conflictedFiles?: string[];
	error?: string;
}

/**
 * Merge an agent branch into a target branch
 */
export async function mergeAgentBranch(
	branchName: string,
	targetBranch: string,
	workDir: string,
): Promise<MergeResult> {
	const git: SimpleGit = simpleGit(workDir);

	try {
		// Checkout target branch
		await git.checkout(targetBranch);

		// Attempt merge
		try {
			await git.merge([branchName, "--no-ff", "-m", `Merge ${branchName} into ${targetBranch}`]);
			return { success: true, hasConflicts: false };
		} catch (mergeError) {
			// Check if we have conflicts
			const conflictedFiles = await getConflictedFiles(workDir);
			if (conflictedFiles.length > 0) {
				return {
					success: false,
					hasConflicts: true,
					conflictedFiles,
				};
			}
			// Some other merge error
			throw mergeError;
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			hasConflicts: false,
			error: errorMsg,
		};
	}
}

/**
 * Create an integration branch for a parallel group
 */
export async function createIntegrationBranch(
	groupNum: number,
	baseBranch: string,
	workDir: string,
): Promise<string> {
	const git: SimpleGit = simpleGit(workDir);
	const branchName = `ralphy/integration-group-${groupNum}`;

	// Checkout base branch first
	await git.checkout(baseBranch);

	// Delete the branch if it exists
	try {
		await git.deleteLocalBranch(branchName, true);
	} catch {
		// Branch might not exist
	}

	// Create new branch from base
	await git.checkoutLocalBranch(branchName);

	return branchName;
}

/**
 * Merge multiple source branches into a target branch
 * Returns lists of succeeded and failed branches
 */
export async function mergeIntoBranch(
	sourceBranches: string[],
	targetBranch: string,
	workDir: string,
): Promise<{ succeeded: string[]; failed: string[]; conflicted: string[] }> {
	const succeeded: string[] = [];
	const failed: string[] = [];
	const conflicted: string[] = [];

	for (const branch of sourceBranches) {
		const result = await mergeAgentBranch(branch, targetBranch, workDir);
		if (result.success) {
			succeeded.push(branch);
		} else if (result.hasConflicts) {
			conflicted.push(branch);
		} else {
			failed.push(branch);
		}
	}

	return { succeeded, failed, conflicted };
}

/**
 * Get list of files with merge conflicts
 */
export async function getConflictedFiles(workDir: string): Promise<string[]> {
	const git: SimpleGit = simpleGit(workDir);
	const status = await git.status();

	// Conflicted files are in the 'conflicted' array
	return status.conflicted;
}

/**
 * Abort an in-progress merge
 */
export async function abortMerge(workDir: string): Promise<void> {
	const git: SimpleGit = simpleGit(workDir);
	try {
		await git.merge(["--abort"]);
	} catch {
		// Ignore if no merge in progress
	}
}

/**
 * Delete a local branch
 */
export async function deleteLocalBranch(
	branchName: string,
	workDir: string,
	force = false,
): Promise<boolean> {
	const git: SimpleGit = simpleGit(workDir);
	try {
		await git.deleteLocalBranch(branchName, force);
		return true;
	} catch {
		return false;
	}
}

/**
 * Complete a merge after conflicts have been resolved
 * Only stages the specific resolved files and commits if there are no remaining conflicts
 */
export async function completeMerge(workDir: string, resolvedFiles: string[]): Promise<boolean> {
	const git: SimpleGit = simpleGit(workDir);
	try {
		// Verify no conflicts remain
		const remainingConflicts = await getConflictedFiles(workDir);
		if (remainingConflicts.length > 0) {
			return false;
		}

		// Stage only the specific resolved files to avoid staging unrelated changes
		for (const file of resolvedFiles) {
			await git.add(file);
		}

		// Use --no-edit to preserve Git's prepared merge message
		await git.commit([], ["--no-edit"]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a merge is currently in progress
 */
export async function isMergeInProgress(workDir: string): Promise<boolean> {
	const git: SimpleGit = simpleGit(workDir);
	const status = await git.status();
	// If we have conflicted files or are in a merge state
	return status.conflicted.length > 0 || status.current?.includes("MERGING") || false;
}

/**
 * Check if a branch exists locally
 */
export async function branchExists(branchName: string, workDir: string): Promise<boolean> {
	const git: SimpleGit = simpleGit(workDir);
	const branches = await git.branchLocal();
	return branches.all.includes(branchName);
}
