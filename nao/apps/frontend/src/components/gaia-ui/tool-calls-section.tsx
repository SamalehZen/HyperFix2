// MIT License — Copyright (c) 2026 The Experience Company
// Source: https://ui.heygaia.io/r/tool-calls-section.json
// (registry item "tool-calls-section", file "registry/new-york/ui/tool-calls-section.tsx")
// Vendored into nao. Only the icon imports were adapted for Vite
// (@/components/icons [HugeIcons] -> ./icons [lucide-react],
//  @/lib/utils/tool-icons -> ./tool-icons,
//  @/registry/.../compact-markdown -> ./compact-markdown).
// The "@/lib/utils" (cn) import is unchanged — nao provides it.

import { useEffect, useMemo, useState } from 'react';

import { GaiaChevronIcon, GaiaToolsIcon } from './icons';
import { formatToolName, getToolCategoryIcon } from './tool-icons';
import { CompactMarkdown } from './compact-markdown';
import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface ToolCallEntry {
	/** Name of the tool that was called */
	tool_name: string;
	/** Category/integration the tool belongs to (e.g., "gmail", "search", "memory") */
	tool_category: string;
	/** Human-readable message describing what the tool did */
	message?: string;
	/** Whether to show the category label (default: true) */
	show_category?: boolean;
	/** Unique ID for this tool call */
	tool_call_id?: string;
	/** Input parameters passed to the tool */
	inputs?: Record<string, unknown>;
	/** Output/result from the tool */
	output?: string;
	/** URL to custom icon for integrations */
	icon_url?: string;
	/** Friendly name for the integration (e.g., "Linear", "Slack") */
	integration_name?: string;
	/** True while the tool call is still running (input streaming or executing) */
	pending?: boolean;
}

export interface IntegrationInfo {
	iconUrl?: string;
	name?: string;
}

export interface ToolCallsSectionProps {
	/** Array of tool call entries to display */
	toolCalls: ToolCallEntry[];
	/** Optional map of integration IDs to their info for icon/name lookup */
	integrations?: Map<string, IntegrationInfo>;
	/** Maximum number of icons to show in the stacked display (default: 10) */
	maxIconsToShow?: number;
	/** Whether to start with the accordion expanded (default: false) */
	defaultExpanded?: boolean;
	/** True while the group is still streaming (shows "Using…" + progress affordances) */
	isStreaming?: boolean;
	/** Custom class name for the container */
	className?: string;
	/** Custom icon size (default: 21) */
	iconSize?: number;
	/** Custom icon renderer override */
	renderIcon?: (call: ToolCallEntry, size: number) => ReactNode;
	/** Custom content renderer override for inputs/outputs */
	renderContent?: (content: unknown) => ReactNode;
}

// ============================================================================
// Helper Components
// ============================================================================

interface ChevronIconProps {
	isExpanded: boolean;
	size?: number;
	className?: string;
}

function ChevronIcon({ isExpanded, size = 18, className = '' }: ChevronIconProps) {
	return <GaiaChevronIcon isExpanded={isExpanded} size={size} className={className} />;
}

// ============================================================================
// Main Component
// ============================================================================

