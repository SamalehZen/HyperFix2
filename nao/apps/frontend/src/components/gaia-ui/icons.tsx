// Gaia-native chevron + fallback icons (bulk-rounded style, same as the thread).
// MIT-compatible: @theexperiencecompany/gaia-icons is ISC licensed.

import { ArrowDown01Icon, ToolsIcon } from '@theexperiencecompany/gaia-icons/bulk-rounded';
import { cn } from '@/lib/utils';

interface GaiaChevronIconProps {
	isExpanded: boolean;
	size?: number;
	className?: string;
}

export function GaiaChevronIcon({ isExpanded, size = 18, className = '' }: GaiaChevronIconProps) {
	return (
		<ArrowDown01Icon
			size={size}
			className={cn('transition-transform duration-200', isExpanded && 'rotate-180', className)}
		/>
	);
}

interface GaiaToolsIconProps {
	size?: number;
	className?: string;
}

export function GaiaToolsIcon({ size = 21, className = '' }: GaiaToolsIconProps) {
	return <ToolsIcon size={size} className={className} />;
}
