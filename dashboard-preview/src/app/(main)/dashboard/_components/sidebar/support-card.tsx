import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SupportCard() {
  return (
    <Card size="sm" className="overflow-hidden shadow-none group-data-[collapsible=icon]:hidden">
      <CardHeader className="min-w-0 px-4">
        <CardTitle className="truncate text-sm">HyperFix</CardTitle>
        <CardDescription className="line-clamp-3">
          Récap story V2 et poste de pilotage dans&nbsp;
          <Link prefetch={false} href="/dashboard/mix2" className="text-foreground hover:underline">
            le dashboard
          </Link>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
