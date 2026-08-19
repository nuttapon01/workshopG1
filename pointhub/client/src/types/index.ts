export interface MemberData {
  memberId: string;
  tier: 'SILVER' | 'GOLD' | 'PLATINUM';
  joinedAt: string;
}

export interface BalanceData {
  memberId: string;
  balance: number;
}

export interface LineDetail {
  lineNo: number;
  category: string;
  amountTHB: number;
  winningCampaign: string;
  multiplier: number;
  milliPoints: number;
}

export interface HistoryEntry {
  id: number;
  entryType: 'EARN' | 'BURN' | 'REFUND_CLAWBACK' | 'ADJUSTMENT' | 'EXPIRY';
  points: number;
  description: string;
  reasonCode: string | null;
  transactionId: string | null;
  createdAt: string;
  txType: string | null;
  txDate: string | null;
  storeId: string | null;
  totalAmountTHB: number | null;
  lineDetails?: LineDetail[];
}

export interface HistoryResponse {
  memberId: string;
  entries: HistoryEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdjustmentResponse {
  adjustmentId: number;
  memberId: string;
  points: number;
  reasonCode: string;
  description: string;
  newBalance: number;
  createdAt: string;
}

export type ReasonCode = 'GOODWILL' | 'SYSTEM_ERROR' | 'FRAUD_DEDUCT' | 'EVENT_BONUS';
