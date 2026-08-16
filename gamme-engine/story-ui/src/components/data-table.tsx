import * as React from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type Row,
  type SortingState,
} from "@tanstack/react-table"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { toast } from "sonner"
import { z } from "zod"

import { useIsMobile } from "@/hooks/use-mobile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CircleCheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CopyIcon,
  Columns3Icon,
  EllipsisVerticalIcon,
  GripVerticalIcon,
} from "lucide-react"
import type { Negatif } from "@/lib/story"
import { fmtDate, fmtDateShort, fmtFdj, fmtNum } from "@/lib/story"

// New in v9: declare the features this table uses — anything you don't
// register is tree-shaken out of the bundle.
const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})

const columnHelper = createColumnHelper<typeof features, z.infer<typeof schema>>()

export const schema = z.object({
  code: z.number(),
  libelle: z.string().nullable(),
  stock_j1: z.number().nullable(),
  stock_j: z.number(),
  variation: z.number().nullable(),
  px_revient: z.number().nullable(),
  px_vente: z.number().nullable(),
  couv: z.number().nullable(),
  statut: z.string(),
  priorite: z.string(),
  jours_consecutifs: z.number(),
  premiere_apparition: z.string().nullable(),
  nb_occurrences: z.number(),
  compensateur: z.string().nullable(),
  confiance: z.string(),
  hist7: z.array(z.object({ jour: z.string(), stock: z.number().nullable() })),
})

const STATUT_LABELS: Record<string, string> = {
  nouveau: "Nouveau",
  persistant_aggrave: "Aggravé",
  persistant_ameliore: "Amélioré",
  persistant_stable: "Stable",
  corrige: "Corrigé",
}

const COLUMN_LABELS: Record<string, string> = {
  libelle: "Libellé",
  code: "Code",
  statut: "Statut",
  priorite: "Priorité",
  stock_j1: "J-1",
  stock_j: "J",
  variation: "Δ",
  px_revient: "Px revient",
  px_vente: "Px vente",
  couv: "Couverture",
  jours_consecutifs: "Jours nég.",
  premiere_apparition: "1re apparition",
  compensateur: "Compensateur",
  confiance: "Confiance",
}

function PrioriteBadge({ value }: { value: string }) {
  const cls =
    value === "critique"
      ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40"
      : value === "important"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40"
        : value === "corrige"
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
          : "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/40"
  return (
    <Badge variant="outline" className={`px-1.5 ${cls}`}>
      {value}
    </Badge>
  )
}

function ConfianceBadge({ value }: { value: string }) {
  const cls =
    value === "fort"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40"
      : value === "moyen"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40"
        : value === "faible"
          ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/40"
          : ""
  return (
    <Badge variant="outline" className={`px-1.5 ${cls}`}>
      {value}
    </Badge>
  )
}

// Create a separate component for the drag handle
function DragHandle({ id }: { id: number }) {
  const { attributes, listeners } = useSortable({
    id,
  })

  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:bg-transparent"
    >
      <GripVerticalIcon className="size-3 text-muted-foreground" />
      <span className="sr-only">Réordonner</span>
    </Button>
  )
}

