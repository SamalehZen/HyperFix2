// Adapter: nao message parts -> gaia-ui ToolCallEntry[].
// Pure mapping, no backend/architecture change. The thread component
// (ToolCallsSection) only ever sees these entries.

import { formatToolName } from './tool-icons';
import type { GroupablePart } from '@/types/ai';
import type { ToolCallEntry } from './tool-calls-section';
import { getToolName, isReasoningPart, isToolUIPart } from '@/lib/ai';

const MAX_MESSAGE_LENGTH = 140;
const MAX_OUTPUT_LENGTH = 1200;
const MAX_INPUT_STRING_LENGTH = 2000;

const truncate = (value: string, maxLength: number): string => {
	const trimmed = value.trim();
	return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
};

type InputRecord = Record<string, unknown>;

const asRecord = (value: unknown): InputRecord | undefined => {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as InputRecord;
	}
	return undefined;
};

const stringField = (input: InputRecord | undefined, ...keys: string[]): string | undefined => {
	if (!input) {return undefined;}
	for (const key of keys) {
		const value = input[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value;
		}
	}
	return undefined;
};

/** Human-readable one-liner for a tool call, in the spirit of Gaia's deriveToolCallDisplay. */
const describeToolCall = (toolName: string, input: InputRecord | undefined): string | undefined => {
	if (toolName === 'mcp_call' || toolName === 'mcp_connect') {
		const server = stringField(input, 'server');
		const tool = stringField(input, 'tool');
		if (server && tool) {return `Using ${tool} from ${server}`;}
		if (server) {return `Connecting to ${server}`;}
		return undefined;
	}
	if (toolName === 'execute_sql' || toolName === 'query_app_db' || toolName === 'read_query_result') {
		const name = stringField(input, 'name');
		const sql = stringField(input, 'sql_query', 'sql', 'query');
		if (name && sql) {return `SQL · ${name} · ${truncate(sql, 80)}`;}
		if (name) {return `SQL · ${name}`;}
		if (sql) {return truncate(sql, MAX_MESSAGE_LENGTH);}
		return 'SQL query';
	}
	// Generic: surface the most telling string field (path, query, pattern...).
	const hint = stringField(
		input,
		'query',
		'path',
		'file',
		'pattern',
		'question',
		'message',
		'text',
		'url',
		'libelle',
		'label',
	);
	if (hint) {return truncate(hint, MAX_MESSAGE_LENGTH);}
	return undefined;
};

/** Category used for the Gaia icon + secondary label: the real tool name,
 *  so every tool gets its own adapted icon (see tool-icons.tsx). */
const categoryForTool = (toolName: string, input: InputRecord | undefined): string => {
	if (toolName === 'mcp_call') {
		return stringField(input, 'tool') ?? 'mcp_call';
	}
	return toolName;
};

/** Friendly integration label shown under the tool message (Gaia's secondaryLabel). */
const integrationForTool = (toolName: string, input: InputRecord | undefined): string | undefined => {
	if (toolName === 'mcp_call' || toolName === 'mcp_connect') {
		return stringField(input, 'server');
	}
	return undefined;
};

/** Short human summary of a tool output (full payloads stay in the native cards). */
const summarizeOutput = (output: unknown): string | undefined => {
	if (output === undefined || output === null) {return undefined;}
	if (typeof output === 'string') {
		const trimmed = output.trim();
		return trimmed.length > 0 ? truncate(trimmed, MAX_OUTPUT_LENGTH) : undefined;
	}
	if (Array.isArray(output)) {
		return `${output.length} résultat${output.length > 1 ? 's' : ''}`;
	}
	if (typeof output === 'object') {
		const record = output as InputRecord;
		if (typeof record.row_count === 'number') {
			return `${record.row_count} ligne${record.row_count > 1 ? 's' : ''}`;
		}
		if (Array.isArray(record.data)) {
			return `${record.data.length} ligne${record.data.length > 1 ? 's' : ''}`;
		}
		if (Array.isArray(record.content)) {
			const text = record.content
				.filter((c) => c && typeof c === 'object' && (c as InputRecord).type === 'text')
				.map((c) => String((c as InputRecord).text ?? ''))
				.join('\n')
				.trim();
			if (text.length > 0) {return truncate(text, MAX_OUTPUT_LENGTH);}
		}
		try {
			return truncate(JSON.stringify(output), MAX_OUTPUT_LENGTH);
		} catch {
			return undefined;
		}
	}
	return truncate(String(output), MAX_OUTPUT_LENGTH);
};

/** Trim oversized input payloads before display (details stay in native cards). */
const sanitizeInput = (input: InputRecord | undefined): Record<string, unknown> | undefined => {
	if (!input) {return undefined;}
	const entries = Object.entries(input);
	if (entries.length === 0) {return undefined;}
	const result: Record<string, unknown> = {};
	for (const [key, value] of entries) {
		if (typeof value === 'string' && value.length > MAX_INPUT_STRING_LENGTH) {
			result[key] = `${value.slice(0, MAX_INPUT_STRING_LENGTH)}…`;
		} else if (Array.isArray(value) && value.length > 50) {
			result[key] = `${value.length} éléments`;
		} else if (value !== undefined) {
			result[key] = value as unknown;
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
};

export const partsToToolCallEntries = (parts: GroupablePart[]): ToolCallEntry[] => {
	return parts.flatMap((part, index): ToolCallEntry[] => {
		if (isReasoningPart(part)) {
			const text = part.text?.trim() ?? '';
			if (text.length === 0) {return [];}
			return [
				{
					tool_name: 'thinking',
					tool_category: 'thinking',
					message: truncate(text, MAX_MESSAGE_LENGTH),
				},
			];
		}
		if (!isToolUIPart(part)) {return [];}

		const toolName = getToolName(part);
		// suggest_follow_ups / load_skill are never rendered (dispatcher returns null).
		if (toolName === 'suggest_follow_ups' || toolName === 'load_skill') {return [];}

		const input = 'input' in part ? asRecord(part.input) : undefined;
		const toolCallId = 'toolCallId' in part ? (part.toolCallId as string | undefined) : undefined;
		const errorText = 'errorText' in part ? (part.errorText as string | undefined) : undefined;
		const output = 'output' in part ? part.output : undefined;
		const state = 'state' in part ? (part.state as string | undefined) : undefined;
		const pending = state === 'input-streaming' || state === 'input-available';
		const described = describeToolCall(toolName, input);

		return [
			{
				tool_name: toolName,
				tool_category: categoryForTool(toolName, input),
				message: described ?? (pending ? `Preparing ${formatToolName(toolName)}…` : undefined),
				integration_name: integrationForTool(toolName, input),
				tool_call_id: toolCallId ?? `${toolName}-${index}`,
				inputs: sanitizeInput(input),
				output: summarizeOutput(errorText ?? output),
				pending,
			},
		];
	});
};

/** True if any tool part of the group ended in error (drives auto-expand). */
export const groupHasError = (parts: GroupablePart[]): boolean => {
	return parts.some((part) => isToolUIPart(part) && part.state === 'output-error');
};