export function ToolCallsSection({
	toolCalls,
	integrations,
	maxIconsToShow = 10,
	defaultExpanded = false,
	isStreaming = false,
	className,
	iconSize = 21,
	renderIcon,
	renderContent,
}: ToolCallsSectionProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);
	const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());

	// Follow the live state: auto-expand while streaming (like the old thread).
	useEffect(() => {
		if (defaultExpanded) {setIsExpanded(true);}
	}, [defaultExpanded]);

	// Create a lookup map for custom integrations by id
	const integrationLookup = useMemo(() => {
		if (integrations) {return integrations;}
		return new Map<string, IntegrationInfo>();
	}, [integrations]);

	// Helper to get icon_url with fallback to integrations lookup
	const getIconUrl = (call: ToolCallEntry): string | undefined => {
		if (call.icon_url) {return call.icon_url;}
		const integration = integrationLookup.get(call.tool_category);
		return integration?.iconUrl;
	};

	// Helper to get integration_name with fallback to integrations lookup
	const getIntegrationName = (call: ToolCallEntry): string | undefined => {
		if (call.integration_name) {return call.integration_name;}
		const integration = integrationLookup.get(call.tool_category);
		return integration?.name;
	};

	const toggleCallExpansion = (key: string) => {
		setExpandedCalls((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {next.delete(key);}
			else {next.add(key);}
			return next;
		});
	};

	const callKey = (call: ToolCallEntry, index: number): string =>
		call.tool_call_id || `${call.tool_name}-step-${index}`;

	if (toolCalls.length === 0) {return null;}

	// Default icon renderer
	const defaultRenderIcon = (call: ToolCallEntry, size: number) => {
		const icon = getToolCategoryIcon(
			call.tool_category || 'general',
			{ width: size, height: size },
			getIconUrl(call),
		);
		return (
			icon || (
				<div className='p-1 min-w-8 min-h-8 bg-zinc-200 dark:bg-zinc-800 rounded-lg text-zinc-600 dark:text-zinc-400 backdrop-blur'>
					<GaiaToolsIcon size={size} />
				</div>
			)
		);
	};

	const iconRenderer = renderIcon || defaultRenderIcon;

	// Default content renderer
	const defaultRenderContent = (content: unknown) => <CompactMarkdown content={content} />;

	const contentRenderer = renderContent || defaultRenderContent;

	// Render stacked rotated icons (deduplicated by category for cleaner display)
	const renderStackedIcons = () => {
		const seenCategories = new Set<string>();
		const uniqueIcons = toolCalls.filter((call) => {
			const category = call.tool_category || 'general';
			if (seenCategories.has(category)) {return false;}
			seenCategories.add(category);
			return true;
		});
		const displayIcons = uniqueIcons.slice(0, maxIconsToShow);

		return (
			<div className='flex min-h-8 items-center -space-x-2'>
				{displayIcons.map((call, index) => (
					<div
						key={`${call.tool_name}-${index}`}
						className='relative flex min-w-8 items-center justify-center'
						style={{
							rotate:
								displayIcons.length > 1 ? (index % 2 === 0 ? '8deg' : '-8deg') : '0deg',
							zIndex: index,
						}}
					>
						{iconRenderer(call, iconSize)}
					</div>
				))}
				{uniqueIcons.length > maxIconsToShow && (
					<div className='z-0 flex size-7 min-h-7 min-w-7 items-center justify-center rounded-lg bg-zinc-200 dark:bg-zinc-700/60 text-xs text-zinc-600 dark:text-zinc-500 font-normal'>
						+{uniqueIcons.length - maxIconsToShow}
					</div>
				)}
			</div>
		);
	};

	return (
		<div className={cn('w-fit max-w-[35rem]', className)}>
			{/* Collapsible Header */}
			<button
				type='button'
				onClick={() => setIsExpanded(!isExpanded)}
				className='flex items-center gap-2 hover:text-zinc-900 dark:hover:text-white text-zinc-500 cursor-pointer py-2'
			>
				{renderStackedIcons()}
				{isStreaming && <Spinner className='size-3 opacity-60' />}
				<span
					className={cn(
						'text-xs font-medium transition-all duration-200',
						isStreaming && 'text-shimmer',
					)}
				>
					{isStreaming ? 'Using' : 'Used'} {toolCalls.length} tool{toolCalls.length > 1 ? 's' : ''}
					{isStreaming ? '…' : ''}
				</span>
				<ChevronIcon isExpanded={isExpanded} />
			</button>

			{/* Collapsible Content */}
			<div
				className={cn(
					'overflow-hidden transition-all duration-200',
					isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0',
				)}
			>
				<div className='space-y-0 pt-1'>
					{toolCalls.map((call, index) => {
						const hasCategoryText =
							call.show_category !== false &&
							call.tool_category &&
							call.tool_category !== 'unknown';
						// While streaming, rows stay expandable (skeleton) even with no I/O yet.
						const hasDetails = Boolean(call.inputs || call.output || call.pending);
						const key = callKey(call, index);
						const isCallExpanded = expandedCalls.has(key);

						return (
							<div key={key} className='flex items-stretch gap-2'>
								{/* Icon column with connector line */}
								<div className='flex flex-col items-center self-stretch'>
									<div className='min-h-8 min-w-8 flex items-center justify-center shrink-0'>
										{iconRenderer(call, iconSize)}
									</div>
									{index < toolCalls.length - 1 && (
										<div className='w-px flex-1 bg-zinc-300 dark:bg-zinc-700 min-h-4' />
									)}
								</div>

								{/* Content column */}
								<div className='flex-1 min-w-0'>
									<button
										type='button'
										className={cn(
											'flex items-center gap-1 group/parent',
											hasDetails ? 'cursor-pointer' : '',
											!hasCategoryText ? 'pt-2' : '',
										)}
										onClick={() => hasDetails && toggleCallExpansion(key)}
									>
										{call.pending && <Spinner className='size-3 shrink-0 opacity-60' />}
										<p
											className={cn(
												'text-xs text-zinc-600 dark:text-zinc-400 font-medium',
												hasDetails &&
													'group-hover/parent:text-zinc-900 dark:group-hover/parent:text-white',
												call.pending && 'text-shimmer',
											)}
										>
											{call.message || formatToolName(call.tool_name)}
											{call.pending && !call.output ? '…' : ''}
										</p>
										{hasDetails && <ChevronIcon isExpanded={isCallExpanded} size={14} />}
									</button>

									{hasCategoryText && (
										<p className='text-[11px] text-zinc-400 dark:text-zinc-500 capitalize'>
											{getIntegrationName(call) ||
												call.tool_category
													.replace(/_/g, ' ')
													.split(' ')
													.map(
														(word) =>
															word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
													)
													.join(' ')}
										</p>
									)}

									{isCallExpanded && hasDetails && (
										<div className='mt-2 space-y-2 text-[11px] bg-zinc-100 dark:bg-zinc-800/50 rounded-xl p-3 mb-3 w-fit'>
											{call.pending && !call.inputs && !call.output && (
												<span className='text-shimmer'>Working…</span>
											)}
											{call.inputs && Object.keys(call.inputs).length > 0 && (
												<div className='flex flex-col'>
													<span className='text-zinc-400 dark:text-zinc-500 font-medium mb-1'>
														Input
													</span>
													{contentRenderer(call.inputs)}
												</div>
											)}
											{call.output && (
												<div className='flex flex-col'>
													<span className='text-zinc-400 dark:text-zinc-500 font-medium mb-1'>
														Output
													</span>
													{contentRenderer(call.output)}
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

export default ToolCallsSection;