const columns = columnHelper.columns([
  columnHelper.display({
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.code} />,
  }),
  columnHelper.display({
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Tout sélectionner"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Sélectionner la ligne"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  }),
  columnHelper.accessor("libelle", {
    header: "Libellé",
    cell: ({ row }) => <TableCellViewer item={row.original} />,
    enableHiding: false,
  }),
  columnHelper.accessor("code", {
    header: "Code",
    cell: ({ row }) => (
      <span className="font-mono text-muted-foreground">{row.original.code}</span>
    ),
  }),
  columnHelper.accessor("statut", {
    header: "Statut",
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        {row.original.statut === "corrige" && (
          <CircleCheckIcon className="fill-green-500 dark:fill-green-400" />
        )}
        {STATUT_LABELS[row.original.statut] ?? row.original.statut}
      </Badge>
    ),
  }),
  columnHelper.accessor("priorite", {
    header: "Priorité",
    cell: ({ row }) => <PrioriteBadge value={row.original.priorite} />,
  }),
  columnHelper.accessor("stock_j1", {
    header: () => <div className="w-full text-right">J-1</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{fmtNum(row.original.stock_j1)}</div>
    ),
  }),
  columnHelper.accessor("stock_j", {
    header: () => <div className="w-full text-right">J</div>,
    cell: ({ row }) => (
      <div
        className={`text-right font-bold tabular-nums ${row.original.stock_j < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
      >
        {fmtNum(row.original.stock_j)}
      </div>
    ),
  }),
  columnHelper.accessor("variation", {
    header: () => <div className="w-full text-right">Δ</div>,
    cell: ({ row }) => {
      const v = row.original.variation
      return (
        <div
          className={`text-right tabular-nums ${v !== null && v < 0 ? "text-red-600 dark:text-red-400" : ""}`}
        >
          {v === null ? "—" : v > 0 ? `+${fmtNum(v)}` : fmtNum(v)}
        </div>
      )
    },
  }),
  columnHelper.accessor("px_revient", {
    header: () => <div className="w-full text-right">Px revient</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{fmtFdj(row.original.px_revient)}</div>
    ),
  }),
  columnHelper.accessor("px_vente", {
    header: () => <div className="w-full text-right">Px vente</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{fmtFdj(row.original.px_vente)}</div>
    ),
  }),
  columnHelper.accessor("couv", {
    header: () => <div className="w-full text-right">Couv.</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">{fmtNum(row.original.couv, 1)}</div>
    ),
  }),
  columnHelper.accessor("jours_consecutifs", {
    header: () => <div className="w-full text-right">Jours nég.</div>,
    cell: ({ row }) => (
      <div className="text-right tabular-nums">
        {row.original.jours_consecutifs} j
      </div>
    ),
  }),
  columnHelper.accessor("premiere_apparition", {
    header: "1re apparition",
    cell: ({ row }) => fmtDateShort(row.original.premiere_apparition ?? ""),
  }),
  columnHelper.accessor("compensateur", {
    header: "Compensateur",
    cell: ({ row }) => row.original.compensateur ?? "—",
  }),
  columnHelper.accessor("confiance", {
    header: "Confiance",
    cell: ({ row }) => <ConfianceBadge value={row.original.confiance} />,
  }),
  columnHelper.display({
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
            size="icon"
          >
            <EllipsisVerticalIcon />
            <span className="sr-only">Ouvrir le menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={() => {
              navigator.clipboard?.writeText(String(row.original.code))
              toast.success(`Code ${row.original.code} copié`)
            }}
          >
            <CopyIcon /> Copier le code
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              navigator.clipboard?.writeText(row.original.libelle ?? "")
              toast.success("Libellé copié")
            }}
          >
            <CopyIcon /> Copier le libellé
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  }),
])

function DraggableRow({
  row,
}: {
  row: Row<typeof features, z.infer<typeof schema>>
}) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.code,
  })

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition,
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          <FlexRender cell={cell} />
        </TableCell>
      ))}
    </TableRow>
  )
}

export function DataTable({ data }: { data: z.infer<typeof schema>[] }) {
  const [tab, setTab] = React.useState("tous")
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<ColumnVisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })
  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  const filtered = React.useMemo(() => {
    if (tab === "nouveaux") return data.filter((r) => r.statut === "nouveau")
    if (tab === "persistants")
      return data.filter((r) => r.statut.startsWith("persistant"))
    if (tab === "corriges") return data.filter((r) => r.statut === "corrige")
    return data
  }, [data, tab])

  const counts = React.useMemo(
    () => ({
      tous: data.length,
      nouveaux: data.filter((r) => r.statut === "nouveau").length,
      persistants: data.filter((r) => r.statut.startsWith("persistant")).length,
      corriges: data.filter((r) => r.statut === "corrige").length,
    }),
    [data]
  )

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => filtered?.map(({ code }) => code) || [],
    [filtered]
  )

  const table = useTable({
    features,
    data: filtered,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.code.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  })

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }, [tab])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (active && over && active.id !== over.id) {
      toast.info("L'ordre d'affichage est piloté par la priorité du jour")
    }
  }

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex items-center justify-between px-4 lg:px-6">
        <Label htmlFor="view-selector" className="sr-only">
          Vue
        </Label>
        <Select value={tab} onValueChange={setTab}>
          <SelectTrigger
            className="flex w-fit @4xl/main:hidden"
            size="sm"
            id="view-selector"
          >
            <SelectValue placeholder="Sélectionner une vue" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="tous">Tous ({counts.tous})</SelectItem>
              <SelectItem value="nouveaux">Nouveaux ({counts.nouveaux})</SelectItem>
              <SelectItem value="persistants">
                Persistants ({counts.persistants})
              </SelectItem>
              <SelectItem value="corriges">Corrigés ({counts.corriges})</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
          <TabsTrigger value="tous">
            Tous <Badge variant="secondary">{counts.tous}</Badge>
          </TabsTrigger>
          <TabsTrigger value="nouveaux">
            Nouveaux <Badge variant="secondary">{counts.nouveaux}</Badge>
          </TabsTrigger>
          <TabsTrigger value="persistants">
            Persistants <Badge variant="secondary">{counts.persistants}</Badge>
          </TabsTrigger>
          <TabsTrigger value="corriges">
            Corrigés <Badge variant="secondary">{counts.corriges}</Badge>
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3Icon data-icon="inline-start" />
                Colonnes
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {COLUMN_LABELS[column.id] ?? column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder ? null : (
                            <FlexRender header={header} />
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows?.length ? (
                  <SortableContext
                    items={dataIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      Aucun résultat.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} sur{" "}
            {table.getFilteredRowModel().rows.length} ligne(s) sélectionnée(s).
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Lignes par page
              </Label>
              <Select
                value={`${table.state.pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue placeholder={table.state.pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectGroup>
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.state.pagination.pageIndex + 1} sur{" "}
              {Math.max(table.getPageCount(), 1)}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Première page</span>
                <ChevronsLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Page précédente</span>
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Page suivante</span>
                <ChevronRightIcon />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Dernière page</span>
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Tabs>
  )
}

const histChartConfig = {
  stock: {
    label: "Stock",
    color: "var(--primary)",
  },
} satisfies ChartConfig

function TableCellViewer({ item }: { item: z.infer<typeof schema> }) {
  const isMobile = useIsMobile()
  const neg = item as unknown as Negatif

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="link" className="w-fit px-0 text-left text-foreground">
          {neg.libelle ?? `Article ${neg.code}`}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>
            {neg.libelle ?? "—"}{" "}
            <span className="font-mono text-sm text-muted-foreground">
              #{neg.code}
            </span>
          </DrawerTitle>
          <DrawerDescription className="flex items-center gap-2">
            <PrioriteBadge value={neg.priorite} />
            <Badge variant="outline">
              {STATUT_LABELS[neg.statut] ?? neg.statut}
            </Badge>
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {!isMobile && neg.hist7.length > 0 && (
            <>
              <ChartContainer config={histChartConfig} className="h-[160px] w-full">
                <AreaChart
                  accessibilityLayer
                  data={neg.hist7}
                  margin={{ left: 0, right: 10 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="jour"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => fmtDateShort(value as string)}
                    hide
                  />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        indicator="dot"
                        labelFormatter={(value) => fmtDateShort(value as string)}
                      />
                    }
                  />
                  <Area
                    dataKey="stock"
                    type="natural"
                    fill="var(--color-stock)"
                    fillOpacity={0.4}
                    stroke="var(--color-stock)"
                  />
                </AreaChart>
              </ChartContainer>
              <Separator />
            </>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Stock J-1", fmtNum(neg.stock_j1)],
              ["Stock J", fmtNum(neg.stock_j)],
              [
                "Variation",
                neg.variation === null
                  ? "—"
                  : neg.variation > 0
                    ? `+${fmtNum(neg.variation)}`
                    : fmtNum(neg.variation),
              ],
              ["Px revient", fmtFdj(neg.px_revient)],
              ["Px vente", fmtFdj(neg.px_vente)],
              ["Couverture", fmtNum(neg.couv, 1)],
              ["Jours négatifs consécutifs", `${neg.jours_consecutifs} j`],
              ["1re apparition", fmtDate(neg.premiere_apparition ?? "")],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium tabular-nums">{value}</span>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <span className="font-medium">Compensateurs proposés (LLM)</span>
            {neg.compensateurs?.length ? (
              neg.compensateurs.map((c, i) => (
                <div
                  key={`${c.code}-${i}`}
                  className="flex flex-col gap-1 rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {c.libelle ?? "—"}{" "}
                      {c.code ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          #{c.code}
                        </span>
                      ) : null}
                    </span>
                    <ConfianceBadge value={c.confiance ?? "—"} />
                  </div>
                  <span className="text-muted-foreground">{c.justification}</span>
                  <span className="text-muted-foreground tabular-nums">
                    Px revient {fmtFdj(c.px_revient)} · Stock {fmtNum(c.stock)} · Px vente {fmtFdj(c.px_vente)}
                  </span>
                </div>
              ))
            ) : (
              <span className="text-muted-foreground">
                {neg.justification ?? "Aucun compensateur trouvé"}
              </span>
            )}
          </div>
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Fermer</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
