// Gaia-style thread for grouped tool calls ("Used N tools").
// Replaces ToolCallsGroup's Expandable rendering with the vendored gaia-ui
// ToolCallsSection. Same props ({ parts, isSettled }), no backend change.
// Single (non-grouped) tools keep rendering via <ToolCall> — the existing rich
// components (SQL table, chart, story, clarification, MCP table...) are the
// "native cards" shown alongside this activity thread.

import { memo, useMemo } from 'react';
import type { GroupablePart } from '@/types/ai';
import { isToolUIPart } from '@/lib/ai';
import { ToolCallsSection } from '@/components/gaia-ui/tool-calls-section';
import { groupHasError, partsToToolCallEntries } from '@/components/gaia-ui/tool-display';

interface Props {
	parts: GroupablePart[];
	isSettled: boolean;
}

export const GaiaToolCallsGroup = memo(({ parts, isSettled }: Props) => {
	const entries = useMemo(() => partsToToolCallEntries(parts), [parts]);
	const hasError = useMemo(() => groupHasError(parts), [parts]);

	// Stable identity for the group: the first tool call id never changes as
	// streaming appends new parts, so user expand/collapse state survives chunks.
	// The key only flips when an error appears (auto-expand, like before).
	const groupKey = useMemo(() => {
		const first = parts.find((part) => isToolUIPart(part));
		const id =
			first && isToolUIPart(first) && 'toolCallId' in first
				? String(first.toolCallId ?? 'group')
				: 'group';
		return `${id}|${hasError ? 'error' : 'ok'}`;
	}, [parts, hasError]);

	if (entries.length === 0) return null;

	return (
		<ToolCallsSection
			key={groupKey}
			toolCalls={entries}
			defaultExpanded={!isSettled || hasError}
			isStreaming={!isSettled}
		/>
	);
});
