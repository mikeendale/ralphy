import { spawn } from "node:child_process";
import type { AIEngine, AIResult } from "./types.ts";

/**
 * Check if a command is available in PATH
 */
export async function commandExists(command: string): Promise<boolean> {
	try {
		const proc = Bun.spawn(["which", command], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}

/**
 * Execute a command and return stdout
 */
export async function execCommand(
	command: string,
	args: string[],
	workDir: string,
	env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn([command, ...args], {
		cwd: workDir,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, ...env },
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	return { stdout, stderr, exitCode };
}

/**
 * Parse token counts from stream-json output (Claude/Qwen format)
 */
export function parseStreamJsonResult(output: string): {
	response: string;
	inputTokens: number;
	outputTokens: number;
} {
	const lines = output.split("\n").filter(Boolean);
	let response = "";
	let inputTokens = 0;
	let outputTokens = 0;

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "result") {
				response = parsed.result || "Task completed";
				inputTokens = parsed.usage?.input_tokens || 0;
				outputTokens = parsed.usage?.output_tokens || 0;
			}
		} catch {
			// Ignore non-JSON lines
		}
	}

	return { response: response || "Task completed", inputTokens, outputTokens };
}

/**
 * Check for errors in stream-json output
 */
export function checkForErrors(output: string): string | null {
	const lines = output.split("\n").filter(Boolean);

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line);
			if (parsed.type === "error") {
				return parsed.error?.message || parsed.message || "Unknown error";
			}
		} catch {
			// Ignore non-JSON lines
		}
	}

	return null;
}

/**
 * Base implementation for AI engines
 */
export abstract class BaseAIEngine implements AIEngine {
	abstract name: string;
	abstract cliCommand: string;

	async isAvailable(): Promise<boolean> {
		return commandExists(this.cliCommand);
	}

	abstract execute(prompt: string, workDir: string): Promise<AIResult>;
}
