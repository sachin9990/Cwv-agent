import type { WorkItem } from "../types";

// Simulates the response from POST /run-script (Azure data only, no New Relic fields).
export const MOCK_AZURE_DATA: WorkItem[] = [
  {
    ticket_id: "8703559",
    url: "https://www.bajajfinserv.in/personalisation-for-individuals-affinity",
    metric: "CLS",
    value: 0.195,
    status: "Amber",
  },
  {
    ticket_id: "8712320",
    url: "https://www.bajajfinserv.in/rose-personal-nota-persona-li-can",
    metric: "LCP",
    value: 2.563,
    status: "Amber",
  },
  {
    ticket_id: "8712376",
    url: null,
    metric: null,
    value: null,
    status: null,
  },
  {
    ticket_id: "8800100",
    url: "https://www.bajajfinserv.in/product/laptop-15-inch",
    metric: "LCP",
    value: 1.8,
    status: "Green",
  },
  {
    ticket_id: "8800200",
    url: "https://www.bajajfinserv.in/checkout/payment-gateway",
    metric: "INP",
    value: 320,
    status: "Amber",
  },
  {
    ticket_id: "8800300",
    url: "https://www.bajajfinserv.in/search?q=television&category=electronics",
    metric: "LCP",
    value: 4.2,
    status: "Red",
  },
  {
    ticket_id: "8800400",
    url: "https://www.bajajfinserv.in/offers/summer-sale-2024",
    metric: "CLS",
    value: 0.05,
    status: "Green",
  },
  {
    ticket_id: "8800500",
    url: "https://www.bajajfinserv.in/insurance/health-insurance",
    metric: "INP",
    value: 185,
    status: "Green",
  },
];

// Simulates per-ticket responses from GET /get-metric (New Relic values).
export const MOCK_NR_DATA: Record<string, { value: number | null; status: string | null }> = {
  "8703559": { value: 0.266, status: "Red" },
  "8712320": { value: 2.438, status: "Green" },
  "8712376": { value: null,  status: null },
  "8800100": { value: 1.95,  status: "Green" },
  "8800200": { value: 480,   status: "Amber" },
  "8800300": { value: 4.8,   status: "Red" },
  "8800400": { value: 0.07,  status: "Green" },
  "8800500": { value: 162,   status: "Green" },
};

// Simulates the comment_preview string returned by POST /comment-assign.
export const mockCommentPreview = (ticketId: string, metric: string | null, value: number | null) =>
  `[Auto] CWV metric ${metric ?? "unknown"} for ticket ${ticketId} is within acceptable thresholds ` +
  `(value: ${value?.toFixed(3) ?? "N/A"}). Ticket reassigned to performance-review queue.`;
