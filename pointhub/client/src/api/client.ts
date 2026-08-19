import axios from 'axios';
import type {
  MemberData,
  BalanceData,
  HistoryResponse,
  AdjustmentResponse,
  ReasonCode,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

export async function getMember(memberId: string): Promise<MemberData> {
  const { data } = await api.get<MemberData>(`/members/${memberId}`);
  return data;
}

export async function getBalance(memberId: string): Promise<BalanceData> {
  const { data } = await api.get<BalanceData>(`/members/${memberId}/balance`);
  return data;
}

export async function getHistory(
  memberId: string,
  limit = 20,
  offset = 0
): Promise<HistoryResponse> {
  const { data } = await api.get<HistoryResponse>(`/members/${memberId}/history`, {
    params: { limit, offset },
  });
  return data;
}

export async function postAdjustment(
  memberId: string,
  points: number,
  reasonCode: ReasonCode,
  description?: string
): Promise<AdjustmentResponse> {
  const { data } = await api.post<AdjustmentResponse>('/adjustments', {
    memberId,
    points,
    reasonCode,
    description,
  });
  return data;
}
