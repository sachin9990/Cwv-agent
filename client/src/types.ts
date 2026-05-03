export type WorkItem = {
  ticket_id: string;
  url: string | null;
  metric: string | null;
  value: number | null;
  status: string | null;
  newRelicValue?: number | null;
  newRelicStatus?: string | null;
};
