export interface Snapshot {
  id: string;
  snapshot_date: string;
  total_open_tickets: number;
  total_actionable_tickets: number;
  total_completed_last_7_days: number;
  created_by: string;
  created_at: string;
  agent_stats?: AgentStat[];
}

export interface AgentStat {
  id: string;
  snapshot_id: string;
  agent_id: string;
  agent_name: string;
  agent_email: string;
  open_tickets: number;
  actionable_tickets: number;
  completed_last_7_days: number;
}

export interface TicketRecord {
  id: string;
  snapshot_id: string;
  agent_stat_id: string | null;
  zendesk_ticket_id: number;
  ticket_subject: string;
  ticket_status: string;
  ticket_priority: string | null;
  ticket_type: "actionable" | "on_hold" | "completed";
  requester_name: string;
  created_date: string;
  updated_date: string;
  solved_date: string | null;
}

export function isActionable(status: string): boolean {
  return status !== "hold";
}

export function ticketStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "new":
      return "bg-green-100 text-green-800";
    case "open":
      return "bg-blue-100 text-blue-800";
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "hold":
      return "bg-gray-200 text-gray-600";
    case "solved":
      return "bg-purple-100 text-purple-800";
    case "closed":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function priorityColor(priority: string | null): string {
  switch (priority?.toLowerCase()) {
    case "urgent":
      return "bg-red-100 text-red-800";
    case "high":
      return "bg-orange-100 text-orange-800";
    case "normal":
      return "bg-blue-100 text-blue-800";
    case "low":
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

export const ZENDESK_BASE_URL = "https://voyageadvisoryllc.zendesk.com";
export const ZENDESK_TICKET_URL = `${ZENDESK_BASE_URL}/agent/tickets`;
