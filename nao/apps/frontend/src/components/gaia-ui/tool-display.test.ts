import { describe, expect, it } from 'vitest';

import { groupHasError, partsToToolCallEntries } from './tool-display';
import type { GroupablePart } from '@/types/ai';

const toolPart = (overrides: Record<string, unknown> = {}): GroupablePart =>
	({
		type: 'dynamic-tool',
		toolName: 'mcp_call',
		toolCallId: 'call-1',
		state: 'output-available',
		input: { server: 'gamme-engine', tool: 'gamme_negatifs', arguments: {} },
		output: { data: [{ Code: '123' }], row_count: 1 },
		...overrides,
	}) as unknown as GroupablePart;

describe('partsToToolCallEntries', () => {
	it('maps an mcp gamme call to a Gaia entry with server label', () => {
		const entries = partsToToolCallEntries([toolPart()]);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			tool_name: 'mcp_call',
			tool_category: 'gamme_negatifs',
			message: 'Using gamme_negatifs from gamme-engine',
			integration_name: 'gamme-engine',
			tool_call_id: 'call-1',
		});
	});

	it('summarizes tabular outputs instead of dumping full payloads', () => {
		const entries = partsToToolCallEntries([toolPart()]);
		expect(entries[0]?.output).toBe('1 ligne');
	});

	it('surfaces error text when the tool errored', () => {
		const entries = partsToToolCallEntries([
			toolPart({ state: 'output-error', errorText: 'Accès refusé', output: undefined }),
		]);
		expect(entries[0]?.output).toBe('Accès refusé');
	});

	it('maps reasoning parts to thinking entries and skips empty ones', () => {
		const entries = partsToToolCallEntries([
			{ type: 'reasoning', text: '  je réfléchis  ', state: 'done' } as GroupablePart,
			{ type: 'reasoning', text: '   ', state: 'done' } as GroupablePart,
		]);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ tool_name: 'thinking', message: 'je réfléchis' });
	});

	it('filters out suggest_follow_ups and load_skill', () => {
		const entries = partsToToolCallEntries([
			toolPart({ type: 'tool-suggest_follow_ups', toolName: 'suggest_follow_ups' }),
			toolPart({ type: 'tool-load_skill', toolName: 'load_skill' }),
		]);
		expect(entries).toHaveLength(0);
	});

	it('keeps the real tool name as category so each tool gets its own icon', () => {
		const entries = partsToToolCallEntries([
			toolPart({ input: { server: 'gamme-engine', tool: 'gamme_serie', arguments: {} } }),
			toolPart({
				toolCallId: 'call-2',
				input: { server: 'gamme-engine', tool: 'gamme_futuriste', arguments: {} },
			}),
		]);
		expect(entries[0]?.tool_category).toBe('gamme_serie');
		// Unknown future tools keep their raw name (icon layer falls back to generic gamme icon).
		expect(entries[1]?.tool_category).toBe('gamme_futuriste');
	});

	it('describes sql calls with their query', () => {
		const entries = partsToToolCallEntries([
			toolPart({
				type: 'tool-execute_sql',
				toolName: 'execute_sql',
				toolCallId: 'sql-1',
				input: { sql_query: 'SELECT "Code" FROM gamme_commande LIMIT 5' },
				output: { id: 'q1', data: [], columns: [], row_count: 0 },
			}),
		]);
		expect(entries[0]).toMatchObject({
			tool_name: 'execute_sql',
			tool_category: 'execute_sql',
			message: 'SELECT "Code" FROM gamme_commande LIMIT 5',
		});
		expect(entries[0]?.output).toBe('0 ligne');
	});
});

describe('streaming entries', () => {
	it('marks in-flight calls as pending with a Preparing message', () => {
		const entries = partsToToolCallEntries([
			toolPart({ state: 'input-streaming', input: {}, output: undefined }),
			toolPart({
				toolCallId: 'call-2',
				state: 'input-available',
				input: { server: 'gamme-engine', tool: 'gamme_serie', arguments: {} },
				output: undefined,
			}),
		]);
		expect(entries[0]).toMatchObject({
			pending: true,
			message: 'Preparing Mcp Call…',
		});
		expect(entries[1]).toMatchObject({
			pending: true,
			message: 'Using gamme_serie from gamme-engine',
		});
	});

	it('settled calls are not pending', () => {
		const entries = partsToToolCallEntries([toolPart()]);
		expect(entries[0]?.pending).toBe(false);
	});
});

describe('groupHasError', () => {
	it('detects errored tool parts', () => {
		expect(groupHasError([toolPart()])).toBe(false);
		expect(groupHasError([toolPart({ state: 'output-error', errorText: 'x' })])).toBe(true);
	});
});
