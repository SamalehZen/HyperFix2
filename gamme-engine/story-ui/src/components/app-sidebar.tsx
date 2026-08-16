"use client"

import * as React from "react"
import {
  CalendarDaysIcon,
  ChartBarIcon,
  PackageIcon,
  ShieldAlertIcon,
  StoreIcon,
} from "lucide-react"

import { NavDocuments } from "@/components/nav-documents"
import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { JoursData } from "@/lib/story"
import { fmtDateShort } from "@/lib/story"

const navMain = [
  { title: "Vue du jour", url: "#vue-jour", icon: <ChartBarIcon /> },
  { title: "Négatifs", url: "#negatifs", icon: <PackageIcon /> },
  { title: "Anomalies", url: "#anomalies", icon: <ShieldAlertIcon /> },
]

export function AppSidebar({
  jours,
  rayon,
  jour,
  ...props
}: {
  jours: JoursData | null
  rayon: string
  jour: string
} & React.ComponentProps<typeof Sidebar>) {
  const items = (jours?.jours ?? []).slice(0, 12).map((j) => ({
    name: `${fmtDateShort(j.jour)} — ${j.negatifs} nég.`,
    url: `?jour=${j.jour}&rayon=${encodeURIComponent(rayon)}`,
    icon: <CalendarDaysIcon />,
    isActive: j.jour === jour,
  }))

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href={`?rayon=${encodeURIComponent(rayon)}`}>
                <StoreIcon className="size-5!" />
                <span className="text-base font-semibold">
                  {jours?.libelle_rayon ?? "Gamme"}
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Jours importés</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavDocuments items={items} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
