// Gaïa-style tool icons for the nao chat thread.
//
// Uses the official @theexperiencecompany/gaia-icons package (ISC license,
// commercial use OK), style "bulk-rounded" — the rich two-tone look.
// One icon per tool (no more single icon for all MCP calls).
// Public API unchanged: getToolCategoryIcon(category, iconProps, iconUrl?),
// formatToolName(name).

import {
	Alert02Icon,
	BarChartIcon,
	BookOpen01Icon,
	Brain02Icon,
	ChartDownIcon,
	ChartUpIcon,
	Clock04Icon,
	CodeIcon,
	ComputerTerminal01Icon,
	Database01Icon,
	Database02Icon,
	DocIcon,
	Download02Icon,
	File02Icon,
	FileExportIcon,
	FileSearchIcon,
	FolderSearchIcon,
	Globe02Icon,
	HelpCircleIcon,
	Image02Icon,
	Layers01Icon,
	LayersIcon,
	Link01Icon,
	ListViewIcon,
	MapsIcon,
	Notification01Icon,
	PackageOpenIcon,
	PencilEdit02Icon,
	PlugIcon,
	Search02Icon,
	TableIcon,
	Tag01Icon,
	Target02Icon,
	ToolsIcon,
	TranslateIcon,
	GridViewIcon,
} from '@theexperiencecompany/gaia-icons/bulk-rounded';
import type { ReactElement } from 'react';

interface GaiaIconProps {
	size?: number;
	className?: string;
}

type GaiaIconComponent = (props: GaiaIconProps) => ReactElement;

export interface IconProps {
	size?: number;
	width?: number;
	height?: number;
	strokeWidth?: number;
	className?: string;
	color?: string;
}

// Category-specific icons with colors
export interface IconConfig {
	icon: GaiaIconComponent;
	bgColor: string;
	bgColorLight?: string;
	iconColor: string;
}

/**
 * Normalize a category/integration name for icon lookup
 */
