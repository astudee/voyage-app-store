export interface Asset {
  ASSET_ID: string;
  ASSET_TAG: string | null;
  ASSET_TYPE: string;
  BRAND: string;
  MODEL: string;
  SERIAL_NUMBER: string | null;
  STATUS: string;
  ASSIGNED_TO_STAFF_ID: number | null;
  ASSIGNED_TO_OTHER: string | null;
  PURCHASE_DATE: string | null;
  PURCHASE_COST: number | null;
  WARRANTY_EXPIRY: string | null;
  LIQUIDATED_DATE: string | null;
  NOTES: string | null;
  CREATED_AT: string;
  UPDATED_AT: string;
  // Joined field
  ASSIGNED_TO_STAFF_NAME?: string | null;
}

export interface AssetInput {
  asset_tag?: string | null;
  asset_type: string;
  brand: string;
  model: string;
  serial_number?: string | null;
  status: string;
  assigned_to_staff_id?: number | null;
  assigned_to_other?: string | null;
  purchase_date?: string | null;
  purchase_cost?: number | null;
  warranty_expiry?: string | null;
  liquidated_date?: string | null;
  notes?: string | null;
}

export const ASSET_TYPES = [
  "Laptop",
  "Monitor",
  "Phone",
  "Tablet",
  "Keyboard",
  "Mouse",
  "Headset",
  "Webcam",
  "Docking Station",
  "Other",
] as const;

export const ASSET_STATUSES = [
  "In Use",
  "Inventory",
  "Repair",
  "Pending Liquidation",
  "Liquidated",
  "Lost",
] as const;

export function statusColor(status: string): string {
  switch (status) {
    case "In Use":
      return "bg-blue-100 text-blue-800";
    case "Inventory":
      return "bg-gray-100 text-gray-800";
    case "Repair":
      return "bg-orange-100 text-orange-800";
    case "Pending Liquidation":
      return "bg-yellow-100 text-yellow-800";
    case "Liquidated":
      return "bg-gray-200 text-gray-600";
    case "Lost":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function formatAssetCurrency(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatAssetDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