const normalizeCategoryName = (name: string): string => {
	if (!name) {return 'general';}
	return name
		.toLowerCase()
		.trim()
		.replace(/[\s-]+/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
};

const emerald = {
	bgColor: 'bg-emerald-500/20 backdrop-blur',
	bgColorLight: 'bg-emerald-500/20',
	iconColor: 'text-emerald-400',
};

// Tool icon configs — one entry per tool so every MCP/tool call
// gets its own adapted icon instead of a single generic one.
const iconConfigs: Record<string, IconConfig> = {
	// --- Gamme engine (green family, alerts stand out) ---
	gamme: { icon: Database02Icon, ...emerald },
	gamme_mon_rayon: { icon: Target02Icon, ...emerald },
	gamme_rayons: { icon: GridViewIcon, ...emerald },
	gamme_query: { icon: Database02Icon, ...emerald },
	gamme_article: { icon: PackageOpenIcon, ...emerald },
	gamme_negatifs: {
		icon: ChartDownIcon,
		bgColor: 'bg-red-500/20 backdrop-blur',
		bgColorLight: 'bg-red-500/20',
		iconColor: 'text-red-400',
	},
	gamme_anomalies: {
		icon: Alert02Icon,
		bgColor: 'bg-amber-500/20 backdrop-blur',
		bgColorLight: 'bg-amber-500/20',
		iconColor: 'text-amber-400',
	},
	gamme_rapports: { icon: DocIcon, ...emerald },
	gamme_import_file: { icon: Download02Icon, ...emerald },
	gamme_etiquettes: { icon: Tag01Icon, ...emerald },
	gamme_image_article: { icon: Image02Icon, ...emerald },
	gamme_history_query: { icon: Clock04Icon, ...emerald },
	gamme_history_export: { icon: FileExportIcon, ...emerald },
	gamme_serie: { icon: ChartUpIcon, ...emerald },
	gamme_imports: { icon: LayersIcon, ...emerald },
	gamme_recherche_articles: { icon: Search02Icon, ...emerald },
	gamme_libeller: { icon: TranslateIcon, ...emerald },
	gamme_structure_articles: { icon: Layers01Icon, ...emerald },
	// --- MCP plumbing ---
	mcp: {
		icon: PlugIcon,
		bgColor: 'bg-teal-500/20 backdrop-blur',
		bgColorLight: 'bg-teal-500/20',
		iconColor: 'text-teal-400',
	},
	mcp_call: {
		icon: PlugIcon,
		bgColor: 'bg-teal-500/20 backdrop-blur',
		bgColorLight: 'bg-teal-500/20',
		iconColor: 'text-teal-400',
	},
	mcp_connect: {
		icon: PlugIcon,
		bgColor: 'bg-teal-500/20 backdrop-blur',
		bgColorLight: 'bg-teal-500/20',
		iconColor: 'text-teal-400',
	},
	// --- SQL family (cyan) ---
	execute_sql: {
		icon: Database02Icon,
		bgColor: 'bg-cyan-500/20 backdrop-blur',
		bgColorLight: 'bg-cyan-500/20',
		iconColor: 'text-cyan-400',
	},
	query_app_db: {
		icon: Database01Icon,
		bgColor: 'bg-cyan-500/20 backdrop-blur',
		bgColorLight: 'bg-cyan-500/20',
		iconColor: 'text-cyan-400',
	},
	read_query_result: {
		icon: TableIcon,
		bgColor: 'bg-cyan-500/20 backdrop-blur',
		bgColorLight: 'bg-cyan-500/20',
		iconColor: 'text-cyan-400',
	},
	// --- Web (blue) ---
	web_search: {
		icon: Globe02Icon,
		bgColor: 'bg-blue-500/20 backdrop-blur',
		bgColorLight: 'bg-blue-500/20',
		iconColor: 'text-blue-400',
	},
	google_search: {
		icon: Globe02Icon,
		bgColor: 'bg-blue-500/20 backdrop-blur',
		bgColorLight: 'bg-blue-500/20',
		iconColor: 'text-blue-400',
	},
	web_fetch: {
		icon: Link01Icon,
		bgColor: 'bg-blue-500/20 backdrop-blur',
		bgColorLight: 'bg-blue-500/20',
		iconColor: 'text-blue-400',
	},
	// --- Files (orange) ---
	grep: {
		icon: FileSearchIcon,
		bgColor: 'bg-orange-500/20 backdrop-blur',
		bgColorLight: 'bg-orange-500/20',
		iconColor: 'text-orange-400',
	},
	list: {
		icon: ListViewIcon,
		bgColor: 'bg-orange-500/20 backdrop-blur',
		bgColorLight: 'bg-orange-500/20',
		iconColor: 'text-orange-400',
	},
	read: {
		icon: File02Icon,
		bgColor: 'bg-orange-500/20 backdrop-blur',
		bgColorLight: 'bg-orange-500/20',
		iconColor: 'text-orange-400',
	},
	write: {
		icon: PencilEdit02Icon,
		bgColor: 'bg-orange-500/20 backdrop-blur',
		bgColorLight: 'bg-orange-500/20',
		iconColor: 'text-orange-400',
	},
	search: {
		icon: FolderSearchIcon,
		bgColor: 'bg-orange-500/20 backdrop-blur',
		bgColorLight: 'bg-orange-500/20',
		iconColor: 'text-orange-400',
	},
	// --- Code (cyan) ---
	execute_python: {
		icon: CodeIcon,
		bgColor: 'bg-cyan-500/20 backdrop-blur',
		bgColorLight: 'bg-cyan-500/20',
		iconColor: 'text-cyan-400',
	},
	execute_sandboxed_code: {
		icon: ComputerTerminal01Icon,
		bgColor: 'bg-cyan-500/20 backdrop-blur',
		bgColorLight: 'bg-cyan-500/20',
		iconColor: 'text-cyan-400',
	},
	// --- Visual / misc ---
	display_chart: {
		icon: BarChartIcon,
		bgColor: 'bg-sky-500/20 backdrop-blur',
		bgColorLight: 'bg-sky-500/20',
		iconColor: 'text-sky-400',
	},
	display_map: {
		icon: MapsIcon,
		bgColor: 'bg-teal-500/20 backdrop-blur',
		bgColorLight: 'bg-teal-500/20',
		iconColor: 'text-teal-400',
	},
	story: {
		icon: BookOpen01Icon,
		bgColor: 'bg-violet-500/20 backdrop-blur',
		bgColorLight: 'bg-violet-500/20',
		iconColor: 'text-violet-400',
	},
	clarification: {
		icon: HelpCircleIcon,
		bgColor: 'bg-amber-500/20 backdrop-blur',
		bgColorLight: 'bg-amber-500/20',
		iconColor: 'text-amber-400',
	},
	record_recommendation: {
		icon: Notification01Icon,
		bgColor: 'bg-yellow-500/20 backdrop-blur',
		bgColorLight: 'bg-yellow-500/20',
		iconColor: 'text-yellow-400',
	},
	thinking: {
		icon: Brain02Icon,
		bgColor: 'bg-indigo-500/20 backdrop-blur',
		bgColorLight: 'bg-indigo-500/20',
		iconColor: 'text-indigo-400',
	},
	general: {
		icon: ToolsIcon,
		bgColor: 'bg-gray-500/20 backdrop-blur',
		bgColorLight: 'bg-gray-500/20',
		iconColor: 'text-gray-400',
	},
	unknown: {
		icon: ToolsIcon,
		bgColor: 'bg-zinc-500/20 backdrop-blur',
		bgColorLight: 'bg-zinc-500/20',
		iconColor: 'text-zinc-400',
	},
};

/**
 * Get icon for a tool category with optional URL-based icon fallback.
 * Supports built-in categories and custom integration icons via iconUrl.
 */
export const getToolCategoryIcon = (
	category: string,
	iconProps: Partial<IconProps> & { showBackground?: boolean } = {},
	iconUrl?: string | null,
) => {
	const { showBackground = true, ...restProps } = iconProps;

	const size = restProps.size ?? 16;
	const width = restProps.width ?? 20;
	const height = restProps.height ?? 20;

	// Normalize
	const normalizedCategory = normalizeCategoryName(category);
	const finalCategory = normalizeCategoryName(normalizedCategory);

	let config = iconConfigs[finalCategory];

	// Fallback search
	if (!config) {
		const matchingConfig = Object.entries(iconConfigs).find(
			([key]) => normalizeCategoryName(key) === finalCategory,
		);
		if (matchingConfig) {
			config = matchingConfig[1];
		}
	}

	// Prefix fallback: any future gamme_* tool gets the generic gamme icon.
	if (!config && finalCategory.startsWith('gamme_')) {
		config = iconConfigs.gamme;
	}

	// If no predefined config found, try iconUrl fallback for custom integrations
	if (!config) {
		if (iconUrl) {
			const iconElement = (
				<img
					alt={`${category} Icon`}
					width={width}
					height={height}
					className={`${restProps.className || ''} aspect-square object-contain`}
					src={iconUrl}
				/>
			);
			return showBackground ? (
				<div className='rounded-lg p-1 bg-zinc-700 dark:bg-zinc-700'>{iconElement}</div>
			) : (
				iconElement
			);
		}
		return null;
	}

	// Render gaia icon
	const GaiaIconComponent = config.icon;
	const iconElement = (
		<GaiaIconComponent size={width || size} className={restProps.className || config.iconColor} />
	);

	// Return with or without background based on showBackground prop
	// Using dark: prefix for proper light/dark mode support
	return showBackground ? (
		<div className={`rounded-lg p-1 ${config.bgColorLight || config.bgColor} dark:${config.bgColor}`}>
			{iconElement}
		</div>
	) : (
		iconElement
	);
};

// Format tool names from snake_case to Title Case
export const formatToolName = (name: string): string => {
	return name
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
};
